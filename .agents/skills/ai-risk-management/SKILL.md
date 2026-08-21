---
name: ai-risk-management
description: AI/ML risk management — NIST AI RMF 1.0 (Govern/Map/Measure/Manage), fairness metrics, EU AI Act compliance, AI governance checklist. Triggered by "AI risk", "AI governance", "NIST AI RMF", "AI fairness", "EU AI Act compliance".
---

# AI Risk Management Framework — NIST AI RMF 1.0

## Four Core Functions

| Function | Focus |
|----------|-------|
| **Govern** | Policies, accountability, risk appetite, AI inventory |
| **Map** | Context, stakeholders, intended use, failure modes |
| **Measure** | Fairness, robustness, explainability, privacy |
| **Manage** | Mitigations, monitoring, incident response |

## Key Insight

A model that's "95% accurate overall may be 60% accurate on the demographic that's most impacted" — aggregate metrics can obscure serious fairness failures. Always evaluate slice-based performance.

## Fairness Metrics

| Metric | Definition | When to Use |
|--------|-----------|-------------|
| Demographic parity | Equal positive rates across groups | Hiring, lending |
| Equalized odds | Equal TPR and FPR across groups | Medical diagnosis, fraud |
| Calibration | Predicted probabilities match outcomes per group | Risk scoring |
| Individual fairness | Similar individuals treated similarly | Recommendation systems |

These metrics often conflict — the MAP phase should pre-determine which matters most for your use case.

## EU AI Act — Risk Tiers

| Tier | Examples | Requirements |
|------|---------|-------------|
| Unacceptable | Social scoring, real-time biometrics | Prohibited |
| High Risk | Employment, credit, law enforcement | Human oversight + conformity assessment |
| Limited Risk | Chatbots, emotion recognition | Transparency obligations |
| Minimal Risk | Spam filters, AI in games | No obligations |

US enforcement: FTC, EEOC, and sector-specific regulators.

## Governance Checklist

- [ ] Written AI principles documented
- [ ] AI system inventory maintained (name, purpose, data, model)
- [ ] Deployment approval gates with documented sign-off
- [ ] Model cards for all production systems
- [ ] Defined AI incident response procedure
- [ ] Decommissioning plan for each AI system

## Model Card Template

```markdown
# Model Card: [System Name]
**Owner:** [Team] | **Date:** [ISO date] | **Version:** [v1.0]

## Intended Use
- Primary use case: [description]
- Intended users: [who uses it]
- Out-of-scope: [what it should NOT be used for]

## Training Data
- Source: [description]
- Size: [N samples]
- Date range: [from - to]
- Known biases: [description]

## Performance
| Metric | Overall | Group A | Group B |
|--------|---------|---------|---------|

## Fairness Evaluation
- Demographic parity gap: [value]
- Known limitations: [description]

## Human Oversight
- Decision type: [fully automated / human-in-the-loop / human-on-the-loop]
- Override mechanism: [description]
```

## HiveArmor AI Risk Considerations

For the SOC AI Assistant (F-15):
- Training data from alert logs — check for representation bias across log source types
- Human-in-the-loop required for all containment recommendations
- Audit trail required for AI-generated decisions (AGENTS.md requirement)
- Prompt injection defense: code/data processed as data-only (see `prompt-injection` skill)
- Model selection transparency: explain why capability tier chosen for each task

## Fairness Tooling

- **Fairlearn** (Python) — fairness metrics + mitigation algorithms
- **AI Fairness 360** (IBM) — 70+ fairness metrics
- **What-If Tool** (Google) — interactive model exploration
- **Aequitas** — bias audit for decision systems
