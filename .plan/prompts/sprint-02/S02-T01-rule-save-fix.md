# S02-T01 — Fix New Correlation Rule Save (Null Guard Bug)

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** HIGH — Analyst-blocking P0 bug  
**Issue ID:** UX-P0-01  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

The correlation rules page (`/rules`) has a save handler that silently exits when creating a **new** rule (when `rule` is null). The condition `if (!rule) return` was written to guard against undefined state but incorrectly fires on new-rule creation, making it impossible for analysts to create any new detection rules from the UI.

**Affected file:** `frontend-v2/src/app/(app)/rules/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/rules/page.tsx` — entire file, focus on `handleSave()` function
2. `frontend-v2/src/services/rule.service.ts` — understand `createRule()` and `updateRule()` API methods
3. `frontend-v2/src/types/rule.ts` (or wherever the Rule type is defined) — understand Rule shape
4. The backend endpoint: `backend/src/main/java/com/nilachakra/web/rest/correlation/UtmCorrelationRulesResource.java` — confirm POST vs PUT for create vs update

---

## Implementation Steps

### Step 1: Read and understand the current handleSave logic

In `rules/page.tsx`, find the `handleSave` function. The bug is something like:

```typescript
// CURRENT BROKEN CODE:
const handleSave = async (formData: RuleFormData) => {
    if (!rule) return;  // BUG: exits on new rule creation
    
    await ruleService.updateRule(rule.id, formData);
    // ...
};
```

### Step 2: Fix the null guard to differentiate create vs update

```typescript
const handleSave = async (formData: RuleFormData) => {
    try {
        if (rule) {
            // Edit mode: rule exists, update it
            await ruleService.updateRule(rule.id, formData);
            toast.success('Rule updated successfully');
        } else {
            // Create mode: rule is null/undefined (new rule)
            const created = await ruleService.createRule(formData);
            setRule(created);  // populate state with the created rule
            toast.success('Rule created successfully');
        }
        // Refresh rule list
        await loadRules();
    } catch (error) {
        console.error('Failed to save rule:', error);
        toast.error('Failed to save rule. Please try again.');
    }
};
```

### Step 3: Verify the form initializes correctly for new rules

Look for where the "New Rule" button is clicked. Confirm it sets `rule` to `null` (or `undefined`) and opens the form in create mode. If there's any state leak from a previous edit, reset form state:

```typescript
const handleNewRule = () => {
    setRule(null);         // Explicitly null for create mode
    setFormData(defaultRuleFormData);  // Reset form to defaults
    setIsFormOpen(true);
};
```

### Step 4: Add loading state during save

Currently if save is double-clicked while saving, it may create duplicate rules. Add a loading guard:

```typescript
const [isSaving, setIsSaving] = useState(false);

const handleSave = async (formData: RuleFormData) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
        // ... save logic
    } finally {
        setIsSaving(false);
    }
};

// In JSX:
<Button onClick={handleSave} disabled={isSaving}>
    {isSaving ? 'Saving...' : 'Save Rule'}
</Button>
```

### Step 5: Write tests

Create: `frontend-v2/src/app/(app)/rules/__tests__/rule-save.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RulesPage from '../page';
import * as ruleService from '@/services/rule.service';

vi.mock('@/services/rule.service');

describe('RulesPage save behavior', () => {
    beforeEach(() => {
        vi.mocked(ruleService.getRules).mockResolvedValue([]);
        vi.mocked(ruleService.createRule).mockResolvedValue({ id: 1, name: 'Test Rule' });
        vi.mocked(ruleService.updateRule).mockResolvedValue({ id: 1, name: 'Updated Rule' });
    });

    it('creates a new rule when no rule is selected', async () => {
        render(<RulesPage />);
        
        // Click "New Rule"
        fireEvent.click(screen.getByText(/new rule/i));
        
        // Fill in form
        fireEvent.change(screen.getByLabelText(/rule name/i), {
            target: { value: 'My New Rule' }
        });
        
        // Click Save
        fireEvent.click(screen.getByText(/save/i));
        
        await waitFor(() => {
            expect(ruleService.createRule).toHaveBeenCalledTimes(1);
            expect(ruleService.updateRule).not.toHaveBeenCalled();
        });
    });

    it('updates existing rule when a rule is selected for editing', async () => {
        const existingRule = { id: 42, name: 'Existing Rule' };
        vi.mocked(ruleService.getRules).mockResolvedValue([existingRule]);
        
        render(<RulesPage />);
        
        await waitFor(() => screen.getByText('Existing Rule'));
        
        // Click edit on existing rule
        fireEvent.click(screen.getByLabelText(/edit rule/i));
        
        // Modify and save
        fireEvent.click(screen.getByText(/save/i));
        
        await waitFor(() => {
            expect(ruleService.updateRule).toHaveBeenCalledWith(42, expect.any(Object));
            expect(ruleService.createRule).not.toHaveBeenCalled();
        });
    });

    it('shows error toast when save fails', async () => {
        vi.mocked(ruleService.createRule).mockRejectedValue(new Error('Network error'));
        
        render(<RulesPage />);
        fireEvent.click(screen.getByText(/new rule/i));
        fireEvent.click(screen.getByText(/save/i));
        
        await waitFor(() => {
            expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
        });
    });

    it('disables save button while saving to prevent duplicate submissions', async () => {
        let resolve: (v: unknown) => void;
        vi.mocked(ruleService.createRule).mockImplementation(() => 
            new Promise(r => { resolve = r; })
        );
        
        render(<RulesPage />);
        fireEvent.click(screen.getByText(/new rule/i));
        fireEvent.click(screen.getByText(/save/i));
        
        // Button should be disabled while saving
        expect(screen.getByText(/saving/i)).toBeDisabled();
        
        resolve!({ id: 1 });
        await waitFor(() => {
            expect(screen.getByText(/save/i)).not.toBeDisabled();
        });
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# TypeScript check
npx tsc --noEmit

# Run specific tests
npx vitest run src/app/\(app\)/rules/__tests__/rule-save.test.tsx

# Run all tests (regression check)
npx vitest run

# Manual E2E test:
# 1. Open http://localhost:3000/rules
# 2. Click "New Rule"
# 3. Fill in a rule name, severity, and at least one condition
# 4. Click Save
# 5. The rule should appear in the list — NO silent failure
# 6. Click the rule to edit, change the name, save
# 7. The updated name should appear
```

---

## Acceptance Criteria

- [ ] Clicking "Save" on a new rule calls `ruleService.createRule()` — NOT returning silently
- [ ] Clicking "Save" on an edit calls `ruleService.updateRule(id, ...)` 
- [ ] Save button is disabled while save is in progress (no double-submit)
- [ ] Error toast shown on save failure
- [ ] All 4 unit tests pass
- [ ] `npx tsc --noEmit` passes
- [ ] E2E test: can create and edit a rule in the running UI
