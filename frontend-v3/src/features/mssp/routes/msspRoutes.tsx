import type { ReactElement } from "react";

import { Outlet } from "react-router-dom";

import { MsspAdminGuard } from "../guards/MsspAdminGuard";
import { MsspOverviewPage } from "../pages/MsspOverviewPage";
import { TenantDetailPage } from "../pages/TenantDetailPage";
import { TenantsListPage } from "../pages/TenantsListPage";
import { TenantUsersPage } from "../pages/TenantUsersPage";
import { NewTenantWizard } from "../wizard/NewTenantWizard";

/** Nested under AppLayout + AuthGuard — MSSP_ADMIN check stays in MsspAdminGuard. */
export function MsspPortalOutlet(): ReactElement {
  return (
    <MsspAdminGuard>
      <Outlet />
    </MsspAdminGuard>
  );
}

export const msspRouteChildren = [
  { path: "overview", element: <MsspOverviewPage /> },
  { path: "tenants", element: <TenantsListPage /> },
  { path: "tenants/new", element: <NewTenantWizard /> },
  { path: "tenants/:tenantId", element: <TenantDetailPage /> },
  { path: "tenants/:tenantId/users", element: <TenantUsersPage /> },
];
