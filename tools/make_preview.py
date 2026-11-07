"""Developer tool: build self-contained preview HTML files (CSS, JS and API data inlined)
so the screens can be looked at without running a server.

    python tools/make_preview.py OUTPUT_DIR
"""
import copy
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from canoe import policy  # noqa: E402
from canoe.store import Store  # noqa: E402

out_dir = Path(sys.argv[1])
out_dir.mkdir(parents=True, exist_ok=True)
tmp = Path(tempfile.mkdtemp())
(tmp / "pol").mkdir()
shutil.copy(ROOT / "policies" / "v1.json", tmp / "pol" / "v1.json")
s = Store(tmp / "p.db", tmp / "pol")
s.sync_policies()
s.seed(ROOT / "data")

v2 = copy.deepcopy(policy.load_policy(ROOT / "policies" / "v1.json"))
v2["version"] = "v2"
for r in v2["rules"]:
    if r["id"] == "R1.quote_over_limit":
        r["when"][0]["value"] = 1200
        r["reason"] = "The repair quote is above the routine limit of EUR 1,200."
v2["rules"].insert(7, {"id": "R1.ev_battery", "outcome": "human_review", "reason": "EV high-voltage battery work needs review.",
                       "when": [{"field": "repair_type", "op": "eq", "value": "ev_high_voltage_battery"}]})
s.override("DEV-001", "human_review", "Photos look edited", "Rita Reviewer")
s.publish_policy(v2, "Pia Policy", "Omar Approver", "Lower limit to 1,200 and review EV battery work (demo)")
s.record_outcome("DEV-001", "human_review", "audit", "Fraud confirmed later", "Claims ops")

example = s.submit_claim({
    "claimant_name": "Ana Demo", "claimant_email": "ana@example.com", "claim_summary": "Rear bumper, parking damage",
    "policy_active_on_incident": "True", "claim_type": "motor_own_damage", "repair_type": "standard", "quote_eur": "2140",
    "incident_report_present": "True", "itemized_quote_present": "", "injury_reported": "False",
    "liability_disputed": "False", "duplicate_flag": "False", "evidence_conflict": "False"})
incomplete = s.submit_claim({
    "claimant_name": "Ben Demo", "claimant_email": "ben@example.com", "claim_summary": "Minor bumper damage. The incident report has not been sent yet.",
    "policy_active_on_incident": "True", "claim_type": "motor_own_damage", "repair_type": "standard", "quote_eur": "750",
    "incident_report_present": "", "itemized_quote_present": "True", "injury_reported": "False",
    "liability_disputed": "False", "duplicate_flag": "False", "evidence_conflict": "False"})

data = {
    "GET /api/health": {"status": "ok", "policy_version": "v2"},
    "GET /api/impact": s.impact(),
    "GET /api/claims": {"claims": s.list_claims()},
    "GET /api/policy": s.policy_overview(),
    "GET /api/quality": s.quality_report(),
    "GET /api/audit": {"events": s.audit_log()},
    "POST /api/claims": example,
}
for c in s.list_claims():
    data[f"GET /api/claims/{c['case_id']}"] = s.get_claim(c["case_id"])
data["GET /api/claims/CLM-0002"] = incomplete

static = ROOT / "canoe" / "static"
css = (static / "styles.css").read_text(encoding="utf-8")
js = (static / "app.js").read_text(encoding="utf-8")
mock = ("const __DATA__ = " + json.dumps(data) + ";\n"
        "window.fetch = async (url, opts = {}) => { const key = (opts.method || 'GET') + ' ' + String(url).split('?')[0];\n"
        "  const hit = __DATA__[key]; const ok = hit !== undefined;\n"
        "  return { ok, status: ok ? 200 : 404, statusText: 'x', json: async () => ok ? hit : { error: 'Preview only: ' + key }, text: async () => '' }; };\n")
shell = (static / "index.html").read_text(encoding="utf-8")


def build(name, start, signed_in=True, scroll=None, desktop=False):
    html = shell.replace('<link rel="stylesheet" href="/styles.css">', f"<style>{css}</style>")
    pre = f"try{{location.hash='{start}';}}catch(e){{}}\n"
    if signed_in:
        pre += "window.__SIGNED__=true;\n"
    user_js = 'let user = {name: "Rita Reviewer"};' if signed_in else "let user = null;"
    page_js = js.replace("let user = null;", user_js, 1)
    inject = "<script>" + pre + mock + "</script><script>" + page_js + "</script>"
    if scroll:
        inject += ("<script>setTimeout(function(){var e=document.querySelector(" + json.dumps(scroll) +
                   ");if(e){window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-70);}},1200);</script>")
    html = html.replace('<script src="/app.js"></script>', inject)
    if desktop:  # render at 1280px inside a scaled frame, because the preview panel is narrow
        import html as htmllib
        html = ('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f3eee2;overflow:hidden">'
                '<iframe style="width:1280px;height:1700px;border:0;transform:scale(0.49);transform-origin:0 0" srcdoc="'
                + htmllib.escape(html, quote=True) + '"></iframe></body>')
    (out_dir / name).write_text(html, encoding="utf-8")


build("d_home.html", "#/", desktop=True)
build("d_outcomes.html", "#/", scroll=".section", desktop=True)
build("d_reviewer.html", "#/reviewers/PRA-003", desktop=True)
build("d_reviewer_low.html", "#/reviewers/PRA-003", scroll="#override-form", desktop=True)
build("d_policy.html", "#/policy", desktop=True)
build("d_measurement.html", "#/measurement", desktop=True)
build("d_business.html", "#/business", desktop=True)
build("d_triage.html", "#/triage", desktop=True)
build("preview_home.html", "#/")
build("preview_scene.html", "#/", scroll=".scene")
build("preview_outcomes.html", "#/", scroll=".outcomes")
build("preview_control.html", "#/", scroll=".control")
build("preview_reviewer_detail.html", "#/reviewers/PRA-003", scroll="#detail")
build("preview_reviewer_action.html", "#/reviewers/PRA-003", scroll="#override-form")
build("preview_policy_rules.html", "#/policy", scroll="#rules")
build("preview_triage_form.html", "#/triage", scroll="#claim-form")
build("preview_triage.html", "#/triage")
build("preview_reviewer.html", "#/reviewers/PRA-003")
build("preview_policy.html", "#/policy")
build("preview_measurement.html", "#/measurement")
build("preview_business.html", "#/business")
build("preview_claim.html", "#/claim/CLM-0002")
print("built", sorted(p.name for p in out_dir.glob("preview_*.html")))
