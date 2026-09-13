package agent

import (
	"testing"

	"github.com/hivearmor/agent-manager/utils"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// P0A1-T03/T05 — the security-critical scoping logic shared by ListAgents,
// ListAgentCommands and the by-hostname lookup: a tenant_id predicate is forced
// ahead of any user filter, and a missing tenant fails closed.

func TestTenantScopedFilters_PrependsForcedTenantPredicate(t *testing.T) {
	user := []utils.Filter{{Field: "hostname", Op: utils.Is, Value: "web01"}}
	got, err := tenantScopedFilters(101, user)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 filters (tenant + user), got %d", len(got))
	}
	// The tenant predicate MUST be first so it cannot be dropped/overridden.
	if got[0].Field != "tenant_id" || got[0].Op != utils.Is || got[0].Value.(int64) != 101 {
		t.Fatalf("first filter must be forced tenant_id = 101, got %+v", got[0])
	}
	if got[1].Field != "hostname" || got[1].Value != "web01" {
		t.Fatalf("user filter must be preserved after the tenant predicate, got %+v", got[1])
	}
}

func TestTenantScopedFilters_ForcedEvenWithNoUserFilters(t *testing.T) {
	got, err := tenantScopedFilters(202, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].Field != "tenant_id" || got[0].Value.(int64) != 202 {
		t.Fatalf("expected a single forced tenant_id = 202 predicate, got %+v", got)
	}
}

func TestTenantScopedFilters_FailsClosedWhenNoTenant(t *testing.T) {
	for _, tid := range []int64{0, -1} {
		_, err := tenantScopedFilters(tid, nil)
		if err == nil {
			t.Fatalf("expected PermissionDenied for tenant_id=%d, got nil", tid)
		}
		if status.Code(err) != codes.PermissionDenied {
			t.Fatalf("expected codes.PermissionDenied for tenant_id=%d, got %v", tid, status.Code(err))
		}
	}
}

func TestTenantScopedFilters_UserCannotOverrideTenantViaSearch(t *testing.T) {
	// A caller-supplied tenant_id filter (e.g. from search_query) must NOT win:
	// the forced predicate is still first, and FilterScope applies BOTH as
	// AND-ed WHERE clauses — so a foreign tenant_id can only narrow, never widen.
	malicious := utils.NewFilter("tenant_id.Is=999")
	got, err := tenantScopedFilters(101, malicious)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Field != "tenant_id" || got[0].Value.(int64) != 101 {
		t.Fatalf("forced tenant (101) must be first regardless of user search, got %+v", got[0])
	}
}

// P0A1-T07 — command reads are scoped via a JOIN to agents (commands carry no
// tenant column of their own).

func TestTenantScopedCommandFilters_JoinAndQualifiedPredicate(t *testing.T) {
	user := []utils.Filter{{Field: "command_status", Op: utils.Is, Value: int64(3)}}
	join, got, err := tenantScopedCommandFilters(101, user)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if join != "JOIN agents ON agents.id = agent_commands.agent_id" {
		t.Fatalf("unexpected join clause: %q", join)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 filters (agents.tenant_id + user), got %d", len(got))
	}
	// The forced predicate must be the qualified agents.tenant_id and be first.
	if got[0].Field != "agents.tenant_id" || got[0].Op != utils.Is || got[0].Value.(int64) != 101 {
		t.Fatalf("first filter must be forced agents.tenant_id = 101, got %+v", got[0])
	}
	if got[1].Field != "command_status" {
		t.Fatalf("user filter must be preserved after the tenant predicate, got %+v", got[1])
	}
}

func TestTenantScopedCommandFilters_FailsClosedWhenNoTenant(t *testing.T) {
	for _, tid := range []int64{0, -1} {
		_, _, err := tenantScopedCommandFilters(tid, nil)
		if err == nil {
			t.Fatalf("expected PermissionDenied for tenant_id=%d, got nil", tid)
		}
		if status.Code(err) != codes.PermissionDenied {
			t.Fatalf("expected codes.PermissionDenied for tenant_id=%d, got %v", tid, status.Code(err))
		}
	}
}
