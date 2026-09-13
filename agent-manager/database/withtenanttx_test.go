package database

import (
	"testing"

	"gorm.io/gorm"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// P0-A2-7 §3.2b — WithTenantTx must FAIL CLOSED before any query when no tenant is
// supplied: it returns PermissionDenied and never runs fn (so a missing tenant can
// never execute an unscoped statement or open a tx with no GUC). The
// transaction-local set_config('app.current_tenant', …, true) behaviour is validated
// end-to-end against real Postgres in the PHASE 1 live prototype
// (HIVEARMOR_A2_7_MANAGER_RLS_3_2B_SCOPE.md §5) and by the §3.2b integration matrix.
func TestWithTenantTx_FailsClosedWhenNoTenant(t *testing.T) {
	d := &DB{} // conn is nil: the guard must return before touching it.
	for _, tid := range []int64{0, -1, -99} {
		called := false
		err := d.WithTenantTx(tid, func(tx *gorm.DB) error { called = true; return nil })
		if err == nil {
			t.Fatalf("tenantID=%d must be rejected", tid)
		}
		if status.Code(err) != codes.PermissionDenied {
			t.Fatalf("tenantID=%d: want PermissionDenied, got %v", tid, err)
		}
		if called {
			t.Fatalf("tenantID=%d: fn must NOT run when tenant is missing", tid)
		}
	}
}
