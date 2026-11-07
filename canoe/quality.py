"""Quality measurement on labelled cases, by policy version.

Headline numbers, per policy version:
  * correct next-step recommendations
  * incorrect routine_processing  (predicted routine, label says otherwise: the costly error)
  * unnecessary human_review      (predicted review, label says review was not needed)

Changed cases are reported separately so a good overall score cannot hide a
failure on the new policy. Cases with blank inputs get their own section.
"""

from __future__ import annotations

from .engine import FIELD_ORDER, OUTCOMES, decide, normalize_claim, policy_fields

BLANK = ("", None)


def _label(row: dict, version: str, first_version: str) -> str | None:
    """Expected outcome for a case under a version, or None if unlabelled."""
    if version == first_version:
        value = row.get("expected_v1") or row.get(f"expected_{version}")
    else:
        value = row.get(f"expected_{version}")
        if not value and (row.get("case_status") or "open").strip().lower() == "closed":
            value = row.get("expected_v1")  # closed claims keep their original outcome
        if not value and version == "v2":
            value = row.get("expected_v2")
    value = (value or "").strip()
    return value if value in OUTCOMES else None


def _predict(claim: dict, policy: dict, first: dict) -> dict:
    if claim["case_status"] == "closed" and policy is not first:
        return decide(claim, first)  # closed: retained v1 decision
    return decide(claim, policy)


def _rate(n: int, d: int) -> float:
    return round(n / d, 4) if d else 0.0


def _metrics(items: list[dict]) -> dict:
    """items: [{pred, label, ...}] with labels present."""
    n = len(items)
    correct = sum(i["pred"] == i["label"] for i in items)
    wrong_routine = [i for i in items if i["pred"] == "routine_processing" and i["label"] != "routine_processing"]
    unneeded_review = [i for i in items if i["pred"] == "human_review" and i["label"] != "human_review"]
    routine_preds = sum(i["pred"] == "routine_processing" for i in items)
    confusion = {a: {b: 0 for b in OUTCOMES} for a in OUTCOMES}
    for i in items:
        confusion[i["label"]][i["pred"]] += 1
    return {
        "n": n,
        "correct": correct,
        "accuracy": _rate(correct, n),
        "incorrect_routine": len(wrong_routine),
        "incorrect_routine_rate": _rate(len(wrong_routine), n),
        "incorrect_routine_share_of_routine_recommendations": _rate(len(wrong_routine), routine_preds),
        "unnecessary_human_review": len(unneeded_review),
        "unnecessary_human_review_rate": _rate(len(unneeded_review), n),
        "confusion_label_by_prediction": confusion,
    }


def evaluate(rows: list[dict], policies: list[dict]) -> dict:
    """rows: labelled CSV rows (expected_v1, optional expected_v2 ...)."""
    first = policies[0]
    latest = policies[-1]
    versions = [first] if latest is first else [first, latest]
    claims = [(r, normalize_claim(r)) for r in rows]

    report: dict = {"versions": {}, "changed_cases": {}, "blank_fields": [], "notes": []}
    per_version_items: dict[str, list[dict]] = {}

    for pol in versions:
        v = pol["version"]
        labelled, unlabelled = [], []
        for raw, claim in claims:
            d = _predict(claim, pol, first)
            item = {
                "case_id": claim["case_id"], "case_status": claim["case_status"],
                "pred": d["recommendation"], "rule": d["full_rule_id"],
                "label": _label(raw, v, first["version"]), "summary": claim["claim_summary"],
            }
            (labelled if item["label"] else unlabelled).append(item)
        per_version_items[v] = labelled + unlabelled
        entry = {"policy_version": v, "labelled_cases": len(labelled), "unlabelled_cases": len(unlabelled)}
        if labelled:
            entry.update(_metrics(labelled))
            entry["failures"] = [
                {**i, "kind": _failure_kind(i)} for i in labelled if i["pred"] != i["label"]
            ]
        else:
            entry["note"] = f"No expected labels for {v}. Add an expected_{v} column to measure it."
        report["versions"][v] = entry

    # changed cases: open claims whose recommendation moved between v1 and the newest version
    if latest is not first:
        v1, vn = first["version"], latest["version"]
        by_id_1 = {i["case_id"]: i for i in per_version_items[v1]}
        changed = []
        for i in per_version_items[vn]:
            before = by_id_1[i["case_id"]]
            if before["case_status"] == "open" and before["pred"] != i["pred"]:
                changed.append({
                    "case_id": i["case_id"], "from": before["pred"], "to": i["pred"],
                    "rule_before": before["rule"], "rule_after": i["rule"],
                    "label_after": i["label"], "label_before": before["label"],
                    "correct_before": (before["pred"] == before["label"]) if before["label"] else None,
                    "correct_after": (i["pred"] == i["label"]) if i["label"] else None,
                })
        labelled_changed = [c for c in changed if c["label_after"]]
        report["changed_cases"] = {
            "from_version": v1, "to_version": vn,
            "count": len(changed), "cases": changed,
            "labelled": len(labelled_changed),
            "correct_after": sum(1 for c in labelled_changed if c["correct_after"]),
            "wrong_after": sum(1 for c in labelled_changed if not c["correct_after"]),
        }
        # Judge both versions against the NEW labels (what the rule change intends).
        # fixed: the old version's answer is wrong under the new rules and the new version is right.
        # regressions: the old answer was right under the new rules and the new version is wrong.
        regress, fixed = [], []
        for i in per_version_items[vn]:
            b = by_id_1[i["case_id"]]
            if i["label"]:
                if b["pred"] != i["label"] and i["pred"] == i["label"]:
                    fixed.append(i["case_id"])
                if b["pred"] == i["label"] and i["pred"] != i["label"]:
                    regress.append(i["case_id"])
        report["changed_cases"]["regressions"] = regress
        report["changed_cases"]["fixed"] = fixed

    # blank-field handling, using the first policy's fields plus the newest
    needed = []
    for pol in versions:
        for f in policy_fields(pol):
            if f not in needed:
                needed.append(f)
    for raw, claim in claims:
        absent = [f for f in needed if claim["facts"].get(f) is None]
        if absent:
            d = decide(claim, latest)
            lab = _label(raw, latest["version"], first["version"])
            report["blank_fields"].append({
                "case_id": claim["case_id"], "absent_fields": absent,
                "unreadable_fields": [f for f in absent if claim["fact_status"][f] == "unreadable"],
                "recommendation": d["recommendation"], "rule": d["full_rule_id"],
                "label": lab, "correct": (d["recommendation"] == lab) if lab else None,
            })
    report["notes"].append(
        "A blank or unreadable field is an absent fact. It is never filled in. "
        "If a known fact already requires human review, that wins; otherwise the claim goes to request_information."
    )
    return report


def _failure_kind(item: dict) -> str:
    if item["pred"] == "routine_processing":
        return "incorrect_routine"
    if item["pred"] == "human_review" and item["label"] != "human_review":
        return "unnecessary_human_review"
    if item["label"] == "human_review":
        return "missed_human_review"
    return "wrong_next_step"


def report_markdown(report: dict) -> str:
    lines = ["# Canoe quality report", ""]
    lines += ["| Policy | Labelled | Correct | Accuracy | Incorrect routine | Unnecessary review |", "|---|---|---|---|---|---|"]
    for v, e in report["versions"].items():
        if e["labelled_cases"]:
            lines.append(
                f"| {v} | {e['labelled_cases']} | {e['correct']} | {e['accuracy']:.0%} | "
                f"{e['incorrect_routine']} ({e['incorrect_routine_rate']:.0%}) | "
                f"{e['unnecessary_human_review']} ({e['unnecessary_human_review_rate']:.0%}) |"
            )
        else:
            lines.append(f"| {v} | 0 | n/a | n/a | n/a | n/a |")
    cc = report.get("changed_cases")
    if cc:
        lines += ["", f"## Changed cases ({cc['from_version']} to {cc['to_version']}): {cc['count']}"]
        for c in cc["cases"]:
            lines.append(f"- {c['case_id']}: {c['from']} to {c['to']} ({c['rule_after']})")
        lines.append(f"- Fixed: {cc['fixed'] or 'none'}. Regressions: {cc['regressions'] or 'none'}.")
    lines += ["", "## Cases with blank or unreadable inputs"]
    for b in report["blank_fields"]:
        lines.append(f"- {b['case_id']}: absent {', '.join(b['absent_fields'])} -> {b['recommendation']} ({b['rule']})")
    return "\n".join(lines) + "\n"
