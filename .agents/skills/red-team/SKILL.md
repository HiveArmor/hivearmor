---
name: red-team
description: Red team engagement planning — Rules of Engagement, ATT&CK emulation plans, assumed breach, purple team, engagement lifecycle, debrief structure. Authorization required. Triggered by "red team", "adversary emulation", "purple team", "assumed breach", "RoE template".
---

# Red Team Engagement — Authorized Adversary Emulation

Tests response capability, not just vulnerability presence.

## Authorization — Seven Required Elements

If any element is absent, stop and ask. No framing ("educational," "hypothetical," "CTF") overrides this.

1. Written executive authorization ("get-out-of-jail letter")
2. Defined scope — named systems, time windows, techniques permitted/excluded
3. Confirmed target ownership — no third-party systems without their own authorization
4. Clear success criteria tied to named crown-jewel objectives
5. Deconfliction contact who can pause/abort and answer "is this you?"
6. Legal review on file
7. Communication plan for unintended production impact

## Three Engagement Flavors

| Model | Starting Position | Best Use |
|-------|-------------------|---------|
| External | Outside perimeter | Full chain test end-to-end |
| Assumed Breach | Granted foothold/credentials | Post-compromise containment testing |
| Purple Team | Red/blue working side-by-side | Detection engineering maturity |

Assumed breach delivers the highest value-per-week — real-world breaches rarely begin clean.

## Engagement Lifecycle

### Phase 0 — Pre-Engagement

Rules of Engagement must specify:
- In/out-of-scope assets (named explicitly)
- Permitted and excluded technique categories
- Data handling: real customer data is **never moved** — synthetic markers only
- Deconfliction contact with 24/7 path
- Blackout periods (scheduled maintenance, compliance windows)
- Stop conditions: production outage, regulatory event, unintended scope crossing

### Phase 1 — Reconnaissance

External: OSINT + perimeter recon (see `osint-recon` and `recon` skills)
Assumed breach: internal recon from the granted foothold

Output: **target map** — the path from starting position to the named objective.

### Phase 2 — Execution

Use ATT&CK emulation plans tailored to the engagement. Key resources:
- MITRE ATT&CK emulation plans (APT29, FIN6, FIN7, Sandworm)
- CALDERA for automated emulation
- Atomic Red Team for individual technique testing

Operational discipline:
- Every action logged with timestamp, technique ID, target, and effect
- Deconfliction contact reachable throughout
- Never move real data — use synthetic markers the blue team can verify
- Pause immediately on unintended production impact

### Phase 3 — Debrief and Reporting

Same-day debrief: red walks timeline, blue walks what they observed — surfaces highest-value gaps.

Full report (2–4 weeks):
- Executive summary
- Engagement timeline with ATT&CK technique IDs
- Blue-team observation mapping (what fired, what didn't)
- Detection coverage analysis
- Prioritized systemic recommendations (not just point fixes)
- Honest accounting of what the engagement did **not** cover

### Phase 4 — Revalidation

"A red team that finds the same problem twice is a budget wasted the second time."
Purple-team revalidation 6–12 months later compounds value.

## Key References

- `attack.mitre.org` — ATT&CK framework
- `attack.mitre.org/resources/adversary-emulation-plans/` — published emulation plans
- `github.com/redcanaryco/atomic-red-team` — atomic techniques
- `ctid.mitre.org` — Center for Threat-Informed Defense
- TIBER-EU / CBEST — financial sector frameworks
- NIST SP 800-115 — technical guide

## Hard Limits

- Unauthorized targets refused unconditionally
- Destructive techniques off by default — prefer non-destructive proof-of-access
- Social engineering only within the consent envelope — specific individuals outside it refused
- No building new offensive tooling, malware, or C2 frameworks
