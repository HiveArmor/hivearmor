# S02-T03 — Fix Agent Manager API Path Mismatch

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** HIGH — Page completely broken  
**Issue ID:** API-BROKEN-01  
**Dependencies:** None (S02-T08 depends on this)  
**Estimated time:** 1 hour

---

## Context

The agents page calls `GET /api/agents` but the backend registers agents under `GET /api/agent-manager/agents`. The frontend gets a 404 on every load, so the agents list is always empty. This is a simple path fix.

**Affected file:** `frontend-v2/src/services/agent.service.ts` (~line 48)

---

## What to Read First

1. `frontend-v2/src/services/agent.service.ts` — entire file
2. `frontend-v2/src/app/(app)/agents/page.tsx` — how agents are listed
3. Confirm backend path: `grep -r "agent-manager" backend/src/main/java/com/nilachakra/web/rest/ --include="*.java" -l` then read those files

---

## Implementation Steps

### Step 1: Fix the path in `agent.service.ts`

Find all API calls and fix:

```typescript
// BEFORE (broken):
async listAgents(params?: AgentQueryParams): Promise<Agent[]> {
    const response = await apiClient.get('/api/agents', { params });
    return response.data;
}

// AFTER (correct):
async listAgents(params?: AgentQueryParams): Promise<Agent[]> {
    const response = await apiClient.get('/api/agent-manager/agents', { params });
    return response.data;
}
```

Also check and fix any other agent-related paths in the service:
- Agent detail: `GET /api/agents/{id}` → check backend, may be `/api/agent-manager/agents/{id}`
- Delete agent: `DELETE /api/agents/{id}` → check backend
- Agent modules/plugins: check paths

### Step 2: Run a quick path audit

Before saving, grep the backend to confirm ALL agent paths:

```bash
grep -r "@GetMapping\|@PostMapping\|@PutMapping\|@DeleteMapping" \
  backend/src/main/java/com/nilachakra/web/rest/ \
  --include="*.java" | grep -i "agent" | grep -v "#"
```

Cross-check each frontend service call against the backend paths found.

### Step 3: Write a service test

Create: `frontend-v2/src/services/__tests__/agent.service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentService } from '../agent.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('agentService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('listAgents calls correct backend path', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
        
        await agentService.listAgents();
        
        expect(apiClient.get).toHaveBeenCalledWith(
            '/api/agent-manager/agents',
            expect.any(Object)
        );
        // Confirm OLD wrong path is NOT used
        expect(apiClient.get).not.toHaveBeenCalledWith(
            '/api/agents',
            expect.any(Object)
        );
    });

    it('getAgent calls correct backend path', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 1 } });
        
        await agentService.getAgent(1);
        
        expect(apiClient.get).toHaveBeenCalledWith(
            expect.stringMatching(/agent-manager\/agents\/1/)
        );
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/agent.service.test.ts

# Manual test with running backend:
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Verify backend path works:
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/agent-manager/agents?page=0&size=10" | jq '.length'
# Should return a number (even 0 is OK if no agents registered)

# Verify old path is gone (should 404):
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/agents"
# Should return 404

# Open http://localhost:3000/agents — list should load (or show "No agents" if empty)
```

---

## Acceptance Criteria

- [ ] `agentService.listAgents()` calls `/api/agent-manager/agents` not `/api/agents`
- [ ] All other agent API methods in the service use the correct `/api/agent-manager/` prefix
- [ ] Unit test passes confirming correct path
- [ ] Agents page loads without network errors in the browser console
- [ ] `npx tsc --noEmit` passes
