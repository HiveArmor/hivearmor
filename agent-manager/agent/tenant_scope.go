package agent

import (
	"github.com/hivearmor/agent-manager/utils"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// P0A1-T03 — tenant scoping for endpoint-scoped list reads.
//
// The tenant id is supplied authoritatively by the backend on ListRequest.tenant_id
// (set from the authenticated identity, never a client parameter). We force a
// tenant_id predicate ahead of any user-supplied search filter so a caller cannot
// widen the scope via search_query, and we fail closed when no tenant is supplied.
//
// tenantId <= 0 means "no tenant supplied". Until an explicit, audited system
// context exists (P0A1-T14), that is rejected for endpoint-scoped reads rather
// than silently returning every tenant's rows.

// tenantScopedFilters returns the user filters with a forced tenant_id predicate
// prepended, or an error when no tenant is supplied. The forced field name is the
// constant literal "tenant_id" (not caller-controlled) and the value is bound as a
// query parameter by FilterScope.
func tenantScopedFilters(tenantID int64, userFilters []utils.Filter) ([]utils.Filter, error) {
	if tenantID <= 0 {
		return nil, status.Error(codes.PermissionDenied,
			"tenant scope is required for this read but no tenant was supplied")
	}
	scoped := make([]utils.Filter, 0, len(userFilters)+1)
	scoped = append(scoped, utils.Filter{Field: "tenant_id", Op: utils.Is, Value: tenantID})
	scoped = append(scoped, userFilters...)
	return scoped, nil
}

// P0A1-T07 — AgentCommand rows carry no tenant column of their own; their tenant
// is the owning agent's tenant. We therefore scope commands by JOINing to agents
// and forcing agents.tenant_id = ?, so a caller can never read a command whose
// owning agent belongs to another tenant. The join clause and the qualified
// column name are constant literals; the tenant id is a bound parameter.
const commandTenantJoin = "JOIN agents ON agents.id = agent_commands.agent_id"

// tenantScopedCommandFilters returns the join clause + the forced qualified
// tenant predicate (as a user-filter-compatible slice), or an error when no
// tenant is supplied.
func tenantScopedCommandFilters(tenantID int64, userFilters []utils.Filter) (string, []utils.Filter, error) {
	if tenantID <= 0 {
		return "", nil, status.Error(codes.PermissionDenied,
			"tenant scope is required for this read but no tenant was supplied")
	}
	scoped := make([]utils.Filter, 0, len(userFilters)+1)
	scoped = append(scoped, utils.Filter{Field: "agents.tenant_id", Op: utils.Is, Value: tenantID})
	scoped = append(scoped, userFilters...)
	return commandTenantJoin, scoped, nil
}
