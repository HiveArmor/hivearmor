# S03-T03 — Add Incident Assignment UI

**Sprint:** 3 (Frontend RBAC + Key UX Features)  
**Severity:** MEDIUM — SOC coordination blocker  
**Issue ID:** UX-P1-03  
**Dependencies:** S03-T02 (pagination must be stable)  
**Estimated time:** 4 hours

---

## Context

There is no way to assign an incident to a specific analyst. Without assignment, multiple analysts work the same incident or incidents go unattended. The backend supports assignment via `PUT /api/utm-incidents/{id}` with an assignee field.

**Affected files:**
- `frontend-v2/src/app/(app)/incidents/page.tsx`
- `frontend-v2/src/app/(app)/incidents/[id]/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/incidents/page.tsx` — incident list row UI
2. `frontend-v2/src/app/(app)/incidents/[id]/page.tsx` — incident detail page
3. `frontend-v2/src/services/incident.service.ts` — update method
4. Backend: `backend/src/main/java/com/nilachakra/web/rest/incident_response/UtmIncidentResource.java` — find the update/assign endpoint and its body shape
5. Backend user endpoint: `GET /api/users` — to populate the assignee dropdown

---

## Implementation Steps

### Step 1: Add user list fetching for assignee dropdown

In `frontend-v2/src/services/user.service.ts` (create if doesn't exist), add:

```typescript
async listAnalysts(): Promise<UserSummary[]> {
    const response = await apiClient.get<UserSummary[]>('/api/users', {
        params: { 
            page: 0, 
            size: 100,
            // Filter to analysts and admins only if backend supports it
        }
    });
    return response.data;
}
```

### Step 2: Create `AssigneeSelector` component

Create: `frontend-v2/src/components/incidents/assignee-selector.tsx`

```typescript
import { useEffect, useState } from 'react';
import { userService, type UserSummary } from '@/services/user.service';

interface AssigneeSelectorProps {
    currentAssignee?: string | null;
    onAssign: (userId: string | null) => void;
    disabled?: boolean;
}

export function AssigneeSelector({ currentAssignee, onAssign, disabled }: AssigneeSelectorProps) {
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        userService.listAnalysts()
            .then(setUsers)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Assigned to:</label>
            <select
                value={currentAssignee || ''}
                onChange={e => onAssign(e.target.value || null)}
                disabled={disabled || loading}
                className="text-sm border rounded px-2 py-1"
            >
                <option value="">Unassigned</option>
                {users.map(user => (
                    <option key={user.id} value={user.login}>
                        {user.firstName} {user.lastName} ({user.login})
                    </option>
                ))}
            </select>
        </div>
    );
}
```

### Step 3: Add assignment to `incidentService`

```typescript
async assignIncident(incidentId: number, assigneeLogin: string | null): Promise<Incident> {
    const response = await apiClient.put<Incident>(`/api/utm-incidents/${incidentId}`, {
        id: incidentId,
        incidentAssigned: assigneeLogin,  // check exact field name in backend DTO
    });
    return response.data;
}
```

**Important:** Read `UtmIncidentResource.java` to confirm:
- The exact HTTP method (PUT vs PATCH)
- The exact field name for the assignee (`incidentAssigned`, `assignedTo`, `assignedUser`, etc.)
- Whether a full incident object is required or just the changed fields

### Step 4: Add assignment to incident detail page

In `incidents/[id]/page.tsx`, add the component and wire the save:

```typescript
const handleAssign = async (assigneeLogin: string | null) => {
    try {
        const updated = await incidentService.assignIncident(incident!.id, assigneeLogin);
        setIncident(updated);
        toast.success(assigneeLogin ? `Assigned to ${assigneeLogin}` : 'Unassigned');
    } catch (err) {
        toast.error('Failed to update assignment');
    }
};

// In JSX, above the incident detail body:
<AssigneeSelector
    currentAssignee={incident.incidentAssigned}
    onAssign={handleAssign}
/>
```

### Step 5: Add assignment display to the incidents list

In `incidents/page.tsx`, add an "Assigned to" column to the table:

```typescript
// In the table header:
<th>Assigned To</th>

// In the table row:
<td>
    {incident.incidentAssigned ? (
        <span className="text-sm">{incident.incidentAssigned}</span>
    ) : (
        <span className="text-sm text-muted-foreground italic">Unassigned</span>
    )}
</td>
```

### Step 6: Add assignment filter to the incidents list

Add a filter for "My incidents":

```typescript
const [showMine, setShowMine] = useState(false);
const { user } = useCurrentUser();

// In query params:
const params = {
    page: currentPage,
    size: pageSize,
    ...(showMine && user ? { assignedTo: user.login } : {}),
};

// In the filter bar:
<label>
    <input 
        type="checkbox" 
        checked={showMine} 
        onChange={e => setShowMine(e.target.checked)} 
    />
    My incidents only
</label>
```

### Step 7: Write tests

Create: `frontend-v2/src/components/incidents/__tests__/assignee-selector.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { AssigneeSelector } from '../assignee-selector';
import * as userService from '@/services/user.service';

vi.mock('@/services/user.service');

const mockUsers = [
    { id: 1, login: 'john.doe', firstName: 'John', lastName: 'Doe' },
    { id: 2, login: 'jane.smith', firstName: 'Jane', lastName: 'Smith' },
];

describe('AssigneeSelector', () => {
    beforeEach(() => {
        vi.mocked(userService.listAnalysts).mockResolvedValue(mockUsers);
    });

    it('shows user list in dropdown', async () => {
        render(<AssigneeSelector onAssign={vi.fn()} />);
        
        await waitFor(() => {
            expect(screen.getByText('John Doe (john.doe)')).toBeInTheDocument();
        });
    });

    it('calls onAssign with selected user login', async () => {
        const onAssign = vi.fn();
        render(<AssigneeSelector onAssign={onAssign} />);
        
        await waitFor(() => screen.getByText('John Doe (john.doe)'));
        
        fireEvent.change(screen.getByRole('combobox'), { 
            target: { value: 'john.doe' } 
        });
        
        expect(onAssign).toHaveBeenCalledWith('john.doe');
    });

    it('calls onAssign with null when Unassigned selected', async () => {
        const onAssign = vi.fn();
        render(<AssigneeSelector currentAssignee="john.doe" onAssign={onAssign} />);
        
        await waitFor(() => screen.getByRole('combobox'));
        
        fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
        
        expect(onAssign).toHaveBeenCalledWith(null);
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/components/incidents/__tests__/assignee-selector.test.tsx

# Manual E2E test:
# 1. Open http://localhost:3000/incidents
# 2. Click into an incident
# 3. In the detail view, select an analyst from the "Assigned to" dropdown
# 4. Refresh the page — assignee should still be shown
# 5. Check the incidents list — assignee column shows the name
# 6. Use "My incidents only" filter — shows only incidents assigned to the current user
```

---

## Acceptance Criteria

- [ ] `AssigneeSelector` component renders user list from API
- [ ] Selecting a user calls `incidentService.assignIncident(id, login)`
- [ ] Selecting "Unassigned" calls `assignIncident(id, null)`
- [ ] Assignment persists after page refresh
- [ ] Incidents list shows "Assigned to" column
- [ ] "My incidents only" filter works
- [ ] All 3 component tests pass
- [ ] `npx tsc --noEmit` passes
