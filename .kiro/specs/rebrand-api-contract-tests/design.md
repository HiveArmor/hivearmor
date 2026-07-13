# Design — API Contract Tests

## Overview

Write regression tests that permanently guard auth constants and branding config against accidental future changes.

## Components and Interfaces

### New frontend test files

```typescript
// frontend/src/environments/branding.spec.ts
import { BRANDING } from './branding';
describe('BRANDING config', () => {
  it('productName is NilaChakra', () => expect(BRANDING.productName).toBe('NilaChakra'));
  it('has no undefined values', () => Object.values(BRANDING).forEach(v => expect(v).toBeTruthy()));
  it('brandAccent is valid hex', () => expect(BRANDING.brandAccent).toMatch(/^#[0-9A-Fa-f]{6}$/));
});

// frontend/src/app/app.constants.spec.ts
import { COOKIE_AUTH_TOKEN, ACCESS_KEY } from './app.constants';
describe('Auth constants (MUST NOT CHANGE — breaks active sessions)', () => {
  it('COOKIE_AUTH_TOKEN is utmauth', () => expect(COOKIE_AUTH_TOKEN).toBe('utmauth'));
  it('ACCESS_KEY is Utm-Internal-Key', () => expect(ACCESS_KEY).toBe('Utm-Internal-Key'));
});

// frontend/src/app/shared/constants/global.constant.spec.ts
import { BRANDING } from '../../../environments/branding';
import { DEMO_URL, ONLINE_DOCUMENTATION_BASE } from './global.constant';
describe('Global constants from BRANDING', () => {
  it('DEMO_URL comes from BRANDING.demoUrl', () => expect(DEMO_URL).toBe(BRANDING.demoUrl));
  it('ONLINE_DOCUMENTATION_BASE comes from BRANDING.docsUrl', () => expect(ONLINE_DOCUMENTATION_BASE).toBe(BRANDING.docsUrl));
});
```

### New backend test file

```java
// backend/src/test/java/com/park/utmstack/config/BrandingPropertiesTest.java
@SpringBootTest
class BrandingPropertiesTest {
    @Autowired ApplicationProperties props;
    @Value("${spring.application.name}") String springAppName;

    @Test void brandingNameIsNilaChakra() {
        assertEquals("NilaChakra", props.getBranding().getName());
    }

    @Test void springAppNameIsNotChangedByBranding() {
        assertEquals("UTMStack-API", springAppName); // MUST NOT CHANGE
    }
}
```

## Data Models

No new data models.

## Correctness Properties

### Property 1: Auth Contract Tests Exist and Pass

**Validates: Requirements 1.1, 1.2, 1.3**

After this spec, the Karma test suite includes at minimum 2 tests that assert `COOKIE_AUTH_TOKEN` and `ACCESS_KEY` values.

### Property 2: All New Tests Pass

**Validates: Requirements 1–3**

`npm test -- --watch=false` shows ≥ 29 SUCCESS (26 existing + 3 new minimum).

## Error Handling

Tests that import `app.constants.ts` must handle the case where the file path may vary — use relative imports consistent with the test file location.
