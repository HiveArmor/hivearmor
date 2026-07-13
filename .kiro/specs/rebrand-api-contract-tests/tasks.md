# Tasks — API Contract Tests

## Tasks

- [ ] 1. Create `frontend/src/environments/branding.spec.ts`
  - [ ] 1.1 Test every BRANDING key is non-empty
  - [ ] 1.2 Test `productName === 'NilaChakra'`
  - [ ] 1.3 Test `brandAccent` matches hex pattern

- [ ] 2. Create `frontend/src/app/app.constants.spec.ts`
  - [ ] 2.1 Test `COOKIE_AUTH_TOKEN === 'utmauth'`
  - [ ] 2.2 Test `ACCESS_KEY === 'Utm-Internal-Key'`
  - [ ] 2.3 Add comment: "THESE TESTS MUST NEVER BE DELETED — they guard active user sessions"

- [ ] 3. Create `frontend/src/app/shared/constants/global.constant.spec.ts`
  - [ ] 3.1 Test `DEMO_URL === BRANDING.demoUrl`
  - [ ] 3.2 Test `ONLINE_DOCUMENTATION_BASE === BRANDING.docsUrl`

- [ ] 4. Create `backend/src/test/.../BrandingPropertiesTest.java`
  - [ ] 4.1 Test `getBranding().getName() === "NilaChakra"`
  - [ ] 4.2 Test `spring.application.name === "UTMStack-API"` (contract guard)
  - Note: Requires `MAVEN_TK` for backend builds — defer if not available

- [ ] 5. Verify all tests pass
  - [ ] 5.1 `npm test -- --watch=false` → ≥ 29 SUCCESS

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": [1, 2, 3, 4],
      "description": "All test files are independent — write in parallel"
    },
    {
      "wave": 1,
      "tasks": [5],
      "description": "Verify all pass",
      "dependsOn": [0]
    }
  ]
}
```
