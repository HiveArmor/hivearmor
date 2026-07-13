# S03-T06 — Wire Integrations Page to API

**Sprint:** 3 (Frontend RBAC + Key UX Features)  
**Severity:** MEDIUM — Feature completely broken  
**Issue ID:** UX (from page status table)  
**Dependencies:** S03-T01 (RBAC must be active, integrations is admin-only)  
**Estimated time:** 4 hours

---

## Context

The integrations page (`/integrations`) uses 100% hardcoded connected/disconnected statuses. No API calls are made. The backend has `GET /api/utm-integrations` and `GET /api/utm-server-modules` endpoints. Admins cannot actually manage integrations from this page.

**Affected file:** `frontend-v2/src/app/(app)/integrations/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/integrations/page.tsx` — entire file, understand all UI sections
2. Backend: `grep -r "integrations\|server-modules" backend/src/main/java/com/nilachakra/web/rest/ --include="*.java" -l`
3. Read those files to get exact paths, response shapes, and available actions

---

## Implementation Steps

### Step 1: Create `integrationService`

Create: `frontend-v2/src/services/integration.service.ts`

```typescript
import { apiClient } from '@/lib/api-client';

export interface Integration {
    id: number;
    name: string;
    type: string;
    status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'PENDING';
    lastSynced?: string;
    config?: Record<string, unknown>;
}

export interface ServerModule {
    id: number;
    moduleName: string;
    moduleActive: boolean;
    moduleDescription: string;
}

class IntegrationService {
    async listIntegrations(): Promise<Integration[]> {
        const response = await apiClient.get<Integration[]>('/api/utm-integrations');
        return response.data;
    }

    async getIntegration(id: number): Promise<Integration> {
        const response = await apiClient.get<Integration>(`/api/utm-integrations/${id}`);
        return response.data;
    }

    async updateIntegration(id: number, config: Partial<Integration>): Promise<Integration> {
        const response = await apiClient.put<Integration>(`/api/utm-integrations/${id}`, config);
        return response.data;
    }

    async testConnection(id: number): Promise<{ success: boolean; message: string }> {
        const response = await apiClient.post(`/api/utm-integrations/${id}/test`);
        return response.data;
    }

    async listServerModules(): Promise<ServerModule[]> {
        const response = await apiClient.get<ServerModule[]>('/api/utm-server-modules');
        return response.data;
    }

    async toggleModule(id: number, active: boolean): Promise<ServerModule> {
        const response = await apiClient.put<ServerModule>(`/api/utm-server-modules/${id}`, { moduleActive: active });
        return response.data;
    }
}

export const integrationService = new IntegrationService();
```

**Critical:** Before finalizing the service, grep and read the actual backend controllers to get exact paths and response shapes. Adjust above to match.

### Step 2: Replace hardcoded data in the page

```typescript
'use client';
import { useEffect, useState } from 'react';
import { integrationService, type Integration, type ServerModule } from '@/services/integration.service';

export default function IntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [modules, setModules] = useState<ServerModule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [intData, modData] = await Promise.all([
                    integrationService.listIntegrations(),
                    integrationService.listServerModules(),
                ]);
                setIntegrations(intData);
                setModules(modData);
            } catch (err) {
                setError('Failed to load integrations');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleTestConnection = async (id: number) => {
        try {
            const result = await integrationService.testConnection(id);
            alert(result.message);
        } catch {
            alert('Connection test failed');
        }
    };

    const handleToggleModule = async (module: ServerModule) => {
        try {
            const updated = await integrationService.toggleModule(module.id, !module.moduleActive);
            setModules(prev => prev.map(m => m.id === updated.id ? updated : m));
        } catch {
            alert('Failed to toggle module');
        }
    };

    // ... render using real data
}
```

### Step 3: Write service tests

Create: `frontend-v2/src/services/__tests__/integration.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { integrationService } from '../integration.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('integrationService', () => {
    it('listIntegrations calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
        await integrationService.listIntegrations();
        expect(apiClient.get).toHaveBeenCalledWith('/api/utm-integrations');
    });

    it('listServerModules calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
        await integrationService.listServerModules();
        expect(apiClient.get).toHaveBeenCalledWith('/api/utm-server-modules');
    });

    it('testConnection posts to correct endpoint', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ data: { success: true } });
        await integrationService.testConnection(5);
        expect(apiClient.post).toHaveBeenCalledWith('/api/utm-integrations/5/test');
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/integration.service.test.ts

# Verify no hardcoded status values remain:
grep -n "CONNECTED\|DISCONNECTED\|hardcoded\|static" \
  src/app/\(app\)/integrations/page.tsx | grep -v "import\|type\|const STATUS"
# Should return nothing related to static data

# Manual test:
# Open http://localhost:3000/integrations (as ADMIN)
# Integration cards should show real connected/disconnected status from API
# "Test Connection" button should call the API
```

---

## Acceptance Criteria

- [ ] Integrations page loads data from `GET /api/utm-integrations`
- [ ] Server modules loaded from `GET /api/utm-server-modules`
- [ ] No hardcoded `CONNECTED`/`DISCONNECTED` statuses
- [ ] "Test Connection" calls backend test endpoint
- [ ] Module toggle calls backend and updates UI
- [ ] Service tests pass
- [ ] `npx tsc --noEmit` passes
