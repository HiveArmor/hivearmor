# S02-T08 — Fix Collectors Page API Path

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** HIGH — Collectors list empty  
**Issue ID:** API-BROKEN (from audit)  
**Dependencies:** S02-T03 (agent path must be fixed first; collector paths follow same pattern)  
**Estimated time:** 1 hour

---

## Context

The data sources collectors page (`/data-sources/collectors`) calls a path that doesn't match the backend registration. The page shows an empty shell. Similar to the agents path fix, collector API paths need to be verified and corrected.

**Affected files:**
- `frontend-v2/src/app/(app)/data-sources/collectors/page.tsx`
- `frontend-v2/src/services/collector.service.ts` (or equivalent)

---

## What to Read First

1. `frontend-v2/src/app/(app)/data-sources/collectors/page.tsx` — find the API call
2. `frontend-v2/src/services/` — find the collector service file
3. Backend paths: run this before writing any code:
   ```bash
   grep -r "@GetMapping\|@PostMapping" \
     backend/src/main/java/com/nilachakra/web/rest/ \
     --include="*.java" | grep -i "collector" | head -20
   ```
4. `backend/src/main/java/com/nilachakra/web/rest/collectors/CollectorOpsResource.java` — confirm the correct path

---

## Implementation Steps

### Step 1: Identify the current wrong path

In `collector.service.ts` or `page.tsx`, find the current API call URL.

### Step 2: Find the correct backend path

From the backend grep above, note the exact controller path. The audit found a mismatch in `GET /api/collectors` vs the real backend path.

### Step 3: Fix the path

```typescript
// In collector.service.ts — update paths to match backend exactly
async listCollectors(params?: CollectorQueryParams) {
    // Replace /api/collectors with whatever the backend grep reveals
    const response = await apiClient.get('/api/collectors', { params });
    return response.data;
}
```

**Collector query parameters:** The backend `CollectorOpsService` accepts filter/sort params. Check the Resource class for `@RequestParam` annotations to know what query params are supported.

### Step 4: Wire up the page

If the page is an empty shell with no service calls, add the data fetching:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { collectorService } from '@/services/collector.service';

export default function CollectorsPage() {
    const [collectors, setCollectors] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        collectorService.listCollectors({ page: 0, size: 20 })
            .then(data => setCollectors(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);
    
    // ... render collector list
}
```

### Step 5: Write test

Create: `frontend-v2/src/services/__tests__/collector.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { collectorService } from '../collector.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('collectorService', () => {
    it('listCollectors calls correct backend path', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
        
        await collectorService.listCollectors();
        
        // Verify the actual correct path (fill in after reading backend controller):
        expect(apiClient.get).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/.*collector/),
            expect.any(Object)
        );
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/collector.service.test.ts

# Manual test with backend:
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Test the backend path directly to confirm it works:
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/CORRECT_PATH_HERE?page=0&size=10" | jq '.'

# Open http://localhost:3000/data-sources/collectors
# Should show collector list (or "No collectors" if none registered)
# Must not show network errors in browser console
```

---

## Acceptance Criteria

- [ ] Collectors page calls the correct backend path
- [ ] Page displays collectors or a "No collectors registered" empty state
- [ ] No 404 errors in browser network tab when viewing the page
- [ ] Unit test passes confirming correct path
- [ ] `npx tsc --noEmit` passes
