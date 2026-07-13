# S02-T07 — Wire Threat Intel Page to Real API

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** MEDIUM — Feature is 100% static  
**Issue ID:** UX-P1-04  
**Dependencies:** None  
**Estimated time:** 6 hours

---

## Context

The threat intel page (`/threat-intel`) has 1,725 lines of UI code but makes zero API calls. All data — IOC lists, feed status, stats, search results — is completely static. The backend has real endpoints for IOC data, feed management, and threat intelligence statistics.

**Affected file:** `frontend-v2/src/app/(app)/threat-intel/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/threat-intel/page.tsx` — entire file, understand ALL UI sections
2. Search for existing threat intel service: `find frontend-v2/src -name "*threat*" -o -name "*intel*" -o -name "*ioc*"`
3. Backend endpoints (read these files):
   - `backend/src/main/java/com/nilachakra/web/rest/threat_intel/ThreatIntelResource.java` (if exists)
   - `grep -r "threat-intel\|threat_intel\|ioc" backend/src/main/java/com/nilachakra/web/rest/ --include="*.java" -l`
4. The audit found these backend paths: `GET /api/v1/threat-intel/ioc`, `GET /api/v1/threat-intel/feeds`, `GET /api/v1/threat-intel/stats`

---

## Implementation Steps

### Step 1: Create `ThreatIntelService`

Create: `frontend-v2/src/services/threat-intel.service.ts`

```typescript
import { apiClient } from '@/lib/api-client';

export interface IOC {
    id: number;
    type: string;        // IP, DOMAIN, URL, HASH, etc.
    value: string;
    severity: string;
    source: string;
    firstSeen: string;
    lastSeen: string;
    tags: string[];
}

export interface ThreatFeed {
    id: number;
    name: string;
    url: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
    lastUpdated: string;
    iocCount: number;
}

export interface ThreatIntelStats {
    totalIOCs: number;
    activeFeeds: number;
    iocsByType: Record<string, number>;
    last24hUpdates: number;
}

export interface IOCSearchParams {
    query?: string;
    type?: string;
    severity?: string;
    source?: string;
    page?: number;
    size?: number;
    sort?: string;
}

class ThreatIntelService {
    async searchIOCs(params: IOCSearchParams): Promise<{ data: IOC[]; total: number }> {
        const response = await apiClient.get('/api/v1/threat-intel/ioc', { params });
        return {
            data: response.data,
            total: parseInt(response.headers['x-total-count'] || '0', 10),
        };
    }

    async getIOC(id: number): Promise<IOC> {
        const response = await apiClient.get<IOC>(`/api/v1/threat-intel/ioc/${id}`);
        return response.data;
    }

    async getFeeds(): Promise<ThreatFeed[]> {
        const response = await apiClient.get<ThreatFeed[]>('/api/v1/threat-intel/feeds');
        return response.data;
    }

    async getStats(): Promise<ThreatIntelStats> {
        const response = await apiClient.get<ThreatIntelStats>('/api/v1/threat-intel/stats');
        return response.data;
    }

    async checkIOC(value: string): Promise<IOC | null> {
        try {
            const response = await apiClient.get<IOC>('/api/v1/threat-intel/ioc/check', {
                params: { value }
            });
            return response.data;
        } catch (err) {
            if (err?.response?.status === 404) return null;
            throw err;
        }
    }
}

export const threatIntelService = new ThreatIntelService();
```

**Important:** Before writing the final service, read the actual backend controller to get the exact paths, query param names, and response shapes. Adjust the service above to match.

### Step 2: Replace static data in `threat-intel/page.tsx`

Restructure the page to use the service. Replace each hardcoded data section:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { threatIntelService, type IOC, type ThreatFeed, type ThreatIntelStats } from '@/services/threat-intel.service';

export default function ThreatIntelPage() {
    const [stats, setStats] = useState<ThreatIntelStats | null>(null);
    const [feeds, setFeeds] = useState<ThreatFeed[]>([]);
    const [iocs, setIOCs] = useState<IOC[]>([]);
    const [iocTotal, setIOCTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [iocType, setIOCType] = useState<string>('');
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setLoading(true);
                const [statsData, feedsData] = await Promise.all([
                    threatIntelService.getStats(),
                    threatIntelService.getFeeds(),
                ]);
                setStats(statsData);
                setFeeds(feedsData);
            } catch (err) {
                setError('Failed to load threat intelligence data');
            } finally {
                setLoading(false);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        const searchIOCs = async () => {
            try {
                const result = await threatIntelService.searchIOCs({
                    query: searchQuery || undefined,
                    type: iocType || undefined,
                    page,
                    size: 50,
                });
                setIOCs(result.data);
                setIOCTotal(result.total);
            } catch (err) {
                console.error('IOC search failed:', err);
            }
        };
        searchIOCs();
    }, [searchQuery, iocType, page]);

    // ... render UI using real data
}
```

### Step 3: Verify backend endpoints exist

Before implementing, confirm all backend paths exist:
```bash
curl -s -H "Authorization: Bearer $JWT" "http://localhost:8088/api/v1/threat-intel/stats" | jq '.'
curl -s -H "Authorization: Bearer $JWT" "http://localhost:8088/api/v1/threat-intel/feeds" | jq '.'
curl -s -H "Authorization: Bearer $JWT" "http://localhost:8088/api/v1/threat-intel/ioc?page=0&size=10" | jq '.'
```

If any endpoint returns 404, check the backend controller and adjust the paths in the service.

### Step 4: Write tests

Create: `frontend-v2/src/services/__tests__/threat-intel.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { threatIntelService } from '../threat-intel.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

describe('threatIntelService', () => {
    it('searchIOCs calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: [],
            headers: { 'x-total-count': '0' }
        });
        
        await threatIntelService.searchIOCs({ query: 'malware', page: 0 });
        
        expect(apiClient.get).toHaveBeenCalledWith(
            '/api/v1/threat-intel/ioc',
            expect.objectContaining({ params: { query: 'malware', page: 0 } })
        );
    });

    it('getStats calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: { totalIOCs: 100 } });
        
        const result = await threatIntelService.getStats();
        
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/threat-intel/stats');
        expect(result.totalIOCs).toBe(100);
    });

    it('getFeeds calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
        
        await threatIntelService.getFeeds();
        
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/threat-intel/feeds');
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/threat-intel.service.test.ts

# Verify no static data remains:
grep -r "MOCK_\|hardcoded\|static_data\|demoIoc" \
  src/app/\(app\)/threat-intel/ --include="*.tsx" --include="*.ts"
# Should return nothing

# Manual test: http://localhost:3000/threat-intel
# Should show real stats (numbers change based on real data)
# Should show real feed status
# Search bar should filter real IOC data
```

---

## Acceptance Criteria

- [ ] `threatIntelService` created with methods for IOC search, feeds, and stats
- [ ] Page fetches stats and feeds on mount
- [ ] IOC search fires when query/type changes
- [ ] All static/MOCK data replaced with real API data
- [ ] Loading state shown during fetch
- [ ] Error state shown if API fails
- [ ] Service unit tests pass
- [ ] `npx tsc --noEmit` passes
