"""Batch path: claims CSV in, results CSV out.

    python batch.py claims.csv results.csv [--policy-dir policies]

Output columns, in this order:
    case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation

* recommendation_v1 always comes from the first policy version (v1).
* recommendation_v2 comes from the newest published version. If only v1
  exists, it repeats v1.
* Closed claims are never re-decided. recommendation_v2 repeats the retained
  v1 decision and needs_recheck is False.
* Open claims get needs_recheck = True when the newest version changes the
  recommendation.
* A row that cannot be processed becomes human_review, never routine_processing.
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
from pathlib import Path
from typing import Iterable

from .engine import decide, normalize_claim
from .policy import load_policies

COLUMNS = [
    "case_id", "recommendation_v1", "recommendation_v2",
    "needs_recheck", "rule_v1", "rule_v2", "explanation",
]


def _safe_decide(claim: dict, policy: dict) -> dict:
    try:
        return decide(claim, policy)
    except Exception as exc:  # never crash a batch and never fall back to routine
        return {
            "policy_version": policy["version"], "recommendation": "human_review",
            "rule_id": "R0.error", "full_rule_id": f"{policy['version']}:R0.error",
            "explanation": f"Could not process this row ({exc.__class__.__name__}). Sent to human review.",
            "missing_fields": [], "trace": [], "also_applies": [], "reason": "processing error", "basis": "",
        }


def result_row(raw: dict, policies: list[dict], index: int = 0) -> dict:
    """Decide one raw CSV row against v1 and the newest version."""
    row = dict(raw)
    if not str(row.get("case_id") or "").strip():
        row["case_id"] = f"ROW-{index}"
    claim = normalize_claim(row)
    first, latest = policies[0], policies[-1]

    d1 = _safe_decide(claim, first)
    if claim["case_status"] == "closed":
        d2 = d1
        recheck = False
        explanation = f"{d1['explanation']} Closed claim: this decision is retained and not re-decided under newer rules."
    else:
        d2 = d1 if latest is first else _safe_decide(claim, latest)
        recheck = d2["recommendation"] != d1["recommendation"]
        explanation = d2["explanation"]
        if latest is not first:
            if recheck:
                explanation += f" Changed from {d1['recommendation']} ({d1['full_rule_id']}): open claim, recheck needed."
            else:
                explanation += f" Same result as {first['version']}."

    return {
        "case_id": claim["case_id"],
        "recommendation_v1": d1["recommendation"],
        "recommendation_v2": d2["recommendation"],
        "needs_recheck": "True" if recheck else "False",
        "rule_v1": d1["full_rule_id"],
        "rule_v2": d2["full_rule_id"],
        "explanation": explanation,
    }


def run_rows(rows: Iterable[dict], policies: list[dict]) -> list[dict]:
    return [result_row(r, policies, i) for i, r in enumerate(rows, 1)]


def read_csv_text(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    return [{(k or "").strip(): v for k, v in row.items()} for row in reader]


def results_to_csv_text(results: list[dict]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(results)
    return out.getvalue()


def run_file(in_path: str | Path, out_path: str | Path, policy_dir: str | None = None) -> list[dict]:
    policies = load_policies(policy_dir)
    text = Path(in_path).read_text(encoding="utf-8-sig")
    results = run_rows(read_csv_text(text), policies)
    Path(out_path).write_text(results_to_csv_text(results), encoding="utf-8", newline="")
    return results


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Canoe batch triage: claims CSV in, results CSV out")
    ap.add_argument("input", help="claims CSV")
    ap.add_argument("output", help="results CSV to write")
    ap.add_argument("--policy-dir", default=None, help="folder with v1.json, v2.json, ... (default: ./policies)")
    args = ap.parse_args(argv)
    results = run_file(args.input, args.output, args.policy_dir)
    changed = sum(r["needs_recheck"] == "True" for r in results)
    versions = ", ".join(p["version"] for p in load_policies(args.policy_dir))
    print(f"Wrote {len(results)} rows to {args.output}. Policy versions: {versions}. Need recheck: {changed}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
