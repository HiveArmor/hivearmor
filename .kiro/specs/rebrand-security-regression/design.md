# Design — Security Regression Review

## Overview

Automated + manual checklist to verify no security regression after rebrand phases. Leverages existing Playwright test infrastructure and the contract tests from SPEC 5.

## Components and Interfaces

### `test-security-regression.mjs` (Playwright test)

```javascript
// Tests: login, cookie, headers, RBAC, logout
const page = await browser.newPage();

// 1. Unauthenticated → 401
const unauth = await page.request.get('/api/users');
assert(unauth.status() === 401, 'Unauth must return 401');

// 2. Login and verify cookie
const loginResp = await page.request.post('/api/authenticate', { data: {...} });
const setCookie = loginResp.headers()['set-cookie'];
assert(setCookie.includes('utmauth='), 'utmauth cookie must be set');

// 3. Navigate to dashboard, intercept API calls
page.on('request', req => {
  if (req.url().includes('/api/')) {
    assert(req.headers()['authorization'], 'Bearer token missing');
    assert(req.headers()['utm-internal-key'], 'Utm-Internal-Key header missing');
  }
});
await page.goto('/dashboard');

// 4. Admin endpoint access
const adminResp = await page.request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
assert(adminResp.status() === 200, 'Admin can access /api/users');

// 5. Logout
await page.request.post('/api/logout');
const postLogout = await page.request.get('/api/account');
assert(postLogout.status() === 401, 'After logout: 401');
```

## Data Models

No new data models.

## Correctness Properties

### Property 1: Auth Flow End-to-End

**Validates: Requirements 1.1–1.5**

Playwright test `test-security-regression.mjs` passes all assertions with zero errors.

### Property 2: Frozen Identifiers Unchanged

**Validates: Requirements 3.1–3.5**

All Karma contract tests from SPEC 5 still pass. Git diff on `backend/.../liquibase/` shows no change to `utm_` table names.

## Error Handling

If any security test fails, STOP the rebrand deployment. Investigate before proceeding — a broken auth contract is a production outage.
