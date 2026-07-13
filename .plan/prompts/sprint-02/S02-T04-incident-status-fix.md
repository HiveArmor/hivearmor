# S02-T04 — Fix Incident Status Update Method/Path/Body

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** HIGH — Status updates silently fail  
**Issue ID:** API-BROKEN-02  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

The incident status update call fails because the frontend sends `POST /api/utm-incidents/status` with one body shape, but the backend expects `PUT /api/utm-incidents/change-status` with a different body shape. Every analyst status update silently fails.

**Affected files:**
- `frontend-v2/src/services/incident.service.ts`
- `frontend-v2/src/app/(app)/incidents/page.tsx` (or wherever status is changed)

---

## What to Read First

1. `frontend-v2/src/services/incident.service.ts` — find the `updateStatus` or `changeStatus` method
2. Backend endpoint: `backend/src/main/java/com/nilachakra/web/rest/incident_response/UtmIncidentResource.java` — find the `change-status` mapping, confirm HTTP method, path, and request body structure
3. `frontend-v2/src/app/(app)/incidents/page.tsx` — where status change is triggered from

---

## Implementation Steps

### Step 1: Read the backend endpoint precisely

Open `UtmIncidentResource.java` and find the status update endpoint. Note:
- Exact HTTP method (`@PutMapping`, `@PostMapping`, etc.)
- Exact path annotation (`@PutMapping("/change-status")`)
- Request body type — the Java class name and its fields (e.g., `IncidentStatusVM` or `UtmIncidentStatusDTO`)

### Step 2: Fix the service method

Example fix (actual field names will come from reading Step 1):

```typescript
// BEFORE (broken):
async updateIncidentStatus(incidentId: number, status: string): Promise<void> {
    await apiClient.post('/api/utm-incidents/status', {
        id: incidentId,
        status: status
    });
}

// AFTER (correct — verify exact method, path, and body against backend):
async updateIncidentStatus(incidentId: number, status: string): Promise<void> {
    await apiClient.put('/api/utm-incidents/change-status', {
        incidentId: incidentId,     // match backend field name exactly
        incidentStatus: status       // match backend field name exactly
    });
}
```

**Important:** Read the backend DTO class and use the exact JSON field names it expects. Common gotchas:
- Backend may expect `id` or `incidentId`
- Status value may need to be an enum string matching the Java enum (`OPEN`, `CLOSED`, `IN_PROGRESS`, etc.)

### Step 3: Update the TypeScript type if needed

If the incident status values are defined in a type file, ensure they match the Java enum values exactly:

```typescript
// frontend-v2/src/types/incident.ts
export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'FALSE_POSITIVE';
// Verify these match: grep "enum" backend/src/main/java/com/nilachakra/domain/enumeration/ -r
```

### Step 4: Write tests

Create: `frontend-v2/src/services/__tests__/incident-status.service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { incidentService } from '../incident.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('incidentService.updateStatus', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls PUT not POST', async () => {
        vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
        
        await incidentService.updateIncidentStatus(42, 'CLOSED');
        
        expect(apiClient.put).toHaveBeenCalledTimes(1);
        expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('calls correct path /change-status not /status', async () => {
        vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
        
        await incidentService.updateIncidentStatus(42, 'CLOSED');
        
        expect(apiClient.put).toHaveBeenCalledWith(
            '/api/utm-incidents/change-status',
            expect.any(Object)
        );
        expect(apiClient.put).not.toHaveBeenCalledWith(
            '/api/utm-incidents/status',
            expect.any(Object)
        );
    });

    it('sends correct body fields', async () => {
        vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
        
        await incidentService.updateIncidentStatus(42, 'IN_PROGRESS');
        
        // Verify body matches backend DTO field names (update these after reading backend)
        const callArgs = vi.mocked(apiClient.put).mock.calls[0][1];
        expect(callArgs).toMatchObject({
            incidentId: 42,
            incidentStatus: 'IN_PROGRESS'
        });
    });
});
```

### Step 5: E2E test in the UI

Add to the test for visual confirmation:

```typescript
// In incidents page test file, add:
it('status change updates UI without page reload', async () => {
    // ... render incidents list with a mock incident
    // Click status dropdown and change to CLOSED
    // Verify the status badge updates in the list without a full page reload
    // Verify apiClient.put was called with correct args
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/incident-status.service.test.ts

# Manual test with running backend:
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Get a real incident ID
INCIDENT_ID=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-incidents?page=0&size=1" | jq '.[0].id')

# Test the correct backend endpoint directly:
curl -s -X PUT "http://localhost:8088/api/utm-incidents/change-status" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"incidentId\": $INCIDENT_ID, \"incidentStatus\": \"IN_PROGRESS\"}" | jq '.'
# Should return 200 or updated incident

# In the frontend (http://localhost:3000/incidents):
# Change an incident status — status badge should update immediately
```

---

## Acceptance Criteria

- [ ] Status update calls `PUT /api/utm-incidents/change-status` not `POST /api/utm-incidents/status`
- [ ] Request body field names match what the backend Java DTO expects exactly
- [ ] Status values match the backend Java enum values
- [ ] All 3 unit tests pass
- [ ] Manual test: changing incident status in the UI reflects without a page reload
- [ ] `npx tsc --noEmit` passes
