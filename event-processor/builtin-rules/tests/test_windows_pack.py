"""
Property 11 (Windows subset): Builtin rule pack well-formedness.

Parametrised pytest over every file under event-processor/builtin-rules/windows/*.yml
asserting:
  - Valid YAML (parseable via yaml.safe_load)
  - Required Sigma keys: id, title, status, logsource, level, tags, detection, falsepositives
  - HiveArmor extension keys:
      impact (with confidentiality, integrity, availability sub-keys)
      deduplicateBy (list)
      groupBy (list)
      mitre (with tactic and technique sub-keys)
  - logsource.product == "windows"
  - At least one attack.* tag
  - Zero legacy brand tokens (UTMStack, utmstack, com.utmstack, threatwinds)

Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.8, 3.10, 8.1
"""
from __future__ import annotations

import glob
import os
import re
from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# File collection
# ---------------------------------------------------------------------------

# Locate the windows pack relative to this test file so it works from any cwd.
_REPO_ROOT = Path(__file__).resolve().parents[3]  # .../event-processor/builtin-rules/tests -> repo root
_WINDOWS_PACK_GLOB = str(_REPO_ROOT / "event-processor" / "builtin-rules" / "windows" / "*.yml")

_WINDOWS_RULE_FILES = sorted(glob.glob(_WINDOWS_PACK_GLOB))

# Fail fast and clearly if the glob resolves nothing — the pack hasn't been created yet.
assert _WINDOWS_RULE_FILES, (
    f"No Windows rule files found at {_WINDOWS_PACK_GLOB}. "
    "Ensure event-processor/builtin-rules/windows/*.yml files exist."
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REQUIRED_SIGMA_KEYS = {
    "id",
    "title",
    "status",
    "logsource",
    "level",
    "tags",
    "detection",
    "falsepositives",
}

REQUIRED_IMPACT_SUB_KEYS = {"confidentiality", "integrity", "availability"}
REQUIRED_MITRE_SUB_KEYS = {"tactic", "technique"}

LEGACY_BRAND_TOKENS = re.compile(
    r"UTMStack|utmstack|com\.utmstack|threatwinds",
)

# ---------------------------------------------------------------------------
# Parametrised test
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "rule_path",
    _WINDOWS_RULE_FILES,
    ids=[os.path.basename(p) for p in _WINDOWS_RULE_FILES],
)
def test_windows_rule_well_formed(rule_path: str) -> None:
    """
    **Property 11 (Windows subset): Builtin rule pack well-formedness**

    Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.8, 3.10, 8.1
    """
    raw_text = Path(rule_path).read_text(encoding="utf-8")

    # ------------------------------------------------------------------
    # Requirement 3.4 — Valid YAML
    # ------------------------------------------------------------------
    try:
        rule = yaml.safe_load(raw_text)
    except yaml.YAMLError as exc:
        pytest.fail(f"YAML parse failure in {rule_path}: {exc}")

    assert isinstance(rule, dict), (
        f"{rule_path}: expected a YAML mapping at the top level, got {type(rule).__name__}"
    )

    # ------------------------------------------------------------------
    # Requirement 3.5 — Required Sigma keys present
    # ------------------------------------------------------------------
    missing_sigma = REQUIRED_SIGMA_KEYS - rule.keys()
    assert not missing_sigma, (
        f"{rule_path}: missing required Sigma keys: {sorted(missing_sigma)}"
    )

    # ------------------------------------------------------------------
    # Requirement 3.6 — HiveArmor extension keys present and well-shaped
    # ------------------------------------------------------------------

    # impact
    assert "impact" in rule, f"{rule_path}: missing top-level key 'impact'"
    impact = rule["impact"]
    assert isinstance(impact, dict), (
        f"{rule_path}: 'impact' must be a mapping, got {type(impact).__name__}"
    )
    missing_impact = REQUIRED_IMPACT_SUB_KEYS - impact.keys()
    assert not missing_impact, (
        f"{rule_path}: 'impact' is missing sub-keys: {sorted(missing_impact)}"
    )

    # deduplicateBy — must be a list
    assert "deduplicateBy" in rule, f"{rule_path}: missing top-level key 'deduplicateBy'"
    assert isinstance(rule["deduplicateBy"], list), (
        f"{rule_path}: 'deduplicateBy' must be a list, got {type(rule['deduplicateBy']).__name__}"
    )

    # groupBy — must be a list
    assert "groupBy" in rule, f"{rule_path}: missing top-level key 'groupBy'"
    assert isinstance(rule["groupBy"], list), (
        f"{rule_path}: 'groupBy' must be a list, got {type(rule['groupBy']).__name__}"
    )

    # mitre
    assert "mitre" in rule, f"{rule_path}: missing top-level key 'mitre'"
    mitre = rule["mitre"]
    assert isinstance(mitre, dict), (
        f"{rule_path}: 'mitre' must be a mapping, got {type(mitre).__name__}"
    )
    missing_mitre = REQUIRED_MITRE_SUB_KEYS - mitre.keys()
    assert not missing_mitre, (
        f"{rule_path}: 'mitre' is missing sub-keys: {sorted(missing_mitre)}"
    )

    # ------------------------------------------------------------------
    # Requirement 3.7 — logsource.product == "windows"
    # ------------------------------------------------------------------
    logsource = rule.get("logsource")
    assert isinstance(logsource, dict), (
        f"{rule_path}: 'logsource' must be a mapping, got {type(logsource).__name__}"
    )
    assert logsource.get("product") == "windows", (
        f"{rule_path}: logsource.product expected 'windows', got {logsource.get('product')!r}"
    )

    # ------------------------------------------------------------------
    # Requirement 3.8 — at least one attack.* tag (MITRE_Tag)
    # ------------------------------------------------------------------
    tags = rule.get("tags", [])
    assert isinstance(tags, list), (
        f"{rule_path}: 'tags' must be a list, got {type(tags).__name__}"
    )
    attack_tags = [t for t in tags if isinstance(t, str) and t.startswith("attack.")]
    assert attack_tags, (
        f"{rule_path}: 'tags' must contain at least one MITRE tag starting with 'attack.'; "
        f"found tags: {tags}"
    )

    # ------------------------------------------------------------------
    # Requirement 3.10 — zero legacy brand tokens
    # ------------------------------------------------------------------
    match = LEGACY_BRAND_TOKENS.search(raw_text)
    assert match is None, (
        f"{rule_path}: legacy brand token found: {match.group()!r} "
        f"(tokens checked: UTMStack, utmstack, com.utmstack, threatwinds)"
    )
