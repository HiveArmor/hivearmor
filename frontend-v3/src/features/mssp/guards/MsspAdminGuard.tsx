import type { ReactNode, ReactElement } from "react";

import { hasAuthority } from "@/lib/auth/hasAuthority";
import { AccessDeniedPage } from "@/pages/auth/AccessDeniedPage";

const MSSP_ADMIN = "MSSP_ADMIN";

export function MsspAdminGuard({ children }: { children: ReactNode }): ReactElement {
  if (hasAuthority(MSSP_ADMIN)) {
    return <>{children}</>;
  }
  return <AccessDeniedPage />;
}
