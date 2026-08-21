# HiveArmor visual research

## Objective

This review extracts current interaction principles for a dense, multi-tenant enterprise SIEM. It does not reproduce another product's identity, layout, content, or implementation.

## Sources and findings

| Source reviewed | Principle observed | Why it matters for HiveArmor | Decision | HiveArmor interpretation | Accessibility implication |
|---|---|---|---|---|---|
| [Microsoft Sentinel overview](https://learn.microsoft.com/azure/sentinel/overview?tabs=defender-portal) | SIEM, investigation, hunting, automation, and posture are connected workflows rather than isolated tools. | Analysts need continuity from signal to evidence to response. | Adopt | A persistent application shell and task-oriented route groups keep operational context visible. | Landmarks, a skip link, and consistent navigation reduce repeated orientation effort. |
| [Microsoft Sentinel incident investigation](https://learn.microsoft.com/en-us/azure/sentinel/investigate-incidents) | Incident investigation combines entities, evidence, timeline, ownership, and action. | The dashboard should send users to ranked, explainable work—not decorative summaries. | Adopt | Priority work shows severity, type, tenant, owner, age, SLA, and a drill-down. | Severity is communicated by text and shape in addition to colour. |
| [Elastic Security UI overview](https://www.elastic.co/guide/en/security/current/es-ui-overview.html) | Global date context and cross-domain security navigation are persistent. | Time scope changes the meaning of every metric. | Adopt | Masthead and page toolbar preserve tenant, environment, search, time range, freshness, and data status. | Explicit labels are retained rather than relying on icon-only controls. |
| [Elastic alert details](https://www.elastic.co/guide/en/security/current/view-alert-details.html) | Alert workflows depend on context, related entities, history, and direct investigation actions. | Operational summaries must reveal where the analyst should go next. | Adopt | Every primary metric and work item has a real route target. | Links receive visible focus and descriptive accessible names. |
| [Elastic risk score analysis](https://www.elastic.co/guide/en/security/current/analyze-risk-score-data.html) | Risk is useful when scoped, comparable, and tied to underlying alerts. | A single unexplained risk score is not actionable. | Adopt selectively | HiveArmor uses explicit incident, SLA, workload, and health measures in Phase 1; aggregate risk can follow when its API and explanation model exist. | Avoids conveying high-stakes meaning through an unexplained colour or gauge. |
| [Splunk Mission Control overview](https://help.splunk.com/en/splunk-enterprise-security-8/user-guide/8.0/mission-control/overview-of-mission-control-in-splunk-enterprise-security) | Analyst work is centered on finding review, investigation, response, and shared operational status. | The dashboard must support shift coordination and intervention. | Adopt | “Mission Control” is composed as a shift workspace: what changed, what is critical, health, capacity, and recent operational activity. | Dense information is split into named sections with logical headings. |
| [WCAG 2.2 Understanding documents](https://www.w3.org/WAI/WCAG22/Understanding/) | Focus visibility, target size, labels, contrast, reflow, status communication, and reduced motion are core requirements. | SOC users work for long sessions and frequently use keyboards or zoom. | Adopt | 3:1 focus rings, AA text contrast, reduced-motion rules, non-colour state labels, responsive stacking, and a keyboard-operable shell. | Target is WCAG 2.2 AA; automated and manual checks remain part of release validation. |

## Synthesis

1. Persistent context matters more than visual spectacle. Tenant, environment, time range, freshness, live connectivity, search, and user context remain visible in the shell.
2. The dashboard is an intervention surface. Six metrics are the maximum primary summary; ranked priority work is the central operational table.
3. Telemetry and detection health are first-class security outcomes. Disconnected and partial-data states stay visible without impersonating healthy production data.
4. Brand colour and security semantics must not compete. Violet identifies HiveArmor interaction; red, amber, blue, and green retain conventional operational meaning.
5. Density requires calm surfaces. Near-black neutrals, thin borders, restrained radii, tabular numerals, and limited elevation reduce fatigue.
6. Hive references work best as structure, not controls. The login has a low-contrast honeycomb field and the logo uses a hexagonal mark; operational controls remain conventional and legible.

## Typography decision

Inter remains the preferred UI typeface because the repository already defines it, it is open source, has clear numerals and compact letterforms, and performs well at 11–14px. The stack falls back to native system sans-serif if Inter is not locally available. Production deployment should self-host the approved Inter files rather than call a third-party font CDN. We use 400, 500/600, and 650/700-equivalent emphasis only. Monospace is restricted to technical identifiers and machine-readable values.

## Product-specific principles

- Use real or explicitly labelled demonstration data; never make a mock action look production-backed.
- Preserve API, JWT, MFA, SSO, SSE, TanStack Query, Zustand, React Router, ECharts, and PatternFly foundations already present.
- Keep alert severity, connection state, tenant scope, ownership, and SLA readable without colour.
- At 1024px, preserve critical summaries and context while stacking secondary panels; dense mobile dashboard operation is not a Phase 1 goal.
