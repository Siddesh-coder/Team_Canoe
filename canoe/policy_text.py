"""Turn a policy written in plain sentences (.txt, .md or .docx) into a draft policy.

No AI is involved. The same text always gives the same rules, and a line that
cannot be read is reported, never guessed. The draft is only a draft: the policy
owner previews it and publishes it with an approver, as for any other change.

Format, one rule per line, top to bottom is the order they run in:

    Version: v3                                       (optional)
    Title: Motor claims triage                        (optional)
    Send to human_review if quote_eur is greater than 1200
    Send to human_review if repair_type is ev_high_voltage_battery because EV battery work needs review.
    Send to human_review if claim_type is not motor_own_damage or injury_reported is true
    Send to request_information if incident_report_present is false or blank
    Otherwise routine_processing

* "and" joins conditions that must all hold. "or" starts another rule with the same outcome.
  Mixing "and" with "or" on one line is refused, because the meaning would be a guess.
* "because ..." sets the reason shown to reviewers (otherwise one is written from the line).
* "or blank" after a condition on a request_information rule means a blank counts as missing.
* Lines that start with # or // are comments. Lines that are not rules are listed as ignored.
"""

from __future__ import annotations

import difflib
import io
import re
import zipfile
from xml.etree import ElementTree as ET

from . import policy as policy_mod
from .engine import FIELDS, parse_value

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
LABEL = {"human_review": "human review", "request_information": "request information"}

_NUMBERING = re.compile(r"^\s*(?:[-*•]\s+|(?:rule\s*)?\d+\s*[.):\-]\s*)", re.I)
_RULE = re.compile(
    r"^(?:send(?:\s+the\s+claim)?\s+to\s+|route\s+to\s+|recommend\s+)?"
    r"(human[\s_]review|request[\s_]information|routine[\s_]processing)\s+(?:if|when|where)\s+(.+)$", re.I)
_OTHERWISE = re.compile(r"^(?:otherwise|else|default)\b[\s,:]*(?:send\s+to\s+|recommend\s+)?(routine[\s_]processing)\.?$", re.I)
_BLANK = re.compile(r"\s+or\s+(?:is\s+)?(?:blank|missing|not\s+known|unknown)\b", re.I)
_NUM = r"(-?[\d][\d.,]*)"
_FIELD = r"([A-Za-z][A-Za-z0-9_ \-]*?)"

_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(rf"^{_FIELD}\s+(?:is|are)\s+(?:true|yes)$", re.I), "is_true"),
    (re.compile(rf"^{_FIELD}\s+(?:is|are)\s+(?:false|no)$", re.I), "is_false"),
    (re.compile(rf"^{_FIELD}\s+(?:is\s+)?(?:greater\s+than|more\s+than|higher\s+than|above|over|exceeds|>)\s*€?\s*{_NUM}\s*(?:eur|euros?)?$", re.I), "gt"),
    (re.compile(rf"^{_FIELD}\s+(?:is\s+)?(?:at\s+least|>=)\s*€?\s*{_NUM}\s*(?:eur|euros?)?$", re.I), "gte"),
    (re.compile(rf"^{_FIELD}\s+(?:is\s+)?(?:less\s+than|lower\s+than|below|under|<)\s*€?\s*{_NUM}\s*(?:eur|euros?)?$", re.I), "lt"),
    (re.compile(rf"^{_FIELD}\s+(?:is\s+)?(?:at\s+most|<=)\s*€?\s*{_NUM}\s*(?:eur|euros?)?$", re.I), "lte"),
    (re.compile(rf"^{_FIELD}\s+is\s+one\s+of\s+(.+)$", re.I), "in"),
    (re.compile(rf"^{_FIELD}\s+is\s+none\s+of\s+(.+)$", re.I), "not_in"),
    (re.compile(rf"^{_FIELD}\s+(?:is\s+not|isn'?t|!=|does\s+not\s+equal|not\s+equal\s+to)\s+(.+)$", re.I), "neq"),
    (re.compile(rf"^{_FIELD}\s+(?:is|equals|==|=)\s+(.+)$", re.I), "eq"),
]

OP_WORDS = {
    "is_true": "is true", "is_false": "is false", "eq": "is", "neq": "is not", "gt": "is greater than",
    "gte": "is at least", "lt": "is less than", "lte": "is at most", "in": "is one of", "not_in": "is none of",
}


class ParseProblem(Exception):
    pass


# --------------------------------------------------------------------------- reading files
def extract_text(data: bytes) -> str:
    """Text of a .docx (detected by its zip header) or a plain text file."""
    if data[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                xml = z.read("word/document.xml")
        except (zipfile.BadZipFile, KeyError):
            raise ParseProblem("That file looks like a Word document but cannot be opened. Save it again as .docx or .txt.")
        root = ET.fromstring(xml)
        lines = []
        for para in root.iter(f"{W}p"):
            parts = []
            for node in para.iter():
                if node.tag == f"{W}t":
                    parts.append(node.text or "")
                elif node.tag in (f"{W}tab", f"{W}br"):
                    parts.append(" ")
            lines.append("".join(parts))
        return "\n".join(lines)
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ParseProblem("Could not read the text file. Save it as UTF-8 .txt.")


# --------------------------------------------------------------------------- parsing
def _field(name: str) -> str:
    key = re.sub(r"[\s\-]+", "_", name.strip().lower())
    if key in FIELDS:
        return key
    near = difflib.get_close_matches(key, list(FIELDS), n=1, cutoff=0.6)
    hint = f" Did you mean {near[0]}?" if near else ""
    raise ParseProblem(f"Unknown field '{name.strip()}'.{hint} Known fields: {', '.join(FIELDS)}.")


def _value(field: str, raw: str):
    raw = raw.strip().strip(".").strip("\"'“”")
    ftype = FIELDS[field][0]
    if ftype == "number":
        value, status = parse_value(field, raw)
        if status != "known":
            raise ParseProblem(f"'{raw}' is not a number for {field}.")
        return value
    if ftype == "bool":
        raise ParseProblem(f"{field} is a yes/no field. Write '{field} is true' or '{field} is false'.")
    return raw


def _condition(text: str) -> dict:
    text = text.strip().strip(".;")
    for pattern, op in _PATTERNS:
        m = pattern.match(text)
        if not m:
            continue
        field = _field(m.group(1))
        ftype = FIELDS[field][0]
        if op in ("is_true", "is_false"):
            if ftype != "bool":
                raise ParseProblem(f"{field} is not a yes/no field, so 'true' or 'false' does not apply.")
            return {"field": field, "op": op}
        if op in ("gt", "gte", "lt", "lte"):
            if ftype != "number":
                raise ParseProblem(f"{field} is not a number, so a size comparison does not apply.")
            return {"field": field, "op": op, "value": _value(field, m.group(2))}
        if op in ("in", "not_in"):
            items = [v.strip().strip("\"'") for v in re.split(r",|\s+or\s+|\s+and\s+", m.group(2)) if v.strip()]
            if not items:
                raise ParseProblem("Give at least one value after 'one of'.")
            return {"field": field, "op": op, "value": items}
        return {"field": field, "op": op, "value": _value(field, m.group(2))}
    raise ParseProblem(f"Cannot read the condition '{text}'. Use forms like 'quote_eur is greater than 1200', "
                       "'injury_reported is true' or 'claim_type is not motor_own_damage'.")


def _describe(cond: dict) -> str:
    v = cond.get("value")
    if isinstance(v, list):
        v = ", ".join(v)
    return f"{cond['field']} {OP_WORDS[cond['op']]}" + (f" {v}" if v is not None else "")


def _parse_rule_line(outcome_word: str, body: str) -> list[dict]:
    outcome = re.sub(r"[\s]+", "_", outcome_word.strip().lower())
    if outcome == "routine_processing":
        raise ParseProblem("routine_processing is what happens when no rule applies. Write 'Otherwise routine_processing' instead.")
    reason = None
    parts = re.split(r"\s+because\s+", body, maxsplit=1, flags=re.I)
    body = parts[0]
    if len(parts) == 2:
        reason = parts[1].strip().rstrip(".") + "."
    blank = bool(_BLANK.search(body))
    if blank:
        if outcome != "request_information":
            raise ParseProblem("'or blank' only makes sense on a request_information rule.")
        body = _BLANK.sub("", body)
    groups = re.split(r"\s+or\s+", body.strip().rstrip(".;"), flags=re.I)
    if len(groups) > 1 and any(re.search(r"\sand\s", g, re.I) for g in groups):
        raise ParseProblem("This line mixes 'and' with 'or'. Split it into separate lines so the meaning is exact.")
    # an "or" that sits inside a value list belongs to the list, not to the rules
    merged: list[str] = []
    for g in groups:
        if merged and re.search(r"\sis\s+(?:one|none)\s+of\s", merged[-1], re.I) and not re.search(r"\s(?:is|are|=|>|<)", g):
            merged[-1] += " or " + g
        else:
            merged.append(g)
    rules = []
    for g in merged:
        conds = [_condition(c) for c in re.split(r"\s+and\s+", g, flags=re.I) if c.strip()]
        if not conds:
            raise ParseProblem("This line has no condition after 'if'.")
        rule = {"outcome": outcome, "when": conds,
                "reason": reason or f"Rule from the policy document: {' and '.join(_describe(c) for c in conds)}."}
        if blank:
            rule["blank_counts_as_match"] = True
        rules.append(rule)
    return rules


def parse_policy_text(text: str) -> dict:
    """Returns {version, title, rules, default, warnings, lines}. Never raises for a bad line."""
    version = title = None
    rules: list[dict] = []
    lines: list[dict] = []
    warnings: list[str] = []
    has_otherwise = False

    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("//"):
            lines.append({"n": n, "text": line, "status": "ignored", "detail": "comment"})
            continue
        if line.startswith("#"):  # markdown heading or comment, unless it carries a version or title
            line = line.lstrip("#").strip()
            if not re.match(r"^(version|title)\s*[:=]", line, re.I):
                lines.append({"n": n, "text": raw.strip(), "status": "ignored", "detail": "heading or comment"})
                continue
        m = re.match(r"^(version|title)\s*[:=]\s*(.+)$", line, re.I)
        if m:
            if m.group(1).lower() == "version":
                v = m.group(2).strip().lower()
                v = v if v.startswith("v") else f"v{v}"
                try:
                    policy_mod.version_key(v)
                    version = v
                except policy_mod.PolicyError:
                    warnings.append(f"Line {n}: '{m.group(2).strip()}' is not a version like v3, so it was ignored.")
            else:
                title = m.group(2).strip()
            lines.append({"n": n, "text": raw.strip(), "status": "ok", "detail": m.group(1).lower()})
            continue
        stripped = _NUMBERING.sub("", line).strip().rstrip(";")
        if _OTHERWISE.match(stripped):
            has_otherwise = True
            lines.append({"n": n, "text": raw.strip(), "status": "ok", "detail": "default: routine_processing"})
            continue
        m = _RULE.match(stripped)
        if not m:
            lines.append({"n": n, "text": raw.strip(), "status": "ignored", "detail": "not a rule, so it was skipped"})
            continue
        try:
            new = _parse_rule_line(m.group(1), m.group(2))
        except ParseProblem as exc:
            lines.append({"n": n, "text": raw.strip(), "status": "error", "detail": str(exc)})
            warnings.append(f"Line {n}: {exc}")
            continue
        rules.extend(new)
        lines.append({"n": n, "text": raw.strip(), "status": "ok", "detail": f"{len(new)} rule{'s' if len(new) != 1 else ''}"})

    # ids and defaults
    used: set[str] = set()
    final: list[dict] = []
    for rule in rules:
        prefix = "R1" if rule["outcome"] == "human_review" else "R2"
        base = "_and_".join(dict.fromkeys(c["field"] for c in rule["when"]))
        rid, k = f"{prefix}.{base}", 2
        while rid in used:
            rid = f"{prefix}.{base}_{k}"
            k += 1
        used.add(rid)
        item = {"id": rid, "outcome": rule["outcome"], "reason": rule["reason"], "when": rule["when"]}
        if rule.get("blank_counts_as_match"):
            item["blank_counts_as_match"] = True
        final.append(item)
    rules = final
    if not has_otherwise:
        warnings.append("No 'Otherwise routine_processing' line found. The default stays routine_processing.")
    default = {"id": "R3.routine", "outcome": "routine_processing",
               "reason": "No rule for review or for missing information applies. The claim may enter normal downstream processing. "
                         "This is not a payment approval."}
    return {"version": version, "title": title, "rules": rules, "default": default, "warnings": warnings, "lines": lines}


# --------------------------------------------------------------------------- merging into a policy
def _signature(rule: dict) -> str:
    conds = sorted(repr(sorted(c.items(), key=lambda kv: kv[0])) for c in (rule["when"] if isinstance(rule["when"], list) else [rule["when"]]))
    return rule["outcome"] + "|" + "|".join(conds)


def add_to(existing_rules: list[dict], new_rules: list[dict]) -> tuple[list[dict], list[str]]:
    """Insert new rules into an existing ordered list without reordering what is there.

    human_review rules go before the first request_information rule, so a known reason for
    review still beats a missing document. request_information rules go last.
    """
    rules = [dict(r) for r in existing_rules]
    notes: list[str] = []
    have = {_signature(r) for r in rules}
    used = {r["id"] for r in rules}
    for rule in new_rules:
        if _signature(rule) in have:
            notes.append(f"Skipped a rule that already exists: {rule['id']}.")
            continue
        rid, k = rule["id"], 2
        while rid in used:
            rid = f"{rule['id']}_{k}"
            k += 1
        rule = {**rule, "id": rid}
        used.add(rid)
        have.add(_signature(rule))
        if rule["outcome"] == "human_review":
            pos = next((i for i, r in enumerate(rules) if r["outcome"] == "request_information"), len(rules))
        else:
            pos = len(rules)
        rules.insert(pos, rule)
        notes.append(f"Added {rid} ({LABEL[rule['outcome']]}).")
    return rules, notes
