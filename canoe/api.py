"""HTTP API and static site. Standard library only.

    python -m canoe.api            # serves http://localhost:8000

Environment
    PORT              port to listen on (default 8000)
    CANOE_API_TOKEN   if set, every /api request (except /api/health) must send
                      "Authorization: Bearer <token>" or "X-API-Key: <token>"
    CANOE_DB          path of the SQLite file
    CANOE_POLICY_DIR  folder with v1.json, v2.json, ...
"""

from __future__ import annotations

import hmac
import json
import mimetypes
import os
import re
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import batch as batch_mod
from . import policy as policy_mod
from . import policy_text
from .policy import PolicyError
from .store import Store, StoreError

STATIC = Path(__file__).resolve().parent / "static"
MAX_BODY = 5 * 1024 * 1024
TOKEN = os.environ.get("CANOE_API_TOKEN", "")

store: Store | None = None


def get_store() -> Store:
    global store
    if store is None:
        store = Store()
        store.sync_policies()
        store.seed()
    return store


class Handler(BaseHTTPRequestHandler):
    server_version = "Canoe/1.0"

    # ---------------------------------------------------------------- plumbing
    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise StoreError("Request is too large (limit 5 MB).", 413)
        return self.rfile.read(length) if length else b""

    def _json_body(self) -> dict:
        raw = self._body()
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise StoreError("The request body is not valid JSON.")
        if not isinstance(data, dict):
            raise StoreError("The request body must be a JSON object.")
        return data

    def _authorized(self) -> bool:
        if not TOKEN:
            return True
        given = self.headers.get("X-API-Key") or ""
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            given = auth[7:].strip()
        return hmac.compare_digest(given.encode(), TOKEN.encode())

    # ---------------------------------------------------------------- verbs
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def _route(self, method: str):
        url = urlparse(self.path)
        path = url.path.rstrip("/") or "/"
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            if not path.startswith("/api"):
                return self._static(path) if method == "GET" else self._json(405, {"error": "Method not allowed"})
            if path != "/api/health" and not self._authorized():
                return self._json(401, {"error": "Missing or wrong API token."})
            result = self._api(method, path, query)
            if result is not None:
                self._json(200, result)
        except StoreError as exc:
            self._json(exc.status, {"error": str(exc)})
        except PolicyError as exc:
            self._json(400, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            traceback.print_exc()
            self._json(500, {"error": f"Server error: {exc.__class__.__name__}: {exc}"})

    # ---------------------------------------------------------------- static
    def _static(self, path: str):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = (STATIC / rel).resolve()
        if not str(target).startswith(str(STATIC.resolve())):
            return self._json(404, {"error": "Not found"})
        if not target.is_file():
            target = STATIC / "index.html"  # single-page app fallback
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
            ctype += "; charset=utf-8"
        self._send(200, target.read_bytes(), ctype, {"Cache-Control": "no-cache"})

    # ---------------------------------------------------------------- api
    def _api(self, method: str, path: str, query: dict):
        s = get_store()
        parts = path.split("/")[2:]  # after /api

        if method == "GET":
            if parts == ["health"]:
                return {"status": "ok", "policy_version": s.latest_policy()["version"]}
            if parts == ["policy"]:
                return s.policy_overview()
            if parts == ["claims"]:
                return {"claims": s.list_claims(query.get("status"))}
            if len(parts) == 2 and parts[0] == "claims":
                return s.get_claim(parts[1])
            if parts == ["quality"]:
                return s.quality_report()
            if parts == ["impact"]:
                return s.impact()
            if parts == ["outbox"]:
                return {"emails": s.outbox()}
            if parts == ["audit"]:
                return {"events": s.audit_log()}
            raise StoreError("Not found", 404)

        # POST
        if parts == ["claims"]:
            return s.submit_claim(self._json_body())
        if len(parts) == 3 and parts[0] == "claims":
            body, cid = self._json_body(), parts[1]
            if parts[2] == "override":
                return s.override(cid, body.get("corrected_recommendation", ""), body.get("reason", ""), body.get("reviewer", ""))
            if parts[2] == "facts":
                return s.edit_facts(cid, body.get("changes") or {}, body.get("reason", ""), body.get("reviewer", ""))
            if parts[2] == "info-response":
                return s.answer_info(cid, body.get("values") or {}, body.get("name", ""))
            if parts[2] == "outcome":
                return s.record_outcome(cid, body.get("final_outcome", ""), body.get("source", ""),
                                        body.get("note", ""), body.get("recorded_by", ""))
        if parts == ["policy", "parse"]:
            return self._parse_policy(s, query)
        if parts == ["policy", "preview"]:
            return s.preview_policy(self._json_body().get("draft") or {})
        if parts == ["policy", "publish"]:
            b = self._json_body()
            return s.publish_policy(b.get("draft") or {}, b.get("published_by", ""), b.get("approved_by", ""), b.get("note", ""))
        if parts == ["batch"]:
            return self._batch(s, query)
        if parts == ["labelled-import"]:
            text = self._body().decode("utf-8-sig", errors="replace")
            return s.import_claims_csv(text, "labelled_import", labelled=True)
        raise StoreError("Not found", 404)

    def _parse_policy(self, s: Store, query: dict):
        """Read a policy written in plain sentences (.txt, .md, .docx) into a draft. Writes nothing."""
        data = self._body()
        if not data:
            raise StoreError("The file is empty.")
        try:
            text = policy_text.extract_text(data)
        except policy_text.ParseProblem as exc:
            raise StoreError(str(exc))
        parsed = policy_text.parse_policy_text(text)
        latest = s.latest_policy()
        lines = [l for l in parsed["lines"] if not (l["status"] == "ignored" and l["detail"] in ("comment", "heading or comment"))]
        errors = [l for l in parsed["lines"] if l["status"] == "error"]
        out = {"mode": query.get("mode", "replace"), "lines": lines, "warnings": parsed["warnings"], "notes": [],
               "has_errors": bool(errors), "draft": None, "version_in_document": parsed["version"]}
        if errors:
            return out  # never hand back a partial draft: a skipped rule could send a claim to routine processing
        if not parsed["rules"]:
            raise StoreError("No rules found. Write each rule as a sentence such as "
                             "'Send to human_review if quote_eur is greater than 1200'. See the template.")
        if out["mode"] == "add":
            rules, out["notes"] = policy_text.add_to(latest["rules"], parsed["rules"])
        else:
            rules = parsed["rules"]
        draft = {"title": parsed["title"] or latest.get("title", ""), "rules": rules, "default": latest["default"]}
        policy_mod.validate({**draft, "version": "v1"})
        nxt = policy_mod.next_version(s.policies())
        if parsed["version"] and parsed["version"] != nxt:
            out["warnings"].append(f"The document says {parsed['version']}, but the next version will be {nxt}. The number is assigned when you publish.")
        out["draft"] = draft
        return out

    def _batch(self, s: Store, query: dict):
        text = self._body().decode("utf-8-sig", errors="replace")
        rows = batch_mod.read_csv_text(text)
        if not rows:
            raise StoreError("The CSV has no rows. Check it has a header line and at least one claim.")
        results = batch_mod.run_rows(rows, s.policies())
        saved = None
        if query.get("save") in ("1", "true", "yes"):
            saved = s.import_claims_csv(text, "batch_upload")
        csv_text = batch_mod.results_to_csv_text(results)
        if query.get("format") == "csv":
            self._send(200, csv_text.encode("utf-8"), "text/csv; charset=utf-8",
                       {"Content-Disposition": 'attachment; filename="results.csv"'})
            return None
        return {"columns": batch_mod.COLUMNS, "results": results, "csv": csv_text, "saved": saved,
                "policy_versions": [p["version"] for p in s.policies()]}


def serve(port: int | None = None) -> None:
    port = port or int(os.environ.get("PORT", "8000"))
    get_store()
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Canoe running on http://localhost:{port}  (token {'required' if TOKEN else 'off'})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    serve()
