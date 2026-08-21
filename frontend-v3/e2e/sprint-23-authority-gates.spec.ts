import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Sprint 23 — Authority gate e2e tests
 * Verifies that MSSP portal routes are protected and sidebar is conditional.
 *
 * Requirements: 16.9, 17.4-17.7, 17.10
 *
 * Run against: local-dev stack (frontend on port 5173, backend proxied)
 *
 * Prerequisites:
 *   - `npm ci && npm run build` must have been executed in `frontend-v3/`
 *   - The full local-dev Docker Compose stack must be running (`cd local-dev && docker compose up -d`)
 *   - User `mssp-admin` with authority `MSSP_ADMIN` must exist in `jhi_user` + `jhi_user_authority`
 *     (seeded by Sprint23MsspPortalFunctionalIT Check 1, or manually via the SQL in the spec)
 *   - A regular user `user` with password `user` and NO `MSSP_ADMIN` authority must exist
 */

const MSSP_ROUTES = [
  "/mssp/overview",
  "/mssp/tenants",
  "/mssp/tenants/new",
  "/mssp/tenants/1",
  "/mssp/tenants/1/users",
] as const;

const KPI_LABELS = [
  "Managed Tenants",
  "Active Users",
  "Total EPS",
  "Alerts Today",
] as const;

/**
 * Authenticates via the HiveArmor backend `/api/authenticate` endpoint and stores
 * the returned JWT in `localStorage["hivearmor_auth_token"]` via `addInitScript`,
 * which executes the injection before any page-level JavaScript runs.
 *
 * Uses relative path `/api/authenticate` — routed through the Vite dev proxy or
 * served from the production build, never an absolute backend URL.
 */
async function loginAs(page: Page, login: string, password: string): Promise<void> {
  const response = await page.request.post("/api/authenticate", {
    data: { username: login, password, rememberMe: false },
  });

  const body = await response.json() as { id_token: string };
  const token: string = body.id_token;

  // addInitScript fires before page scripts — ensures the token is present on first
  // load and on every subsequent navigation the page performs.
  await page.addInitScript((tk: string) => {
    window.localStorage.setItem("hivearmor_auth_token", tk);
  }, token);
}

test.describe("Sprint 23 MSSP authority gates", () => {
  // ---------------------------------------------------------------------------
  // Check 2: Unauthorized user sees AccessDeniedPage at all MSSP routes
  //          and the URL is preserved (no redirect).
  // ---------------------------------------------------------------------------
  test(
    "unauthorized user sees access-denied at all MSSP routes and URL is preserved",
    async ({ page }) => {
      // Navigate to root first so addInitScript registers before the token is needed.
      await page.goto("/");
      await loginAs(page, "user", "user");

      for (const route of MSSP_ROUTES) {
        await page.goto(route);

        // URL must be preserved — the guard renders AccessDeniedPage in-place
        // without issuing any navigation.
        expect(page.url()).toContain(route);

        // AccessDeniedPage marker must be visible.
        await expect(page.getByText("Access Denied")).toBeVisible();

        // KPI labels must NOT appear on the denied page.
        for (const label of KPI_LABELS) {
          await expect(page.getByText(label)).not.toBeVisible();
        }
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Check 3: mssp-admin sees "MSSP Portal" section in the sidebar.
  // ---------------------------------------------------------------------------
  test("mssp-admin sees MSSP Portal section in sidebar", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "mssp-admin", "MsspAdmin@2026!");

    // Navigate to a standard authenticated route so the full shell (sidebar) renders.
    await page.goto("/queue");

    await expect(page.getByText("MSSP Portal")).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Check 4: Regular user does NOT see "MSSP Portal" in the sidebar.
  // ---------------------------------------------------------------------------
  test(
    "user without MSSP_ADMIN does not see MSSP Portal in sidebar",
    async ({ page }) => {
      await page.goto("/");
      await loginAs(page, "user", "user");

      await page.goto("/queue");

      await expect(page.getByText("MSSP Portal")).not.toBeVisible();
    },
  );
});
