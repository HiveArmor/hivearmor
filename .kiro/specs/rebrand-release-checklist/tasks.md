# Tasks — Release Checklist

## Tasks

### Automated Checks

- [ ] 1. Frontend build and tests
  - [ ] 1.1 `cd frontend && NODE_OPTIONS="..." npm run build` → clean, no errors
  - [ ] 1.2 `npm test -- --watch=false` → 26+ SUCCESS (all Karma specs including contract tests from SPEC 5)
  - [ ] 1.3 Bundle size: main.*.js ≤ 15 MB

- [ ] 2. Playwright rebrand verification
  - [ ] 2.1 `node .cursor-audit/test-rebrand.mjs` → all ✅ checks pass
  - [ ] 2.2 Login page shows NilaChakra heading and placeholder logo
  - [ ] 2.3 Browser title is "NilaChakra"
  - [ ] 2.4 Header aria-label is "NilaChakra home"
  - [ ] 2.5 All 4 placeholder SVG logos return HTTP 200

- [ ] 3. Playwright security regression
  - [ ] 3.1 `node .cursor-audit/test-security-regression.mjs` → all assertions pass
  - [ ] 3.2 `node .cursor-audit/test-all-bugs.mjs` → BUG-001..BUG-004 still fixed

- [ ] 4. Property verification greps
  - [ ] 4.1 P1: `grep -r '"UTMStack"' frontend/src/app --include="*.{ts,html}"` → zero (excl. frozen)
  - [ ] 4.2 P3: `grep -r 'UTMStack' backend/src/main/resources/templates/mail` → zero
  - [ ] 4.3 P5: `grep -r 'bg-image-utmstack' frontend/src --include="*.{html,scss}"` → zero
  - [ ] 4.4 P7: COOKIE_AUTH_TOKEN still 'utmauth' in app.constants.ts
  - [ ] 4.5 DB tables: `git diff HEAD -- backend/src/main/resources/config/liquibase/` → no utm_ changes

- [ ] 5. Backend build (requires MAVEN_TK)
  - [ ] 5.1 `cd backend && mvn -B -Pprod clean package -s settings.xml` → WAR produced
  - [ ] 5.2 Backend start → log shows "NilaChakra Backend API" in Swagger
  - [ ] 5.3 `spring.application.name` still `UTMStack-API` (Prometheus)

### Manual Smoke Test

- [ ] 6. NilaChakra UI walkthrough
  - [ ] 6.1 Open http://localhost:8880 → NilaChakra login page (chakra logo + NilaChakra heading)
  - [ ] 6.2 Log in → dashboard loads, KPI strip shows real data
  - [ ] 6.3 Browser tab: "NilaChakra"
  - [ ] 6.4 Sidebar: NilaChakra logo/name in header
  - [ ] 6.5 Navigate: Alerts, SOAR, Compliance, Log Analyzer → all load, no red errors
  - [ ] 6.6 DevTools Console: zero red errors on any page
  - [ ] 6.7 DevTools Network: requests have `utm-internal-key` and `Authorization` headers
  - [ ] 6.8 DevTools Application Cookies: `utmauth` cookie present and set
  - [ ] 6.9 Email test: create admin user → check activation email → "NilaChakra" in subject/body

### Documentation

- [ ] 7. Update release documentation
  - [ ] 7.1 Update `REBRAND_NILACHAKRA_PLAN.md` with final completion status
  - [ ] 7.2 Update `.kiro/steering/branding.md` if needed
  - [ ] 7.3 Create git commit: `rebrand: NilaChakra frontend + branding complete`
  - [ ] 7.4 Open PR to release/v11 branch
  - [ ] 7.5 Tag: awaiting Tier-3 approver sign-off (required by pr-checks.yml)

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": [1, 2, 3, 4],
      "description": "All automated checks — run in parallel"
    },
    {
      "wave": 1,
      "tasks": [5],
      "description": "Backend build (requires MAVEN_TK)",
      "dependsOn": [0]
    },
    {
      "wave": 2,
      "tasks": [6],
      "description": "Manual smoke test after all automated checks pass",
      "dependsOn": [0]
    },
    {
      "wave": 3,
      "tasks": [7],
      "description": "Documentation and PR",
      "dependsOn": [1, 2]
    }
  ]
}
```
