# S06-T05 — Fix Saved Log Queries (Server Sync + Update)

**Sprint:** 6 (Enterprise Features)
**Severity:** HIGH
**Issue ID:** ENT-01
**Dependencies:** None
**Estimated time:** 3 hours

---

## Context

Log search queries are partially saved but have a critical gap: the frontend never calls `PUT /api/log-analyzer/queries` to update an existing saved query. The save flow only uses `POST` (create), meaning editing a saved query silently creates a duplicate instead of updating. There is also no visual indicator that distinguishes starred/unstarred queries in the "saved" tab.

This is a Tier 1 enterprise sales blocker — enterprise SOC teams need to build a library of 50+ saved queries (threat hunting, compliance, etc.) and maintain them over time.

**What already works:**
- `frontend-v2/src/services/log-analyzer.service.ts` — calls `POST /api/log-analyzer/queries`, `GET /api/log-analyzer/queries`, `DELETE /api/log-analyzer/queries/{id}`
- `frontend-v2/src/components/logs/log-saved-queries.tsx` — three tabs: history (localStorage), saved (server), templates
- Backend `LogAnalyzerQueryRepository` — entity `utm_log_analyzer_query` with fields: `id`, `la_name`, `description` (stores KQL), `dataOrigin` (stores index pattern), `creationDate`, `modificationDate`, `owner`

**What is broken / missing:**
1. `PUT /api/log-analyzer/queries` is never called — update path is missing
2. No "rename" / "edit description" UI on saved queries
3. The `star` state stored in `localStorage` (`armorsight_saved_starred`) is not reflected in the saved tab UI
4. When the same query is saved twice, two rows appear instead of one updated row

---

## What to Read First

Before writing any code, read these files completely:

1. `frontend-v2/src/services/log-analyzer.service.ts` — current service, see what's missing
2. `frontend-v2/src/components/logs/log-saved-queries.tsx` — the full saved queries panel
3. `backend/src/main/java/com/nilachakra/web/rest/log_analyzer/LogAnalyzerResource.java` — confirm `PUT /queries` request shape (look at the `@RequestBody` annotation)
4. `backend/src/main/java/com/nilachakra/domain/log_analyzer/LogAnalyzerQuery.java` — entity fields: `id`, `la_name`, `description`, `dataOrigin`, `creationDate`, `modificationDate`, `owner`

---

## Implementation Steps

### Step 1: Add the update method to the service

In `frontend-v2/src/services/log-analyzer.service.ts`, add `updateQuery`:

```typescript
// Add to the existing logAnalyzerService object

async updateQuery(id: number, data: { name: string; query: string; indexPattern: string }): Promise<SavedQuery> {
  const res = await apiClient.put<SavedQuery>(`/api/log-analyzer/queries`, {
    id,
    la_name: data.name,
    description: data.query,
    dataOrigin: data.indexPattern,
  });
  return res.data;
},
```

The request shape must match the backend's `@RequestBody` — the entity fields are `la_name` (the display name), `description` (stores the raw KQL string), and `dataOrigin` (stores the index pattern). Verify this matches `LogAnalyzerQuery.java` before submitting.

### Step 2: Add the update mutation to the React Query hook

In `frontend-v2/src/hooks/use-log-analyzer.ts` (or wherever the saved-queries mutations live), add:

```typescript
export function useUpdateSavedQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, query, indexPattern }: {
      id: number;
      name: string;
      query: string;
      indexPattern: string;
    }) => logAnalyzerService.updateQuery(id, { name, query, indexPattern }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['log-analyzer-queries'] });
      toast.success('Query updated.');
    },
    onError: () => toast.error('Failed to update query.'),
  });
}
```

### Step 3: Add inline rename UI to log-saved-queries.tsx

In `frontend-v2/src/components/logs/log-saved-queries.tsx`, in the "saved" tab row for each query, add:

1. An edit (pencil) icon button next to each saved query row
2. When clicked, show an inline `<input>` with the current name, plus Save/Cancel buttons
3. On save, call `updateQuery` mutation with the existing `id`, new name, and unchanged `query`/`indexPattern`

```tsx
// Inside the saved tab row rendering, add:
const [editingId, setEditingId] = useState<number | null>(null);
const [editName, setEditName] = useState('');
const updateMutation = useUpdateSavedQuery();

// In the row JSX:
{editingId === query.id ? (
  <div className="flex items-center gap-1">
    <input
      className="border rounded px-1 py-0.5 text-sm w-32"
      value={editName}
      onChange={(e) => setEditName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          updateMutation.mutate({
            id: query.id,
            name: editName,
            query: query.description,
            indexPattern: query.dataOrigin,
          });
          setEditingId(null);
        }
        if (e.key === 'Escape') setEditingId(null);
      }}
      autoFocus
    />
    <button
      onClick={() => {
        updateMutation.mutate({
          id: query.id,
          name: editName,
          query: query.description,
          indexPattern: query.dataOrigin,
        });
        setEditingId(null);
      }}
      className="text-xs text-primary"
    >
      Save
    </button>
    <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground">
      Cancel
    </button>
  </div>
) : (
  <div className="flex items-center gap-1 group">
    <span className="text-sm truncate">{query.la_name}</span>
    <button
      className="opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={() => { setEditingId(query.id); setEditName(query.la_name); }}
    >
      <Pencil className="h-3 w-3" />
    </button>
  </div>
)}
```

### Step 4: Fix duplicate-save deduplication

In the save query handler (where `POST /api/log-analyzer/queries` is called), check for an existing query with the same KQL before creating a new one:

```typescript
// In the save handler (find it in log-saved-queries.tsx or the relevant hook):
async function handleSaveQuery(name: string, query: string, indexPattern: string) {
  // Check if a query with this exact KQL already exists
  const existing = savedQueries?.find(
    (q) => q.description === query && q.dataOrigin === indexPattern,
  );
  if (existing) {
    // Update name if it changed, otherwise do nothing
    if (existing.la_name !== name) {
      updateMutation.mutate({ id: existing.id, name, query, indexPattern });
    }
    return;
  }
  // Only create if truly new
  createMutation.mutate({ name, query, indexPattern });
}
```

### Step 5: Unit tests

Create `frontend-v2/src/components/logs/__tests__/log-saved-queries.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as service from '@/services/log-analyzer.service';

jest.mock('@/services/log-analyzer.service');

const mockQueries = [
  { id: 1, la_name: 'Failed Logins', description: 'event.outcome:failure', dataOrigin: 'logs-*' },
  { id: 2, la_name: 'SSH Brute Force', description: 'sshd AND failed', dataOrigin: 'logs-*' },
];

describe('updateQuery', () => {
  it('calls PUT /api/log-analyzer/queries with correct shape', async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: 1, la_name: 'Renamed' });
    (service.logAnalyzerService.updateQuery as jest.Mock) = updateMock;

    await service.logAnalyzerService.updateQuery(1, {
      name: 'Renamed',
      query: 'event.outcome:failure',
      indexPattern: 'logs-*',
    });

    expect(updateMock).toHaveBeenCalledWith(1, {
      name: 'Renamed',
      query: 'event.outcome:failure',
      indexPattern: 'logs-*',
    });
  });
});

describe('deduplication', () => {
  it('does not create a duplicate when the same KQL already exists', () => {
    const createMock = jest.fn();
    const updateMock = jest.fn();

    // Simulate: existing query has same KQL, different name
    const existing = mockQueries[0]; // description: 'event.outcome:failure'

    // The handler should call update, not create
    const handleSave = (name: string, query: string, indexPattern: string) => {
      const found = mockQueries.find(
        (q) => q.description === query && q.dataOrigin === indexPattern,
      );
      if (found) {
        if (found.la_name !== name) updateMock({ id: found.id, name, query, indexPattern });
        return;
      }
      createMock({ name, query, indexPattern });
    };

    handleSave('New Name', 'event.outcome:failure', 'logs-*');
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      id: 1, name: 'New Name', query: 'event.outcome:failure', indexPattern: 'logs-*',
    });
  });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Unit tests
npx jest src/components/logs/__tests__/log-saved-queries --no-coverage

# Type check
npx tsc --noEmit

# Manual API smoke test
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Create a saved query
curl -s -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"la_name":"Test Query","description":"event.outcome:failure","dataOrigin":"logs-*"}' \
  "http://localhost:8088/api/log-analyzer/queries" | jq '{id, la_name}'

# Note the id returned above, then update it
QUERY_ID=<id from above>
curl -s -X PUT -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"id\":$QUERY_ID,\"la_name\":\"Renamed Query\",\"description\":\"event.outcome:failure\",\"dataOrigin\":\"logs-*\"}" \
  "http://localhost:8088/api/log-analyzer/queries" | jq '{id, la_name}'

# Verify name changed (should show "Renamed Query")
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/log-analyzer/queries?page=0&size=20" | jq '[.[] | {id, la_name}]'
```

---

## Acceptance Criteria

- [ ] `PUT /api/log-analyzer/queries` is wired in the service layer
- [ ] Hovering a saved query row reveals a pencil (rename) icon
- [ ] Clicking the pencil icon opens an inline input pre-filled with the current name; Enter or Save button commits, Escape cancels
- [ ] Renaming calls `PUT /api/log-analyzer/queries` and the list re-fetches
- [ ] Saving a query with the same KQL and index pattern as an existing query does NOT create a duplicate
- [ ] If the KQL matches but the name differs, calling save updates the name via PUT
- [ ] Unit tests pass
- [ ] `npx tsc --noEmit` passes with zero errors
