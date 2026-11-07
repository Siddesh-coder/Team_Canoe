"""SQLite store: claims, decisions, overrides, fact edits, info requests, outcomes, policy versions.

Rules that this module enforces
-------------------------------
* Every decision row carries the policy version that produced it.
* Decisions are only ever appended. Nothing is overwritten, so history stays inspectable.
* Closed claims are never re-decided, edited or overridden.
* A reviewer override records: corrected outcome, reason, reviewer, policy version, time.
* Publishing a policy version never touches closed claims. Open claims whose
  recommendation changes get a pending recheck.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from . import policy as policy_mod
from .batch import read_csv_text
from .engine import FIELDS, FIELD_ORDER, OUTCOMES, decide, normalize_claim, parse_value, policy_fields
from .quality import evaluate

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("CANOE_DB", ROOT / "data" / "canoe.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS claims(
  case_id TEXT PRIMARY KEY, case_status TEXT NOT NULL, summary TEXT, facts TEXT NOT NULL,
  fact_status TEXT NOT NULL, fact_source TEXT NOT NULL, claimant_name TEXT, claimant_email TEXT,
  source TEXT, created_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS labels(case_id TEXT, version TEXT, expected TEXT, PRIMARY KEY(case_id, version));
CREATE TABLE IF NOT EXISTS decisions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, policy_version TEXT NOT NULL,
  recommendation TEXT NOT NULL, rule_id TEXT NOT NULL, explanation TEXT, detail TEXT,
  trigger TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS overrides(
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, decision_id INTEGER, policy_version TEXT NOT NULL,
  kind TEXT NOT NULL, original_recommendation TEXT, corrected_recommendation TEXT, reason TEXT,
  reviewer TEXT NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS fact_edits(
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, field TEXT, old_value TEXT, new_value TEXT,
  reason TEXT, editor TEXT, role TEXT, policy_version TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS policy_meta(
  version TEXT PRIMARY KEY, title TEXT, published_by TEXT, approved_by TEXT, note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS rechecks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, from_version TEXT, to_version TEXT,
  from_recommendation TEXT, to_recommendation TEXT, has_override INTEGER, status TEXT, created_at TEXT, resolved_at TEXT);
CREATE TABLE IF NOT EXISTS info_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, ask_fields TEXT, subject TEXT, body TEXT,
  status TEXT, created_at TEXT, answered_at TEXT);
CREATE TABLE IF NOT EXISTS outbox(
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, to_addr TEXT, subject TEXT, body TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS outcomes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, final_outcome TEXT, source TEXT, note TEXT,
  recorded_by TEXT, recorded_at TEXT);
"""

ASK_TEXT = {
    "incident_report_present": "Please send the incident report.",
    "itemized_quote_present": "Please send an itemized repair quote with one line per item, not just a total.",
    "quote_eur": "The repair quote amount is missing or unreadable. Please confirm the amount in euros.",
    "policy_active_on_incident": "Please confirm the policy was active on the date of the incident.",
    "claim_type": "Please confirm what kind of claim this is.",
    "injury_reported": "Please tell us whether anyone was injured.",
    "liability_disputed": "Please tell us whether the other party disputes who was at fault.",
    "duplicate_flag": "Please tell us whether you have already submitted this incident.",
    "evidence_conflict": "Please tell us whether any evidence, such as photo dates, conflicts with your report.",
    "repair_type": "Please confirm the type of repair.",
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class StoreError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class Store:
    def __init__(self, db_path: Path | str | None = None, policy_dir: Path | str | None = None):
        self.db_path = str(db_path or DB_PATH)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.policy_dir = Path(policy_dir) if policy_dir else policy_mod.DEFAULT_DIR
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.db_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.db.commit()

    # ------------------------------------------------------------------ helpers
    def _q(self, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
        return self.db.execute(sql, args).fetchall()

    def policies(self) -> list[dict]:
        return policy_mod.load_policies(self.policy_dir)

    def latest_policy(self) -> dict:
        return self.policies()[-1]

    def _claim_obj(self, row: sqlite3.Row) -> dict:
        return {
            "case_id": row["case_id"], "case_status": row["case_status"], "claim_summary": row["summary"] or "",
            "facts": json.loads(row["facts"]), "fact_status": json.loads(row["fact_status"]),
        }

    def _insert_decision(self, case_id: str, d: dict, trigger: str) -> int:
        detail = {k: d[k] for k in ("reason", "basis", "also_applies", "missing_fields", "ask_fields", "trace")}
        cur = self.db.execute(
            "INSERT INTO decisions(case_id,policy_version,recommendation,rule_id,explanation,detail,trigger,created_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (case_id, d["policy_version"], d["recommendation"], d["rule_id"], d["explanation"],
             json.dumps(detail), trigger, now()),
        )
        return cur.lastrowid

    def _latest_decision(self, case_id: str) -> sqlite3.Row | None:
        rows = self._q("SELECT * FROM decisions WHERE case_id=? ORDER BY id DESC LIMIT 1", (case_id,))
        return rows[0] if rows else None

    def _effective(self, case_id: str, decision: sqlite3.Row | None) -> tuple[str | None, str]:
        """(recommendation, source). A reviewer correction on the current decision wins over the system."""
        if decision is None:
            return None, "none"
        rows = self._q(
            "SELECT * FROM overrides WHERE case_id=? AND decision_id=? ORDER BY id DESC LIMIT 1",
            (case_id, decision["id"]),
        )
        if rows and rows[0]["kind"] == "override":
            return rows[0]["corrected_recommendation"], "reviewer"
        if rows and rows[0]["kind"] == "confirm":
            return decision["recommendation"], "reviewer_confirmed"
        return decision["recommendation"], "system"

    # ------------------------------------------------------------------ policies
    def sync_policies(self) -> None:
        """Register policy files that the store has not seen yet and apply them to open claims."""
        with self.lock:
            known = {r["version"] for r in self._q("SELECT version FROM policy_meta")}
            pols = self.policies()
            for pol in pols:
                if pol["version"] in known:
                    continue
                self.db.execute(
                    "INSERT INTO policy_meta VALUES(?,?,?,?,?,?)",
                    (pol["version"], pol.get("title", ""), pol.get("published_by", "system"),
                     pol.get("approved_by", ""), pol.get("note", ""), now()),
                )
                if pol["version"] != pols[0]["version"]:
                    self._apply_to_open_claims(pol)
            self.db.commit()

    def _apply_to_open_claims(self, pol: dict) -> dict:
        """Re-decide open claims under a new version. Closed claims are left exactly as they are."""
        moved = unchanged = 0
        closed = self._q("SELECT COUNT(*) c FROM claims WHERE case_status='closed'")[0]["c"]
        for row in self._q("SELECT * FROM claims WHERE case_status='open' ORDER BY case_id"):
            claim = self._claim_obj(row)
            prev = self._latest_decision(claim["case_id"])
            d = decide(claim, pol)
            self._insert_decision(claim["case_id"], d, "policy_publish")
            if prev is not None and prev["recommendation"] != d["recommendation"]:
                moved += 1
                has_override = bool(self._q("SELECT 1 FROM overrides WHERE case_id=? AND kind='override'", (claim["case_id"],)))
                self.db.execute(
                    "INSERT INTO rechecks(case_id,from_version,to_version,from_recommendation,to_recommendation,"
                    "has_override,status,created_at) VALUES(?,?,?,?,?,?,'pending',?)",
                    (claim["case_id"], prev["policy_version"], pol["version"], prev["recommendation"],
                     d["recommendation"], int(has_override), now()),
                )
            else:
                unchanged += 1
            self._after_decision(claim["case_id"], d, claim)
        return {"open_changed": moved, "open_unchanged": unchanged, "closed_untouched": closed}

    def preview_policy(self, draft: dict) -> dict:
        """Dry run: what would change if this draft were published? Nothing is written."""
        with self.lock:
            existing = self.policies()
            draft = dict(draft)
            draft.setdefault("version", policy_mod.next_version(existing))
            policy_mod.validate(draft)
            if draft["version"] in {p["version"] for p in existing}:
                raise StoreError(f"{draft['version']} already exists. Published versions never change.", 409)
            current = existing[-1]
            rows = []
            for row in self._q("SELECT * FROM claims ORDER BY case_id"):
                claim = self._claim_obj(row)
                cur = self._latest_decision(claim["case_id"])
                cur_rec = cur["recommendation"] if cur else decide(claim, current)["recommendation"]
                cur_rule = f"{cur['policy_version']}:{cur['rule_id']}" if cur else ""
                if claim["case_status"] == "closed":
                    rows.append({"case_id": claim["case_id"], "status": "closed", "from": cur_rec, "to": cur_rec,
                                 "rule_from": cur_rule, "rule_to": cur_rule, "changed": False, "retained": True,
                                 "has_override": False, "summary": claim["claim_summary"]})
                    continue
                d = decide(claim, draft)
                has_ov = bool(self._q("SELECT 1 FROM overrides WHERE case_id=? AND kind='override'", (claim["case_id"],)))
                rows.append({"case_id": claim["case_id"], "status": "open", "from": cur_rec, "to": d["recommendation"],
                             "rule_from": cur_rule, "rule_to": d["full_rule_id"],
                             "changed": cur_rec != d["recommendation"], "retained": False,
                             "has_override": has_ov, "summary": claim["claim_summary"]})
            moves: dict[str, int] = {}
            for r in rows:
                if r["changed"]:
                    key = f"{r['from']} -> {r['to']}"
                    moves[key] = moves.get(key, 0) + 1
            return {
                "from_version": current["version"], "to_version": draft["version"],
                "open_claims": sum(r["status"] == "open" for r in rows),
                "closed_untouched": sum(r["status"] == "closed" for r in rows),
                "changed": sum(r["changed"] for r in rows), "moves": moves, "rows": rows,
                "warnings": [f"{r['case_id']} has a reviewer override that this change would put up for recheck."
                             for r in rows if r["changed"] and r["has_override"]],
            }

    def publish_policy(self, draft: dict, published_by: str, approved_by: str, note: str) -> dict:
        if not published_by or not approved_by:
            raise StoreError("Publishing needs the author and an approver. Both are recorded.")
        with self.lock:
            existing = self.policies()
            draft = dict(draft)
            draft["version"] = draft.get("version") or policy_mod.next_version(existing)
            if policy_mod.version_key(draft["version"]) != policy_mod.version_key(existing[-1]["version"]) + 1:
                raise StoreError(f"The next version must be {policy_mod.next_version(existing)}.", 409)
            latest = existing[-1]
            if draft.get("rules") == latest["rules"] and draft.get("default") == latest["default"]:
                raise StoreError(f"This draft is identical to {latest['version']}. Change a rule before publishing.", 409)
            draft["published_by"], draft["approved_by"], draft["note"] = published_by, approved_by, note
            preview = self.preview_policy(draft)
            policy_mod.save_policy(draft, self.policy_dir)
            self.db.execute(
                "INSERT INTO policy_meta VALUES(?,?,?,?,?,?)",
                (draft["version"], draft.get("title", ""), published_by, approved_by, note, now()),
            )
            applied = self._apply_to_open_claims(draft)
            self.db.commit()
            return {"version": draft["version"], "applied": applied, "preview": preview}

    def policy_overview(self) -> dict:
        meta = {r["version"]: dict(r) for r in self._q("SELECT * FROM policy_meta")}
        out = []
        for pol in self.policies():
            out.append({**pol, "meta": meta.get(pol["version"], {})})
        return {"versions": out, "latest": out[-1]["version"], "fields": {k: v[1] for k, v in FIELDS.items()}}

    # ------------------------------------------------------------------ claims
    def _next_case_id(self) -> str:
        n = len(self._q("SELECT case_id FROM claims WHERE case_id LIKE 'CLM-%'")) + 1
        while self._q("SELECT 1 FROM claims WHERE case_id=?", (f"CLM-{n:04d}",)):
            n += 1
        return f"CLM-{n:04d}"

    def _store_claim(self, row: dict, source: str, name: str = "", email: str = "", trigger: str = "intake",
                     flag_recheck: bool = False) -> str:
        """flag_recheck: set for claims that already existed before the newest policy (loaded files),
        so an open claim whose answer differs between v1 and the newest version is flagged for recheck.
        A brand-new claim from the form is not flagged: nobody acted on a v1 answer for it."""
        claim = normalize_claim(row)
        case_id = claim["case_id"] or self._next_case_id()
        if self._q("SELECT 1 FROM claims WHERE case_id=?", (case_id,)):
            raise StoreError(f"Case {case_id} already exists.", 409)
        src = {f: ("blank" if claim["fact_status"][f] != "known" else source) for f in FIELD_ORDER}
        self.db.execute(
            "INSERT INTO claims(case_id,case_status,summary,facts,fact_status,fact_source,claimant_name,claimant_email,"
            "source,created_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (case_id, claim["case_status"], claim["claim_summary"], json.dumps(claim["facts"]),
             json.dumps(claim["fact_status"]), json.dumps(src), name, email, source, now(),
             now() if claim["case_status"] == "closed" else None),
        )
        claim["case_id"] = case_id
        pols = self.policies()
        if claim["case_status"] == "closed":
            d = decide(claim, pols[0])  # closed claims keep the original v1 decision
            self._insert_decision(case_id, d, "retained")
        else:
            d1 = d = decide(claim, pols[0])  # always keep the v1 view, so v1 and newest can be compared
            self._insert_decision(case_id, d, trigger)
            if pols[-1] is not pols[0]:
                d = decide(claim, pols[-1])
                self._insert_decision(case_id, d, trigger)
                if flag_recheck and d["recommendation"] != d1["recommendation"]:
                    self.db.execute(
                        "INSERT INTO rechecks(case_id,from_version,to_version,from_recommendation,to_recommendation,"
                        "has_override,status,created_at) VALUES(?,?,?,?,?,0,'pending',?)",
                        (case_id, d1["policy_version"], d["policy_version"], d1["recommendation"],
                         d["recommendation"], now()))
            self._after_decision(case_id, d, claim)
        return case_id

    def submit_claim(self, form: dict) -> dict:
        with self.lock:
            row = {k: form.get(k) for k in FIELD_ORDER}
            row["case_status"] = "open"
            row["claim_summary"] = (form.get("claim_summary") or "").strip()
            case_id = self._store_claim(row, "claimant_form", (form.get("claimant_name") or "").strip(),
                                        (form.get("claimant_email") or "").strip())
            self.db.commit()
            return self.get_claim(case_id)

    def import_claims_csv(self, text: str, source: str = "csv", labelled: bool = False) -> dict:
        added, skipped = [], []
        with self.lock:
            for raw in read_csv_text(text):
                cid = (raw.get("case_id") or "").strip()
                if cid and self._q("SELECT 1 FROM claims WHERE case_id=?", (cid,)):
                    skipped.append(cid)
                else:
                    cid = self._store_claim(raw, source, flag_recheck=True)
                    added.append(cid)
                if labelled and cid:
                    for key, val in raw.items():
                        if key.startswith("expected_") and (val or "").strip() in OUTCOMES:
                            self.db.execute("INSERT OR REPLACE INTO labels VALUES(?,?,?)",
                                            (cid, key[len("expected_"):], val.strip()))
            self.db.commit()
        return {"added": added, "skipped_existing": skipped}

    def seed(self, data_dir: Path | str | None = None) -> None:
        """Load the supplied development and practice cases on first start."""
        folder = Path(data_dir) if data_dir else ROOT / "data"
        with self.lock:
            if self._q("SELECT 1 FROM claims LIMIT 1"):
                return
            for name, labelled in (("labelled_development_cases.csv", True), ("unlabelled_practice_cases.csv", False)):
                path = folder / name
                if path.exists():
                    self.import_claims_csv(path.read_text(encoding="utf-8-sig"), "seed", labelled)
            self.db.commit()

    def get_claim(self, case_id: str) -> dict:
        rows = self._q("SELECT * FROM claims WHERE case_id=?", (case_id,))
        if not rows:
            raise StoreError(f"Case {case_id} not found.", 404)
        row = rows[0]
        claim = self._claim_obj(row)
        src = json.loads(row["fact_source"])
        fields = [{
            "field": f, "label": FIELDS[f][1], "type": FIELDS[f][0], "value": claim["facts"][f],
            "status": claim["fact_status"][f], "source": src.get(f, ""),
        } for f in FIELD_ORDER]
        decisions = []
        for d in self._q("SELECT * FROM decisions WHERE case_id=? ORDER BY id", (case_id,)):
            decisions.append({**{k: d[k] for k in d.keys() if k != "detail"}, "detail": json.loads(d["detail"] or "{}")})
        latest = decisions[-1] if decisions else None
        eff, eff_src = self._effective(case_id, self._latest_decision(case_id))
        info = [dict(r, ask_fields=json.loads(r["ask_fields"])) for r in
                self._q("SELECT * FROM info_requests WHERE case_id=? ORDER BY id", (case_id,))]
        return {
            "case_id": case_id, "case_status": row["case_status"], "summary": row["summary"],
            "claimant_name": row["claimant_name"], "claimant_email": row["claimant_email"],
            "source": row["source"], "created_at": row["created_at"],
            "fields": fields, "decisions": decisions, "latest_decision": latest,
            "effective_recommendation": eff, "effective_source": eff_src,
            "overrides": [dict(r) for r in self._q("SELECT * FROM overrides WHERE case_id=? ORDER BY id", (case_id,))],
            "fact_edits": [dict(r) for r in self._q("SELECT * FROM fact_edits WHERE case_id=? ORDER BY id", (case_id,))],
            "rechecks": [dict(r) for r in self._q("SELECT * FROM rechecks WHERE case_id=? ORDER BY id", (case_id,))],
            "info_requests": info,
            "outcomes": [dict(r) for r in self._q("SELECT * FROM outcomes WHERE case_id=? ORDER BY id", (case_id,))],
            "labels": {r["version"]: r["expected"] for r in self._q("SELECT * FROM labels WHERE case_id=?", (case_id,))},
            "editable": row["case_status"] == "open",
        }

    def list_claims(self, status: str | None = None) -> list[dict]:
        out = []
        pols = self.policies()
        for row in self._q("SELECT * FROM claims ORDER BY created_at, case_id"):
            if status and row["case_status"] != status:
                continue
            decs = self._q("SELECT * FROM decisions WHERE case_id=? ORDER BY id", (row["case_id"],))
            latest = decs[-1] if decs else None
            first = next((d for d in decs if d["policy_version"] == pols[0]["version"]), None)
            eff, eff_src = self._effective(row["case_id"], latest)
            pend = self._q("SELECT COUNT(*) c FROM rechecks WHERE case_id=? AND status='pending'", (row["case_id"],))[0]["c"]
            facts = json.loads(row["facts"])
            out.append({
                "case_id": row["case_id"], "case_status": row["case_status"], "summary": row["summary"],
                "quote_eur": facts.get("quote_eur"), "source": row["source"], "created_at": row["created_at"],
                "recommendation_v1": first["recommendation"] if first else None,
                "recommendation_latest": latest["recommendation"] if latest else None,
                "policy_version": latest["policy_version"] if latest else None,
                "rule": f"{latest['policy_version']}:{latest['rule_id']}" if latest else None,
                "effective_recommendation": eff, "effective_source": eff_src,
                "recheck_pending": bool(pend),
            })
        return out

    # ------------------------------------------------------------------ workflow after a decision
    def _after_decision(self, case_id: str, d: dict, claim: dict) -> None:
        """Open or close the missing-information request that goes with the current decision."""
        open_req = self._q("SELECT * FROM info_requests WHERE case_id=? AND status='open'", (case_id,))
        if d["recommendation"] == "request_information":
            ask = d.get("ask_fields") or d["missing_fields"]
            if open_req and json.loads(open_req[0]["ask_fields"]) == ask:
                return
            for r in open_req:
                self.db.execute("UPDATE info_requests SET status='superseded' WHERE id=?", (r["id"],))
            row = self._q("SELECT claimant_name, claimant_email FROM claims WHERE case_id=?", (case_id,))[0]
            lines = "\n".join(f"- {ASK_TEXT.get(f, 'Please confirm ' + FIELDS[f][1].lower() + '.')}" for f in ask)
            name = row["claimant_name"] or "there"
            subject = f"Claim {case_id}: we need a few more details"
            body = (f"Hello {name},\n\nThank you for your claim {case_id}. To continue we still need:\n{lines}\n\n"
                    f"You can answer on your claim page: open Canoe and look up claim {case_id}. "
                    "Nothing is approved or paid yet; this only lets us handle your claim.\n")
            self.db.execute(
                "INSERT INTO info_requests(case_id,ask_fields,subject,body,status,created_at) VALUES(?,?,?,?,'open',?)",
                (case_id, json.dumps(ask), subject, body, now()))
            if row["claimant_email"]:
                self.db.execute("INSERT INTO outbox(case_id,to_addr,subject,body,created_at) VALUES(?,?,?,?,?)",
                                (case_id, row["claimant_email"], subject, body, now()))
        else:
            for r in open_req:
                self.db.execute("UPDATE info_requests SET status='closed' WHERE id=?", (r["id"],))

    def _redecide(self, case_id: str, trigger: str) -> dict:
        row = self._q("SELECT * FROM claims WHERE case_id=?", (case_id,))[0]
        claim = self._claim_obj(row)
        d = decide(claim, self.latest_policy())
        self._insert_decision(case_id, d, trigger)
        self._after_decision(case_id, d, claim)
        return d

    def _require_open(self, case_id: str) -> sqlite3.Row:
        rows = self._q("SELECT * FROM claims WHERE case_id=?", (case_id,))
        if not rows:
            raise StoreError(f"Case {case_id} not found.", 404)
        if rows[0]["case_status"] != "open":
            raise StoreError(f"Case {case_id} is closed. Closed decisions are kept as they were.", 409)
        return rows[0]

    def _apply_fact_changes(self, case_id: str, changes: dict, reason: str, who: str, role: str, source: str) -> None:
        row = self._require_open(case_id)
        facts, status, src = json.loads(row["facts"]), json.loads(row["fact_status"]), json.loads(row["fact_source"])
        version = self.latest_policy()["version"]
        for field, raw in changes.items():
            if field not in FIELDS:
                raise StoreError(f"Unknown field '{field}'.")
            value, st = parse_value(field, raw)
            if st == "unreadable":
                raise StoreError(f"Could not read '{raw}' as {FIELDS[field][0]} for {field}. Leave it blank if unknown.")
            if value == facts[field] and st == status[field]:
                continue
            self.db.execute(
                "INSERT INTO fact_edits(case_id,field,old_value,new_value,reason,editor,role,policy_version,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?)",
                (case_id, field, json.dumps(facts[field]), json.dumps(value), reason, who, role, version, now()))
            facts[field], status[field] = value, st
            src[field] = source if st == "known" else "blank"
        self.db.execute("UPDATE claims SET facts=?, fact_status=?, fact_source=? WHERE case_id=?",
                        (json.dumps(facts), json.dumps(status), json.dumps(src), case_id))

    def edit_facts(self, case_id: str, changes: dict, reason: str, reviewer: str) -> dict:
        if not (reason or "").strip():
            raise StoreError("Say why you are changing the facts. The reason is recorded.")
        if not (reviewer or "").strip():
            raise StoreError("A reviewer name is required.")
        if not changes:
            raise StoreError("No changes given.")
        with self.lock:
            self._apply_fact_changes(case_id, changes, reason.strip(), reviewer.strip(), "reviewer", "reviewer_edit")
            self._redecide(case_id, "fact_edit")
            self.db.commit()
            return self.get_claim(case_id)

    def override(self, case_id: str, corrected: str, reason: str, reviewer: str) -> dict:
        reviewer = (reviewer or "").strip()
        reason = (reason or "").strip()
        if corrected not in OUTCOMES:
            raise StoreError(f"Pick one of: {', '.join(OUTCOMES)}.")
        if not reviewer:
            raise StoreError("A reviewer name is required.")
        with self.lock:
            self._require_open(case_id)
            cur = self._latest_decision(case_id)
            kind = "confirm" if corrected == cur["recommendation"] else "override"
            if kind == "override" and not reason:
                raise StoreError("Say why you are overriding. The reason is recorded.")
            self.db.execute(
                "INSERT INTO overrides(case_id,decision_id,policy_version,kind,original_recommendation,"
                "corrected_recommendation,reason,reviewer,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (case_id, cur["id"], cur["policy_version"], kind, cur["recommendation"], corrected, reason, reviewer, now()))
            self.db.execute("UPDATE rechecks SET status='resolved', resolved_at=? WHERE case_id=? AND status='pending'",
                            (now(), case_id))
            self.db.commit()
            return self.get_claim(case_id)

    def answer_info(self, case_id: str, values: dict, name: str = "") -> dict:
        """Claimant supplies the facts we asked for. Values are marked as stated, not verified."""
        with self.lock:
            self._require_open(case_id)
            req = self._q("SELECT * FROM info_requests WHERE case_id=? AND status='open' ORDER BY id DESC", (case_id,))
            if not req:
                raise StoreError("There is nothing to answer for this claim right now.", 409)
            allowed = set(json.loads(req[0]["ask_fields"]))
            changes = {k: v for k, v in values.items() if k in allowed}
            if not changes:
                raise StoreError("Please answer at least one of the requested items.")
            self._apply_fact_changes(case_id, changes, "Provided by claimant after information request",
                                     name or "claimant", "claimant", "claimant_followup")
            self.db.execute("UPDATE info_requests SET answered_at=? WHERE id=?", (now(), req[0]["id"]))
            self._redecide(case_id, "info_response")
            self.db.commit()
            return self.get_claim(case_id)

    def record_outcome(self, case_id: str, final_outcome: str, source: str, note: str, recorded_by: str) -> dict:
        if final_outcome not in OUTCOMES:
            raise StoreError(f"final_outcome must be one of: {', '.join(OUTCOMES)}.")
        with self.lock:
            if not self._q("SELECT 1 FROM claims WHERE case_id=?", (case_id,)):
                raise StoreError(f"Case {case_id} not found.", 404)
            self.db.execute("INSERT INTO outcomes(case_id,final_outcome,source,note,recorded_by,recorded_at) VALUES(?,?,?,?,?,?)",
                            (case_id, final_outcome, source or "downstream", note or "", recorded_by or "", now()))
            self.db.commit()
            return self.get_claim(case_id)

    # ------------------------------------------------------------------ measurement and monitoring
    def labelled_rows(self) -> list[dict]:
        rows = []
        for row in self._q("SELECT * FROM claims ORDER BY case_id"):
            labels = {r["version"]: r["expected"] for r in self._q("SELECT * FROM labels WHERE case_id=?", (row["case_id"],))}
            if not labels:
                continue
            facts = json.loads(row["facts"])
            rec = {"case_id": row["case_id"], "case_status": row["case_status"], "claim_summary": row["summary"]}
            rec.update({k: ("" if v is None else v) for k, v in facts.items()})
            rec.update({f"expected_{v}": e for v, e in labels.items()})
            rows.append(rec)
        return rows

    def quality_report(self) -> dict:
        report = evaluate(self.labelled_rows(), self.policies())
        report["monitoring"] = self.monitoring()
        return report

    def monitoring(self) -> dict:
        reviewed = self._q("SELECT COUNT(DISTINCT case_id) c FROM overrides")[0]["c"]
        overrides = self._q("SELECT * FROM overrides WHERE kind='override'")
        by_rule: dict[str, int] = {}
        for o in overrides:
            d = self._q("SELECT rule_id FROM decisions WHERE id=?", (o["decision_id"],))
            key = f"{o['policy_version']}:{d[0]['rule_id']}" if d else o["policy_version"]
            by_rule[key] = by_rule.get(key, 0) + 1
        outs = self._q("SELECT * FROM outcomes ORDER BY id")
        agree = disagree = 0
        wrong_routine_outcomes = []
        for o in outs:
            dec = self._latest_decision(o["case_id"])
            if not dec:
                continue
            if dec["recommendation"] == o["final_outcome"]:
                agree += 1
            else:
                disagree += 1
                if dec["recommendation"] == "routine_processing":
                    wrong_routine_outcomes.append(o["case_id"])
        pending = self._q("SELECT COUNT(*) c FROM rechecks WHERE status='pending'")[0]["c"]
        return {
            "claims_with_reviewer_action": reviewed,
            "overrides_recorded": len(overrides),
            "confirmations_recorded": self._q("SELECT COUNT(*) c FROM overrides WHERE kind='confirm'")[0]["c"],
            "overrides_by_rule": by_rule,
            "override_rate": round(len(overrides) / reviewed, 4) if reviewed else None,
            "final_outcomes_recorded": len(outs),
            "outcome_agreement": agree, "outcome_disagreement": disagree,
            "routine_recommendations_contradicted_by_outcome": wrong_routine_outcomes,
            "pending_rechecks": pending,
        }

    def impact(self) -> dict:
        """Business view: what the newest policy version did to old and new claims."""
        pols = self.policies()
        latest = pols[-1]["version"]
        rows = self._q("SELECT * FROM rechecks ORDER BY id")
        moves: dict[str, int] = {}
        for r in rows:
            k = f"{r['from_recommendation']} -> {r['to_recommendation']}"
            moves[k] = moves.get(k, 0) + 1
        claims = self.list_claims()
        return {
            "latest_version": latest, "versions": [p["version"] for p in pols],
            "open_claims": sum(c["case_status"] == "open" for c in claims),
            "closed_claims": sum(c["case_status"] == "closed" for c in claims),
            "closed_changed": 0,  # closed claims are never re-decided
            "recheck_total": len(rows), "recheck_pending": sum(r["status"] == "pending" for r in rows),
            "moves": moves, "rechecks": [dict(r) for r in rows],
        }

    def outbox(self) -> list[dict]:
        return [dict(r) for r in self._q("SELECT * FROM outbox ORDER BY id DESC")]

    def audit_log(self, limit: int = 200) -> list[dict]:
        """One time-ordered feed of everything that happened. Useful for the demo and for audits."""
        events = []
        for r in self._q("SELECT * FROM overrides"):
            events.append({"at": r["created_at"], "type": r["kind"], "case_id": r["case_id"], "by": r["reviewer"],
                           "detail": f"{r['original_recommendation']} -> {r['corrected_recommendation']}: {r['reason']}",
                           "policy_version": r["policy_version"]})
        for r in self._q("SELECT * FROM fact_edits"):
            events.append({"at": r["created_at"], "type": "fact_edit", "case_id": r["case_id"], "by": r["editor"],
                           "detail": f"{r['field']}: {r['old_value']} -> {r['new_value']} ({r['reason']})",
                           "policy_version": r["policy_version"]})
        for r in self._q("SELECT * FROM policy_meta"):
            events.append({"at": r["created_at"], "type": "policy_published", "case_id": "", "by": r["published_by"],
                           "detail": f"{r['version']} approved by {r['approved_by'] or 'n/a'}. {r['note'] or ''}",
                           "policy_version": r["version"]})
        events.sort(key=lambda e: e["at"], reverse=True)
        return events[:limit]
