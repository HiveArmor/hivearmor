# S03-T02 — Add Pagination to Incidents List

**Sprint:** 3 (Frontend RBAC + Key UX Features)  
**Severity:** MEDIUM — SOC workflow blocked at 100 records  
**Issue ID:** UX-P1-02  
**Dependencies:** None  
**Estimated time:** 3 hours

---

## Context

The incidents page hard-caps at 100 records with no pagination UI. When an incident list grows beyond 100, older incidents are inaccessible from the UI. The backend supports full Spring pagination (`page`, `size`, `sort` params) and returns `X-Total-Count` header.

**Affected file:** `frontend-v2/src/app/(app)/incidents/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/incidents/page.tsx` — find the hardcoded `size=100` or similar limit
2. `frontend-v2/src/services/incident.service.ts` — find `listIncidents()` call
3. Backend endpoint: `GET /api/utm-incidents` — check `UtmIncidentResource.java` for page/size support
4. Look for an existing pagination component: `find frontend-v2/src/components -name "*pagination*" -i`

---

## Implementation Steps

### Step 1: Remove the hardcoded limit in the service call

```typescript
// BEFORE:
const incidents = await incidentService.listIncidents({ size: 100 });

// AFTER:
const { data: incidents, total } = await incidentService.listIncidents({ 
    page: currentPage,
    size: pageSize,  // default 25
    sort: 'incidentCreationDate,desc'
});
```

### Step 2: Update `incidentService.listIncidents()` to return pagination info

```typescript
async listIncidents(params: IncidentListParams): Promise<{ data: Incident[]; total: number }> {
    const response = await apiClient.get('/api/utm-incidents', { params });
    return {
        data: response.data,
        total: parseInt(response.headers['x-total-count'] || '0', 10),
    };
}
```

### Step 3: Add pagination state to the page

```typescript
const PAGE_SIZE = 25;
const [currentPage, setCurrentPage] = useState(0);
const [total, setTotal] = useState(0);
const totalPages = Math.ceil(total / PAGE_SIZE);
```

### Step 4: Add or reuse a Pagination component

If no pagination component exists, create: `frontend-v2/src/components/ui/pagination.tsx`

```typescript
interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
    return (
        <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
            </div>
            <div className="flex gap-2">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 0}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                >
                    Previous
                </button>
                {/* Page number buttons for nearby pages */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = Math.max(0, Math.min(currentPage - 2 + i, totalPages - 1));
                    return (
                        <button
                            key={page}
                            onClick={() => onPageChange(page)}
                            className={`px-3 py-1 border rounded ${
                                page === currentPage ? 'bg-primary text-primary-foreground' : ''
                            }`}
                        >
                            {page + 1}
                        </button>
                    );
                })}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
```

### Step 5: Add page info to the incidents page header

```typescript
<div className="flex justify-between items-center mb-4">
    <h1>Incidents</h1>
    <span className="text-sm text-muted-foreground">
        {total} total incidents
    </span>
</div>

{/* ... incident table ... */}

<Pagination 
    currentPage={currentPage}
    totalPages={totalPages}
    onPageChange={setCurrentPage}
/>
```

### Step 6: Add page size selector

```typescript
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const [pageSize, setPageSize] = useState(25);

// In JSX, add a select near the pagination:
<select 
    value={pageSize} 
    onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
>
    {PAGE_SIZE_OPTIONS.map(size => (
        <option key={size} value={size}>{size} per page</option>
    ))}
</select>
```

### Step 7: Write tests

Create: `frontend-v2/src/app/(app)/incidents/__tests__/pagination.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import IncidentsPage from '../page';
import * as incidentService from '@/services/incident.service';

vi.mock('@/services/incident.service');

describe('IncidentsPage pagination', () => {
    beforeEach(() => {
        vi.mocked(incidentService.listIncidents).mockResolvedValue({
            data: Array.from({ length: 25 }, (_, i) => ({ id: i, name: `Incident ${i}`, status: 'OPEN' })),
            total: 75,
        });
    });

    it('shows total count in header', async () => {
        render(<IncidentsPage />);
        await waitFor(() => {
            expect(screen.getByText(/75.*incident/i)).toBeInTheDocument();
        });
    });

    it('shows pagination controls', async () => {
        render(<IncidentsPage />);
        await waitFor(() => {
            expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
            expect(screen.getByText('Previous')).toBeDisabled();
            expect(screen.getByText('Next')).not.toBeDisabled();
        });
    });

    it('loads next page when Next is clicked', async () => {
        render(<IncidentsPage />);
        await waitFor(() => screen.getByText('Next'));
        
        fireEvent.click(screen.getByText('Next'));
        
        await waitFor(() => {
            expect(incidentService.listIncidents).toHaveBeenCalledWith(
                expect.objectContaining({ page: 1 })
            );
        });
    });

    it('does NOT hardcode size: 100', async () => {
        render(<IncidentsPage />);
        await waitFor(() => screen.getByText('Next'));
        
        // Default size should be 25, never 100
        expect(incidentService.listIncidents).toHaveBeenCalledWith(
            expect.objectContaining({ size: 25 })
        );
        expect(incidentService.listIncidents).not.toHaveBeenCalledWith(
            expect.objectContaining({ size: 100 })
        );
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/app/\(app\)/incidents/__tests__/pagination.test.tsx

# Manual test:
# Open http://localhost:3000/incidents
# Should see "X total incidents" header
# Should see page controls (Previous / 1 / 2 / ... / Next)
# Clicking Next loads the next 25 incidents
# Page size dropdown changes how many are shown
```

---

## Acceptance Criteria

- [ ] Incidents are loaded with default page size of 25 (not 100)
- [ ] `X-Total-Count` header used to show total count
- [ ] Pagination controls show current page and total pages
- [ ] Next/Previous buttons navigate to next/previous page
- [ ] Previous button disabled on page 1
- [ ] Next button disabled on last page
- [ ] Page size selector allows 10/25/50/100 per page
- [ ] All 4 pagination tests pass
- [ ] `npx tsc --noEmit` passes
