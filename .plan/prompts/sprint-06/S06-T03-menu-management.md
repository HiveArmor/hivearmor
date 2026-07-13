# S06-T03 — Build Menu Management Admin Page (Next.js)

**Sprint:** 6 (Admin & Config)
**Severity:** MEDIUM
**Issue ID:** ADMIN
**Dependencies:** S06-T02 (RBAC guards already in place from Sprint 3)
**Estimated time:** 6 hours

---

## Context

Menu management exists only in the Angular frontend at `frontend/src/app/app-management/menu/`. There is no Next.js equivalent. This page lets admins reorder, show/hide, and rename navigation menu items. The backend is fully implemented with CRUD at `POST/PUT/GET/DELETE /api/menu` and a special `POST /api/menu/save-menu-structure` endpoint that saves the full reordered tree in one call.

The backend also exposes `GET /api/menu/get-menu-by-authorities` (returns menu items the current user can see) and `GET /api/menu/all` (returns the `List<MenuType>` enum for type dropdowns).

---

## What to Read First

Before writing any code, read these files completely:

1. `frontend/src/app/app-management/menu/menu.component.ts` — Angular component showing all API calls
2. `frontend/src/app/app-management/menu/menu-card/menu-card.component.ts` — card rendering + drag state
3. `frontend/src/app/app-management/menu/menu-delete/menu-delete-dialog.component.ts` — delete confirmation
4. `backend/src/main/java/com/nilachakra/web/rest/UtmMenuResource.java` — all endpoints and request/response shapes
5. `backend/src/main/java/com/nilachakra/domain/UtmMenu.java` — entity field names
6. `backend/src/main/java/com/nilachakra/domain/shared_types/MenuType.java` — the enum list (e.g., ITEM, SECTION, LINK)
7. `backend/src/main/java/com/nilachakra/service/dto/UtmMenuCriteria.java` — filter fields for GET /api/menu

---

## Implementation Steps

### Step 1: Create the API service

Create `frontend-v2/src/services/menu-management.service.ts`:

```typescript
import { apiClient } from '@/lib/api-client';

export interface UtmMenu {
  id?: number;
  name: string;
  url?: string;
  type: string;           // MenuType enum value
  icon?: string;
  parentId?: number | null;
  position: number;
  active: boolean;
  authorities?: string[]; // roles that can see this item
}

export interface MenuStructure {
  items: UtmMenu[];
}

export const menuManagementService = {
  async list(params?: { type?: string; parentId?: number; active?: boolean }): Promise<UtmMenu[]> {
    const res = await apiClient.get<UtmMenu[]>('/api/menu', { params });
    return res.data;
  },

  async getMenuTypes(): Promise<string[]> {
    const res = await apiClient.get<string[]>('/api/menu/all');
    return res.data;
  },

  async getByAuthorities(): Promise<UtmMenu[]> {
    const res = await apiClient.get<UtmMenu[]>('/api/menu/get-menu-by-authorities');
    return res.data;
  },

  async create(menu: UtmMenu): Promise<UtmMenu> {
    const res = await apiClient.post<UtmMenu>('/api/menu', menu);
    return res.data;
  },

  async update(menu: UtmMenu): Promise<UtmMenu> {
    const res = await apiClient.put<UtmMenu>('/api/menu', menu);
    return res.data;
  },

  async saveStructure(items: UtmMenu[]): Promise<void> {
    await apiClient.post('/api/menu/save-menu-structure', { items });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/menu/${id}`);
  },
};
```

### Step 2: Create React Query hooks

Create `frontend-v2/src/hooks/use-menu-management.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuManagementService, UtmMenu } from '@/services/menu-management.service';
import { toast } from '@/components/ui/toast';

const MENU_KEY = ['menu-management'];
const TYPES_KEY = ['menu-types'];

export function useMenuItems() {
  return useQuery({
    queryKey: MENU_KEY,
    queryFn: () => menuManagementService.list(),
    staleTime: 30_000,
  });
}

export function useMenuTypes() {
  return useQuery({
    queryKey: TYPES_KEY,
    queryFn: menuManagementService.getMenuTypes,
    staleTime: Infinity,
  });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: UtmMenu) => menuManagementService.create(item),
    onSuccess: () => { qc.invalidateQueries({ queryKey: MENU_KEY }); toast.success('Menu item created.'); },
    onError: () => toast.error('Failed to create menu item.'),
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: UtmMenu) => menuManagementService.update(item),
    onSuccess: () => { qc.invalidateQueries({ queryKey: MENU_KEY }); toast.success('Menu item updated.'); },
    onError: () => toast.error('Failed to update menu item.'),
  });
}

export function useSaveMenuStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: UtmMenu[]) => menuManagementService.saveStructure(items),
    onSuccess: () => { qc.invalidateQueries({ queryKey: MENU_KEY }); toast.success('Menu order saved.'); },
    onError: () => toast.error('Failed to save menu order.'),
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => menuManagementService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: MENU_KEY }); toast.success('Menu item deleted.'); },
    onError: () => toast.error('Failed to delete menu item.'),
  });
}
```

### Step 3: Build the drag-and-drop menu list

Install the drag library if not already present:

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Create `frontend-v2/src/components/admin/menu-item-row.tsx`:

```tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { UtmMenu } from '@/services/menu-management.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';

interface Props {
  item: UtmMenu;
  onEdit: (item: UtmMenu) => void;
  onDelete: (id: number) => void;
  onToggleActive: (item: UtmMenu) => void;
}

export function MenuItemRow({ item, onEdit, onDelete, onToggleActive }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border-b last:border-0 bg-background"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.name}</p>
        {item.url && (
          <p className="text-xs text-muted-foreground truncate">{item.url}</p>
        )}
      </div>

      <Badge variant="outline" className="text-xs">{item.type}</Badge>

      <Button
        size="icon"
        variant="ghost"
        onClick={() => onToggleActive(item)}
        title={item.active ? 'Deactivate' : 'Activate'}
      >
        {item.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
      </Button>

      <Button size="icon" variant="ghost" onClick={() => onEdit(item)}>
        <Pencil className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant="ghost"
        onClick={() => item.id && onDelete(item.id)}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
```

### Step 4: Build the page

Create `frontend-v2/src/app/(app)/admin/menu-management/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useSaveMenuStructure,
  useDeleteMenuItem,
} from '@/hooks/use-menu-management';
import { UtmMenu } from '@/services/menu-management.service';
import { MenuItemRow } from '@/components/admin/menu-item-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Save, AlertCircle } from 'lucide-react';

export default function MenuManagementPage() {
  const { data: serverItems, isLoading, isError } = useMenuItems();
  const [items, setItems] = useState<UtmMenu[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const createMutation = useCreateMenuItem();
  const updateMutation = useUpdateMenuItem();
  const saveMutation = useSaveMenuStructure();
  const deleteMutation = useDeleteMenuItem();

  useEffect(() => {
    if (serverItems) {
      const sorted = [...serverItems].sort((a, b) => a.position - b.position);
      setItems(sorted);
      setIsDirty(false);
    }
  }, [serverItems]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex).map((item, idx) => ({
        ...item,
        position: idx,
      }));
      setIsDirty(true);
      return reordered;
    });
  }

  function handleToggleActive(item: UtmMenu) {
    updateMutation.mutate({ ...item, active: !item.active });
  }

  function handleDelete(id: number) {
    deleteMutation.mutate(id);
  }

  function handleSaveOrder() {
    saveMutation.mutate(items, { onSuccess: () => setIsDirty(false) });
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-destructive p-8">
        <AlertCircle className="h-5 w-5" />
        Failed to load menu items.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Menu Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag items to reorder. Toggle the eye icon to show/hide items.
            Click &quot;Save Order&quot; to persist the new arrangement.
          </p>
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button onClick={handleSaveOrder} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Saving…' : 'Save Order'}
            </Button>
          )}
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 border-b flex items-center gap-3">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))
          : items.length === 0
            ? (
              <div className="p-8 text-center text-muted-foreground">
                No menu items found.
              </div>
            )
            : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map((i) => i.id!)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      onEdit={() => {/* TODO: open edit form */}}
                      onDelete={handleDelete}
                      onToggleActive={handleToggleActive}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
      </div>
    </div>
  );
}
```

### Step 5: Unit tests

Create `frontend-v2/src/app/(app)/admin/menu-management/__tests__/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MenuManagementPage from '../page';
import * as hooks from '@/hooks/use-menu-management';

jest.mock('@/hooks/use-menu-management');
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  DndContext: ({ children }: any) => <div>{children}</div>,
}));

const mockItems = [
  { id: 1, name: 'Dashboard', type: 'ITEM', position: 0, active: true },
  { id: 2, name: 'Alerts', type: 'ITEM', position: 1, active: false },
];

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('MenuManagementPage', () => {
  beforeEach(() => {
    jest.spyOn(hooks, 'useMenuItems').mockReturnValue({ data: mockItems, isLoading: false, isError: false } as any);
    jest.spyOn(hooks, 'useCreateMenuItem').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
    jest.spyOn(hooks, 'useUpdateMenuItem').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
    jest.spyOn(hooks, 'useSaveMenuStructure').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
    jest.spyOn(hooks, 'useDeleteMenuItem').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
  });

  it('renders all menu items', () => {
    wrap(<MenuManagementPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('shows loading skeletons', () => {
    jest.spyOn(hooks, 'useMenuItems').mockReturnValue({ data: undefined, isLoading: true, isError: false } as any);
    wrap(<MenuManagementPage />);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('shows empty state', () => {
    jest.spyOn(hooks, 'useMenuItems').mockReturnValue({ data: [], isLoading: false, isError: false } as any);
    wrap(<MenuManagementPage />);
    expect(screen.getByText(/No menu items found/i)).toBeInTheDocument();
  });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Unit tests
npx jest src/app/\(app\)/admin/menu-management --no-coverage

# Type check
npx tsc --noEmit

# Manual smoke test
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Get all menu items
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/menu" | jq '[.[] | {id, name, type, position, active}]'

# Get menu types enum
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/menu/all" | jq '.'

# Get menu visible to current user
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/menu/get-menu-by-authorities" | jq '[.[] | .name]'
```

---

## Acceptance Criteria

- [ ] `GET /api/menu` is called on mount and all items are rendered as rows
- [ ] Items are sorted by `position` on initial render
- [ ] Drag-and-drop reorders the list visually
- [ ] Dragging marks the list as dirty and reveals the "Save Order" button
- [ ] Clicking "Save Order" calls `POST /api/menu/save-menu-structure` with all items and updated positions
- [ ] Toggling the eye icon calls `PUT /api/menu` with `active` flipped and re-fetches the list
- [ ] Clicking delete calls `DELETE /api/menu/{id}` and re-fetches the list
- [ ] Loading state shows skeleton rows
- [ ] Empty state message shown when no items exist
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Unit tests pass
