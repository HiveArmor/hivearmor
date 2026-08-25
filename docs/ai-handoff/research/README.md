# Offline research index

These notes preserve paraphrased conclusions and source provenance for models without web access. They are not copied standards and do not replace authoritative source review.

| Domain | Note | Refresh trigger |
|---|---|---|
| Autonomous SOC program closure (A1–D) | `autonomous-soc-program-closure.md` | Staging smoke evidence lands, NIST CSF/CA guidance changes, or HiveArmor status vocabulary rules change. |
| Autonomous SOC cross-product closure (Wave D) | `autonomous-soc-cross-product-closure.md` | WCAG 2.2, NIST AC-6, OWASP ASVS deprecation, or HiveArmor global shell/theme/status contracts change. |
| Autonomous SOC MSSP portal (Wave C3) | `autonomous-soc-mssp.md` | Azure Lighthouse, Okta multi-tenancy, NIST AC/AU, or HiveArmor `/api/ha-mssp/*` contracts change. |
| Autonomous SOC platform admin (Wave C2) | `autonomous-soc-platform-admin.md` | NIST SP 800-92, Entra RBAC, Elastic/Splunk monitoring, or HiveArmor IAM/INO/GOV/ING contracts change. |
| Autonomous SOC dashboards & reports (Wave C1) | `autonomous-soc-dashboards-reports.md` | Splunk Dashboard Studio, Azure Workbooks, NIST SP 800-61, or HiveArmor DSH/REP contracts change. |
| Autonomous SOC posture & compliance (Wave B2) | `autonomous-soc-posture-compliance.md` | Microsoft Exposure Management attack paths, NIST CSF 2.0, CIS Benchmarks, or HiveArmor EXP/ADP/CMP/MITRE contracts change. |
| Autonomous SOC endpoint defense (Wave B1) | `autonomous-soc-endpoint-defense.md` | Defender endpoint isolate/quarantine, CrowdStrike host containment, NIST SP 800-61 containment, or HiveArmor agent DTO / EDR ProcessCommand contracts change. |
| Autonomous SOC defend & respond (Wave A3) | `autonomous-soc-defend-respond.md` | Defender Action center, Elastic Workflows/response actions, NIST SP 800-61 containment, or HiveArmor playbook/governance contracts change. |
| Autonomous SOC investigate & AI (Wave A2) | `autonomous-soc-investigate-ai.md` | Defender investigation graph/entity pages, Elastic AI Assistant/Cases, Splunk TIM/Mission Control observables, or HiveArmor hunt/entity/constellation contracts change. |
| Autonomous SOC command & triage (Wave A1) | `autonomous-soc-command-triage.md` | Microsoft Defender/Sentinel queue, Splunk ES Mission Control, Elastic alert→case workflows, NIST SP 800-61, or HiveArmor A1 auth/KPI contracts change. |
| Vulnerability management | `vulnerability-management.md` | CISA KEV/SSVC, FIRST EPSS, NIST patch guidance or the product data model changes. |
| Security configuration assessment | `security-configuration-assessment.md` | CIS benchmark/profile guidance, NIST checklist/configuration-management guidance, benchmark licensing or the SCA producer/data model changes. |
| Compliance assurance | `compliance-assurance-workspace.md` | Microsoft Purview, AWS Audit Manager, ServiceNow GRC, NIST CSF/CIS guidance or the assessment/control/evidence contract changes. |
| Dashboard operations | `dashboard-operations-workspace.md` | Splunk Dashboard Studio, Elastic dashboards, Sentinel Workbooks, Grafana governance or the HiveArmor dashboard contract changes. |
| Reporting and SOC communications | `reporting-soc-communications.md` | Splunk reporting/scheduling, NIST incident-response guidance, Sentinel/ServiceNow reporting or HiveArmor generation/delivery contracts change. |
| Pipeline and ingestion operations | `pipeline-ingestion-operations.md` | Splunk Monitoring Console, Elastic monitoring, Sentinel connector health, OpenSearch/Data Prepper observability or HiveArmor `ING-001`–`ING-010` changes. |
| Integration and notification operations | `integration-notification-operations.md` | Sentinel content/connectors, Elastic integrations/Fleet, Splunk data onboarding, ServiceNow connection aliases or HiveArmor `INO-001`–`INO-010` changes. |
| Identity, tenancy and MSSP administration | `identity-tenancy-administration.md` | Microsoft Entra administration/access reviews, Azure Lighthouse, Okta lifecycle/SCIM, Splunk role guidance or HiveArmor `IAM-001`–`IAM-010` changes. |
| Governance and platform settings | `governance-platform-settings.md` | NIST log-management guidance, Elastic/Splunk audit or lifecycle administration, ServiceNow change governance, or HiveArmor `GOV-001`–`GOV-010` changes. |

When adding research, record retrieval date, primary URL, conclusion, product implication, limitations and a refresh trigger. Prefer official standards, government guidance and vendor documentation. Do not paste paywalled or copyrighted source text.
