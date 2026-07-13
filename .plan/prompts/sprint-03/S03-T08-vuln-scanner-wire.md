# S03-T08 — Wire Vulnerability Scanner Page to Real API

**Sprint:** 3 (Frontend RBAC + Key UX Features)  
**Severity:** MEDIUM — Feature is 100% mock data  
**Issue ID:** UX-P1-07  
**Dependencies:** S03-T01 (RBAC active), S03-T07 (scanner pattern established)  
**Estimated time:** 3 hours

---

## Context

The vulnerability scanner page (`/vulnerability-scanner`) uses 100% `MOCK_*` static data. Similar to the network scanner, it needs to be wired to the real vulnerability scan backend endpoints.

**Affected file:** `frontend-v2/src/app/(app)/vulnerability-scanner/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/vulnerability-scanner/page.tsx` — find all `MOCK_*` and understand the UI
2. Backend: `grep -r "vulnerability\|vuln" backend/src/main/java/com/nilachakra/web/rest/ --include="*.java" -l` then read the relevant controllers
3. `backend/src/main/java/com/nilachakra/domain/` — find vulnerability-related entities

---

## Implementation Steps

### Step 1: Locate actual backend endpoints

Before writing a service, confirm what vulnerability endpoints exist:

```bash
grep -r "@RequestMapping\|@GetMapping\|@PostMapping" \
  backend/src/main/java/com/nilachakra/web/rest/ \
  --include="*.java" | grep -i "vuln" | head -20
```

Common paths to check: `/api/utm-vulnerability-scans`, `/api/vulnerability`, `/api/utm-vulns`

### Step 2: Create `vulnerabilityService`

Create: `frontend-v2/src/services/vulnerability.service.ts`

```typescript
import { apiClient } from '@/lib/api-client';

export interface Vulnerability {
    id: number;
    assetIp: string;
    assetName?: string;
    cve?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    description?: string;
    solution?: string;
    discoveredAt: string;
    status: 'OPEN' | 'PATCHED' | 'ACCEPTED';
    port?: number;
    service?: string;
}

export interface VulnerabilityScanSummary {
    totalVulnerabilities: number;
    bySeverity: Record<string, number>;
    openCount: number;
    patchedCount: number;
    lastScanAt?: string;
}

class VulnerabilityService {
    async list(params: {
        assetIp?: string;
        severity?: string;
        status?: string;
        page?: number;
        size?: number;
    } = {}): Promise<{ data: Vulnerability[]; total: number }> {
        const response = await apiClient.get('/api/utm-vulnerability-scans', { params });
        return {
            data: response.data,
            total: parseInt(response.headers['x-total-count'] || '0', 10),
        };
    }

    async getSummary(): Promise<VulnerabilityScanSummary> {
        const response = await apiClient.get<VulnerabilityScanSummary>('/api/utm-vulnerability-scans/summary');
        return response.data;
    }

    async updateStatus(id: number, status: Vulnerability['status']): Promise<Vulnerability> {
        const response = await apiClient.put<Vulnerability>(`/api/utm-vulnerability-scans/${id}`, { status });
        return response.data;
    }
}

export const vulnerabilityService = new VulnerabilityService();
```

**Adjust all paths to match what the backend grep reveals.**

### Step 3: Replace MOCK_* in the page

Follow the same pattern as S03-T07:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { vulnerabilityService, type Vulnerability } from '@/services/vulnerability.service';

export default function VulnerabilityScannerPage() {
    const [vulns, setVulns] = useState<Vulnerability[]>([]);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [severityFilter, setSeverityFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('OPEN');
    const [page, setPage] = useState(0);

    useEffect(() => {
        const load = async () => {
            try {
                const [result, summaryData] = await Promise.all([
                    vulnerabilityService.list({ 
                        severity: severityFilter || undefined,
                        status: statusFilter || undefined,
                        page,
                        size: 25
                    }),
                    vulnerabilityService.getSummary().catch(() => null),
                ]);
                setVulns(result.data);
                setTotal(result.total);
                if (summaryData) setSummary(summaryData);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [severityFilter, statusFilter, page]);

    // ... render
}
```

### Step 4: Add severity filter controls

```typescript
// Filter bar above the vuln table:
<div className="flex gap-3 mb-4">
    <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
        <option value="">All Severities</option>
        <option value="CRITICAL">Critical</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
    </select>
    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
        <option value="">All Statuses</option>
        <option value="OPEN">Open</option>
        <option value="PATCHED">Patched</option>
        <option value="ACCEPTED">Accepted Risk</option>
    </select>
</div>
```

### Step 5: Write tests

Create: `frontend-v2/src/services/__tests__/vulnerability.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { vulnerabilityService } from '../vulnerability.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('vulnerabilityService', () => {
    it('list calls endpoint with filters', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ 
            data: [], headers: { 'x-total-count': '10' } 
        });
        
        await vulnerabilityService.list({ severity: 'CRITICAL', status: 'OPEN', page: 0 });
        
        expect(apiClient.get).toHaveBeenCalledWith(
            '/api/utm-vulnerability-scans',
            expect.objectContaining({ 
                params: expect.objectContaining({ severity: 'CRITICAL', status: 'OPEN' })
            })
        );
    });

    it('no MOCK_ data in results', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ 
            data: [{ id: 1, assetIp: '10.0.0.1', severity: 'HIGH', status: 'OPEN' }],
            headers: { 'x-total-count': '1' }
        });
        
        const result = await vulnerabilityService.list();
        expect(result.data[0].assetIp).toBe('10.0.0.1');
        // No mock data values like "MOCK_IP" in results
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/vulnerability.service.test.ts

# Check no MOCK_ remains:
grep -c "MOCK_" src/app/\(app\)/vulnerability-scanner/page.tsx
# Expected: 0

# Manual: http://localhost:3000/vulnerability-scanner
# Should show severity summary cards from real data
# Should show filterable vulnerability list
```

---

## Acceptance Criteria

- [ ] Zero `MOCK_` references in vulnerability-scanner page
- [ ] Vulnerabilities loaded from real API endpoint
- [ ] Summary statistics come from real API
- [ ] Severity and status filters work
- [ ] Pagination works
- [ ] Service tests pass
- [ ] `npx tsc --noEmit` passes
