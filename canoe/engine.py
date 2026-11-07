"""Deterministic triage engine.

The written policy decides. No language model is involved in this module.

Key behaviour
-------------
* Facts come from structured fields. A blank or unreadable field is an *absent* fact.
  It is never replaced by a default or a guess.
* Every rule is evaluated with three-valued logic: TRUE, FALSE or UNKNOWN.
* Rules run in policy order. The first TRUE rule decides.
* A known reason for human review always beats a missing document, because the
  review rules come first in the policy.
* If no rule is TRUE but a fact that a rule needs is absent, the answer is
  request_information (rule R0.absent_fact), never routine_processing.
"""

from __future__ import annotations

import re
from typing import Any

TRUE, FALSE, UNKNOWN = "true", "false", "unknown"

OUTCOMES = ("routine_processing", "request_information", "human_review")

# name -> (type, human label)
FIELDS: dict[str, tuple[str, str]] = {
    "policy_active_on_incident": ("bool", "Policy active on incident date"),
    "claim_type": ("text", "Claim type"),
    "repair_type": ("text", "Repair type"),
    "quote_eur": ("number", "Quote (EUR)"),
    "incident_report_present": ("bool", "Incident report present"),
    "itemized_quote_present": ("bool", "Itemized quote present"),
    "injury_reported": ("bool", "Injury reported"),
    "liability_disputed": ("bool", "Liability disputed"),
    "duplicate_flag": ("bool", "Duplicate flag"),
    "evidence_conflict": ("bool", "Evidence conflict"),
}
FIELD_ORDER = list(FIELDS)

_TRUE_WORDS = {"true", "yes", "y", "1", "t"}
_FALSE_WORDS = {"false", "no", "n", "0", "f"}
_BLANK_WORDS = {"", "none", "null", "nan", "n/a", "na", "-"}


# --------------------------------------------------------------------------- parsing
def parse_value(field: str, raw: Any) -> tuple[Any, str]:
    """Return (value, status). status is 'known', 'blank' or 'unreadable'.

    Anything we cannot read with certainty becomes None. We never guess.
    """
    ftype = FIELDS.get(field, ("text", ""))[0]
    if raw is None:
        return None, "blank"
    if isinstance(raw, float) and raw != raw:  # NaN
        return None, "blank"
    if isinstance(raw, bool):
        return (raw, "known") if ftype == "bool" else (None, "unreadable")
    text = str(raw).strip()
    if text.lower() in _BLANK_WORDS:
        return None, "blank"
    if ftype == "bool":
        low = text.lower()
        if low in _TRUE_WORDS:
            return True, "known"
        if low in _FALSE_WORDS:
            return False, "known"
        return None, "unreadable"
    if ftype == "number":
        cleaned = text.replace("€", "").replace("EUR", "").replace("eur", "").replace(" ", "")
        # accept 1,500 and 1.500,50 and 1500.50
        if re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", cleaned):
            cleaned = cleaned.replace(",", "")
        elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d+)?", cleaned):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        elif re.fullmatch(r"-?\d+,\d+", cleaned):
            cleaned = cleaned.replace(",", ".")
        try:
            number = float(cleaned)
        except ValueError:
            return None, "unreadable"
        if number < 0 or number != number or number in (float("inf"), float("-inf")):
            return None, "unreadable"
        return (int(number) if number == int(number) else number), "known"
    return text, "known"


def normalize_claim(row: dict[str, Any]) -> dict[str, Any]:
    """Turn a raw row (CSV or form) into a claim with parsed facts and their status."""
    facts: dict[str, Any] = {}
    status: dict[str, str] = {}
    for field in FIELD_ORDER:
        value, st = parse_value(field, row.get(field))
        facts[field] = value
        status[field] = st
    case_status = str(row.get("case_status") or "open").strip().lower()
    if case_status not in ("open", "closed"):
        case_status = "open"  # unknown status: stay conservative, keep it reviewable
    return {
        "case_id": str(row.get("case_id") or "").strip(),
        "case_status": case_status,
        "claim_summary": str(row.get("claim_summary") or ""),
        "facts": facts,
        "fact_status": status,
    }


# --------------------------------------------------------------------------- evaluation
def _compare(op: str, left: Any, right: Any) -> str:
    if left is None:
        return UNKNOWN
    if op in ("eq", "neq", "in", "not_in"):
        norm = lambda v: str(v).strip().lower()  # noqa: E731
        if op == "eq":
            return TRUE if norm(left) == norm(right) else FALSE
        if op == "neq":
            return TRUE if norm(left) != norm(right) else FALSE
        options = {norm(x) for x in (right if isinstance(right, (list, tuple)) else [right])}
        hit = norm(left) in options
        return TRUE if hit == (op == "in") else FALSE
    try:
        lv, rv = float(left), float(right)
    except (TypeError, ValueError):
        return UNKNOWN
    return TRUE if {"gt": lv > rv, "gte": lv >= rv, "lt": lv < rv, "lte": lv <= rv}[op] else FALSE


def eval_condition(cond: Any, facts: dict[str, Any]) -> str:
    """Evaluate one condition, or a nested {'all': [...]} / {'any': [...]} group."""
    if isinstance(cond, list):
        cond = {"all": cond}
    if "all" in cond:
        results = [eval_condition(c, facts) for c in cond["all"]]
        if FALSE in results:
            return FALSE
        return UNKNOWN if UNKNOWN in results else TRUE
    if "any" in cond:
        results = [eval_condition(c, facts) for c in cond["any"]]
        if TRUE in results:
            return TRUE
        return UNKNOWN if UNKNOWN in results else FALSE
    field, op = cond["field"], cond["op"]
    value = facts.get(field)
    if op == "is_true":
        return UNKNOWN if value is None else (TRUE if value is True else FALSE)
    if op == "is_false":
        return UNKNOWN if value is None else (TRUE if value is False else FALSE)
    return _compare(op, value, cond.get("value"))


def condition_fields(cond: Any) -> list[str]:
    if isinstance(cond, list):
        cond = {"all": cond}
    if "all" in cond:
        return [f for c in cond["all"] for f in condition_fields(c)]
    if "any" in cond:
        return [f for c in cond["any"] for f in condition_fields(c)]
    return [cond["field"]]


_OP_TEXT = {
    "eq": "=", "neq": "!=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=",
    "in": "in", "not_in": "not in",
}


def describe_condition(cond: Any, facts: dict[str, Any]) -> str:
    if isinstance(cond, list):
        cond = {"all": cond}
    if "all" in cond or "any" in cond:
        joiner = " and " if "all" in cond else " or "
        return joiner.join(describe_condition(c, facts) for c in cond.get("all", cond.get("any")))
    field, op = cond["field"], cond["op"]
    value = facts.get(field)
    shown = "blank" if value is None else str(value)
    if op in ("is_true", "is_false"):
        return f"{field} is {shown}"
    return f"{field} {shown} {_OP_TEXT.get(op, op)} {cond.get('value')}"


def policy_fields(policy: dict) -> list[str]:
    """All fields the policy reads, in a stable order."""
    seen: list[str] = []
    for rule in policy["rules"]:
        for f in condition_fields(rule["when"]):
            if f not in seen:
                seen.append(f)
    return seen


# --------------------------------------------------------------------------- decision
def decide(claim: dict[str, Any], policy: dict) -> dict[str, Any]:
    """Apply one policy version to one normalized claim."""
    facts = claim["facts"]
    status = claim["fact_status"]
    version = policy["version"]

    trace = []
    fired = None
    also_true: list[dict] = []
    ask_fields: list[str] = []  # facts we would need to ask the claimant for
    for rule in policy["rules"]:
        result = eval_condition(rule["when"], facts)
        counted = result
        if result == UNKNOWN and rule.get("blank_counts_as_match"):
            counted = TRUE  # a blank document flag means the document is not confirmed present
        trace.append({
            "rule": rule["id"], "outcome": rule["outcome"], "result": result,
            "counted_as": counted, "fields": condition_fields(rule["when"]),
        })
        if counted == TRUE and rule["outcome"] == "request_information":
            for f in condition_fields(rule["when"]):
                if f not in ask_fields:
                    ask_fields.append(f)
        if counted == TRUE:
            if fired is None:
                fired = rule
            else:
                also_true.append(rule)

    needed = policy_fields(policy)
    missing = [f for f in needed if facts.get(f) is None]

    if fired is not None:
        rule_id, outcome, reason = fired["id"], fired["outcome"], fired["reason"]
        basis = describe_condition(fired["when"], facts)
    elif missing:
        rule_id, outcome = "R0.absent_fact", "request_information"
        reason = "A fact the policy needs is absent, so the claim cannot be treated as routine."
        basis = "absent: " + ", ".join(missing)
    else:
        d = policy["default"]
        rule_id, outcome, reason = d["id"], d["outcome"], d["reason"]
        basis = "no earlier rule applied"

    # Even when a rule fired, tell the reviewer which facts remain unconfirmed.
    explanation = _explain(version, rule_id, outcome, reason, basis, also_true, missing, status)

    return {
        "policy_version": version,
        "recommendation": outcome,
        "rule_id": rule_id,
        "full_rule_id": f"{version}:{rule_id}",
        "reason": reason,
        "basis": basis,
        "also_applies": [r["id"] for r in also_true],
        "missing_fields": missing,
        "ask_fields": [f for f in dict.fromkeys(ask_fields + missing)] if outcome == "request_information" else [],
        "trace": trace,
        "explanation": explanation,
    }


def _explain(version, rule_id, outcome, reason, basis, also_true, missing, status) -> str:
    label = {
        "routine_processing": "Routine processing",
        "request_information": "Request information",
        "human_review": "Human review",
    }[outcome]
    parts = [f"{label} under policy {version}, rule {rule_id}. {reason}"]
    if basis and not basis.startswith("no earlier"):
        parts.append(f"Evidence: {basis}.")
    if also_true:
        parts.append("Also applies: " + ", ".join(r["id"] for r in also_true) + ".")
    if missing:
        absent = []
        for f in missing:
            absent.append(f"{f} ({'unreadable' if status.get(f) == 'unreadable' else 'blank'})")
        parts.append("Not confirmed, treated as absent: " + ", ".join(absent) + ".")
    return " ".join(parts)


def decide_all(claim: dict[str, Any], policies: list[dict]) -> dict[str, dict]:
    return {p["version"]: decide(claim, p) for p in policies}
