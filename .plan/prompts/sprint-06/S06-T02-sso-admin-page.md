# S06-T02 — Build SSO / Identity Provider Admin Page (Next.js)

**Sprint:** 6 (Admin & Config)
**Severity:** HIGH
**Issue ID:** ADMIN
**Dependencies:** Sprint 3 RBAC complete
**Estimated time:** 8 hours

---

## Context

SAML/SSO configuration exists only in the Angular frontend at `frontend/src/app/app-management/identity-provider/`. There is no Next.js equivalent. Enterprise customers need SSO so this is a hard blocker for sales. The backend is fully implemented at `POST/PUT/GET/DELETE /api/identity-providers` and supports multipart file upload for the SP private key (PEM) and SP certificate (PEM). The page must let admins add an IdP, upload certificates, test the connection, and delete providers.

The backend also has a read-only endpoint at `GET /api/utm-providers` (paginated) that exposes a summary list — do not confuse this with the full CRUD endpoint.

---

## What to Read First

Before writing any code, read these files completely:

1. `frontend/src/app/app-management/identity-provider/shared/services/utm-identity-provider.service.ts` — the Angular service showing all API calls and request shapes
2. `frontend/src/app/app-management/identity-provider/shared/models/utm-identity-provider.model.ts` — the data model
3. `backend/src/main/java/com/nilachakra/web/rest/idp_provider/IdentityProviderConfigResource.java` — all endpoints and field names
4. `backend/src/main/java/com/nilachakra/service/dto/idp_provider/dto/IdentityProviderConfigResponseDto.java` — response shape
5. `backend/src/main/java/com/nilachakra/service/dto/idp_provider/dto/IdentityProviderCreateConfigDto.java` — create request shape
6. `frontend/src/app/app-management/identity-provider/shared/components/provider-form/` — understand all form fields

---

## Implementation Steps

### Step 1: Create the API service

Create `frontend-v2/src/services/identity-provider.service.ts`:

```typescript
import { apiClient } from '@/lib/api-client';

export interface IdentityProvider {
  id?: number;
  name: string;
  providerType: 'SAML' | 'OIDC';
  metadataUrl?: string;
  metadataXml?: string;
  entityId?: string;
  ssoUrl?: string;
  idpCertificate?: string;
  active: boolean;
  createdDate?: string;
}

export interface IdentityProviderCreateRequest {
  name: string;
  providerType: 'SAML' | 'OIDC';
  metadataUrl?: string;
  metadataXml?: string;
  entityId?: string;
  ssoUrl?: string;
  idpCertificate?: string;
  active: boolean;
  // File fields submitted as multipart
  spPrivateKey?: File;
  spCertificate?: File;
}

function buildFormData(data: IdentityProviderCreateRequest): FormData {
  const fd = new FormData();
  const json: Record<string, unknown> = {
    name: data.name,
    providerType: data.providerType,
    active: data.active,
  };
  if (data.metadataUrl) json.metadataUrl = data.metadataUrl;
  if (data.metadataXml) json.metadataXml = data.metadataXml;
  if (data.entityId) json.entityId = data.entityId;
  if (data.ssoUrl) json.ssoUrl = data.ssoUrl;
  if (data.idpCertificate) json.idpCertificate = data.idpCertificate;

  fd.append('config', new Blob([JSON.stringify(json)], { type: 'application/json' }));
  if (data.spPrivateKey) fd.append('spPrivateKey', data.spPrivateKey);
  if (data.spCertificate) fd.append('spCertificate', data.spCertificate);
  return fd;
}

export const identityProviderService = {
  async list(): Promise<IdentityProvider[]> {
    const res = await apiClient.get<IdentityProvider[]>('/api/identity-providers');
    return res.data;
  },

  async get(id: number): Promise<IdentityProvider> {
    const res = await apiClient.get<IdentityProvider>(`/api/identity-providers/find/${id}`);
    return res.data;
  },

  async create(data: IdentityProviderCreateRequest): Promise<IdentityProvider> {
    const res = await apiClient.post<IdentityProvider>(
      '/api/identity-providers',
      buildFormData(data),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  },

  async update(id: number, data: IdentityProviderCreateRequest): Promise<IdentityProvider> {
    const res = await apiClient.put<IdentityProvider>(
      `/api/identity-providers/${id}`,
      buildFormData(data),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/identity-providers/${id}`);
  },

  async testConnection(id: number): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post(`/api/identity-providers/${id}/test`);
    return res.data;
  },
};
```

### Step 2: Create React Query hooks

Create `frontend-v2/src/hooks/use-identity-providers.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  identityProviderService,
  IdentityProviderCreateRequest,
} from '@/services/identity-provider.service';
import { toast } from '@/components/ui/toast';

const QUERY_KEY = ['identity-providers'];

export function useIdentityProviders() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: identityProviderService.list,
    staleTime: 30_000,
  });
}

export function useCreateIdentityProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IdentityProviderCreateRequest) => identityProviderService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Identity provider created.');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Failed to create provider.'),
  });
}

export function useUpdateIdentityProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: IdentityProviderCreateRequest }) =>
      identityProviderService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Identity provider updated.');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Failed to update provider.'),
  });
}

export function useDeleteIdentityProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => identityProviderService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Identity provider deleted.');
    },
    onError: () => toast.error('Failed to delete provider.'),
  });
}

export function useTestIdentityProvider() {
  return useMutation({
    mutationFn: (id: number) => identityProviderService.testConnection(id),
    onSuccess: (result) => {
      if (result.success) toast.success('Connection test passed.');
      else toast.error(`Connection test failed: ${result.message}`);
    },
    onError: () => toast.error('Connection test could not be reached.'),
  });
}
```

### Step 3: Build the provider form component

Create `frontend-v2/src/components/admin/identity-provider-form.tsx`:

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { IdentityProvider, IdentityProviderCreateRequest } from '@/services/identity-provider.service';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  providerType: z.enum(['SAML', 'OIDC']),
  metadataUrl: z.string().url().optional().or(z.literal('')),
  metadataXml: z.string().optional(),
  entityId: z.string().optional(),
  ssoUrl: z.string().url().optional().or(z.literal('')),
  idpCertificate: z.string().optional(),
  active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<IdentityProvider>;
  onSubmit: (data: IdentityProviderCreateRequest) => void;
  onCancel: () => void;
  isPending: boolean;
  spPrivateKeyRef: React.RefObject<HTMLInputElement>;
  spCertRef: React.RefObject<HTMLInputElement>;
}

export function IdentityProviderForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  spPrivateKeyRef,
  spCertRef,
}: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      providerType: defaultValues?.providerType ?? 'SAML',
      metadataUrl: defaultValues?.metadataUrl ?? '',
      metadataXml: defaultValues?.metadataXml ?? '',
      entityId: defaultValues?.entityId ?? '',
      ssoUrl: defaultValues?.ssoUrl ?? '',
      idpCertificate: defaultValues?.idpCertificate ?? '',
      active: defaultValues?.active ?? true,
    },
  });

  function handleSubmit(values: FormValues) {
    const spPrivateKey = spPrivateKeyRef.current?.files?.[0];
    const spCertificate = spCertRef.current?.files?.[0];
    onSubmit({ ...values, spPrivateKey, spCertificate });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider Name</FormLabel>
              <FormControl><Input placeholder="e.g. Okta SAML" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="providerType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="SAML">SAML 2.0</SelectItem>
                  <SelectItem value="OIDC">OpenID Connect</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="metadataUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Metadata URL</FormLabel>
              <FormControl>
                <Input placeholder="https://idp.example.com/metadata.xml" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="metadataXml"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Metadata XML (paste if no URL)</FormLabel>
              <FormControl>
                <Textarea rows={5} placeholder="<EntityDescriptor …>" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="idpCertificate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>IdP Certificate (PEM)</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder="-----BEGIN CERTIFICATE-----" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">SP Private Key (PEM file)</label>
            <input ref={spPrivateKeyRef} type="file" accept=".pem,.key" className="mt-1 block" />
          </div>
          <div>
            <label className="text-sm font-medium">SP Certificate (PEM file)</label>
            <input ref={spCertRef} type="file" accept=".pem,.crt" className="mt-1 block" />
          </div>
        </div>

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormLabel className="!mt-0">Active</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save Provider'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

### Step 4: Build the page

Create `frontend-v2/src/app/(app)/admin/identity-provider/page.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import {
  useIdentityProviders,
  useCreateIdentityProvider,
  useUpdateIdentityProvider,
  useDeleteIdentityProvider,
  useTestIdentityProvider,
} from '@/hooks/use-identity-providers';
import { IdentityProvider } from '@/services/identity-provider.service';
import { IdentityProviderForm } from '@/components/admin/identity-provider-form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, TestTube, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type Mode = 'list' | 'create' | 'edit';

export default function IdentityProviderPage() {
  const { data: providers, isLoading, isError } = useIdentityProviders();
  const createMutation = useCreateIdentityProvider();
  const updateMutation = useUpdateIdentityProvider();
  const deleteMutation = useDeleteIdentityProvider();
  const testMutation = useTestIdentityProvider();

  const [mode, setMode] = useState<Mode>('list');
  const [editing, setEditing] = useState<IdentityProvider | null>(null);
  const spKeyRef = useRef<HTMLInputElement>(null);
  const spCertRef = useRef<HTMLInputElement>(null);

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-destructive p-8">
        <AlertCircle className="h-5 w-5" />
        Failed to load identity providers.
      </div>
    );
  }

  if (mode === 'create' || mode === 'edit') {
    const isPending = createMutation.isPending || updateMutation.isPending;
    return (
      <div className="p-8 max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">
          {mode === 'create' ? 'Add Identity Provider' : 'Edit Identity Provider'}
        </h1>
        <IdentityProviderForm
          defaultValues={editing ?? undefined}
          onSubmit={(data) => {
            if (mode === 'create') {
              createMutation.mutate(data, { onSuccess: () => setMode('list') });
            } else if (editing?.id !== undefined) {
              updateMutation.mutate(
                { id: editing.id, data },
                { onSuccess: () => setMode('list') },
              );
            }
          }}
          onCancel={() => { setMode('list'); setEditing(null); }}
          isPending={isPending}
          spPrivateKeyRef={spKeyRef}
          spCertRef={spCertRef}
        />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Identity Providers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure SAML 2.0 or OpenID Connect providers for SSO.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setMode('create'); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Provider
        </Button>
      </div>

      <div className="rounded-lg border divide-y">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))
          : providers?.length === 0
            ? (
              <div className="p-8 text-center text-muted-foreground">
                No identity providers configured. Click &quot;Add Provider&quot; to start.
              </div>
            )
            : providers?.map((p) => (
              <div key={p.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{p.providerType}</p>
                </div>
                <Badge variant={p.active ? 'default' : 'secondary'}>
                  {p.active ? 'Active' : 'Inactive'}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => p.id && testMutation.mutate(p.id)}
                  disabled={testMutation.isPending}
                >
                  <TestTube className="h-3.5 w-3.5 mr-1" /> Test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditing(p); setMode('edit'); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the SSO provider. Users currently signed in via this
                        provider will be logged out on their next request.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => p.id && deleteMutation.mutate(p.id)}
                        className="bg-destructive text-destructive-foreground"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
      </div>
    </div>
  );
}
```

### Step 5: Add the route to the admin nav

In `frontend-v2/src/components/layout/admin-nav.tsx` (or wherever admin sidebar links live), add:

```tsx
{ href: '/admin/identity-provider', label: 'Identity Providers', icon: KeyRound }
```

### Step 6: Unit tests

Create `frontend-v2/src/app/(app)/admin/identity-provider/__tests__/page.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IdentityProviderPage from '../page';
import * as hooks from '@/hooks/use-identity-providers';

jest.mock('@/hooks/use-identity-providers');

const mockProviders = [
  { id: 1, name: 'Okta', providerType: 'SAML', active: true },
  { id: 2, name: 'Azure AD', providerType: 'OIDC', active: false },
];

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('IdentityProviderPage', () => {
  beforeEach(() => {
    jest.spyOn(hooks, 'useIdentityProviders').mockReturnValue({
      data: mockProviders,
      isLoading: false,
      isError: false,
    } as any);
    jest.spyOn(hooks, 'useCreateIdentityProvider').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
    jest.spyOn(hooks, 'useUpdateIdentityProvider').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
    jest.spyOn(hooks, 'useDeleteIdentityProvider').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
    jest.spyOn(hooks, 'useTestIdentityProvider').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
  });

  it('renders provider list', () => {
    wrap(<IdentityProviderPage />);
    expect(screen.getByText('Okta')).toBeInTheDocument();
    expect(screen.getByText('Azure AD')).toBeInTheDocument();
  });

  it('shows Active/Inactive badge correctly', () => {
    wrap(<IdentityProviderPage />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('clicking Add Provider switches to create form', () => {
    wrap(<IdentityProviderPage />);
    fireEvent.click(screen.getByText('Add Provider'));
    expect(screen.getByText('Add Identity Provider')).toBeInTheDocument();
  });

  it('shows empty state when no providers', () => {
    jest.spyOn(hooks, 'useIdentityProviders').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any);
    wrap(<IdentityProviderPage />);
    expect(screen.getByText(/No identity providers configured/i)).toBeInTheDocument();
  });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Unit tests
npx jest src/app/\(app\)/admin/identity-provider --no-coverage

# Type check
npx tsc --noEmit

# Manual API smoke test
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# List providers (empty array is fine on fresh install)
curl -s -H "Authorization: Bearer $JWT" \
  http://localhost:8088/api/identity-providers | jq '.'

# SAML redirect safety test — verify backend rejects unsigned AuthnRequests from unknown SPs
# (This should return 4xx, not redirect to an arbitrary URL)
curl -v "http://localhost:8088/saml2/authenticate/test?RelayState=https://evil.com" 2>&1 | grep -E "location|HTTP/"
```

---

## Acceptance Criteria

- [ ] `GET /api/identity-providers` is called on mount and results are rendered in the list
- [ ] Empty state message shown when no providers exist
- [ ] "Add Provider" opens the form; form has all fields: name, provider type, metadata URL, metadata XML, IdP certificate, SP key file upload, SP cert file upload, active toggle
- [ ] Submitting the create form calls `POST /api/identity-providers` as multipart/form-data
- [ ] Submitting the edit form calls `PUT /api/identity-providers/{id}` as multipart/form-data
- [ ] "Test" button calls `POST /api/identity-providers/{id}/test` and shows success/failure toast
- [ ] "Delete" requires confirmation dialog before calling `DELETE /api/identity-providers/{id}`
- [ ] Provider list re-fetches after create, update, or delete
- [ ] SAML open-redirect test returns 4xx (not a redirect to an attacker URL)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Unit tests pass
