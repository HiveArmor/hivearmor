# S04-T01 — Implement Real Active Directory Page

**Sprint:** 4 (Active Directory + Compliance)  
**Severity:** HIGH — Feature is 100% mock, analyst-blocking  
**Issue ID:** UX-P0-03  
**Dependencies:** None (but requires user-auditor microservice running)  
**Estimated time:** 8 hours

---

## Context

The Active Directory page (`/active-directory`) uses 100% mock data: `MOCK_OVERVIEW`, `MOCK_USERS`, `MOCK_EVENTS`, `MOCK_REPORTS`. No API calls exist. The `user-auditor` microservice (running at `http://user-auditor:8080/api`) provides real AD audit data. The main backend proxies to it via `UtmAuditorUsersResource`.

**Affected file:** `frontend-v2/src/app/(app)/active-directory/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/active-directory/page.tsx` — entire file, understand all tabs/sections
2. Backend proxy: `backend/src/main/java/com/nilachakra/web/rest/user_auditor/UtmAuditorUsersResource.java` — all endpoint paths and response shapes
3. `backend/src/main/java/com/nilachakra/service/dto/` — find AD-related DTOs
4. Also check: `grep -r "auditor\|active.directory\|utm.ad" backend/src/main/java/com/nilachakra/web/rest/ --include="*.java" -l`

---

## Implementation Steps

### Step 1: Audit all available AD endpoints from the backend

Run:
```bash
grep -r "@GetMapping\|@PostMapping\|@PutMapping" \
  backend/src/main/java/com/nilachakra/web/rest/user_auditor/ \
  --include="*.java"
```

Note all available paths. Common ones from audit:
- `GET /api/utm-auditor-users` — AD user list
- `GET /api/utm-auditor-users/{id}` — user detail
- `GET /api/utm-auditor-events` — AD events
- `GET /api/utm-auditor-groups` — AD groups
- `GET /api/utm-auditor-reports` — AD reports/stats

### Step 2: Create `activeDirectoryService`

Create: `frontend-v2/src/services/active-directory.service.ts`

```typescript
import { apiClient } from '@/lib/api-client';

export interface ADUser {
    id: number;
    username: string;
    displayName: string;
    email?: string;
    department?: string;
    groups: string[];
    lastLogin?: string;
    loginCount?: number;
    failedLoginCount?: number;
    riskScore?: number;
    status: 'ACTIVE' | 'DISABLED' | 'LOCKED';
}

export interface ADEvent {
    id: number;
    eventTime: string;
    eventType: string;
    username: string;
    sourceIp?: string;
    targetUser?: string;
    description: string;
    logonType?: string;
    result: 'SUCCESS' | 'FAILURE';
}

export interface ADOverview {
    totalUsers: number;
    activeUsers: number;
    lockedAccounts: number;
    recentLoginFailures: number;
    privilegedAccounts: number;
    staleAccounts: number;
}

class ActiveDirectoryService {
    async getOverview(): Promise<ADOverview> {
        const response = await apiClient.get<ADOverview>('/api/utm-auditor-overview');
        return response.data;
    }

    async listUsers(params: {
        query?: string;
        department?: string;
        status?: string;
        page?: number;
        size?: number;
    } = {}): Promise<{ data: ADUser[]; total: number }> {
        const response = await apiClient.get('/api/utm-auditor-users', { params });
        return {
            data: response.data,
            total: parseInt(response.headers['x-total-count'] || '0', 10),
        };
    }

    async getUser(id: number): Promise<ADUser> {
        const response = await apiClient.get<ADUser>(`/api/utm-auditor-users/${id}`);
        return response.data;
    }

    async listEvents(params: {
        username?: string;
        eventType?: string;
        startDate?: string;
        endDate?: string;
        page?: number;
        size?: number;
    } = {}): Promise<{ data: ADEvent[]; total: number }> {
        const response = await apiClient.get('/api/utm-auditor-events', { params });
        return {
            data: response.data,
            total: parseInt(response.headers['x-total-count'] || '0', 10),
        };
    }
}

export const activeDirectoryService = new ActiveDirectoryService();
```

**Adjust all paths to match the actual backend controller paths you found in Step 1.**

### Step 3: Replace all MOCK_* in the page

Structure the page with tabs (Overview, Users, Events):

```typescript
'use client';
import { useEffect, useState } from 'react';
import { activeDirectoryService } from '@/services/active-directory.service';

export default function ActiveDirectoryPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'events'>('overview');
    const [overview, setOverview] = useState(null);
    const [users, setUsers] = useState([]);
    const [userTotal, setUserTotal] = useState(0);
    const [events, setEvents] = useState([]);
    const [eventTotal, setEventTotal] = useState(0);
    const [userPage, setUserPage] = useState(0);
    const [eventPage, setEventPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const overviewData = await activeDirectoryService.getOverview();
                setOverview(overviewData);
            } catch (err) {
                setError('Failed to load AD data. Ensure the user-auditor service is running.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (activeTab === 'users') {
            activeDirectoryService.listUsers({ page: userPage, size: 25 })
                .then(r => { setUsers(r.data); setUserTotal(r.total); });
        }
    }, [activeTab, userPage]);

    useEffect(() => {
        if (activeTab === 'events') {
            activeDirectoryService.listEvents({ page: eventPage, size: 25 })
                .then(r => { setEvents(r.data); setEventTotal(r.total); });
        }
    }, [activeTab, eventPage]);

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-destructive">{error}</p>
                <p className="text-sm text-muted-foreground mt-2">
                    Check that user-auditor service is running at http://user-auditor:8080
                </p>
            </div>
        );
    }

    // ... render tabs using real data
}
```

### Step 4: Write tests

Create: `frontend-v2/src/services/__tests__/active-directory.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { activeDirectoryService } from '../active-directory.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('activeDirectoryService', () => {
    it('getOverview calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: { totalUsers: 100 } });
        const result = await activeDirectoryService.getOverview();
        expect(apiClient.get).toHaveBeenCalledWith('/api/utm-auditor-overview');
        expect(result.totalUsers).toBe(100);
    });

    it('listUsers includes pagination params', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: [], headers: { 'x-total-count': '0' } });
        await activeDirectoryService.listUsers({ page: 2, size: 25 });
        expect(apiClient.get).toHaveBeenCalledWith(
            '/api/utm-auditor-users',
            expect.objectContaining({ params: { page: 2, size: 25 } })
        );
    });

    it('page does not use MOCK data', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ 
            data: { totalUsers: 42 }, 
        });
        const overview = await activeDirectoryService.getOverview();
        // Real data, not MOCK_OVERVIEW values
        expect(overview.totalUsers).toBe(42);
    });
});
```

Create page test:
```typescript
// Test that MOCK_ is gone from the page:
it('no MOCK data rendered', async () => {
    render(<ActiveDirectoryPage />);
    await waitFor(() => {
        expect(screen.queryByText(/mock/i)).not.toBeInTheDocument();
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/active-directory.service.test.ts

# Check MOCK_ is removed:
grep -c "MOCK_" src/app/\(app\)/active-directory/page.tsx
# Expected: 0

# Manual test:
# 1. Ensure user-auditor service is running:
docker-compose ps | grep user-auditor

# 2. Test backend proxy:
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-auditor-users?page=0&size=5" | jq '.'

# 3. Open http://localhost:3000/active-directory
# Should show overview stats, user list, and event timeline from real data
```

---

## Acceptance Criteria

- [ ] Zero `MOCK_` references in active-directory page
- [ ] Overview tab shows real stats from AD audit service
- [ ] Users tab shows real AD users with pagination
- [ ] Events tab shows real AD events with filtering
- [ ] Error state shown when user-auditor service is unreachable
- [ ] Service tests pass
- [ ] `npx tsc --noEmit` passes
