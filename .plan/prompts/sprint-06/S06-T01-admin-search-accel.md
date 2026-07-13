# S06-T01 — Wire Search Acceleration Admin Page to Real Backend

**Sprint:** 6 (Admin & Config)
**Severity:** MEDIUM
**Issue ID:** UX
**Dependencies:** Sprint 3 RBAC complete
**Estimated time:** 4 hours

---

## Context

The search acceleration admin page at `/admin/search-acceleration` renders in the UI but makes zero API calls. It is a static shell with no data loading, no save action, and no feedback. The backend is fully implemented: `GET /api/search-acceleration` returns the current acceleration settings list and `POST /api/search-acceleration/apply` pushes the ISM policy to OpenSearch.

The backend also has an `IndexPolicyService` that manages a named ISM policy (`nilachakra_ism_policy`) through OpenSearch's `/_plugins/_ism/` API. The UI needs to load the current settings, allow edits, and save + apply them.

---

## What to Read First

Before writing any code, read these files completely:

1. `frontend-v2/src/app/(app)/admin/search-acceleration/page.tsx` — the existing static shell
2. `backend/src/main/java/com/nilachakra/web/rest/search/UtmSearchAccelerationResource.java` — the 4 endpoints: `GET /`, `PUT /{key}`, `PUT /` (bulk), `POST /apply`
3. `backend/src/main/java/com/nilachakra/service/search/UtmSearchAccelerationService.java` — to understand the data model
4. `backend/src/main/java/com/nilachakra/domain/search/UtmSearchAcceleration.java` — field names and types
5. `backend/src/main/java/com/nilachakra/service/index_policy/IndexPolicyService.java` — understand what "apply" does to OpenSearch

---

## Implementation Steps

### Step 1: Create the API client

Create `frontend-v2/src/services/search-acceleration.service.ts`:

```typescript
import { apiClient } from '@/lib/api-client';

export interface SearchAcceleration {
  id: number;
  accelKey: string;
  accelValue: string;
  accelDescription: string;
  accelActive: boolean;
}

export const searchAccelerationService = {
  async getAll(): Promise<SearchAcceleration[]> {
    const res = await apiClient.get<SearchAcceleration[]>('/api/search-acceleration');
    return res.data;
  },

  async updateBulk(settings: SearchAcceleration[]): Promise<SearchAcceleration[]> {
    const res = await apiClient.put<SearchAcceleration[]>('/api/search-acceleration', settings);
    return res.data;
  },

  async updateOne(key: string, setting: SearchAcceleration): Promise<SearchAcceleration> {
    const res = await apiClient.put<SearchAcceleration>(`/api/search-acceleration/${key}`, setting);
    return res.data;
  },

  async apply(): Promise<void> {
    await apiClient.post('/api/search-acceleration/apply');
  },
};
```

### Step 2: Create a React Query hook

Create `frontend-v2/src/hooks/use-search-acceleration.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchAccelerationService, SearchAcceleration } from '@/services/search-acceleration.service';
import { toast } from '@/components/ui/toast';

const QUERY_KEY = ['search-acceleration'];

export function useSearchAcceleration() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: searchAccelerationService.getAll,
    staleTime: 60_000,
  });
}

export function useUpdateSearchAcceleration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: SearchAcceleration[]) =>
      searchAccelerationService.updateBulk(settings),
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEY, updated);
      toast.success('Settings saved.');
    },
    onError: () => toast.error('Failed to save settings.'),
  });
}

export function useApplySearchAcceleration() {
  return useMutation({
    mutationFn: searchAccelerationService.apply,
    onSuccess: () => toast.success('ISM policy applied to OpenSearch.'),
    onError: () => toast.error('Failed to apply policy to OpenSearch.'),
  });
}
```

### Step 3: Replace the static page with a wired page

Replace `frontend-v2/src/app/(app)/admin/search-acceleration/page.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  useSearchAcceleration,
  useUpdateSearchAcceleration,
  useApplySearchAcceleration,
} from '@/hooks/use-search-acceleration';
import { SearchAcceleration } from '@/services/search-acceleration.service';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Save, Zap } from 'lucide-react';

export default function SearchAccelerationPage() {
  const { data: settings, isLoading, isError } = useSearchAcceleration();
  const [localSettings, setLocalSettings] = useState<SearchAcceleration[]>([]);
  const updateMutation = useUpdateSearchAcceleration();
  const applyMutation = useApplySearchAcceleration();

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  function handleToggle(index: number, checked: boolean) {
    setLocalSettings((prev) =>
      prev.map((s, i) => (i === index ? { ...s, accelActive: checked } : s)),
    );
  }

  function handleValueChange(index: number, value: string) {
    setLocalSettings((prev) =>
      prev.map((s, i) => (i === index ? { ...s, accelValue: value } : s)),
    );
  }

  const isSaving = updateMutation.isPending;
  const isApplying = applyMutation.isPending;

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-destructive p-8">
        <AlertCircle className="h-5 w-5" />
        <span>Failed to load search acceleration settings. Is the backend running?</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Search Acceleration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure OpenSearch ISM (Index State Management) policy settings.
          Save changes, then click &quot;Apply to OpenSearch&quot; to push them live.
        </p>
      </div>

      <div className="rounded-lg border divide-y">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))
          : localSettings.map((setting, idx) => (
              <div key={setting.id} className="p-4 flex items-start gap-4">
                <Switch
                  checked={setting.accelActive}
                  onCheckedChange={(checked) => handleToggle(idx, checked)}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{setting.accelKey}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {setting.accelDescription}
                  </p>
                  <input
                    className="mt-2 w-full border rounded px-2 py-1 text-sm bg-background"
                    value={setting.accelValue}
                    onChange={(e) => handleValueChange(idx, e.target.value)}
                    disabled={!setting.accelActive}
                  />
                </div>
              </div>
            ))}
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => updateMutation.mutate(localSettings)}
          disabled={isSaving || isLoading}
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving…' : 'Save Settings'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => applyMutation.mutate()}
          disabled={isApplying || isLoading}
        >
          <Zap className="h-4 w-4 mr-2" />
          {isApplying ? 'Applying…' : 'Apply to OpenSearch'}
        </Button>
      </div>
    </div>
  );
}
```

### Step 4: Unit tests

Create `frontend-v2/src/app/(app)/admin/search-acceleration/__tests__/page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchAccelerationPage from '../page';
import * as hooks from '@/hooks/use-search-acceleration';

jest.mock('@/hooks/use-search-acceleration');

const mockSettings = [
  {
    id: 1,
    accelKey: 'max_result_window',
    accelValue: '10000',
    accelDescription: 'Maximum number of results per query',
    accelActive: true,
  },
  {
    id: 2,
    accelKey: 'search_idle_after',
    accelValue: '30s',
    accelDescription: 'Mark shard as idle after this duration',
    accelActive: false,
  },
];

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SearchAccelerationPage', () => {
  const mutateMock = jest.fn();

  beforeEach(() => {
    jest.spyOn(hooks, 'useSearchAcceleration').mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
    } as any);
    jest.spyOn(hooks, 'useUpdateSearchAcceleration').mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as any);
    jest.spyOn(hooks, 'useApplySearchAcceleration').mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as any);
  });

  it('renders all settings from API', () => {
    wrap(<SearchAccelerationPage />);
    expect(screen.getByText('max_result_window')).toBeInTheDocument();
    expect(screen.getByText('search_idle_after')).toBeInTheDocument();
  });

  it('shows loading skeletons when loading', () => {
    jest.spyOn(hooks, 'useSearchAcceleration').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);
    wrap(<SearchAccelerationPage />);
    // Skeletons render, no setting keys visible
    expect(screen.queryByText('max_result_window')).not.toBeInTheDocument();
  });

  it('shows error state when API fails', () => {
    jest.spyOn(hooks, 'useSearchAcceleration').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as any);
    wrap(<SearchAccelerationPage />);
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('calls updateBulk mutation when Save is clicked', () => {
    wrap(<SearchAccelerationPage />);
    fireEvent.click(screen.getByText('Save Settings'));
    expect(mutateMock).toHaveBeenCalledWith(mockSettings);
  });

  it('disables inactive setting value input', () => {
    wrap(<SearchAccelerationPage />);
    const inputs = screen.getAllByRole('textbox');
    // search_idle_after is inactive → its input should be disabled
    expect(inputs[1]).toBeDisabled();
  });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Run the unit tests
npx jest src/app/\(app\)/admin/search-acceleration --no-coverage

# Type-check only
npx tsc --noEmit

# Manual API smoke test (requires running backend)
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Should return array of acceleration settings
curl -s -H "Authorization: Bearer $JWT" \
  http://localhost:8088/api/search-acceleration | jq '.'

# Should return 200 (applies ISM policy)
curl -s -X POST -H "Authorization: Bearer $JWT" \
  http://localhost:8088/api/search-acceleration/apply
echo "Exit: $?"
```

---

## Acceptance Criteria

- [ ] Page loads and calls `GET /api/search-acceleration` on mount
- [ ] Each setting is rendered with its key, description, value input, and active toggle
- [ ] Inactive settings have their value input disabled
- [ ] Clicking "Save Settings" calls `PUT /api/search-acceleration` with the full updated list
- [ ] Clicking "Apply to OpenSearch" calls `POST /api/search-acceleration/apply`
- [ ] Loading state shows skeleton rows while the API call is in flight
- [ ] Error state shows a user-friendly message when the API is unreachable
- [ ] Toast notification appears on successful save and successful apply
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Unit tests pass
