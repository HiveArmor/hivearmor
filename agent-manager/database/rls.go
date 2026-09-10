package database

// P0-A2-7 §3.2a — agent-manager Postgres Row-Level Security policies.
//
// Design + runbook: HIVEARMOR_A2_7_MANAGER_RLS.md. This is the POLICY-ONLY step: it
// installs ENABLE + FORCE ROW LEVEL SECURITY and a tenant_isolation policy on the
// manager's tenant-bearing tables. It is DEFENSE-IN-DEPTH beneath the app-layer
// forced-tenant scoping shipped in #290 (utils.TenantScope / DB.ScopedFind).
//
// INERTNESS IS CONDITIONAL (design §2.1): a policy only applies to the connecting
// role when that role is NEITHER superuser NOR BYPASSRLS. In every deployment shipped
// today DB_USER=postgres is a SUPERUSER, which ignores RLS entirely — so installing
// these policies is a runtime NO-OP there. It becomes enforcing only once the runtime
// (§3.2b) connects as an unprivileged role and sets a per-transaction GUC
// (app.current_tenant). Until then the policies sit dormant but correct.
//
// The policy predicate reads a transaction-local GUC and FAILS CLOSED when it is
// absent: current_setting('app.current_tenant', true) returns NULL (not an error)
// when unset, and COALESCE(..., -1) maps that to the impossible tenant id -1
// (single-tenant = 0, MSSP ids are positive) → zero rows / rejected write.
//
// All statements are IDEMPOTENT (AutoMigrate runs every boot): DROP POLICY IF EXISTS
// before CREATE, and ENABLE/FORCE are no-ops when already set.

// rlsColumnTables are the tables that carry their own tenant_id column.
var rlsColumnTables = []string{
	"agents",
	"collectors",
	"enrollment_tokens",
	"enrollment_audit_events",
}

// tenantPredicate is the fail-closed tenant match used by every policy. The column
// is a constant literal and the GUC is read (never interpolated from user input).
const tenantPredicate = `tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant', true), '')::bigint, -1)`

// buildRlsStatements returns the idempotent statement set installed by
// installTenantRlsPolicies. Pure (no DB) so it can be unit-tested.
func buildRlsStatements() []string {
	statements := make([]string, 0, len(rlsColumnTables)*4+4)

	// --- Tables with their own tenant_id column ---
	for _, t := range rlsColumnTables {
		statements = append(statements,
			`ALTER TABLE `+t+` ENABLE ROW LEVEL SECURITY`,
			`ALTER TABLE `+t+` FORCE ROW LEVEL SECURITY`,
			`DROP POLICY IF EXISTS tenant_isolation ON `+t,
			`CREATE POLICY tenant_isolation ON `+t+`
				USING (`+tenantPredicate+`)
				WITH CHECK (`+tenantPredicate+`)`,
		)
	}

	// --- agent_commands: no own tenant_id; tenant is the owning agent's ---
	// Explicit USING (reads/updates/deletes) and WITH CHECK (inserts/updates of the
	// NEW row) so a caller can neither read nor create a command against another
	// tenant's agent. The parent lookup itself resolves under the same GUC.
	const cmdParent = `EXISTS (
		SELECT 1 FROM agents a
		 WHERE a.id = agent_commands.agent_id
		   AND a.tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant', true), '')::bigint, -1)
	)`
	statements = append(statements,
		`ALTER TABLE agent_commands ENABLE ROW LEVEL SECURITY`,
		`ALTER TABLE agent_commands FORCE ROW LEVEL SECURITY`,
		`DROP POLICY IF EXISTS tenant_isolation ON agent_commands`,
		`CREATE POLICY tenant_isolation ON agent_commands
			USING (`+cmdParent+`)
			WITH CHECK (`+cmdParent+`)`,
	)
	return statements
}

// installTenantRlsPolicies installs the §3.2a RLS policies idempotently. It runs as
// part of MigrateDatabase (currently as the superuser role, before the §3.2b role
// split); superuser CREATE POLICY is permitted and the resulting policies are inert
// for the superuser at runtime.
func installTenantRlsPolicies(db *DB) error {
	for _, statement := range buildRlsStatements() {
		if err := db.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}
