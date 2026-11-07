"""Run with:  python -m unittest discover -s tests -v"""
import copy
import csv
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from canoe import batch, policy, policy_text, quality
from canoe.engine import decide, normalize_claim
from canoe.store import Store, StoreError

ROOT = Path(__file__).resolve().parent.parent
DEV = ROOT / "data" / "labelled_development_cases.csv"
PRACTICE = ROOT / "data" / "unlabelled_practice_cases.csv"


def v1():
    return policy.load_policy(ROOT / "policies" / "v1.json")


def make_v2():
    """A demo policy change, only used in tests: lower the limit and review EV battery work."""
    p = copy.deepcopy(v1())
    p["version"] = "v2"
    for r in p["rules"]:
        if r["id"] == "R1.quote_over_limit":
            r["when"][0]["value"] = 1200
    p["rules"].insert(7, {
        "id": "R1.ev_battery", "outcome": "human_review", "reason": "EV battery work needs review.",
        "when": [{"field": "repair_type", "op": "eq", "value": "ev_high_voltage_battery"}]})
    return p


def rows(path):
    return list(csv.DictReader(open(path, encoding="utf-8-sig")))


class EngineTests(unittest.TestCase):
    def test_all_labelled_cases_match_v1(self):
        pol = v1()
        for r in rows(DEV):
            got = decide(normalize_claim(r), pol)["recommendation"]
            self.assertEqual(got, r["expected_v1"], r["case_id"])

    def test_boundary_1500_is_routine_and_1501_is_review(self):
        base = dict(rows(DEV)[0], quote_eur="1500")
        self.assertEqual(decide(normalize_claim(base), v1())["recommendation"], "routine_processing")
        base["quote_eur"] = "1501"
        self.assertEqual(decide(normalize_claim(base), v1())["recommendation"], "human_review")

    def test_blank_never_becomes_routine(self):
        for field in ["policy_active_on_incident", "claim_type", "quote_eur", "incident_report_present",
                      "itemized_quote_present", "injury_reported", "liability_disputed", "duplicate_flag",
                      "evidence_conflict"]:
            r = dict(rows(DEV)[0])
            r[field] = ""
            d = decide(normalize_claim(r), v1())
            self.assertNotEqual(d["recommendation"], "routine_processing", field)
            self.assertEqual(d["recommendation"], "request_information", field)

    def test_known_review_reason_beats_blank_field(self):
        r = dict(rows(DEV)[0], injury_reported="True", incident_report_present="")
        self.assertEqual(decide(normalize_claim(r), v1())["recommendation"], "human_review")

    def test_unreadable_values_are_absent(self):
        r = dict(rows(DEV)[0], quote_eur="see attachment")
        d = decide(normalize_claim(r), v1())
        self.assertEqual(d["recommendation"], "request_information")
        self.assertIn("quote_eur", d["missing_fields"])

    def test_number_formats(self):
        from canoe.engine import parse_value
        self.assertEqual(parse_value("quote_eur", "1,500")[0], 1500)
        self.assertEqual(parse_value("quote_eur", "€ 1.234,50")[0], 1234.5)
        self.assertEqual(parse_value("quote_eur", "abc")[1], "unreadable")
        self.assertEqual(parse_value("quote_eur", "")[1], "blank")

    def test_decision_carries_policy_version_and_rule(self):
        d = decide(normalize_claim(rows(DEV)[3]), v1())
        self.assertEqual(d["policy_version"], "v1")
        self.assertEqual(d["full_rule_id"], "v1:R1.quote_over_limit")


class RealV2Tests(unittest.TestCase):
    """policies/v2.json must match the official change notice."""

    def setUp(self):
        self.v2 = policy.load_policy(ROOT / "policies" / "v2.json")

    def rec(self, **over):
        row = dict(rows(DEV)[0])  # a complete, routine claim
        row.update({k: str(v) for k, v in over.items()})
        return decide(normalize_claim(row), self.v2)["recommendation"]

    def test_limit_boundary_is_1200(self):
        self.assertEqual(self.rec(quote_eur=1200), "routine_processing")
        self.assertEqual(self.rec(quote_eur=1201), "human_review")

    def test_ev_battery_always_review_and_beats_missing_documents(self):
        self.assertEqual(self.rec(repair_type="ev_high_voltage_battery", quote_eur=100), "human_review")
        self.assertEqual(self.rec(repair_type="ev_high_voltage_battery", itemized_quote_present="False"), "human_review")

    def test_v2_labels_on_dev_cases(self):
        for r in csv.DictReader(open(ROOT / "data" / "labelled_development_cases_v2.csv", encoding="utf-8-sig")):
            got = decide(normalize_claim(r), self.v2)["recommendation"]
            self.assertEqual(got, r["expected_v2"], r["case_id"])


class PolicyTextTests(unittest.TestCase):
    """A policy written as sentences must behave exactly like the JSON policy."""

    TEMPLATE = ROOT / "docs" / "policy_template.txt"

    def test_template_matches_official_v2_on_random_claims(self):
        import random
        parsed = policy_text.parse_policy_text(self.TEMPLATE.read_text(encoding="utf-8"))
        self.assertEqual(parsed["warnings"], [])
        draft = {"version": "v2", "rules": parsed["rules"], "default": parsed["default"]}
        policy.validate(draft)
        official = policy.load_policy(ROOT / "policies" / "v2.json")
        rnd = random.Random(7)
        pick = rnd.choice
        for i in range(1500):
            row = {"case_id": str(i), "case_status": "open",
                   "policy_active_on_incident": pick(["True", "False", ""]), "claim_type": pick(["motor_own_damage", "theft", ""]),
                   "repair_type": pick(["standard", "ev_high_voltage_battery", ""]),
                   "quote_eur": pick(["", "300", "1200", "1201", "1500", "abc"]),
                   "incident_report_present": pick(["True", "False", ""]), "itemized_quote_present": pick(["True", "False", ""]),
                   "injury_reported": pick(["True", "False", ""]), "liability_disputed": pick(["True", "False"]),
                   "duplicate_flag": pick(["True", "False"]), "evidence_conflict": pick(["True", "False"])}
            c = normalize_claim(row)
            self.assertEqual(decide(c, draft)["recommendation"], decide(c, official)["recommendation"], row)

    def test_unreadable_line_blocks_the_draft_instead_of_skipping_it(self):
        for bad in ["Send to human_review if quote is greater than 1200",
                    "Send to human_review if quote_eur is bigger-ish than 1200",
                    "Send to human_review if injury_reported is true and claim_type is theft or duplicate_flag is true",
                    "Send to human_review if vehicle_age is greater than 15",
                    "Send to human_review if repair_type is true"]:
            res = policy_text.parse_policy_text("Send to human_review if injury_reported is true\n" + bad)
            self.assertTrue(any(l["status"] == "error" for l in res["lines"]), bad)

    def test_routine_cannot_be_a_rule_and_prose_is_ignored(self):
        res = policy_text.parse_policy_text("Send to routine_processing if quote_eur is greater than 5\nThis is just a sentence.")
        self.assertEqual([l["status"] for l in res["lines"]], ["error", "ignored"])

    def test_numbering_markdown_and_euro_formats(self):
        res = policy_text.parse_policy_text("# Policy\nVersion: 3\n1. Send to human_review if quote_eur is above €1,250.50.\n- Request information if itemized_quote_present is false or blank")
        self.assertEqual(res["version"], "v3")
        self.assertEqual(res["rules"][0]["when"], [{"field": "quote_eur", "op": "gt", "value": 1250.5}])
        self.assertTrue(res["rules"][1]["blank_counts_as_match"])

    def test_or_splits_into_rules_and_value_lists_keep_their_or(self):
        res = policy_text.parse_policy_text(
            "Send to human_review if injury_reported is true or duplicate_flag is true\n"
            "Send to human_review if claim_type is one of theft or other")
        self.assertEqual([r["id"] for r in res["rules"]], ["R1.injury_reported", "R1.duplicate_flag", "R1.claim_type"])
        self.assertEqual(res["rules"][2]["when"][0]["value"], ["theft", "other"])

    def test_add_mode_keeps_review_rules_ahead_of_missing_documents(self):
        existing = policy.load_policy(ROOT / "policies" / "v1.json")["rules"]
        new = policy_text.parse_policy_text("Send to human_review if quote_eur is greater than 1000\n"
                                            "Send to human_review if injury_reported is true")["rules"]
        merged, notes = policy_text.add_to(existing, new)
        ids = [r["id"] for r in merged]
        self.assertLess(ids.index("R1.quote_eur"), ids.index("R2.incident_report_missing"))
        self.assertEqual(len(merged), len(existing) + 1)  # the injury rule already existed
        self.assertTrue(any("Skipped" in n for n in notes))

    def test_docx_is_read(self):
        import io
        import zipfile
        xml = ('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
               "<w:p><w:r><w:t>Send to human_review if quote_eur is greater than 900</w:t></w:r></w:p></w:body></w:document>")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("word/document.xml", xml)
        res = policy_text.parse_policy_text(policy_text.extract_text(buf.getvalue()))
        self.assertEqual(res["rules"][0]["when"][0]["value"], 900)
        with self.assertRaises(policy_text.ParseProblem):
            policy_text.extract_text(b"PK\x03\x04not really a zip")


class PolicyTests(unittest.TestCase):
    def test_invalid_policy_rejected(self):
        bad = v1()
        bad["rules"][0]["when"][0]["field"] = "nonsense"
        with self.assertRaises(policy.PolicyError):
            policy.validate(bad)
        bad = v1()
        bad["rules"][0]["outcome"] = "routine_processing"
        with self.assertRaises(policy.PolicyError):
            policy.validate(bad)


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "pol").mkdir()
        shutil.copy(ROOT / "policies" / "v1.json", self.tmp / "pol" / "v1.json")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_required_columns_and_order(self):
        out = self.tmp / "out.csv"
        batch.run_file(PRACTICE, out, self.tmp / "pol")
        header = next(csv.reader(open(out)))
        self.assertEqual(header, ["case_id", "recommendation_v1", "recommendation_v2", "needs_recheck",
                                  "rule_v1", "rule_v2", "explanation"])

    def test_closed_claims_keep_v1_and_never_recheck(self):
        policy.save_policy(make_v2(), self.tmp / "pol")
        out = self.tmp / "out.csv"
        batch.run_file(PRACTICE, out, self.tmp / "pol")
        res = {r["case_id"]: r for r in csv.DictReader(open(out))}
        for cid in ("PRA-009", "PRA-010"):  # closed
            self.assertEqual(res[cid]["recommendation_v2"], res[cid]["recommendation_v1"])
            self.assertEqual(res[cid]["needs_recheck"], "False")
            self.assertEqual(res[cid]["rule_v2"], res[cid]["rule_v1"])
        self.assertEqual(res["PRA-003"]["needs_recheck"], "True")  # open, 1201 -> review under demo v2
        self.assertTrue(res["PRA-003"]["rule_v2"].startswith("v2:"))
        self.assertEqual(res["PRA-001"]["needs_recheck"], "False")

    def test_only_v1_means_v2_repeats_v1(self):
        out = self.tmp / "out.csv"
        batch.run_file(DEV, out, self.tmp / "pol")
        for r in csv.DictReader(open(out)):
            self.assertEqual(r["recommendation_v1"], r["recommendation_v2"])
            self.assertEqual(r["needs_recheck"], "False")

    def test_bad_row_goes_to_review_not_routine(self):
        pols = policy.load_policies(self.tmp / "pol")
        res = batch.result_row({"case_id": "X", "case_status": "open"}, pols)  # everything blank
        self.assertNotEqual(res["recommendation_v1"], "routine_processing")


class QualityTests(unittest.TestCase):
    def test_v1_metrics_on_dev(self):
        rep = quality.evaluate(rows(DEV), [v1()])
        m = rep["versions"]["v1"]
        self.assertEqual((m["n"], m["correct"], m["incorrect_routine"], m["unnecessary_human_review"]), (14, 14, 0, 0))
        ids = {b["case_id"] for b in rep["blank_fields"]}
        self.assertEqual(ids, {"DEV-013", "DEV-014"})

    def test_changed_cases_reported_separately(self):
        labelled = rows(DEV)
        for r in labelled:  # pretend labels for the demo v2
            r["expected_v2"] = r["expected_v1"]
        for r in labelled:
            if r["case_id"] in ("DEV-010", "DEV-011"):
                r["expected_v2"] = "human_review"
        rep = quality.evaluate(labelled, [v1(), make_v2()])
        cc = rep["changed_cases"]
        self.assertEqual({c["case_id"] for c in cc["cases"]}, {"DEV-010", "DEV-011"})
        self.assertEqual(cc["wrong_after"], 0)
        self.assertEqual(sorted(cc["fixed"]), ["DEV-010", "DEV-011"])
        self.assertEqual(rep["versions"]["v2"]["accuracy"], 1.0)
        self.assertEqual(rep["versions"]["v1"]["incorrect_routine"], 0)

    def test_wrong_routine_is_counted(self):
        labelled = rows(DEV)
        labelled[0]["expected_v1"] = "human_review"  # system says routine, label says review
        m = quality.evaluate(labelled, [v1()])["versions"]["v1"]
        self.assertEqual(m["incorrect_routine"], 1)
        self.assertEqual(m["failures"][0]["kind"], "incorrect_routine")


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "pol").mkdir()
        shutil.copy(ROOT / "policies" / "v1.json", self.tmp / "pol" / "v1.json")
        self.s = Store(self.tmp / "t.db", self.tmp / "pol")
        self.s.sync_policies()
        self.s.seed(ROOT / "data")

    def tearDown(self):
        self.s.db.close()
        shutil.rmtree(self.tmp)

    def test_override_records_everything(self):
        c = self.s.override("DEV-001", "human_review", "Photos look edited", "Rita Reviewer")
        o = c["overrides"][-1]
        self.assertEqual((o["kind"], o["corrected_recommendation"], o["reason"], o["reviewer"], o["policy_version"]),
                         ("override", "human_review", "Photos look edited", "Rita Reviewer", "v1"))
        self.assertEqual(c["effective_recommendation"], "human_review")
        self.assertEqual(c["latest_decision"]["recommendation"], "routine_processing")  # system output is kept

    def test_override_needs_reason_and_reviewer(self):
        with self.assertRaises(StoreError):
            self.s.override("DEV-001", "human_review", "", "Rita")
        with self.assertRaises(StoreError):
            self.s.override("DEV-001", "human_review", "because", "")

    def test_closed_claims_cannot_be_changed(self):
        with self.assertRaises(StoreError):
            self.s.override("PRA-009", "human_review", "x", "R")
        with self.assertRaises(StoreError):
            self.s.edit_facts("PRA-009", {"quote_eur": "5000"}, "x", "R")

    def test_publish_flags_open_and_spares_closed(self):
        before_closed = self.s.get_claim("PRA-009")["decisions"]
        res = self.s.publish_policy(make_v2(), "Pia Policy", "Omar Approver", "demo")
        self.assertEqual(res["applied"]["closed_untouched"], 2)
        self.assertEqual(self.s.get_claim("PRA-009")["decisions"], before_closed)
        c = self.s.get_claim("PRA-003")
        self.assertEqual(c["latest_decision"]["policy_version"], "v2")
        self.assertEqual(c["rechecks"][-1]["status"], "pending")
        self.assertEqual(c["effective_recommendation"], "human_review")
        with self.assertRaises(StoreError):  # a second publish of the same draft is refused
            self.s.publish_policy(make_v2(), "P", "O", "again")
        same = copy.deepcopy(make_v2())
        same["version"] = "v3"
        with self.assertRaises(StoreError):  # a draft identical to the live version is refused
            self.s.publish_policy(same, "P", "O", "no-op")
        with self.assertRaises(StoreError):  # publishing needs author and approver
            self.s.publish_policy({**make_v2(), "version": "v3", "title": "x"}, "", "O", "n")

    def test_info_request_loop(self):
        c = self.s.submit_claim({
            "claimant_name": "Ana", "claimant_email": "ana@example.com", "claim_summary": "Scratch",
            "policy_active_on_incident": "True", "claim_type": "motor_own_damage", "repair_type": "standard",
            "quote_eur": "500", "incident_report_present": "", "itemized_quote_present": "True",
            "injury_reported": "False", "liability_disputed": "False", "duplicate_flag": "False",
            "evidence_conflict": "False"})
        self.assertEqual(c["latest_decision"]["recommendation"], "request_information")
        self.assertEqual(c["info_requests"][-1]["ask_fields"], ["incident_report_present"])
        self.assertEqual(len(self.s.outbox()), 1)
        c = self.s.answer_info(c["case_id"], {"incident_report_present": "True", "injury_reported": "True"}, "Ana")
        self.assertEqual(c["latest_decision"]["recommendation"], "routine_processing")  # injury was not asked, ignored
        self.assertEqual([f for f in c["fields"] if f["field"] == "incident_report_present"][0]["source"], "claimant_followup")

    def test_reviewer_fact_edit_is_logged_and_redecides(self):
        c = self.s.edit_facts("DEV-001", {"injury_reported": "True"}, "Photo shows a bandage", "Rita")
        self.assertEqual(c["latest_decision"]["recommendation"], "human_review")
        e = c["fact_edits"][-1]
        self.assertEqual((e["field"], e["editor"], e["reason"], e["policy_version"]),
                         ("injury_reported", "Rita", "Photo shows a bandage", "v1"))

    def test_settle_closes_for_good_with_reviewer_reason_and_version(self):
        c = self.s.settle("DEV-006", "decline", "Injury claim handled by bodily-injury team", "Rita Reviewer")
        self.assertEqual(c["case_status"], "closed")
        self.assertFalse(c["editable"])
        st = c["settlement"]
        self.assertEqual((st["decision"], st["reviewer"], st["policy_version"], st["system_recommendation"]),
                         ("decline", "Rita Reviewer", "v1", "human_review"))
        for call in (lambda: self.s.override("DEV-006", "routine_processing", "x", "R"),
                     lambda: self.s.edit_facts("DEV-006", {"injury_reported": "False"}, "x", "R"),
                     lambda: self.s.settle("DEV-006", "approve", "x", "R")):
            with self.assertRaises(StoreError) as e:
                call()
            self.assertEqual(e.exception.status, 409)
        self.assertTrue(any(ev["type"] == "settled" and ev["case_id"] == "DEV-006" for ev in self.s.audit_log()))

    def test_settle_rules(self):
        with self.assertRaises(StoreError):
            self.s.settle("DEV-006", "decline", "", "Rita")          # decline needs a reason
        with self.assertRaises(StoreError):
            self.s.settle("DEV-006", "approve", "", "Rita")          # approving a review case needs a reason
        with self.assertRaises(StoreError):
            self.s.settle("DEV-001", "approve", "", "")              # reviewer required
        with self.assertRaises(StoreError):
            self.s.settle("DEV-001", "pay_out", "x", "Rita")         # no other decisions
        c = self.s.settle("DEV-001", "approve", "", "Rita")          # routine case: reason optional
        self.assertEqual(c["case_status"], "closed")

    def test_settled_claim_is_untouched_by_a_new_policy(self):
        self.s.settle("PRA-003", "approve", "", "Rita")              # 1,201 would move under the demo v2
        res = self.s.publish_policy(make_v2(), "Pia Policy", "Omar Approver", "demo")
        c = self.s.get_claim("PRA-003")
        self.assertEqual(c["latest_decision"]["policy_version"], "v1")
        self.assertNotIn("PRA-003", [r["case_id"] for r in self.s.impact()["rechecks"]])
        self.assertIn("closed_untouched", res["applied"])

    def test_policy_change_time_is_measured(self):
        self.s.preview_policy(make_v2())
        self.s.preview_policy(make_v2())
        res = self.s.publish_policy(make_v2(), "Pia Policy", "Omar Approver", "demo")
        t = res["change_timing"]
        self.assertEqual(t["version"], "v2")
        self.assertEqual(t["previews"], 2)
        self.assertGreaterEqual(t["duration_seconds"], 0)
        self.assertEqual(self.s.impact()["policy_changes"][0]["version"], "v2")

    FORM = dict(claim_type="motor_own_damage", repair_type="standard", quote_eur="650",
                incident_report_present="True", itemized_quote_present="True", injury_reported="False",
                liability_disputed="False", claim_summary="Parking scrape")

    def test_form_claim_gets_insurer_facts_and_can_be_routine(self):
        c = self.s.submit_claim({**self.FORM, "policy_number": "pol-1001", "incident_date": "2026-11-02"})
        self.assertEqual(c["latest_decision"]["recommendation"], "routine_processing")
        src = {f["field"]: f["source"] for f in c["fields"]}
        for f in ("policy_active_on_incident", "duplicate_flag", "evidence_conflict"):
            self.assertEqual(src[f], "insurer_system_demo")
        self.assertEqual(len(c["insurer_checks"]), 3)

    def test_insurer_checks_never_guess(self):
        c = self.s.submit_claim({**self.FORM, "policy_number": "POL-9999", "incident_date": "2026-11-02"})
        f = {x["field"]: x for x in c["fields"]}
        self.assertEqual(f["policy_active_on_incident"]["status"], "blank")    # unknown policy stays absent
        self.assertEqual(c["latest_decision"]["recommendation"], "request_information")
        c = self.s.submit_claim(dict(self.FORM))                                 # no policy number at all
        self.assertEqual(c["latest_decision"]["recommendation"], "request_information")

    def test_insurer_checks_find_inactive_policy_duplicate_and_conflict(self):
        c = self.s.submit_claim({**self.FORM, "policy_number": "POL-2001", "incident_date": "2026-09-01"})
        self.assertEqual(c["latest_decision"]["recommendation"], "human_review")  # policy ended in June
        self.s.submit_claim({**self.FORM, "policy_number": "POL-1002", "incident_date": "2026-10-10"})
        c = self.s.submit_claim({**self.FORM, "policy_number": "POL-1002", "incident_date": "2026-10-10"})
        self.assertTrue(next(x for x in c["fields"] if x["field"] == "duplicate_flag")["value"])
        c = self.s.submit_claim({**self.FORM, "policy_number": "POL-1003", "incident_date": "2026-10-11",
                                 "stated_quote_eur": "900", "document_quote_eur": "1900"})
        self.assertTrue(next(x for x in c["fields"] if x["field"] == "evidence_conflict")["value"])
        self.assertEqual(c["latest_decision"]["recommendation"], "human_review")

    def test_batch_and_csv_input_are_not_enriched(self):
        res = self.s.import_claims_csv("case_id,case_status,claim_summary,policy_active_on_incident,claim_type,repair_type,quote_eur,"
                                       "incident_report_present,itemized_quote_present,injury_reported,liability_disputed,"
                                       "duplicate_flag,evidence_conflict\nCSV-1,open,x,,motor_own_damage,standard,650,True,True,False,False,,\n")
        c = self.s.get_claim("CSV-1")
        self.assertEqual(c["latest_decision"]["recommendation"], "request_information")
        self.assertEqual(c["insurer_checks"], [])

    def test_preview_reports_draft_quality_before_release(self):
        pv = self.s.preview_policy(make_v2())
        q = pv["draft_quality"]
        self.assertIn("v2", q["versions"])
        self.assertEqual(q["versions"]["v1"]["correct"], q["versions"]["v1"]["n"])
        self.assertEqual(self.s.policies()[-1]["version"], "v1")   # nothing published

    def test_final_outcome_is_kept_separate_from_recommendation(self):
        self.s.record_outcome("DEV-001", "human_review", "downstream", "Fraud flagged later", "Claims ops")
        m = self.s.monitoring()
        self.assertEqual(m["outcome_disagreement"], 1)
        self.assertEqual(m["routine_recommendations_contradicted_by_outcome"], ["DEV-001"])
        self.assertEqual(self.s.get_claim("DEV-001")["latest_decision"]["recommendation"], "routine_processing")


if __name__ == "__main__":
    unittest.main()
