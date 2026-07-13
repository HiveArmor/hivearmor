# S03-T01 — Add Role-Based Route Protection to AppShell

**Sprint:** 3 (Frontend RBAC)  
**Severity:** HIGH — Security audit failure  
**Issue ID:** RBAC-01  
**Dependencies:** Sprint 1 complete (JWT key must be stable)  
**Estimated time:** 6 hours

---

## Context

The frontend has zero RBAC enforcement. Every authenticated user (regardless of role: `ROLE_ADMIN`, `ROLE_USER`, `ROLE_VIEWER`) can navigate to any page including destructive admin operations. The only guard is authentication (are you logged in?), not authorization (do you have the right role?). The backend enforces roles, but the UX still allows unauthorized navigation.

**Affected file:** `frontend-v2/src/components/layout/app-shell.tsx`

---

## What to Read First

1. `frontend-v2/src/components/layout/app-shell.tsx` — entire file; this is where authentication is checked
2. `frontend-v2/src/app/(app)/` — scan all page directories to understand the route tree
3. `frontend-v2/src/services/auth.service.ts` — how user account data is fetched (`GET /api/account`)
4. Backend constants: `backend/src/main/java/com/nilachakra/security/AuthoritiesConstants.java` — exact role strings
5. The audit's page status table (`.plan/audit-2026-07-08/task10-remediation-plan.md` section 10b) — which routes need which roles

---

## Implementation Steps

### Step 1: Define role constants matching backend

Create: `frontend-v2/src/lib/roles.ts`

```typescript
// Must match AuthoritiesConstants.java exactly
export const ROLES = {
    ADMIN: 'ROLE_ADMIN',
    USER: 'ROLE_USER',          // SOC Analyst
    VIEWER: 'ROLE_VIEWER',      // Read-only
    PRE_VERIFICATION_USER: 'ROLE_PRE_VERIFICATION_USER',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];
```

### Step 2: Create a route permissions map

Create: `frontend-v2/src/lib/route-permissions.ts`

```typescript
import { ROLES } from './roles';

// Routes that require specific minimum roles (ADMIN > USER > VIEWER)
// If a route is not in this map, any authenticated user can access it
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
    // Admin-only routes
    '/admin': [ROLES.ADMIN],
    '/admin/users': [ROLES.ADMIN],
    '/admin/settings': [ROLES.ADMIN],
    '/admin/variables': [ROLES.ADMIN],
    '/admin/notifications': [ROLES.ADMIN],
    '/admin/connection-keys': [ROLES.ADMIN],
    '/admin/search-acceleration': [ROLES.ADMIN],
    '/data-sources': [ROLES.ADMIN],
    '/data-sources/collectors': [ROLES.ADMIN],
    '/data-sources/groups': [ROLES.ADMIN],
    '/integrations': [ROLES.ADMIN],
    '/agents': [ROLES.ADMIN],
    '/settings': [ROLES.ADMIN],
    '/settings/soc-ai': [ROLES.ADMIN],
    
    // Analyst and admin routes (no viewer access)
    '/rules': [ROLES.ADMIN, ROLES.USER],
    '/rules/coverage': [ROLES.ADMIN, ROLES.USER],
    '/soar': [ROLES.ADMIN, ROLES.USER],
    '/soar/flows': [ROLES.ADMIN, ROLES.USER],
    '/soar/audit': [ROLES.ADMIN, ROLES.USER],
    '/soar/console': [ROLES.ADMIN, ROLES.USER],
    '/alerts': [ROLES.ADMIN, ROLES.USER],
    '/incidents': [ROLES.ADMIN, ROLES.USER],
    '/active-directory': [ROLES.ADMIN, ROLES.USER],
    '/threat-intel': [ROLES.ADMIN, ROLES.USER],
    
    // All authenticated users
    '/dashboard': [ROLES.ADMIN, ROLES.USER, ROLES.VIEWER],
    '/compliance': [ROLES.ADMIN, ROLES.USER, ROLES.VIEWER],
    '/reports': [ROLES.ADMIN, ROLES.USER, ROLES.VIEWER],
};

export function canAccessRoute(pathname: string, userRoles: string[]): boolean {
    // Find the most specific matching route
    const sortedRoutes = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);
    const matchingRoute = sortedRoutes.find(route => pathname.startsWith(route));
    
    if (!matchingRoute) return true; // Not in the list = any authenticated user
    
    const required = ROUTE_PERMISSIONS[matchingRoute];
    return userRoles.some(role => required.includes(role));
}
```

### Step 3: Update `app-shell.tsx` to check roles

```typescript
'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { canAccessRoute } from '@/lib/route-permissions';

export function AppShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const account = await authService.getAccount();
                setUser(account);
                
                // Check role-based access
                const userRoles = account.authorities || [];
                if (!canAccessRoute(pathname, userRoles)) {
                    router.replace('/403');  // or '/dashboard'
                    return;
                }
            } catch (err) {
                router.replace('/login');
            } finally {
                setLoading(false);
            }
        };
        checkAuth();
    }, [pathname]);

    if (loading) return <PageLoadingSpinner />;

    return <>{children}</>;
}
```

### Step 4: Create a 403 Forbidden page

Create: `frontend-v2/src/app/(app)/403/page.tsx`

```typescript
export default function ForbiddenPage() {
    return (
        <div className="flex flex-col items-center justify-center h-96 gap-4">
            <h1 className="text-2xl font-semibold">Access Denied</h1>
            <p className="text-muted-foreground">
                You don't have permission to access this page.
            </p>
            <a href="/dashboard" className="underline">
                Return to Dashboard
            </a>
        </div>
    );
}
```

### Step 5: Create a `useCurrentUser` hook

Create: `frontend-v2/src/hooks/use-current-user.ts`

```typescript
import { useContext } from 'react';
import { UserContext } from '@/contexts/user-context';

export function useCurrentUser() {
    return useContext(UserContext);
}

export function useHasRole(role: string): boolean {
    const user = useCurrentUser();
    return user?.authorities?.includes(role) ?? false;
}

export function useIsAdmin(): boolean {
    return useHasRole('ROLE_ADMIN');
}
```

Store the user in a React context so all components can access it without re-fetching.

### Step 6: Hide admin nav items from non-admins

In the sidebar/navigation component, conditionally render admin-only links:

```typescript
import { useIsAdmin } from '@/hooks/use-current-user';

export function Sidebar() {
    const isAdmin = useIsAdmin();
    
    return (
        <nav>
            {/* Always visible */}
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/alerts">Alerts</NavLink>
            
            {/* Admin only */}
            {isAdmin && (
                <>
                    <NavLink href="/admin">Admin</NavLink>
                    <NavLink href="/settings">Settings</NavLink>
                </>
            )}
        </nav>
    );
}
```

### Step 7: Write tests

Create: `frontend-v2/src/lib/__tests__/route-permissions.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { canAccessRoute } from '../route-permissions';
import { ROLES } from '../roles';

describe('canAccessRoute', () => {
    it('admin can access admin routes', () => {
        expect(canAccessRoute('/admin/users', [ROLES.ADMIN])).toBe(true);
        expect(canAccessRoute('/admin/settings', [ROLES.ADMIN])).toBe(true);
    });

    it('analyst cannot access admin routes', () => {
        expect(canAccessRoute('/admin/users', [ROLES.USER])).toBe(false);
        expect(canAccessRoute('/admin/settings', [ROLES.USER])).toBe(false);
    });

    it('analyst can access analyst routes', () => {
        expect(canAccessRoute('/rules', [ROLES.USER])).toBe(true);
        expect(canAccessRoute('/alerts', [ROLES.USER])).toBe(true);
    });

    it('viewer cannot access analyst routes', () => {
        expect(canAccessRoute('/rules', [ROLES.VIEWER])).toBe(false);
        expect(canAccessRoute('/incidents', [ROLES.VIEWER])).toBe(false);
    });

    it('everyone can access dashboard', () => {
        expect(canAccessRoute('/dashboard', [ROLES.ADMIN])).toBe(true);
        expect(canAccessRoute('/dashboard', [ROLES.USER])).toBe(true);
        expect(canAccessRoute('/dashboard', [ROLES.VIEWER])).toBe(true);
    });

    it('unknown routes are accessible to all authenticated users', () => {
        expect(canAccessRoute('/some-new-route', [ROLES.VIEWER])).toBe(true);
    });

    it('sub-routes inherit parent route permissions', () => {
        expect(canAccessRoute('/admin/users/new', [ROLES.USER])).toBe(false);
        expect(canAccessRoute('/admin/users/new', [ROLES.ADMIN])).toBe(true);
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/lib/__tests__/route-permissions.test.ts

# All 7 route permission tests should pass

# Manual E2E test:
# 1. Login as a USER (non-admin) account
# 2. Navigate to http://localhost:3000/admin/users
# 3. Should redirect to /403 or /dashboard — NOT show user management
# 4. Admin links should be HIDDEN in the sidebar for non-admin users
# 5. Login as ADMIN — all routes should be accessible
```

---

## Acceptance Criteria

- [ ] `canAccessRoute()` function correctly gates routes by role
- [ ] AppShell redirects to `/403` when user lacks the required role
- [ ] Admin-only nav items hidden from non-admin users
- [ ] `useIsAdmin()` and `useHasRole()` hooks available to all components
- [ ] All 7 route permission unit tests pass
- [ ] VIEWER cannot navigate to `/admin/**`, `/rules`, `/incidents`, `/soar`
- [ ] ADMIN can navigate to all routes
- [ ] `npx tsc --noEmit` passes
