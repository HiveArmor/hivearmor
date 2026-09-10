package utils

import "gorm.io/gorm"

// P0-A2-7 — forced-tenant scoping for the agent-manager's own Postgres.
//
// The agent-manager runs on a SEPARATE database (hivearmor_agents) that the Java
// backend's Row-Level-Security policies do not reach, so tenant isolation here is
// enforced in application code. Before this scope, every tenant-facing read had to
// remember to prepend a tenant_id predicate by hand (see agent/tenant_scope.go);
// that is convention-only, with no structural backstop. TenantScope makes the
// tenant predicate the DEFAULT for any read that opts into it.
//
// It is a standard GORM Scopes(...) function, matching FilterScope / PagingScope,
// so it composes with them: db.Scopes(TenantScope(tenantID), FilterScope(f), ...).
//
// The column name is the constant literal "tenant_id" (never caller-controlled) and
// the value is always a bound parameter, so the predicate cannot be used for SQL
// injection.
//
// FAIL-CLOSED: a GORM scope cannot return an error, so when no valid tenant is
// supplied (tenantID <= 0) this adds an always-false predicate ("1 = 0") and the
// query returns ZERO rows rather than every tenant's rows. Callers that must REJECT
// a missing tenant up front (returning gRPC PermissionDenied) should keep using the
// tenantScopedFilters helper in agent/tenant_scope.go, which fails loud; TenantScope
// is the fail-quiet default for the query layer itself.

// tenantColumn is the constant, non-caller-controlled column carrying the owning
// tenant on the agent-manager's tenant-scoped tables (agents, collectors,
// enrollment_tokens, …).
const tenantColumn = "tenant_id"

// impossibleTenant is the sentinel used when no valid tenant is supplied: matching
// it yields zero rows (tenant_id defaults to 0/positive, so a negative id is
// unreachable). The always-false predicate below is preferred, but this documents
// the fail-closed intent.
const impossibleTenant int64 = -1

// TenantScope returns a GORM scope that forces `tenant_id = ?` on the query, bound
// to the supplied tenant id. When tenantID <= 0 it forces an always-false predicate
// so the query fails closed to zero rows instead of leaking every tenant's data.
func TenantScope(tenantID int64) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if tenantID <= 0 {
			// Fail closed: no valid tenant → match nothing.
			return db.Where("1 = 0")
		}
		return db.Where(tenantColumn+" = ?", tenantID)
	}
}

// QualifiedTenantScope is the join-form of TenantScope for a read that JOINs to a
// tenant-bearing table (e.g. agent_commands JOIN agents). The qualified column
// (for example "agents.tenant_id") is a constant literal supplied by the caller's
// code, never end-user input; the value is a bound parameter. Same fail-closed
// behaviour as TenantScope.
func QualifiedTenantScope(qualifiedColumn string, tenantID int64) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if tenantID <= 0 {
			return db.Where("1 = 0")
		}
		return db.Where(qualifiedColumn+" = ?", tenantID)
	}
}
