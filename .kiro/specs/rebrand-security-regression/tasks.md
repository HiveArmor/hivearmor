# Tasks — Security Regression Review

## Tasks

- [ ] 1. Create `.cursor-audit/test-security-regression.mjs`
  - [ ] 1.1 Test: unauthenticated /api/users → 401
  - [ ] 1.2 Test: login → `utmauth` cookie set in response
  - [ ] 1.3 Test: after login, /api/ requests have `Authorization: Bearer` header
  - [ ] 1.4 Test: after login, /api/ requests have `Utm-Internal-Key` header
  - [ ] 1.5 Test: ROLE_ADMIN can access /api/users → 200
  - [ ] 1.6 Test: logout → subsequent /api/account → 401

- [ ] 2. Run Karma contract tests (from SPEC 5)
  - [ ] 2.1 `npm test -- --watch=false` → COOKIE_AUTH_TOKEN test passes
  - [ ] 2.2 `npm test -- --watch=false` → ACCESS_KEY test passes

- [ ] 3. Verify frozen identifiers by git diff
  - [ ] 3.1 `git diff HEAD -- backend/src/main/resources/config/liquibase/` → no utm_ table name changes
  - [ ] 3.2 `git diff HEAD -- frontend/src/app/app.constants.ts` → COOKIE_AUTH_TOKEN and ACCESS_KEY unchanged
  - [ ] 3.3 `git diff HEAD -- backend/src/main/resources/config/application.yml` → spring.application.name unchanged

- [ ] 4. Manual verification checklist
  - [ ] 4.1 Open browser → http://localhost:8880 → NilaChakra login page visible
  - [ ] 4.2 Login with admin/localdev123! → dashboard loads
  - [ ] 4.3 DevTools → Network → any /api/ request shows `utm-internal-key` header
  - [ ] 4.4 DevTools → Application → Cookies → `utmauth` cookie present
  - [ ] 4.5 Trigger a 401 (access restricted endpoint) → error message displays (X-UtmStack-error still read)
  - [ ] 4.6 Logout → redirected to login page

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": [1, 2, 3],
      "description": "Automated checks — run in parallel"
    },
    {
      "wave": 1,
      "tasks": [4],
      "description": "Manual verification after automated pass",
      "dependsOn": [0]
    }
  ]
}
```
