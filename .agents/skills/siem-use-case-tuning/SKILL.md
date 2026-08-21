---
name: siem-use-case-tuning
description: SIEM alert tuning — reduce false positives via statistical baselining, exclusion list management, per-rule TP/FP analysis. Supports Splunk ES and Elastic SIEM. Triggered by "tune SIEM alerts", "reduce false positives", "alert fatigue tuning", "whitelist rule", "tune detection rule".
---

# SIEM Use Case Tuning

Systematic detection rule analysis to reduce alert fatigue while preserving detection fidelity.

## Requirements

- Splunk Enterprise/Cloud with ES **or** Elastic SIEM
- Minimum **30 days** of historical alert data for meaningful baselines
- Python 3.8+ with SIEM API access credentials

## Core Tuning Workflow

```python
# 1. Export alert volumes per rule (last 30 days)
# Splunk
search = """
search index=notable earliest=-30d
| stats count, values(analyst_disposition) as dispositions by rule_name
| eval fp_count = mvcount(mvfilter(match(dispositions, "FP")))
| eval tp_count = mvcount(mvfilter(match(dispositions, "TP")))
| eval fp_rate = fp_count / count * 100
| sort -count
"""

# Elastic
query = {
  "aggs": {
    "by_rule": {
      "terms": { "field": "kibana.alert.rule.name.keyword", "size": 100 },
      "aggs": {
        "dispositions": {
          "terms": { "field": "kibana.alert.workflow_status.keyword" }
        }
      }
    }
  },
  "size": 0
}
```

### 2. Calculate False Positive Rates

```python
def calculate_fp_rate(total_alerts, analyst_closures):
    if total_alerts == 0:
        return 0
    fp_count = analyst_closures.get("false_positive", 0)
    return (fp_count / total_alerts) * 100

# Rules with FP rate > 70% need tuning or retirement
for rule in rules:
    fp_rate = calculate_fp_rate(rule["total"], rule["dispositions"])
    if fp_rate > 70:
        print(f"TUNE: {rule['name']} — {fp_rate:.1f}% FP rate")
```

### 3. Statistical Baseline Building

```python
import numpy as np

def build_baseline(historical_counts: list, std_multiplier=3.0):
    mean = np.mean(historical_counts)
    std = np.std(historical_counts)
    threshold = mean + (std_multiplier * std)
    return {
        "mean": mean,
        "std": std,
        "dynamic_threshold": threshold
    }
```

### 4. Exclusion List Management

```python
# Trusted entities to whitelist (with justification required)
EXCLUSION_CATEGORIES = {
    "service_accounts": {
        "justification_required": True,
        "review_cadence_days": 90,
        "max_exclusion_days": 365
    },
    "admin_hosts": {
        "justification_required": True,
        "review_cadence_days": 30
    },
    "scheduled_jobs": {
        "justification_required": True,
        "time_window_required": True  # only during known maintenance windows
    }
}
```

### 5. Impact Measurement

```python
def measure_tuning_impact(before_count, after_count, TP_preserved):
    reduction_pct = (before_count - after_count) / before_count * 100
    precision = TP_preserved / after_count * 100 if after_count > 0 else 0
    return {
        "alert_reduction": f"{reduction_pct:.1f}%",
        "precision": f"{precision:.1f}%",
        "recommended": reduction_pct > 30 and precision > 70
    }
```

## Tuning Report Output

```json
{
  "tuning_report": {
    "analysis_period": "30 days",
    "total_rules_analyzed": 150,
    "rules_requiring_tuning": 23,
    "projected_reduction": "47%",
    "per_rule_recommendations": [
      {
        "rule_name": "Brute Force Login",
        "current_volume": 2340,
        "fp_rate": 82.3,
        "recommendation": "Increase threshold from 5 to 15 failures, add service account whitelist",
        "projected_volume": 340,
        "projected_fp_rate": 28.0
      }
    ],
    "whitelist_suggestions": [
      { "entity": "backup-svc@company.com", "rule": "After-Hours Login", "justification": "Nightly backup job" }
    ]
  }
}
```

## CSF / ATT&CK Alignment

| Tuning Goal | NIST CSF | ATT&CK |
|-------------|---------|--------|
| Reduce FP volume | DE.CM-01 | T1078, T1190 |
| Improve MTTD | RS.MA-01 | — |
| Anomaly baseline | DE.AE-02 | — |

## Tuning Governance

- All exclusions require business justification documented in ticket
- Service account exclusions expire after 365 days (auto-review)
- "Retire" rules with sustained >80% FP rate after 90 days of tuning attempts
- Never tune away a rule detecting an active campaign without CISO approval
