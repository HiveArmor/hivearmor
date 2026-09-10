package utils

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// --- no-dial stub so gorm.Open never connects to a real Postgres ------------
//
// The postgres dialector skips sql.Open when a gorm.ConnPool is supplied. We give
// it one whose QueryContext returns a canned server_version row (the only query
// the dialector runs at Initialize); every other call is unused because the DB is
// opened in DryRun mode (it compiles SQL, never executes it).

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

type tenantRow struct {
	ID       int64
	TenantID int64
}

func (tenantRow) TableName() string { return "agents" }

// P0-A2-7: a valid tenant id produces a bound `tenant_id = $n` predicate.
func TestTenantScope_ForcesBoundTenantPredicate(t *testing.T) {
	db := dryRunDB(t)
	var rows []tenantRow
	stmt := db.Model(&tenantRow{}).Scopes(TenantScope(101)).Find(&rows).Statement
	sql := stmt.SQL.String()
	if !strings.Contains(sql, "tenant_id") {
		t.Fatalf("expected tenant_id predicate in SQL, got: %s", sql)
	}
	if strings.Contains(sql, "1 = 0") {
		t.Fatalf("valid tenant must NOT fail closed, got: %s", sql)
	}
	if len(stmt.Vars) == 0 || stmt.Vars[len(stmt.Vars)-1] != int64(101) {
		t.Fatalf("expected tenant id 101 bound as a parameter, got vars=%v sql=%s", stmt.Vars, sql)
	}
}

// P0-A2-7: no valid tenant (<= 0) fails CLOSED to an always-false predicate.
func TestTenantScope_FailsClosedWhenNoTenant(t *testing.T) {
	for _, tid := range []int64{0, -1, -999} {
		db := dryRunDB(t)
		var rows []tenantRow
		sql := db.Model(&tenantRow{}).Scopes(TenantScope(tid)).Find(&rows).Statement.SQL.String()
		if !strings.Contains(sql, "1 = 0") {
			t.Fatalf("tenantID=%d must fail closed with an always-false predicate, got: %s", tid, sql)
		}
		if strings.Contains(sql, "tenant_id = ") {
			t.Fatalf("tenantID=%d must NOT emit a real tenant predicate, got: %s", tid, sql)
		}
	}
}

// P0-A2-7: the qualified (join-form) scope forces the caller-supplied qualified
// column with a bound value, and fails closed the same way.
func TestQualifiedTenantScope_ForcesQualifiedPredicateAndFailsClosed(t *testing.T) {
	db := dryRunDB(t)
	var rows []tenantRow
	sql := db.Model(&tenantRow{}).Scopes(QualifiedTenantScope("agents.tenant_id", 202)).Find(&rows).Statement.SQL.String()
	if !strings.Contains(sql, "agents.tenant_id") {
		t.Fatalf("expected qualified agents.tenant_id predicate, got: %s", sql)
	}

	db2 := dryRunDB(t)
	sql2 := db2.Model(&tenantRow{}).Scopes(QualifiedTenantScope("agents.tenant_id", 0)).Find(&rows).Statement.SQL.String()
	if !strings.Contains(sql2, "1 = 0") {
		t.Fatalf("qualified scope must fail closed at tenantID=0, got: %s", sql2)
	}
}

// P0-A2-7: TenantScope composes with a user FilterScope by AND (GORM chains
// Where clauses with AND), so a user-supplied filter can NEITHER widen past the
// tenant predicate NOR rescue a fail-closed query. This is the real bypass concern
// for ScopedGetByPagination, which applies TenantScope BEFORE FilterScope.
func TestTenantScope_ComposesWithFilterScopeAsAND(t *testing.T) {
	// A malicious user filter that names a different tenant must be ANDed on top of
	// the forced tenant predicate, never OR-ed — so both predicates appear and the
	// forced one is not weakened.
	userFilters := []Filter{{Field: "tenant_id", Op: Is, Value: int64(999)}}

	db := dryRunDB(t)
	var rows []tenantRow
	sql := db.Model(&tenantRow{}).
		Scopes(TenantScope(101)).
		Scopes(FilterScope(userFilters)).
		Find(&rows).Statement.SQL.String()
	if strings.Contains(sql, " OR ") {
		t.Fatalf("scope + user filter must chain by AND, never OR; got: %s", sql)
	}
	if !strings.Contains(sql, "AND") {
		t.Fatalf("expected the forced tenant predicate ANDed with the user filter, got: %s", sql)
	}

	// Fail-closed survives a user filter: 1=0 ANDed with anything is still empty.
	db2 := dryRunDB(t)
	sql2 := db2.Model(&tenantRow{}).
		Scopes(TenantScope(0)).
		Scopes(FilterScope(userFilters)).
		Find(&rows).Statement.SQL.String()
	if !strings.Contains(sql2, "1 = 0") {
		t.Fatalf("fail-closed must survive a user filter (1=0 AND ...), got: %s", sql2)
	}
	if strings.Contains(sql2, " OR ") {
		t.Fatalf("a user filter must not OR-rescue a fail-closed query, got: %s", sql2)
	}
}
