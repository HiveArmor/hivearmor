# Tasks — UI Branding Implementation

## Tasks

- [ ] 1. Update guide step text arrays (Group A — 7 files)
  - [ ] 1.1 `guide-macos-agent.component.ts` — display labels
  - [ ] 1.2 `guide-winlogbeat.component.ts` — display labels
  - [ ] 1.3 `guide-syslog/syslog.steps.ts` — "UTMStack agent" → template literal
  - [ ] 1.4 `guide-kaspersky/kasp-steps.ts` — same
  - [ ] 1.5 `guide-eset/eset-steps.ts` — same
  - [ ] 1.6 `guide-sentinel-one/sentinel.steps.ts` — same
  - [ ] 1.7 `guide-netflow.component.ts` — display path label ONLY (not shell commands)
  - ⚠️ DO NOT touch `/opt/utmstack-linux-agent/` or `C:\Program Files\UTMStack\` shell paths

- [ ] 2. Update remaining component templates (Group B)
  - [ ] 2.1 `utm-lite-version.component.{ts,html}` — "UTMStack Lite" → `branding.productName`
  - [ ] 2.2 `contact-us.component.html` — logo + supportUrl from branding
  - [ ] 2.3 `app-restart-api.component.{ts,html}` — "UTMStack detected" → `branding.productName`
  - [ ] 2.4 `app-config-delete-confirm.component.{ts,html}` — same
  - [ ] 2.5 `utm-report-header.component.ts` — seed report logo from `BRANDING.logoWhitePath`
  - [ ] 2.6 `asset-save-report.component.ts` — report filenames
  - [ ] 2.7 `scanner-export-vulnerabilities.component.ts` — download filename

- [ ] 3. Set document title dynamically (Group C)
  - [ ] 3.1 Inject Angular `Title` service into `AppComponent`
  - [ ] 3.2 Call `this.titleService.setTitle(BRANDING.productName)` in `ngOnInit()`

- [ ] 4. Build and verify
  - [ ] 4.1 `npm run build` → no errors
  - [ ] 4.2 `npm test -- --watch=false` → all tests pass
  - [ ] 4.3 Run Property 1 grep → zero results
  - [ ] 4.4 Playwright: verify browser title is "NilaChakra"

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": [1, 2, 3],
      "description": "All groups are independent — can be done in parallel"
    },
    {
      "wave": 1,
      "tasks": [4],
      "description": "Build and verify",
      "dependsOn": [0]
    }
  ]
}
```
