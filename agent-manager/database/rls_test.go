package database

import (
	"strings"
	"testing"
)

// P0-A2-7 §3.2a — validate the RLS statement set without a live DB. Asserts the
// safety properties the design (HIVEARMOR_A2_7_MANAGER_RLS.md) requires.
func TestBuildRlsStatements(t *testing.T) {
	stmts := buildRlsStatements()
	joined := strings.Join(stmts, "\n")

	// Every tenant-bearing table (own tenant_id) + agent_commands must be covered.
	tables := append([]string{}, rlsColumnTables...)
	tables = append(tables, "agent_commands")
	for _, tbl := range tables {
		if !strings.Contains(joined, "ENABLE ROW LEVEL SECURITY") ||
			!strings.Contains(joined, "ALTER TABLE "+tbl+" ENABLE ROW LEVEL SECURITY") {
			t.Fatalf("missing ENABLE RLS for %s", tbl)
		}
		// FORCE so the table owner is also subject (owner is not a silent bypass).
		if !strings.Contains(joined, "ALTER TABLE "+tbl+" FORCE ROW LEVEL SECURITY") {
			t.Fatalf("missing FORCE RLS for %s", tbl)
		}
		// Idempotent: DROP POLICY IF EXISTS before CREATE (AutoMigrate runs every boot).
		if !strings.Contains(joined, "DROP POLICY IF EXISTS tenant_isolation ON "+tbl) {
			t.Fatalf("missing idempotent DROP POLICY for %s", tbl)
		}
		if !strings.Contains(joined, "CREATE POLICY tenant_isolation ON "+tbl) {
			t.Fatalf("missing CREATE POLICY for %s", tbl)
		}
	}

	// Fail-closed predicate: missing_ok current_setting + COALESCE(...,-1).
	if !strings.Contains(joined, "current_setting('app.current_tenant', true)") {
		t.Fatalf("policy must read the GUC with missing_ok=true (fail-closed, no error when unset)")
	}
	if !strings.Contains(joined, "-1)") {
		t.Fatalf("policy must fall back to the impossible tenant id -1 when the GUC is absent")
	}

	// Column-table policies bind on the row's own tenant_id, with WITH CHECK on writes.
	for _, tbl := range rlsColumnTables {
		// find the CREATE POLICY block for this table
		idx := strings.Index(joined, "CREATE POLICY tenant_isolation ON "+tbl)
		block := joined[idx:]
		if !strings.Contains(block[:200], "tenant_id = COALESCE") {
			t.Fatalf("%s policy must match the row's own tenant_id", tbl)
		}
	}

	// agent_commands must resolve via the owning agent (no own tenant_id), with both
	// USING and WITH CHECK referencing the parent agents row.
	cmdIdx := strings.Index(joined, "CREATE POLICY tenant_isolation ON agent_commands")
	cmdBlock := joined[cmdIdx:]
	if !strings.Contains(cmdBlock, "FROM agents a") ||
		!strings.Contains(cmdBlock, "a.id = agent_commands.agent_id") {
		t.Fatalf("agent_commands policy must resolve tenant via the owning agent")
	}
	if !strings.Contains(cmdBlock, "USING (") || !strings.Contains(cmdBlock, "WITH CHECK (") {
		t.Fatalf("agent_commands policy must have explicit USING and WITH CHECK")
	}

	// Idempotency of the whole set: building twice yields the identical statements.
	if strings.Join(buildRlsStatements(), "\n") != joined {
		t.Fatalf("buildRlsStatements must be deterministic")
	}
}
