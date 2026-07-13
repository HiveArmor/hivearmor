# S03-T04 — Wire Admin Variables Page to API

**Sprint:** 3 (Frontend RBAC + Key UX Features)  
**Severity:** MEDIUM — SOAR automation variables unmanageable  
**Issue ID:** UX-P1-05  
**Dependencies:** S03-T01 (RBAC must guard admin routes)  
**Estimated time:** 3 hours

---

## Context

The admin variables page (`/admin/variables`) makes zero API calls. Incident response automation variables — which are used in SOAR playbooks and IR workflows — cannot be managed from the UI. The backend has full CRUD at `GET/POST/PUT/DELETE /api/utm-incident-variables`.

**Affected file:** `frontend-v2/src/app/(app)/admin/variables/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/admin/variables/page.tsx` — current state
2. Backend: `backend/src/main/java/com/nilachakra/web/rest/incident_response/UtmIncidentVariablesResource.java` — confirm CRUD paths and request body shapes
3. `backend/src/main/java/com/nilachakra/domain/UtmIncidentVariable.java` — understand the variable fields
4. `frontend-v2/src/app/(app)/admin/notifications/page.tsx` — a working admin page to use as a pattern

---

## Implementation Steps

### Step 1: Create `incidentVariableService`

Create: `frontend-v2/src/services/incident-variable.service.ts`

```typescript
import { apiClient } from '@/lib/api-client';

export interface IncidentVariable {
    id?: number;
    varName: string;
    varDescription: string;
    varValue: string;
    varType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'SECRET';
}

class IncidentVariableService {
    async list(): Promise<IncidentVariable[]> {
        const response = await apiClient.get<IncidentVariable[]>('/api/utm-incident-variables');
        return response.data;
    }

    async create(variable: Omit<IncidentVariable, 'id'>): Promise<IncidentVariable> {
        const response = await apiClient.post<IncidentVariable>('/api/utm-incident-variables', variable);
        return response.data;
    }

    async update(variable: IncidentVariable): Promise<IncidentVariable> {
        const response = await apiClient.put<IncidentVariable>(
            `/api/utm-incident-variables/${variable.id}`, variable
        );
        return response.data;
    }

    async delete(id: number): Promise<void> {
        await apiClient.delete(`/api/utm-incident-variables/${id}`);
    }
}

export const incidentVariableService = new IncidentVariableService();
```

**Verify:** Read `UtmIncidentVariablesResource.java` to confirm the exact paths (`/api/utm-incident-variables` vs `/api/utm-incident-variables/{id}`) and field names before finalizing.

### Step 2: Wire the page

Replace the empty page with a functional CRUD page:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { incidentVariableService, type IncidentVariable } from '@/services/incident-variable.service';

export default function AdminVariablesPage() {
    const [variables, setVariables] = useState<IncidentVariable[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingVar, setEditingVar] = useState<IncidentVariable | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const loadVariables = async () => {
        try {
            const data = await incidentVariableService.list();
            setVariables(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadVariables(); }, []);

    const handleSave = async (variable: IncidentVariable) => {
        try {
            if (variable.id) {
                await incidentVariableService.update(variable);
            } else {
                await incidentVariableService.create(variable);
            }
            await loadVariables();
            setEditingVar(null);
            setIsCreating(false);
        } catch (err) {
            alert('Failed to save variable');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this variable?')) return;
        try {
            await incidentVariableService.delete(id);
            await loadVariables();
        } catch (err) {
            alert('Failed to delete variable');
        }
    };

    // ... render table + form dialog
}
```

### Step 3: Create a variable edit form dialog

Create: `frontend-v2/src/components/admin/variable-form-dialog.tsx`

```typescript
interface VariableFormDialogProps {
    variable?: IncidentVariable;
    onSave: (v: IncidentVariable) => void;
    onClose: () => void;
}

export function VariableFormDialog({ variable, onSave, onClose }: VariableFormDialogProps) {
    const [form, setForm] = useState<IncidentVariable>(
        variable || { varName: '', varDescription: '', varValue: '', varType: 'STRING' }
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.varName.trim()) return;
        onSave(form);
    };

    return (
        <dialog open className="p-6 rounded shadow-lg">
            <h2>{variable ? 'Edit Variable' : 'New Variable'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
                <label>
                    Name:
                    <input 
                        value={form.varName}
                        onChange={e => setForm(f => ({ ...f, varName: e.target.value }))}
                        required
                    />
                </label>
                <label>
                    Type:
                    <select 
                        value={form.varType}
                        onChange={e => setForm(f => ({ ...f, varType: e.target.value as any }))}
                    >
                        <option>STRING</option>
                        <option>NUMBER</option>
                        <option>BOOLEAN</option>
                        <option>SECRET</option>
                    </select>
                </label>
                <label>
                    Value:
                    <input 
                        type={form.varType === 'SECRET' ? 'password' : 'text'}
                        value={form.varValue}
                        onChange={e => setForm(f => ({ ...f, varValue: e.target.value }))}
                    />
                </label>
                <label>
                    Description:
                    <textarea 
                        value={form.varDescription}
                        onChange={e => setForm(f => ({ ...f, varDescription: e.target.value }))}
                    />
                </label>
                <div className="flex gap-2 justify-end">
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="submit">Save</button>
                </div>
            </form>
        </dialog>
    );
}
```

### Step 4: Write tests

Create: `frontend-v2/src/services/__tests__/incident-variable.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { incidentVariableService } from '../incident-variable.service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client');

const mockVar = { id: 1, varName: 'API_KEY', varValue: 'secret', varType: 'SECRET', varDescription: 'API Key' };

describe('incidentVariableService', () => {
    it('list calls correct endpoint', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: [mockVar] });
        
        const result = await incidentVariableService.list();
        
        expect(apiClient.get).toHaveBeenCalledWith('/api/utm-incident-variables');
        expect(result).toHaveLength(1);
    });

    it('create posts to correct endpoint', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ data: mockVar });
        
        const { id, ...newVar } = mockVar;
        await incidentVariableService.create(newVar);
        
        expect(apiClient.post).toHaveBeenCalledWith('/api/utm-incident-variables', newVar);
    });

    it('update puts to correct endpoint with id', async () => {
        vi.mocked(apiClient.put).mockResolvedValue({ data: mockVar });
        
        await incidentVariableService.update(mockVar);
        
        expect(apiClient.put).toHaveBeenCalledWith('/api/utm-incident-variables/1', mockVar);
    });

    it('delete removes correct id', async () => {
        vi.mocked(apiClient.delete).mockResolvedValue({});
        
        await incidentVariableService.delete(1);
        
        expect(apiClient.delete).toHaveBeenCalledWith('/api/utm-incident-variables/1');
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/services/__tests__/incident-variable.service.test.ts

# Manual test (as ADMIN):
# 1. Open http://localhost:3000/admin/variables
# 2. Should show a list of existing variables (or empty state)
# 3. Click "Add Variable"
# 4. Fill in name="TEST_KEY", type="STRING", value="test123"
# 5. Save — variable appears in list
# 6. Edit the variable — change the value, save
# 7. Delete the variable — confirm it's removed
```

---

## Acceptance Criteria

- [ ] Variables page loads the list from `GET /api/utm-incident-variables`
- [ ] Create variable calls `POST /api/utm-incident-variables`
- [ ] Edit variable calls `PUT /api/utm-incident-variables/{id}`
- [ ] Delete variable calls `DELETE /api/utm-incident-variables/{id}`
- [ ] SECRET type variables show masked input (`type="password"`)
- [ ] All 4 service tests pass
- [ ] `npx tsc --noEmit` passes
