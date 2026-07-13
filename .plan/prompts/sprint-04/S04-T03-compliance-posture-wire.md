# S04-T03 — Wire Compliance Posture Tab to Real Data

**Sprint:** 4 (Active Directory + Compliance)  
**Severity:** HIGH — Compliance tab shows demo data  
**Issue ID:** COMPLIANCE-01 (frontend portion)  
**Dependencies:** S04-T02 (compliance plugin must be deployed and running)  
**Estimated time:** 4 hours

---

## Context

The compliance page (`/compliance`) has two parts:
1. **Controls/Evaluations tab** — already wired to real API (works)
2. **Posture tab** — uses `DEMO_FRAMEWORKS` hardcoded data showing fictional compliance scores

With the compliance orchestrator now deployed (S04-T02), the backend will have real framework posture data available. This task wires the posture tab to those real endpoints.

**Affected file:** `frontend-v2/src/app/(app)/compliance/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/compliance/page.tsx` — find `DEMO_FRAMEWORKS` and understand the posture UI
2. Backend: `backend/src/main/java/com/nilachakra/web/rest/compliance/` — read ALL files for posture-related endpoints
3. `grep -r "framework\|posture" backend/src/main/java/com/nilachakra/web/rest/ --include="*.java" | head -30`
4. After S04-T02, the compliance orchestrator writes to OpenSearch — the backend likely queries those results

---

## Implementation Steps

### Step 1: Identify posture endpoints

From reading the compliance REST controllers, find:
- `GET /api/utm-compliance-frameworks` — list of configured frameworks
- `GET /api/utm-compliance-posture` or similar — current posture scores per framework
- `GET /api/utm-compliance-reports` — historical compliance trend data

### Step 2: Create or extend `complianceService`

In `frontend-v2/src/services/compliance.service.ts`, add posture methods (the file may already exist for the controls tab):

```typescript
export interface ComplianceFramework {
    id: number;
    frameworkName: string;  // HIPAA, PCI_DSS, ISO27001, NIST_CSF, SOC2
    frameworkVersion: string;
    enabled: boolean;
    totalControls: number;
    compliantControls: number;
    partiallyCompliantControls: number;
    nonCompliantControls: number;
    complianceScore: number;  // 0-100
    lastEvaluated?: string;
}

export interface ComplianceTrend {
    frameworkName: string;
    date: string;
    score: number;
}

// Add to existing complianceService:
async getFrameworkPosture(): Promise<ComplianceFramework[]> {
    const response = await apiClient.get<ComplianceFramework[]>('/api/utm-compliance-frameworks/posture');
    return response.data;
}

async getComplianceTrend(frameworkName: string, days: number = 30): Promise<ComplianceTrend[]> {
    const response = await apiClient.get<ComplianceTrend[]>('/api/utm-compliance-trend', {
        params: { framework: frameworkName, days }
    });
    return response.data;
}
```

**Adjust paths to match what you find in the backend controller.**

### Step 3: Replace DEMO_FRAMEWORKS in the page

```typescript
// BEFORE: uses DEMO_FRAMEWORKS constant
// AFTER: real API data

const [frameworks, setFrameworks] = useState<ComplianceFramework[]>([]);
const [postureLoading, setPostureLoading] = useState(true);

useEffect(() => {
    complianceService.getFrameworkPosture()
        .then(setFrameworks)
        .catch(err => {
            console.error('Posture data unavailable:', err);
            // Show helpful message if compliance orchestrator not running
        })
        .finally(() => setPostureLoading(false));
}, []);
```

### Step 4: Display compliance score cards with real data

Each framework should show a score gauge, breakdown bar, and last-evaluated timestamp:

```typescript
{frameworks.map(fw => (
    <div key={fw.id} className="compliance-card">
        <h3>{fw.frameworkName}</h3>
        <div className="score-gauge" style={{ '--score': fw.complianceScore }}>
            {fw.complianceScore}%
        </div>
        <div className="breakdown">
            <span className="compliant">{fw.compliantControls} Compliant</span>
            <span className="partial">{fw.partiallyCompliantControls} Partial</span>
            <span className="non">{fw.nonCompliantControls} Non-Compliant</span>
        </div>
        {fw.lastEvaluated && (
            <p className="text-xs text-muted-foreground">
                Last evaluated: {new Date(fw.lastEvaluated).toLocaleString()}
            </p>
        )}
    </div>
))}
```

### Step 5: Write tests

Create: `frontend-v2/src/services/__tests__/compliance-posture.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { complianceService } from '../compliance.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

const mockPosture = [
    { id: 1, frameworkName: 'PCI_DSS', complianceScore: 87, lastEvaluated: '2026-07-08T10:00:00Z' }
];

describe('compliance posture', () => {
    it('getFrameworkPosture calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: mockPosture });
        
        const result = await complianceService.getFrameworkPosture();
        
        expect(apiClient.get).toHaveBeenCalledWith(
            expect.stringContaining('/api/utm-compliance')
        );
        expect(result[0].complianceScore).toBe(87);
    });

    it('posture data is not from DEMO_FRAMEWORKS', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: mockPosture });
        
        const result = await complianceService.getFrameworkPosture();
        
        // Real data: not mock scores (DEMO_FRAMEWORKS typically uses 75, 82, etc.)
        expect(result[0].frameworkName).not.toMatch(/demo/i);
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/compliance-posture.service.test.ts

# Check DEMO_FRAMEWORKS is gone:
grep -c "DEMO_FRAMEWORKS" src/app/\(app\)/compliance/page.tsx
# Expected: 0

# Manual test (requires compliance orchestrator from S04-T02):
JWT=... # get JWT
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-compliance-frameworks/posture" | jq '.'

# Open http://localhost:3000/compliance → Posture tab
# Should show real framework scores, not DEMO values
```

---

## Acceptance Criteria

- [ ] Zero `DEMO_FRAMEWORKS` references in compliance page
- [ ] Framework posture scores come from real API
- [ ] Last-evaluated timestamps shown
- [ ] Score cards update when backend data changes
- [ ] Handles gracefully when compliance orchestrator has not yet run (empty state, not crash)
- [ ] Service tests pass
- [ ] `npx tsc --noEmit` passes
