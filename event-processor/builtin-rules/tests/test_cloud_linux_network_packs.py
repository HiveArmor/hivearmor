"""
Property 11 (non-Windows packs): Builtin rule pack well-formedness.

Validates: Requirements 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 8.1

Parametrised pytest asserting `logsource.product` equals the expected value per
directory:
  - linux/              → logsource.product == "linux"
  - cloud/aws/          → logsource.product == "aws"
  - cloud/azure/        → logsource.product == "azure"
  - network/            → logsource.product == "network"

Run from repo root:
    pytest event-processor/builtin-rules/tests/
"""

from __future__ import annotations

import pathlib
import re
from typing import List, Tuple

import pytest
import yaml

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

# Anchor on *this* file so the test works regardless of CWD.
_TESTS_DIR = pathlib.Path(__file__).parent
_RULES_ROOT = _TESTS_DIR.parent  # event-processor/builtin-rules/

_LEGACY_BRAND_TOKENS: List[str] = [
    "UTMStack",
    "utmstack",
    "com.utmstack",
    "threatwinds",
    "com.threatwinds",
]

# ---------------------------------------------------------------------------
# Collect (file_path, expected_product) test parameters
# ---------------------------------------------------------------------------

def _collect_pack_params() -> List[Tuple[pathlib.Path, str]]:
    """Return one (file_path, expected_product) tuple per .yml file across all
    four non-Windows rule packs."""
    packs = [
        (_RULES_ROOT / "linux", "linux"),
        (_RULES_ROOT / "cloud" / "aws", "aws"),
        (_RULES_ROOT / "cloud" / "azure", "azure"),
        (_RULES_ROOT / "network", "network"),
    ]
    params: List[Tuple[pathlib.Path, str]] = []
    for directory, product in packs:
        for yml_file in sorted(directory.glob("*.yml")):
            params.append((yml_file, product))
    return params


_PACK_PARAMS = _collect_pack_params()

# Build human-readable IDs: "linux/cron-modification.yml", "aws/cloudtrail-disabled.yml", etc.
_PARAM_IDS = [
    f"{p.relative_to(_RULES_ROOT)}"
    for p, _ in _PACK_PARAMS
]


# ---------------------------------------------------------------------------
# Property 11 (non-Windows packs): Builtin rule pack well-formedness
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("file_path,expected_product", _PACK_PARAMS, ids=_PARAM_IDS)
def test_cloud_linux_network_pack_rule_well_formed(
    file_path: pathlib.Path,
    expected_product: str,
) -> None:
    """
    Property 11 (non-Windows packs): Builtin rule pack well-formedness.

    **Validates: Requirements 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 8.1**

    For each .yml file in linux/, cloud/aws/, cloud/azure/, and network/ this test
    asserts:
    1. The file contains valid YAML (parseable by PyYAML safe_load).
    2. Required Sigma fields are present: id, title, detection, tags.
    3. HiveArmor extension fields are present and correctly structured:
       - impact.confidentiality, impact.integrity, impact.availability
       - deduplicateBy (list)
       - groupBy (list)
       - mitre.tactic, mitre.technique
    4. logsource.product == expected_product (linux / aws / azure / network).
    5. tags contains at least one MITRE ATT&CK tag (starts with "attack.").
    6. No legacy brand tokens are present in the raw file content.
    """
    raw_text = file_path.read_text(encoding="utf-8")

    # ------------------------------------------------------------------
    # 1. Valid YAML
    # ------------------------------------------------------------------
    try:
        rule = yaml.safe_load(raw_text)
    except yaml.YAMLError as exc:
        pytest.fail(f"{file_path.name}: YAML parse error — {exc}")

    assert isinstance(rule, dict), (
        f"{file_path.name}: top-level YAML document must be a mapping, got {type(rule).__name__}"
    )

    # ------------------------------------------------------------------
    # 2. Required Sigma fields: id, title, detection, tags
    # ------------------------------------------------------------------
    required_sigma_fields = ("id", "title", "detection", "tags")
    for field in required_sigma_fields:
        assert field in rule, (
            f"{file_path.name}: missing required Sigma field '{field}'"
        )

    # ------------------------------------------------------------------
    # 3. HiveArmor extension fields
    # ------------------------------------------------------------------

    # impact block with sub-fields
    assert "impact" in rule, f"{file_path.name}: missing HiveArmor extension field 'impact'"
    impact = rule["impact"]
    assert isinstance(impact, dict), (
        f"{file_path.name}: 'impact' must be a mapping, got {type(impact).__name__}"
    )
    for sub in ("confidentiality", "integrity", "availability"):
        assert sub in impact, (
            f"{file_path.name}: 'impact' is missing sub-field '{sub}'"
        )

    # deduplicateBy — must be a list
    assert "deduplicateBy" in rule, (
        f"{file_path.name}: missing HiveArmor extension field 'deduplicateBy'"
    )
    assert isinstance(rule["deduplicateBy"], list), (
        f"{file_path.name}: 'deduplicateBy' must be a list, got {type(rule['deduplicateBy']).__name__}"
    )

    # groupBy — must be a list
    assert "groupBy" in rule, (
        f"{file_path.name}: missing HiveArmor extension field 'groupBy'"
    )
    assert isinstance(rule["groupBy"], list), (
        f"{file_path.name}: 'groupBy' must be a list, got {type(rule['groupBy']).__name__}"
    )

    # mitre block with tactic and technique sub-fields
    assert "mitre" in rule, f"{file_path.name}: missing HiveArmor extension field 'mitre'"
    mitre = rule["mitre"]
    assert isinstance(mitre, dict), (
        f"{file_path.name}: 'mitre' must be a mapping, got {type(mitre).__name__}"
    )
    for sub in ("tactic", "technique"):
        assert sub in mitre, (
            f"{file_path.name}: 'mitre' is missing sub-field '{sub}'"
        )

    # ------------------------------------------------------------------
    # 4. logsource.product == expected_product
    # ------------------------------------------------------------------
    assert "logsource" in rule, f"{file_path.name}: missing 'logsource' field"
    logsource = rule["logsource"]
    assert isinstance(logsource, dict), (
        f"{file_path.name}: 'logsource' must be a mapping"
    )
    assert "product" in logsource, (
        f"{file_path.name}: 'logsource' is missing 'product' sub-field"
    )
    assert logsource["product"] == expected_product, (
        f"{file_path.name}: expected logsource.product == {expected_product!r}, "
        f"got {logsource['product']!r}"
    )

    # ------------------------------------------------------------------
    # 5. At least one attack.* MITRE tag
    # ------------------------------------------------------------------
    tags = rule["tags"]
    assert isinstance(tags, list) and len(tags) > 0, (
        f"{file_path.name}: 'tags' must be a non-empty list"
    )
    attack_tags = [t for t in tags if isinstance(t, str) and t.startswith("attack.")]
    assert len(attack_tags) >= 1, (
        f"{file_path.name}: 'tags' must contain at least one 'attack.*' MITRE tag; "
        f"found tags: {tags}"
    )

    # ------------------------------------------------------------------
    # 6. Zero legacy brand tokens
    # ------------------------------------------------------------------
    for token in _LEGACY_BRAND_TOKENS:
        assert token not in raw_text, (
            f"{file_path.name}: found forbidden legacy brand token '{token}'"
        )


# ---------------------------------------------------------------------------
# Sanity check: ensure the expected number of files were collected per pack
# ---------------------------------------------------------------------------

class TestPackFileCounts:
    """Verify that each pack directory has the required number of rule files."""

    def test_linux_pack_has_15_rules(self) -> None:
        """Requirement 4.1: exactly 15 .yml files under linux/."""
        linux_dir = _RULES_ROOT / "linux"
        yml_files = list(linux_dir.glob("*.yml"))
        assert len(yml_files) == 15, (
            f"Expected 15 Linux rules, found {len(yml_files)}: {[f.name for f in yml_files]}"
        )

    def test_aws_pack_has_10_rules(self) -> None:
        """Requirement 4.1: exactly 10 .yml files under cloud/aws/."""
        aws_dir = _RULES_ROOT / "cloud" / "aws"
        yml_files = list(aws_dir.glob("*.yml"))
        assert len(yml_files) == 10, (
            f"Expected 10 AWS rules, found {len(yml_files)}: {[f.name for f in yml_files]}"
        )

    def test_azure_pack_has_10_rules(self) -> None:
        """Requirement 4.1: exactly 10 .yml files under cloud/azure/."""
        azure_dir = _RULES_ROOT / "cloud" / "azure"
        yml_files = list(azure_dir.glob("*.yml"))
        assert len(yml_files) == 10, (
            f"Expected 10 Azure rules, found {len(yml_files)}: {[f.name for f in yml_files]}"
        )

    def test_network_pack_has_15_rules(self) -> None:
        """Requirement 4.1: exactly 15 .yml files under network/."""
        network_dir = _RULES_ROOT / "network"
        yml_files = list(network_dir.glob("*.yml"))
        assert len(yml_files) == 15, (
            f"Expected 15 Network rules, found {len(yml_files)}: {[f.name for f in yml_files]}"
        )


# ---------------------------------------------------------------------------
# Named-rule presence checks (Requirements 4.2, 4.3, 4.4, 4.5)
# ---------------------------------------------------------------------------

class TestNamedRulesPresent:
    """Verify that each named rule from the spec is present in the right pack."""

    def test_linux_named_rules_present(self) -> None:
        """Requirement 4.2: 6 named Linux rules must exist verbatim."""
        linux_dir = _RULES_ROOT / "linux"
        required = [
            "cron-modification.yml",
            "passwd-shadow-modification.yml",
            "curl-bash-pipeline.yml",
            "sudo-without-tty.yml",
            "suid-sgid-bit-set.yml",
            "ssh-authorized-keys-modification.yml",
        ]
        for name in required:
            assert (linux_dir / name).exists(), (
                f"Required Linux rule file missing: {name}"
            )

    def test_aws_named_rules_present(self) -> None:
        """Requirement 4.3: 4 named AWS rules must exist verbatim."""
        aws_dir = _RULES_ROOT / "cloud" / "aws"
        required = [
            "cloudtrail-disabled.yml",
            "root-account-login.yml",
            "s3-bucket-public-acl.yml",
            "iam-privilege-escalation.yml",
        ]
        for name in required:
            assert (aws_dir / name).exists(), (
                f"Required AWS rule file missing: {name}"
            )

    def test_azure_named_rules_present(self) -> None:
        """Requirement 4.4: 3 named Azure rules must exist verbatim."""
        azure_dir = _RULES_ROOT / "cloud" / "azure"
        required = [
            "nsg-allow-all.yml",
            "mfa-disabled.yml",
            "keyvault-unusual-access.yml",
        ]
        for name in required:
            assert (azure_dir / name).exists(), (
                f"Required Azure rule file missing: {name}"
            )

    def test_network_named_rules_present(self) -> None:
        """Requirement 4.5: 4 named Network rules must exist verbatim."""
        network_dir = _RULES_ROOT / "network"
        required = [
            "port-scan.yml",
            "dns-tor-exit-node.yml",
            "large-outbound-transfer.yml",
            "c2-beaconing.yml",
        ]
        for name in required:
            assert (network_dir / name).exists(), (
                f"Required Network rule file missing: {name}"
            )
