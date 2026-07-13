# S02-T05 — Fix Settings Page Field Name Mismatch

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** HIGH — Settings writes are silently ignored  
**Issue ID:** API-BROKEN-03  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

The admin settings page sends/reads fields with wrong names. Frontend uses `paramShort` and `paramValue`, but the backend Java entity serializes as `confParamShort` and `confParamValue`. Settings appear as `null` on read; updates are silently ignored since the fields don't match.

**Affected files:**
- `frontend-v2/src/services/admin.service.ts` (or wherever config params are fetched/sent)
- `frontend-v2/src/types/admin.ts` (or equivalent TypeScript types)
- `frontend-v2/src/app/(app)/admin/settings/page.tsx`

---

## What to Read First

1. `frontend-v2/src/services/admin.service.ts` — find `getSettings()`, `updateSetting()`, `getConfigParams()` etc.
2. `frontend-v2/src/types/` — find the `ConfigParameter` or `AdminSetting` type
3. Backend entity: `backend/src/main/java/com/nilachakra/domain/UtmConfigurationSection.java` or `UtmConfigurationParameter.java` — read the exact field names in the Java class
4. Backend REST: `backend/src/main/java/com/nilachakra/web/rest/utm_configuration/UtmConfigurationResource.java` — confirm the JSON field names in responses

---

## Implementation Steps

### Step 1: Read the exact backend field names

Open the backend entity/DTO. The audit found the mismatch is:
- Frontend: `paramShort` → Backend: `confParamShort`
- Frontend: `paramValue` → Backend: `confParamValue`
- Frontend: `section` → Backend: `sectionName`

Verify by reading the actual Java entity class. Look for `@JsonProperty` annotations, or just the field names directly.

### Step 2: Fix the TypeScript type

In the TypeScript type definition file:

```typescript
// frontend-v2/src/types/admin.ts (or equivalent)

// BEFORE (wrong field names):
export interface ConfigParameter {
    id: number;
    section: string;
    paramShort: string;
    paramValue: string;
    paramDataType: string;
    paramDescription: string;
}

// AFTER (matching backend field names exactly):
export interface ConfigParameter {
    id: number;
    sectionName: string;     // was: section
    confParamShort: string;  // was: paramShort
    confParamValue: string;  // was: paramValue
    confParamDatatype: string;    // verify exact name
    confParamDescription: string; // verify exact name
}
```

### Step 3: Fix the service method

In `admin.service.ts`, ensure the request body uses the correct field names:

```typescript
async updateConfigParam(param: ConfigParameter): Promise<ConfigParameter> {
    const response = await apiClient.put(`/api/utm-configurations/${param.id}`, {
        id: param.id,
        sectionName: param.sectionName,       // was: section
        confParamShort: param.confParamShort, // was: paramShort
        confParamValue: param.confParamValue, // was: paramValue
        confParamDatatype: param.confParamDatatype,
    });
    return response.data;
}
```

### Step 4: Fix the settings page display

In `admin/settings/page.tsx`, update all references to the old field names:

```typescript
// BEFORE:
<p>{setting.paramShort}</p>
<input value={setting.paramValue} />

// AFTER:
<p>{setting.confParamShort}</p>
<input value={setting.confParamValue} />
```

Find all occurrences with:
```bash
grep -r "paramShort\|paramValue\|\.section\b" frontend-v2/src/ --include="*.tsx" --include="*.ts"
```

Fix every occurrence that refers to config parameters.

### Step 5: Write tests

Create: `frontend-v2/src/services/__tests__/admin-settings.service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminService } from '../admin.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

const mockBackendResponse = [{
    id: 1,
    sectionName: 'EMAIL',
    confParamShort: 'smtp_host',
    confParamValue: 'smtp.example.com',
    confParamDatatype: 'STRING',
    confParamDescription: 'SMTP Server Host',
}];

describe('adminService settings', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getConfigParams returns data with correct backend field names', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: mockBackendResponse });
        
        const result = await adminService.getConfigParams();
        
        expect(result[0]).toHaveProperty('confParamShort', 'smtp_host');
        expect(result[0]).toHaveProperty('confParamValue', 'smtp.example.com');
        expect(result[0]).toHaveProperty('sectionName', 'EMAIL');
        // Old field names must NOT exist
        expect(result[0]).not.toHaveProperty('paramShort');
        expect(result[0]).not.toHaveProperty('paramValue');
        expect(result[0]).not.toHaveProperty('section');
    });

    it('updateConfigParam sends correct field names to backend', async () => {
        vi.mocked(apiClient.put).mockResolvedValue({ data: mockBackendResponse[0] });
        
        await adminService.updateConfigParam({
            id: 1,
            sectionName: 'EMAIL',
            confParamShort: 'smtp_host',
            confParamValue: 'newvalue',
            confParamDatatype: 'STRING',
        });
        
        const body = vi.mocked(apiClient.put).mock.calls[0][1];
        expect(body).toMatchObject({
            confParamShort: 'smtp_host',  // correct name
            confParamValue: 'newvalue',   // correct name
            sectionName: 'EMAIL',
        });
        expect(body).not.toHaveProperty('paramShort');
        expect(body).not.toHaveProperty('paramValue');
    });
});
```

### Step 6: Integration smoke test

```typescript
// Create: frontend-v2/src/app/(app)/admin/settings/__tests__/settings-page.test.tsx
it('renders config param values from API (not null)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockBackendResponse });
    
    render(<AdminSettingsPage />);
    
    await waitFor(() => {
        // Value should display correctly
        expect(screen.getByText('smtp.example.com')).toBeInTheDocument();
        // Must NOT show "null" or "undefined"
        expect(screen.queryByText('null')).not.toBeInTheDocument();
        expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Find all usages of old field names (must be zero after fix):
grep -r "paramShort\|paramValue\|\.section\b" src/ --include="*.tsx" --include="*.ts" \
  | grep -v "test\|spec\|node_modules"
# Output should be empty after the fix

npx tsc --noEmit

npx vitest run src/services/__tests__/admin-settings.service.test.ts

# Manual test with running backend:
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Verify backend field names:
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-configurations?page=0&size=5" | jq '.[0] | keys'
# Note the actual field names returned — they should match what you fixed the frontend to use

# Open http://localhost:3000/admin/settings — values should display (not null)
# Change a value — the change should persist after page refresh
```

---

## Acceptance Criteria

- [ ] No usage of `paramShort`, `paramValue`, or `.section` (as config param field) remains in frontend-v2
- [ ] TypeScript types use field names that match backend exactly
- [ ] Settings page displays actual values (not `null` or empty)
- [ ] Saving a setting value persists after page refresh
- [ ] All service tests pass
- [ ] `npx tsc --noEmit` passes
