# Security Policy

## Supported Versions

HiveArmor (Hyper-scale Incident Visibility Engine) follows a long-term support model. The table below shows the current support status for each release series.

| Version   | Status             | End of Support |
| --------- | ------------------ | -------------- |
| 9.x       | :x:                | Jan 15, 2024   |
| 10.x      | :clock1:           | Jul 15, 2026   |
| 11.x LTS  | :white_check_mark: | Nov 15, 2030   |

### Legend

```
✅  Features, Security, and Bug Fixes  — actively maintained
🕐  Security and Bug Fixes Only        — no new features
❌  Unsupported                         — no patches issued
```

## Scope

This policy applies to the HiveArmor platform, including:

- **Backend API** (Java / Spring Boot, endpoints at `/api/ha-*`)
- **Frontend UI** (Next.js 14 / React 18)
- **HiveArmor Agent** (Go — Windows, Linux, macOS; services `HiveArmorAgent` / `HiveArmorUpdater`)
- **hivearmor-collector** (Go — syslog/UDP/TCP ingestion)
- **Event Processor** (Go — YAML correlation engine, CEL expressions)
- **AgentManager** (Go — gRPC agent registry, ports 9000/9001)
- **Installer and CM server integration** (`cm.onlyhacker.org`)
- **Docker images** distributed as `hivearmor/` (local) and `ghcr.io/hivearmor/` (CI/prod)

Issues in third-party dependencies are considered in scope when HiveArmor ships the vulnerable version and a fix is available upstream.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please email a detailed report to:

**security@hivearmor.io**

Include as much of the following as possible:

- Affected component and version
- Step-by-step reproduction instructions
- Proof-of-concept code or screenshots (if available)
- Potential impact and attack scenario
- Any suggested remediation

You should receive an acknowledgement within **2 business days**. We aim to provide a severity assessment within **7 calendar days** and a patch or mitigation plan within **90 days**, depending on complexity.

We ask that you practice responsible disclosure and allow us time to remediate before any public disclosure.

## Security Update Distribution

Security fixes are distributed as:

- GitHub releases tagged `vX.Y.Z-security` or included in the next patch release
- Docker image updates pushed to `ghcr.io/hivearmor/`
- CM server (`cm.onlyhacker.org`) managed deployments receive automatic update notifications

All users running a supported version are encouraged to apply security patches promptly. Unsupported versions (9.x and earlier) will not receive patches.

## Contact

| Purpose              | Contact                                           |
| -------------------- | ------------------------------------------------- |
| Security reports     | security@hivearmor.io                             |
| General support      | support@hivearmor.io                              |
| Documentation        | https://docs.hivearmor.io                         |
| GitHub               | https://github.com/hivearmor                      |