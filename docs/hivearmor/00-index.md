# HiveArmor Documentation Index

**Product:** HiveArmor — Hyper-scale Incident Visibility Engine  
**Version:** v1.x (production)  
**Last updated:** 2026-07-13

---

## Document Map

| # | Document | Audience |
|---|---|---|
| 01 | [Production Deployment Guide](01-production-deployment.md) | Infrastructure / DevOps |
| 02 | [Administrator Reference](02-admin-guide.md) | Platform Admin |
| 03 | [User Guide](03-user-guide.md) | SOC Analysts / End Users |
| 04 | [Agent Installation Guide](04-agent-installation.md) | Windows / Linux / macOS |
| 05 | [Docker Services Reference](05-docker-services.md) | DevOps / Support |
| 06 | [Parser / Filter Authoring](06-parser-authoring.md) | Engineers |
| 07 | [Correlation Rules Authoring](07-rules-authoring.md) | Security Engineers |
| 08 | [Plugin Development Guide](08-plugin-development.md) | Go Developers |
| 09 | [Feature Status & Production Readiness Audit](09-feature-audit.md) | Product / Engineering |

---

## Quick Start (Production)

1. Follow [01 - Production Deployment](01-production-deployment.md) to stand up the platform
2. Follow [02 - Administrator Reference](02-admin-guide.md) to configure users, SMTP, and integrations
3. Follow [04 - Agent Installation](04-agent-installation.md) to enrol endpoints

## Quick Start (Development)

```bash
cd local-dev
cp .env.example .env          # fill in passwords
docker compose up -d          # all services
cd ../frontend-v2 && npm run dev   # hot-reload UI at http://localhost:3000
```
