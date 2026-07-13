import { describe, it, expect } from "vitest";
import { canAccessRoute } from "../route-permissions";
import { ROLES } from "../roles";

describe("canAccessRoute", () => {
  it("admin can access admin routes", () => {
    expect(canAccessRoute("/admin/users", [ROLES.ADMIN])).toBe(true);
    expect(canAccessRoute("/admin/settings", [ROLES.ADMIN])).toBe(true);
  });

  it("analyst cannot access admin routes", () => {
    expect(canAccessRoute("/admin/users", [ROLES.USER])).toBe(false);
    expect(canAccessRoute("/admin/settings", [ROLES.USER])).toBe(false);
  });

  it("analyst can access analyst routes", () => {
    expect(canAccessRoute("/rules", [ROLES.USER])).toBe(true);
    expect(canAccessRoute("/alerts", [ROLES.USER])).toBe(true);
  });

  it("ROLE_USER cannot access admin-only routes", () => {
    expect(canAccessRoute("/data-sources", [ROLES.USER])).toBe(false);
    expect(canAccessRoute("/agents", [ROLES.USER])).toBe(false);
  });

  it("everyone can access dashboard", () => {
    expect(canAccessRoute("/dashboard", [ROLES.ADMIN])).toBe(true);
    expect(canAccessRoute("/dashboard", [ROLES.USER])).toBe(true);
  });

  it("unknown routes are accessible to all authenticated users", () => {
    expect(canAccessRoute("/some-new-route", [ROLES.USER])).toBe(true);
    expect(canAccessRoute("/some-new-route", [ROLES.ADMIN])).toBe(true);
  });

  it("sub-routes inherit parent route permissions", () => {
    expect(canAccessRoute("/admin/users/new", [ROLES.USER])).toBe(false);
    expect(canAccessRoute("/admin/users/new", [ROLES.ADMIN])).toBe(true);
  });
});
