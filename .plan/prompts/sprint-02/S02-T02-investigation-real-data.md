# S02-T02 — Wire Investigation Workspace to Real Incident Data

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** HIGH — Analyst-blocking P0 bug  
**Issue ID:** UX-P0-02  
**Dependencies:** None  
**Estimated time:** 4 hours

---

## Context

The incident investigation page (`/incidents/[id]`) uses a hardcoded `DEMO_INCIDENT` constant instead of fetching real incident data. Analysts clicking into a real incident see fabricated demo data. The investigation workspace, timeline, evidence board, and all related components are populated with this static data.

**Affected file:** `frontend-v2/src/app/(app)/incidents/[id]/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/incidents/[id]/page.tsx` — entire file, find `DEMO_INCIDENT` usage
2. Search for the constant: `grep -r "DEMO_INCIDENT" frontend-v2/src/`
3. `frontend-v2/src/services/incident.service.ts` — find the `getIncident(id)` method and response shape
4. `frontend-v2/src/types/incident.ts` (or equivalent) — understand the `Incident` type
5. Backend endpoint: `GET /api/utm-incidents/{id}` — read `backend/src/main/java/com/nilachakra/web/rest/incident_response/UtmIncidentResource.java` to understand response fields
6. `frontend-v2/src/app/(app)/incidents/page.tsx` — how incidents list works (as a working reference)

---

## Implementation Steps

### Step 1: Remove the DEMO_INCIDENT constant

Find all locations where `DEMO_INCIDENT` is imported or referenced in `[id]/page.tsx` and remove them.

### Step 2: Implement the data fetching hook

Add a `useIncident(id)` hook or inline state management:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { incidentService } from '@/services/incident.service';
import type { Incident } from '@/types/incident';

export default function IncidentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const incidentId = params.id as string;
    
    const [incident, setIncident] = useState<Incident | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        if (!incidentId) return;
        
        const fetchIncident = async () => {
            try {
                setLoading(true);
                const data = await incidentService.getIncident(Number(incidentId));
                setIncident(data);
            } catch (err) {
                console.error('Failed to fetch incident:', err);
                if (err?.response?.status === 404) {
                    setError('Incident not found');
                } else {
                    setError('Failed to load incident. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };
        
        fetchIncident();
    }, [incidentId]);
    
    if (loading) {
        return <IncidentDetailSkeleton />;  // or a spinner
    }
    
    if (error || !incident) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-destructive">{error || 'Incident not found'}</p>
                <button onClick={() => router.push('/incidents')}>Back to Incidents</button>
            </div>
        );
    }
    
    return <IncidentDetailView incident={incident} />;
}
```

### Step 3: Verify `incidentService.getIncident(id)` exists

In `frontend-v2/src/services/incident.service.ts`, confirm or add:

```typescript
async getIncident(id: number): Promise<Incident> {
    const response = await apiClient.get<Incident>(`/api/utm-incidents/${id}`);
    return response.data;
}
```

### Step 4: Map backend fields to frontend type

The backend `UtmIncident` entity has specific field names. Verify the `Incident` TypeScript type matches. Common mismatches to check:
- `incidentName` vs `name`
- `incidentStatus` vs `status`  
- `incidentSeverity` vs `severity`
- `incidentCreationDate` vs `createdAt`

If mismatches exist, add a mapper in the service:

```typescript
private mapIncident(raw: BackendIncident): Incident {
    return {
        id: raw.id,
        name: raw.incidentName,
        status: raw.incidentStatus,
        severity: raw.incidentSeverity,
        createdAt: raw.incidentCreationDate,
        assignee: raw.incidentAssigned,
        // ... map all fields
    };
}
```

### Step 5: Add loading skeleton

Create: `frontend-v2/src/app/(app)/incidents/[id]/incident-detail-skeleton.tsx`

```typescript
export function IncidentDetailSkeleton() {
    return (
        <div className="space-y-4 p-6 animate-pulse">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-muted rounded" />
                ))}
            </div>
            <div className="h-48 bg-muted rounded" />
        </div>
    );
}
```

### Step 6: Write tests

Create: `frontend-v2/src/app/(app)/incidents/[id]/__tests__/page.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import IncidentDetailPage from '../page';
import * as incidentService from '@/services/incident.service';

vi.mock('next/navigation', () => ({
    useParams: () => ({ id: '42' }),
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/services/incident.service');

const mockIncident = {
    id: 42,
    name: 'SSH Brute Force Detected',
    status: 'OPEN',
    severity: 'HIGH',
    createdAt: '2026-07-08T10:00:00Z',
};

describe('IncidentDetailPage', () => {
    it('fetches and displays real incident data', async () => {
        vi.mocked(incidentService.getIncident).mockResolvedValue(mockIncident);
        
        render(<IncidentDetailPage />);
        
        // Loading state shown initially
        expect(screen.getByTestId('incident-skeleton')).toBeInTheDocument();
        
        await waitFor(() => {
            expect(screen.getByText('SSH Brute Force Detected')).toBeInTheDocument();
        });
        
        expect(incidentService.getIncident).toHaveBeenCalledWith(42);
    });

    it('shows DEMO_INCIDENT data NEVER appears', async () => {
        vi.mocked(incidentService.getIncident).mockResolvedValue(mockIncident);
        
        render(<IncidentDetailPage />);
        
        await waitFor(() => {
            // "DEMO_INCIDENT" or any known demo text should not appear
            expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
        });
    });

    it('shows error state when incident not found', async () => {
        vi.mocked(incidentService.getIncident).mockRejectedValue({ response: { status: 404 } });
        
        render(<IncidentDetailPage />);
        
        await waitFor(() => {
            expect(screen.getByText(/incident not found/i)).toBeInTheDocument();
        });
    });

    it('shows generic error when API fails', async () => {
        vi.mocked(incidentService.getIncident).mockRejectedValue(new Error('Network error'));
        
        render(<IncidentDetailPage />);
        
        await waitFor(() => {
            expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
        });
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/app/\(app\)/incidents/\[id\]/__tests__/page.test.tsx

# Manual E2E test with running backend (http://localhost:8088) and frontend (http://localhost:3000):
# 1. Get the list of real incidents
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

INCIDENT_ID=$(curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-incidents?page=0&size=1" | jq '.[0].id')

echo "Test incident ID: $INCIDENT_ID"

# 2. Navigate to http://localhost:3000/incidents/$INCIDENT_ID
# 3. Verify: page shows REAL data from the incident (name, severity, dates)
# 4. Verify: NO demo/mock text visible anywhere
# 5. Navigate to a non-existent ID: http://localhost:3000/incidents/999999
# 6. Verify: "Incident not found" error shown, not a crash
```

---

## Acceptance Criteria

- [ ] `/incidents/[id]` calls `GET /api/utm-incidents/{id}` on mount
- [ ] Real incident name, severity, status, and creation date are displayed
- [ ] The string `DEMO_INCIDENT` does not appear anywhere in the component tree
- [ ] Loading skeleton shown during fetch
- [ ] 404 shows "Incident not found" with back-to-list button
- [ ] Network error shows generic error with retry
- [ ] All 4 unit tests pass
- [ ] `npx tsc --noEmit` passes
