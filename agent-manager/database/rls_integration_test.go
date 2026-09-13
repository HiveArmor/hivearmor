//go:build integration

// P0-A2-7 §3.2b — RLS integration matrix. Requires a real PostgreSQL. Tagged
// `integration` and excluded from `go test -short`; run with:
//
//	RLS_TEST_DSN='host=... port=... user=postgres password=... dbname=...' \
//	  go test -tags integration ./database/ -run RLSMatrix -v
//
// The DSN must be a SUPERUSER (it creates the schema, policies, and the unprivileged
// app role). The matrix then exercises the tenant paths as the unprivileged role so
// RLS is active. Skips cleanly when RLS_TEST_DSN is unset.
package database

import (
	"database/sql"
	"fmt"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func rlsTestDSN(t *testing.T) string {
	dsn := os.Getenv("RLS_TEST_DSN")
	if dsn == "" {
		t.Skip("RLS_TEST_DSN not set; skipping RLS integration matrix")
	}
	return dsn
}

const rlsSchema = `
DROP TABLE IF EXISTS agent_commands, agents, collectors, enrollment_tokens, enrollment_audit_events CASCADE;
CREATE TABLE agents (id bigserial PRIMARY KEY, tenant_id bigint NOT NULL DEFAULT 0, hostname text);
CREATE TABLE collectors (id bigserial PRIMARY KEY, tenant_id bigint NOT NULL DEFAULT 0, hostname text);
CREATE TABLE enrollment_tokens (id bigserial PRIMARY KEY, tenant_id bigint NOT NULL, token_id text);
CREATE TABLE enrollment_audit_events (id text PRIMARY KEY, tenant_id bigint NOT NULL, event_type text);
CREATE TABLE agent_commands (id bigserial PRIMARY KEY, agent_id bigint, command text);
INSERT INTO agents (id, tenant_id, hostname) VALUES (10,1,'a-t1'), (20,2,'a-t2');
INSERT INTO agent_commands (id, agent_id, command) VALUES (1000,10,'c-t1'), (2000,20,'c-t2');
`

func applyPolicies(t *testing.T, db *sql.DB) {
	for _, s := range buildRlsStatements() {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("apply policy failed: %v\nSQL: %s", err, s)
		}
	}
}

// overrideUser rewrites (or appends) user=/password= in a keyword-style DSN so the
// same host/port/dbname is reused with a different role.
func overrideUser(dsn, user, password string) string {
	fields := []string{}
	for _, f := range splitFields(dsn) {
		if len(f) >= 5 && f[:5] == "user=" {
			continue
		}
		if len(f) >= 9 && f[:9] == "password=" {
			continue
		}
		fields = append(fields, f)
	}
	fields = append(fields, "user="+user, "password="+password)
	out := ""
	for i, f := range fields {
		if i > 0 {
			out += " "
		}
		out += f
	}
	return out
}

func splitFields(s string) []string {
	out := []string{}
	cur := ""
	for _, r := range s {
		if r == ' ' {
			if cur != "" {
				out = append(out, cur)
				cur = ""
			}
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func TestRLSMatrix(t *testing.T) {
	dsn := rlsTestDSN(t)
	admin, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open admin: %v", err)
	}
	defer admin.Close()
	if _, err := admin.Exec(rlsSchema); err != nil {
		t.Fatalf("schema: %v", err)
	}
	applyPolicies(t, admin)
	admin.Exec(`DROP ROLE IF EXISTS ha_app`)
	if _, err := admin.Exec(`CREATE ROLE ha_app LOGIN PASSWORD 'app'`); err != nil {
		t.Fatalf("create role: %v", err)
	}
	admin.Exec(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ha_app`)
	admin.Exec(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ha_app`)

	// App DSN as the unprivileged role. RLS_TEST_APP_DSN lets the caller supply it
	// explicitly; otherwise derive it from the admin DSN by overriding user/password.
	appDSN := os.Getenv("RLS_TEST_APP_DSN")
	if appDSN == "" {
		appDSN = overrideUser(dsn, "ha_app", "app")
	}
	app, err := sql.Open("pgx", appDSN)
	if err != nil {
		t.Fatalf("open app: %v", err)
	}
	defer app.Close()

	inTx := func(tenant int64, f func(tx *sql.Tx)) {
		tx, err := app.Begin()
		if err != nil {
			t.Fatalf("begin: %v", err)
		}
		defer tx.Rollback()
		if tenant != 0 {
			if _, err := tx.Exec(`SELECT set_config('app.current_tenant', $1, true)`, fmt.Sprint(tenant)); err != nil {
				t.Fatalf("set_config: %v", err)
			}
		}
		f(tx)
	}
	count := func(tx *sql.Tx, q string, args ...interface{}) int {
		var n int
		if err := tx.QueryRow(q, args...).Scan(&n); err != nil {
			t.Fatalf("count %q: %v", q, err)
		}
		return n
	}

	t.Run("T-CANARY no GUC -> 0", func(t *testing.T) {
		inTx(0, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents`); n != 0 {
				t.Fatalf("expected 0, got %d", n)
			}
		})
	})
	t.Run("T-SCOPE tenant 1 sees only its agent", func(t *testing.T) {
		inTx(1, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents`); n != 1 {
				t.Fatalf("expected 1, got %d", n)
			}
			if n := count(tx, `SELECT count(*) FROM agents WHERE id=20`); n != 0 {
				t.Fatalf("t1 must not see t2 agent, got %d", n)
			}
		})
	})
	t.Run("T-CMD parent policy tenant 2", func(t *testing.T) {
		inTx(2, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agent_commands`); n != 1 {
				t.Fatalf("expected 1 (id 2000), got %d", n)
			}
		})
	})
	t.Run("T-WRITE cross-tenant insert rejected", func(t *testing.T) {
		inTx(1, func(tx *sql.Tx) {
			if _, err := tx.Exec(`INSERT INTO agents (id,tenant_id,hostname) VALUES (30,2,'evil')`); err == nil {
				t.Fatalf("expected WITH CHECK rejection")
			}
		})
	})
	t.Run("T-CMD cross-tenant insert rejected", func(t *testing.T) {
		inTx(1, func(tx *sql.Tx) {
			if _, err := tx.Exec(`INSERT INTO agent_commands (id,agent_id,command) VALUES (3000,20,'evil')`); err == nil {
				t.Fatalf("expected parent WITH CHECK rejection")
			}
		})
	})
	t.Run("T-WRITE delete cross-tenant affects 0 rows", func(t *testing.T) {
		inTx(1, func(tx *sql.Tx) {
			res, err := tx.Exec(`DELETE FROM agents WHERE id=20`)
			if err != nil {
				t.Fatalf("delete err: %v", err)
			}
			if n, _ := res.RowsAffected(); n != 0 {
				t.Fatalf("cross-tenant delete must affect 0 rows, got %d", n)
			}
		})
	})
	t.Run("T-MISSING-GUC write rejected", func(t *testing.T) {
		inTx(0, func(tx *sql.Tx) {
			if _, err := tx.Exec(`INSERT INTO agents (id,tenant_id,hostname) VALUES (40,1,'noguc')`); err == nil {
				t.Fatalf("expected fail-closed rejection with no GUC")
			}
		})
	})
	t.Run("T-POOL-BLEED GUC does not survive across tx on reused conn", func(t *testing.T) {
		app.SetMaxOpenConns(1)
		inTx(1, func(tx *sql.Tx) { _ = count(tx, `SELECT count(*) FROM agents`) })
		inTx(0, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents`); n != 0 {
				t.Fatalf("GUC bled across tx: expected 0, got %d", n)
			}
		})
	})
	t.Run("T-CONCURRENT interleaved tenants isolate", func(t *testing.T) {
		app.SetMaxOpenConns(4)
		done := make(chan error, 30)
		for i := 0; i < 30; i++ {
			tenant := int64((i % 2) + 1)
			wantID := map[int64]int{1: 10, 2: 20}[tenant]
			other := map[int64]int{1: 20, 2: 10}[tenant]
			go func() {
				tx, err := app.Begin()
				if err != nil {
					done <- err
					return
				}
				defer tx.Rollback()
				if _, err := tx.Exec(`SELECT set_config('app.current_tenant', $1, true)`, fmt.Sprint(tenant)); err != nil {
					done <- err
					return
				}
				var n int
				if err := tx.QueryRow(`SELECT count(*) FROM agents WHERE id=$1`, wantID).Scan(&n); err != nil {
					done <- err
					return
				}
				if n != 1 {
					done <- fmt.Errorf("tenant %d expected agent %d, got %d rows", tenant, wantID, n)
					return
				}
				var leaked int
				tx.QueryRow(`SELECT count(*) FROM agents WHERE id=$1`, other).Scan(&leaked)
				if leaked != 0 {
					done <- fmt.Errorf("tenant %d LEAKED view of agent %d", tenant, other)
					return
				}
				done <- nil
			}()
		}
		for i := 0; i < 30; i++ {
			if err := <-done; err != nil {
				t.Fatalf("concurrent isolation failure: %v", err)
			}
		}
	})

	// P0-A2-7 §3.2 C5 — additional required cases.

	// T-CROSS: cross-tenant read is denied in BOTH directions (not just t1→t2).
	t.Run("T-CROSS bidirectional read isolation", func(t *testing.T) {
		app.SetMaxOpenConns(4)
		inTx(2, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents WHERE id=10`); n != 0 {
				t.Fatalf("t2 must not see t1 agent 10, got %d", n)
			}
			if n := count(tx, `SELECT count(*) FROM agent_commands WHERE id=1000`); n != 0 {
				t.Fatalf("t2 must not see t1 command 1000, got %d", n)
			}
		})
		inTx(1, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agent_commands WHERE id=2000`); n != 0 {
				t.Fatalf("t1 must not see t2 command 2000, got %d", n)
			}
		})
	})

	// T-LEAK: a tenant cannot reassign a row to itself (steal) via UPDATE, and an
	// UPDATE targeting another tenant's row affects 0 rows (never leaks/mutates it).
	t.Run("T-LEAK cross-tenant update cannot steal or mutate", func(t *testing.T) {
		// t1 tries to pull t2's agent 20 into tenant 1 — USING hides the row → 0 rows,
		// and WITH CHECK would also reject the new tenant value.
		inTx(1, func(tx *sql.Tx) {
			res, err := tx.Exec(`UPDATE agents SET tenant_id=1 WHERE id=20`)
			if err == nil {
				if n, _ := res.RowsAffected(); n != 0 {
					t.Fatalf("t1 stole/mutated t2 agent 20: %d rows affected", n)
				}
			}
			// If it errored (WITH CHECK), that is also a correct denial.
		})
		// Confirm from t2's own context that agent 20 is untouched (still tenant 2).
		inTx(2, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents WHERE id=20 AND tenant_id=2`); n != 1 {
				t.Fatalf("t2 agent 20 tenant was altered by t1's attempt, got %d", n)
			}
		})
	})

	// T-MIGRATE: re-running buildRlsStatements() (AutoMigrate runs every boot) is
	// idempotent and enforcement still holds afterwards.
	t.Run("T-MIGRATE idempotent policy re-apply keeps enforcement", func(t *testing.T) {
		applyPolicies(t, admin) // second application — must not error
		applyPolicies(t, admin) // third — still idempotent
		app.SetMaxOpenConns(4)
		inTx(1, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents`); n != 1 {
				t.Fatalf("after re-apply, t1 must still see exactly its 1 agent, got %d", n)
			}
		})
		inTx(0, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents`); n != 0 {
				t.Fatalf("after re-apply, no-GUC must still fail closed, got %d", n)
			}
		})
	})

	// T-BOOT: proves WHY boot caches must use the system (BYPASSRLS) pool. The app
	// role with NO GUC sees zero rows (would starve the credential cache → agent-auth
	// outage), while the admin/superuser role (stand-in for the BYPASSRLS system pool)
	// sees ALL tenants' rows and can warm the cache.
	t.Run("T-BOOT app-role no-GUC starves; system pool sees all", func(t *testing.T) {
		app.SetMaxOpenConns(4)
		inTx(0, func(tx *sql.Tx) {
			if n := count(tx, `SELECT count(*) FROM agents`); n != 0 {
				t.Fatalf("app role with no GUC must read 0 (would starve boot cache), got %d", n)
			}
		})
		var all int
		if err := admin.QueryRow(`SELECT count(*) FROM agents`).Scan(&all); err != nil {
			t.Fatalf("system-pool read: %v", err)
		}
		if all != 2 {
			t.Fatalf("system/BYPASSRLS pool must see all tenants (2), got %d", all)
		}
	})
}
