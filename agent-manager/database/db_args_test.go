package database

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// --- no-dial stub so gorm.Open never connects to a real Postgres -------------
//
// The DB opens in DryRun mode, so it compiles SQL without executing; supplying a
// gorm.ConnPool makes the postgres dialector skip sql.Open entirely.

type stubConnPool struct{}

func (stubConnPool) PrepareContext(context.Context, string) (*sql.Stmt, error) { return nil, nil }
func (stubConnPool) ExecContext(context.Context, string, ...interface{}) (sql.Result, error) {
	return nil, nil
}
func (stubConnPool) QueryContext(context.Context, string, ...interface{}) (*sql.Rows, error) {
	return nil, nil
}
func (stubConnPool) QueryRowContext(context.Context, string, ...interface{}) *sql.Row {
	return &sql.Row{}
}

var _ gorm.ConnPool = stubConnPool{}

func dryRunDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 stubConnPool{},
		WithoutQuotingCheck:  true,
		PreferSimpleProtocol: true,
	}), &gorm.Config{DryRun: true, SkipDefaultTransaction: true})
	if err != nil {
		t.Fatalf("open dry-run db: %v", err)
	}
	return db
}

type row struct {
	ID       int64
	TenantID int64
	Hostname string
}

func (row) TableName() string { return "agents" }

// Regression: a multi-placeholder query with N args must bind each arg to its own
// placeholder. Passing the variadic args slice UNSPREAD (`.Where(query, args)`)
// bound the whole slice to the first `?`, mis-binding every additional predicate —
// notably the tenant_id in a "id = ? AND tenant_id = ?" self-lookup. This asserts
// the fixed spread form (`.Where(query, args...)`) binds all args.
func TestWhereSpread_MultiArgQueryBindsEachArg(t *testing.T) {
	// Mirror GetFirst's fixed call form.
	getFirstArgs := []interface{}{int64(7), int64(42)}
	db := dryRunDB(t)
	var got row
	stmt := db.Where("id = ? AND tenant_id = ?", getFirstArgs...).First(&got).Statement
	// First() appends a LIMIT param, so Vars may hold more than the query args; what
	// matters is the two query args are bound INDIVIDUALLY as the first two vars
	// (the unspread bug bound them as one slice → a single leading var).
	if len(stmt.Vars) < 2 {
		t.Fatalf("expected the 2 query args bound individually, got %d: %v", len(stmt.Vars), stmt.Vars)
	}
	if stmt.Vars[0] != int64(7) || stmt.Vars[1] != int64(42) {
		t.Fatalf("args mis-bound: %v", stmt.Vars)
	}

	// Mirror Delete's fixed call form.
	delArgs := []interface{}{"host-1", "syslog"}
	db2 := dryRunDB(t)
	stmt2 := db2.Where("hostname = ? and module = ?", delArgs...).Delete(&row{}).Statement
	if len(stmt2.Vars) < 2 {
		t.Fatalf("expected the 2 delete query args bound individually, got %d: %v", len(stmt2.Vars), stmt2.Vars)
	}
	if stmt2.Vars[0] != "host-1" || stmt2.Vars[1] != "syslog" {
		t.Fatalf("delete args mis-bound: %v", stmt2.Vars)
	}
}

// Guard: the unspread form (the pre-fix bug) mis-binds a multi-placeholder query.
// GORM folds a lone []interface{} into the FIRST placeholder as a tuple and leaves
// the rest unbound: `WHERE id = ($1,$2) AND tenant_id = ?`. This documents exactly
// what was wrong and fails if anyone reverts to `.Where(query, args)`.
func TestWhereUnspread_MisbindsMultiArgInSQL(t *testing.T) {
	args := []interface{}{int64(7), int64(42)}
	db := dryRunDB(t)
	var got row
	sql := db.Where("id = ? AND tenant_id = ?", args).First(&got).Statement.SQL.String()
	// The bug signature: both args collapse into the first placeholder as a tuple,
	// and the tenant_id placeholder is left as a bare, unbound "?".
	if !strings.Contains(sql, "id = ($1,$2)") {
		t.Fatalf("expected the unspread bug to fold both args into the first placeholder; got: %s", sql)
	}
	if !strings.Contains(sql, "tenant_id = ?") {
		t.Fatalf("expected the tenant_id placeholder left unbound by the unspread bug; got: %s", sql)
	}

	// Contrast: the fixed spread form binds each placeholder individually.
	db2 := dryRunDB(t)
	sqlOk := db2.Where("id = ? AND tenant_id = ?", args...).First(&got).Statement.SQL.String()
	if !strings.Contains(sqlOk, "id = $1 AND tenant_id = $2") {
		t.Fatalf("spread form must bind each placeholder; got: %s", sqlOk)
	}
}
