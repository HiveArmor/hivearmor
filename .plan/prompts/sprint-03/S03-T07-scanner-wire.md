# S03-T07 — Wire Network Scanner Page to Real API

**Sprint:** 3 (Frontend RBAC + Key UX Features)  
**Severity:** MEDIUM — Feature is 100% mock data  
**Issue ID:** UX-P1-06  
**Dependencies:** S03-T01 (RBAC active)  
**Estimated time:** 3 hours

---

## Context

The network scanner page (`/scanner`) uses 100% `MOCK_*` static data. The backend has `GET /api/utm-network-scans` endpoints. Asset discovery and scan results are completely fabricated.

**Affected file:** `frontend-v2/src/app/(app)/scanner/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/scanner/page.tsx` — find all `MOCK_*` constants and understand the UI sections
2. Backend: `backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmNetworkScanResource.java` — exact paths, supported query params, response shape
3. `backend/src/main/java/com/nilachakra/domain/UtmNetworkScan.java` — entity fields

---

## Implementation Steps

### Step 1: Create `networkScanService`

Create: `frontend-v2/src/services/network-scan.service.ts`

```typescript
import { apiClient } from '@/lib/api-client';

export interface NetworkScan {
    id: number;
    assetIp: string;
    assetName?: string;
    os?: string;
    type?: string;
    openPorts?: string;
    discoveredAt: string;
    lastSeen: string;
    probe?: string;
    alive: boolean;
}

export interface NetworkScanFilter {
    assetIp?: string;
    assetName?: string;
    os?: string;
    type?: string;
    page?: number;
    size?: number;
    sort?: string;
}

class NetworkScanService {
    async list(filter: NetworkScanFilter = {}): Promise<{ data: NetworkScan[]; total: number }> {
        const response = await apiClient.get('/api/utm-network-scans', { params: filter });
        return {
            data: response.data,
            total: parseInt(response.headers['x-total-count'] || '0', 10),
        };
    }

    async getScan(id: number): Promise<NetworkScan> {
        const response = await apiClient.get<NetworkScan>(`/api/utm-network-scans/${id}`);
        return response.data;
    }

    async triggerScan(config: { targetRange: string }): Promise<void> {
        await apiClient.post('/api/utm-network-scans/trigger', config);
    }

    async getStats(): Promise<{ totalAssets: number; liveAssets: number; osBreakdown: Record<string, number> }> {
        const response = await apiClient.get('/api/utm-network-scans/stats');
        return response.data;
    }
}

export const networkScanService = new NetworkScanService();
```

**Verify** the exact backend paths before finalizing.

### Step 2: Replace MOCK_* data in scanner page

```typescript
'use client';
import { useEffect, useState, useCallback } from 'react';
import { networkScanService, type NetworkScan } from '@/services/network-scan.service';

export default function ScannerPage() {
    const [scans, setScans] = useState<NetworkScan[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState(null);
    const [filter, setFilter] = useState<NetworkScanFilter>({ page: 0, size: 25 });
    const [loading, setLoading] = useState(true);

    const loadScans = useCallback(async () => {
        try {
            const [result, statsData] = await Promise.all([
                networkScanService.list(filter),
                networkScanService.getStats().catch(() => null),
            ]);
            setScans(result.data);
            setTotal(result.total);
            if (statsData) setStats(statsData);
        } catch (err) {
            console.error('Failed to load scans:', err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { loadScans(); }, [loadScans]);

    // ... render real data
}
```

### Step 3: Verify MOCK_ is gone

After implementation:
```bash
grep -n "MOCK_" src/app/\(app\)/scanner/page.tsx
# Must return empty
```

### Step 4: Write tests

Create: `frontend-v2/src/services/__tests__/network-scan.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { networkScanService } from '../network-scan.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('networkScanService', () => {
    it('list calls correct endpoint with params', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ 
            data: [], 
            headers: { 'x-total-count': '50' } 
        });
        
        const result = await networkScanService.list({ assetIp: '192.168', page: 0, size: 25 });
        
        expect(apiClient.get).toHaveBeenCalledWith('/api/utm-network-scans', {
            params: { assetIp: '192.168', page: 0, size: 25 }
        });
        expect(result.total).toBe(50);
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/network-scan.service.test.ts

# Check no MOCK_ remains:
grep -c "MOCK_" src/app/\(app\)/scanner/page.tsx
# Expected: 0

# Manual test: Open http://localhost:3000/scanner
# Should show discovered assets from real network scans
```

---

## Acceptance Criteria

- [ ] Zero `MOCK_` references in scanner page
- [ ] Data loaded from `GET /api/utm-network-scans`
- [ ] Stats loaded from stats endpoint
- [ ] Pagination works
- [ ] Service tests pass
- [ ] `npx tsc --noEmit` passes
