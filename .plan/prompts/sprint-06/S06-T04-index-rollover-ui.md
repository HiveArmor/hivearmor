# S06-T04 — Build Index Rollover Admin Page (Next.js)

**Sprint:** 6 (Admin & Config)
**Severity:** MEDIUM
**Issue ID:** ADMIN
**Dependencies:** None
**Estimated time:** 5 hours

---

## Context

The index rollover configuration UI exists only in the Angular frontend at `frontend/src/app/app-management/rollover-config/`. There is no Next.js equivalent. Admins need this page to control when OpenSearch indices roll over (e.g., "roll to a new index when size exceeds 30 GB or age exceeds 24 hours"). Without this, all events land in a single growing index that eventually causes OpenSearch heap pressure and slow queries.

The Angular service calls `GET /api/index-policy/policy` to load the current ISM policy configuration and `PUT /api/index-policy/policy` to save changes. The backend `IndexPolicyService` maps this to OpenSearch ISM policy `nilachakra_ism_policy` — same policy managed by the search-acceleration feature (S06-T01), but this page edits the rollover/transition thresholds specifically.

---

## What to Read First

Before writing any code, read these files completely:

1. `frontend/src/app/app-management/rollover-config/shared/service/utm-rollover.service.ts` — Angular service showing the API contract
2. `frontend/src/app/app-management/rollover-config/shared/type/utm-rollover.type.ts` — data model (field names)
3. `frontend/src/app/app-management/rollover-config/shared/const/rollover-object-path.const.ts` — object path constants that reveal the nested JSON structure sent to the API
4. `backend/src/main/java/com/nilachakra/service/index_policy/IndexPolicyService.java` — specifically `updatePolicy()` and `getRollover()` methods
5. `backend/src/main/java/com/nilachakra/domain/index_policy/Policy.java` — top-level policy model
6. `backend/src/main/java/com/nilachakra/domain/index_policy/Transition.java` — rollover conditions live here
7. `backend/src/main/java/com/nilachakra/domain/index_policy/IsmTemplate.java` — which indices the policy applies to

---

## Implementation Steps

### Step 1: Create the API service

Create `frontend-v2/src/services/index-rollover.service.ts`:

```typescript
import { apiClient } from '@/lib/api-client';

export interface RolloverConditions {
  minSize?: string;     // e.g. "30gb"
  minAge?: string;      // e.g. "24h"
  minDocCount?: number;
}

export interface RolloverPolicy {
  rolloverEnabled: boolean;
  conditions: RolloverConditions;
  deleteAfter?: string;   // e.g. "30d" — retention period
  snapshotEnabled?: boolean;
  snapshotPath?: string;
  affectedIndices?: string[]; // ISM template index patterns
}

export const indexRolloverService = {
  async get(): Promise<RolloverPolicy> {
    const res = await apiClient.get<RolloverPolicy>('/api/index-policy/policy');
    return res.data;
  },

  async update(policy: RolloverPolicy): Promise<RolloverPolicy> {
    const res = await apiClient.put<RolloverPolicy>('/api/index-policy/policy', policy);
    return res.data;
  },
};
```

> Note: If the actual response structure differs from the above after reading the files, adjust the TypeScript types to match exactly. The Angular `utm-rollover.type.ts` is the source of truth.

### Step 2: Create React Query hooks

Create `frontend-v2/src/hooks/use-index-rollover.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { indexRolloverService, RolloverPolicy } from '@/services/index-rollover.service';
import { toast } from '@/components/ui/toast';

const QUERY_KEY = ['index-rollover-policy'];

export function useIndexRolloverPolicy() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: indexRolloverService.get,
    staleTime: 60_000,
  });
}

export function useUpdateRolloverPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policy: RolloverPolicy) => indexRolloverService.update(policy),
    onSuccess: (updated) => {
      qc.setQueryData(QUERY_KEY, updated);
      toast.success('Rollover policy saved.');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Failed to save rollover policy.'),
  });
}
```

### Step 3: Build the form component

Create `frontend-v2/src/components/admin/rollover-policy-form.tsx`:

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { RolloverPolicy } from '@/services/index-rollover.service';

const SIZE_REGEX = /^\d+(\.\d+)?(kb|mb|gb|tb)$/i;
const DURATION_REGEX = /^\d+(s|m|h|d|w)$/i;

const schema = z.object({
  rolloverEnabled: z.boolean(),
  minSize: z
    .string()
    .regex(SIZE_REGEX, 'Must be a size like 30gb, 500mb')
    .optional()
    .or(z.literal('')),
  minAge: z
    .string()
    .regex(DURATION_REGEX, 'Must be a duration like 24h, 7d, 1w')
    .optional()
    .or(z.literal('')),
  minDocCount: z.coerce.number().int().min(0).optional(),
  deleteAfter: z
    .string()
    .regex(DURATION_REGEX, 'Must be a duration like 30d, 90d')
    .optional()
    .or(z.literal('')),
  snapshotEnabled: z.boolean().optional(),
  snapshotPath: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  defaultValues: RolloverPolicy;
  onSubmit: (values: RolloverPolicy) => void;
  isPending: boolean;
}

export function RolloverPolicyForm({ defaultValues, onSubmit, isPending }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      rolloverEnabled: defaultValues.rolloverEnabled,
      minSize: defaultValues.conditions?.minSize ?? '',
      minAge: defaultValues.conditions?.minAge ?? '',
      minDocCount: defaultValues.conditions?.minDocCount ?? 0,
      deleteAfter: defaultValues.deleteAfter ?? '',
      snapshotEnabled: defaultValues.snapshotEnabled ?? false,
      snapshotPath: defaultValues.snapshotPath ?? '',
    },
  });

  function handleSubmit(values: FormValues) {
    const policy: RolloverPolicy = {
      rolloverEnabled: values.rolloverEnabled,
      conditions: {
        minSize: values.minSize || undefined,
        minAge: values.minAge || undefined,
        minDocCount: values.minDocCount || undefined,
      },
      deleteAfter: values.deleteAfter || undefined,
      snapshotEnabled: values.snapshotEnabled,
      snapshotPath: values.snapshotPath || undefined,
    };
    onSubmit(policy);
  }

  const rolloverEnabled = form.watch('rolloverEnabled');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="rolloverEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div>
                <FormLabel className="!mt-0">Enable Index Rollover</FormLabel>
                <FormDescription>
                  When enabled, new indices are created based on the conditions below.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <fieldset disabled={!rolloverEnabled} className="space-y-4 disabled:opacity-50">
          <p className="text-sm font-medium">Rollover Conditions (any condition triggers rollover)</p>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="minSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Index Size</FormLabel>
                  <FormControl>
                    <Input placeholder="30gb" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">e.g. 30gb, 500mb</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minAge"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Index Age</FormLabel>
                  <FormControl>
                    <Input placeholder="24h" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">e.g. 24h, 7d, 1w</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minDocCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Document Count</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="1000000" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">0 = no limit</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="deleteAfter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Delete Index After</FormLabel>
                <FormControl>
                  <Input placeholder="30d" className="max-w-xs" {...field} />
                </FormControl>
                <FormDescription className="text-xs">
                  Retention period. e.g. 30d, 90d. Older indices are deleted automatically.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        <fieldset className="space-y-4">
          <p className="text-sm font-medium">Snapshot (Backup)</p>
          <FormField
            control={form.control}
            name="snapshotEnabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Enable Snapshots Before Delete</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="snapshotPath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Snapshot Repository Path</FormLabel>
                <FormControl>
                  <Input placeholder="/mnt/snapshots" className="max-w-md" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save Rollover Policy'}
        </Button>
      </form>
    </Form>
  );
}
```

### Step 4: Build the page

Create `frontend-v2/src/app/(app)/admin/index-rollover/page.tsx`:

```tsx
'use client';

import { useIndexRolloverPolicy, useUpdateRolloverPolicy } from '@/hooks/use-index-rollover';
import { RolloverPolicy } from '@/services/index-rollover.service';
import { RolloverPolicyForm } from '@/components/admin/rollover-policy-form';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Info } from 'lucide-react';

const DEFAULT_POLICY: RolloverPolicy = {
  rolloverEnabled: false,
  conditions: {},
};

export default function IndexRolloverPage() {
  const { data, isLoading, isError } = useIndexRolloverPolicy();
  const updateMutation = useUpdateRolloverPolicy();

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-destructive p-8">
        <AlertCircle className="h-5 w-5" />
        Failed to load rollover policy. Is the backend and OpenSearch running?
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Index Rollover</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure when OpenSearch indices roll over to a new index. This applies
          to the <code className="text-xs bg-muted px-1 rounded">nilachakra_ism_policy</code>.
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-sm">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Changes take effect at the next ISM policy evaluation (usually within 5 minutes).
          Existing indices are not retroactively rolled over.
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <RolloverPolicyForm
          defaultValues={data ?? DEFAULT_POLICY}
          onSubmit={(policy: RolloverPolicy) => updateMutation.mutate(policy)}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}
```

### Step 5: Unit tests

Create `frontend-v2/src/app/(app)/admin/index-rollover/__tests__/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IndexRolloverPage from '../page';
import * as hooks from '@/hooks/use-index-rollover';

jest.mock('@/hooks/use-index-rollover');

const mockPolicy = {
  rolloverEnabled: true,
  conditions: { minSize: '30gb', minAge: '24h' },
  deleteAfter: '90d',
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('IndexRolloverPage', () => {
  beforeEach(() => {
    jest.spyOn(hooks, 'useIndexRolloverPolicy').mockReturnValue({
      data: mockPolicy, isLoading: false, isError: false,
    } as any);
    jest.spyOn(hooks, 'useUpdateRolloverPolicy').mockReturnValue({
      mutate: jest.fn(), isPending: false,
    } as any);
  });

  it('renders the form with policy values', () => {
    wrap(<IndexRolloverPage />);
    expect(screen.getByDisplayValue('30gb')).toBeInTheDocument();
    expect(screen.getByDisplayValue('24h')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    jest.spyOn(hooks, 'useIndexRolloverPolicy').mockReturnValue({
      data: undefined, isLoading: true, isError: false,
    } as any);
    wrap(<IndexRolloverPage />);
    expect(screen.queryByDisplayValue('30gb')).not.toBeInTheDocument();
  });

  it('shows error state', () => {
    jest.spyOn(hooks, 'useIndexRolloverPolicy').mockReturnValue({
      data: undefined, isLoading: false, isError: true,
    } as any);
    wrap(<IndexRolloverPage />);
    expect(screen.getByText(/Failed to load rollover policy/i)).toBeInTheDocument();
  });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Unit tests
npx jest src/app/\(app\)/admin/index-rollover --no-coverage

# Type check
npx tsc --noEmit

# Manual API smoke test
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Load current policy
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/index-policy/policy" | jq '.'

# Save a test policy (adjust field names to match what the GET returns)
curl -s -X PUT -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"rolloverEnabled":true,"conditions":{"minSize":"30gb","minAge":"24h"}}' \
  "http://localhost:8088/api/index-policy/policy" | jq '.'
```

---

## Acceptance Criteria

- [ ] `GET /api/index-policy/policy` is called on mount and form fields are pre-filled with current values
- [ ] Rollover conditions section is disabled (greyed out) when "Enable Index Rollover" toggle is off
- [ ] Saving calls `PUT /api/index-policy/policy` with the correct payload
- [ ] Validation prevents non-size strings in "Max Index Size" (e.g., "abc" is rejected; "30gb" is accepted)
- [ ] Validation prevents non-duration strings in "Max Index Age" (e.g., "yesterday" is rejected; "24h" is accepted)
- [ ] Toast notification appears on successful save
- [ ] Loading state shows skeleton while API call is in flight
- [ ] Error state shown when backend is unreachable
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Unit tests pass
