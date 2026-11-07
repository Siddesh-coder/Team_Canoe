"""Policy versions stored as JSON files: policies/v1.json, v2.json, ..."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from .engine import FIELDS, OUTCOMES

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = Path(os.environ.get("CANOE_POLICY_DIR", ROOT / "policies"))

OPS = {"is_true", "is_false", "eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in"}
VALUE_OPS = OPS - {"is_true", "is_false"}


class PolicyError(ValueError):
    pass


def version_key(version: str) -> int:
    m = re.fullmatch(r"v(\d+)", version)
    if not m:
        raise PolicyError(f"Version '{version}' must look like v1, v2, v3")
    return int(m.group(1))


def _validate_condition(cond, where: str) -> None:
    if isinstance(cond, list):
        cond = {"all": cond}
    if not isinstance(cond, dict):
        raise PolicyError(f"{where}: condition must be an object or a list")
    if "all" in cond or "any" in cond:
        items = cond.get("all", cond.get("any"))
        if not items:
            raise PolicyError(f"{where}: empty condition group")
        for c in items:
            _validate_condition(c, where)
        return
    field, op = cond.get("field"), cond.get("op")
    if field not in FIELDS:
        raise PolicyError(f"{where}: unknown field '{field}'")
    if op not in OPS:
        raise PolicyError(f"{where}: unknown operator '{op}'")
    if op in VALUE_OPS and "value" not in cond:
        raise PolicyError(f"{where}: operator '{op}' needs a value")
    if op in ("gt", "gte", "lt", "lte"):
        try:
            float(cond["value"])
        except (TypeError, ValueError):
            raise PolicyError(f"{where}: '{op}' needs a number, got {cond['value']!r}")


def validate(policy: dict) -> dict:
    if not isinstance(policy, dict):
        raise PolicyError("Policy must be an object")
    version_key(str(policy.get("version", "")))
    rules = policy.get("rules")
    if not isinstance(rules, list) or not rules:
        raise PolicyError("Policy needs at least one rule")
    seen = set()
    for i, rule in enumerate(rules, 1):
        rid = rule.get("id")
        if not rid or not isinstance(rid, str):
            raise PolicyError(f"Rule {i}: missing id")
        if rid in seen:
            raise PolicyError(f"Rule id '{rid}' is used twice")
        seen.add(rid)
        if rule.get("outcome") not in OUTCOMES or rule["outcome"] == "routine_processing":
            raise PolicyError(f"Rule {rid}: outcome must be human_review or request_information")
        if not rule.get("reason"):
            raise PolicyError(f"Rule {rid}: add a plain-language reason")
        _validate_condition(rule.get("when"), f"Rule {rid}")
    default = policy.get("default") or {}
    if default.get("outcome") != "routine_processing" or not default.get("id"):
        raise PolicyError("Policy needs a default routine_processing outcome with an id")
    return policy


def load_policy(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return validate(json.load(fh))


def load_policies(directory: Path | str | None = None) -> list[dict]:
    """All policy versions, oldest first."""
    folder = Path(directory) if directory else DEFAULT_DIR
    found = []
    for path in sorted(folder.glob("v*.json")):
        try:
            found.append(load_policy(path))
        except (PolicyError, json.JSONDecodeError) as exc:
            raise PolicyError(f"{path.name}: {exc}") from exc
    found.sort(key=lambda p: version_key(p["version"]))
    if not found:
        raise PolicyError(f"No policy files found in {folder}")
    return found


def next_version(policies: list[dict]) -> str:
    return f"v{max(version_key(p['version']) for p in policies) + 1}"


def save_policy(policy: dict, directory: Path | str | None = None) -> Path:
    validate(policy)
    folder = Path(directory) if directory else DEFAULT_DIR
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{policy['version']}.json"
    if path.exists():
        raise PolicyError(f"{policy['version']} already exists. Published versions never change.")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(policy, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    return path
