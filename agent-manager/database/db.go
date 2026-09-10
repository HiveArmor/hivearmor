package database

import (
	"errors"
	"fmt"
	"sync"

	"github.com/hivearmor/agent-manager/config"
	"github.com/hivearmor/agent-manager/utils"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	dbOnce     sync.Once
	dbInstance *DB
)

type DB struct {
	conn   *gorm.DB
	// P0-A2-7 §3.2b — sysConn is the all-tenant, BYPASSRLS system-context pool used
	// ONLY by SystemContextFind (boot caches, connector-authorization reconciliation,
	// VerifyConnectorIdentity). It is a SEPARATE connection so system-context reads
	// never depend on a per-request tenant GUC. Until an operator provisions a
	// BYPASSRLS role via DB_SYSTEM_USER, it connects with the same creds as conn, so
	// this is inert.
	sysConn *gorm.DB
	locker  sync.RWMutex
}

func (d *DB) Migrate(data ...interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	for _, v := range data {
		if err := d.conn.AutoMigrate(v); err != nil {
			return err
		}
	}
	return nil
}

func (d *DB) Create(data interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	if err := d.conn.Create(data).Error; err != nil {
		return err
	}
	return nil
}

func (d *DB) Exec(statement string, args ...interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	return d.conn.Exec(statement, args...).Error
}

func (d *DB) Upsert(data interface{}, query string, updates map[string]interface{}, args ...interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	var count int64
	if err := d.conn.Model(data).Where(query, args...).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		if updates != nil {
			return d.conn.Model(data).Where(query, args...).Updates(updates).Error
		}
		return d.conn.Model(data).Where(query, args...).Updates(data).Error
	}
	return d.conn.Create(data).Error
}

func (d *DB) GetFirst(data interface{}, query string, args ...interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	err := d.conn.Where(query, args...).First(data).Error
	if err != nil {
		return err
	}
	return nil
}

func (d *DB) GetAll(data interface{}, query string, args ...interface{}) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	tx := d.conn
	if query != "" {
		tx = tx.Where(query, args...)
	}
	result := tx.Find(data)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func (d *DB) GetByPagination(data interface{}, p utils.Pagination, f []utils.Filter, join string, getDeleted bool) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	var count int64
	tx := d.conn.Model(data).Scopes(utils.FilterScope(f)).Count(&count).Scopes(p.PagingScope)
	if getDeleted {
		tx = tx.Unscoped()
	}
	if join != "" {
		tx = tx.Joins(join)
	}
	tx = tx.Find(data)
	if tx.Error != nil {
		return 0, tx.Error
	}
	return count, nil
}

// P0-A2-7 — tenant-scoped read helpers. These are the BLESSED DEFAULT for any
// tenant-facing read on the agent-manager's own database: they force a
// `tenant_id = ?` predicate via utils.TenantScope, which fails closed to zero rows
// when no valid tenant is supplied (tenantID <= 0). Prefer these over the raw
// GetAll / GetByPagination for endpoint-scoped reads so tenant isolation is
// structural rather than per-caller convention.
//
// System-context reads that legitimately span all tenants (the boot-time
// credential cache, the event-processor revocation-reconciliation projection)
// must NOT be tenant-scoped — use SystemContextFind, which is documented as an
// explicit, audited all-tenant read.

// ScopedFind is the tenant-scoped form of GetAll: it returns only rows whose
// tenant_id matches tenantID. It runs inside WithTenantTx, so BOTH the DB-level RLS
// GUC (app.current_tenant) AND the app-level utils.TenantScope predicate enforce the
// tenant — defense in depth. An optional extra query (with args) is ANDed after the
// forced tenant predicate. Fails closed (PermissionDenied) when tenantID <= 0.
func (d *DB) ScopedFind(data interface{}, tenantID int64, query string, args ...interface{}) (int64, error) {
	var affected int64
	err := d.WithTenantTx(tenantID, func(tx *gorm.DB) error {
		q := tx.Scopes(utils.TenantScope(tenantID))
		if query != "" {
			q = q.Where(query, args...)
		}
		result := q.Find(data)
		if result.Error != nil {
			return result.Error
		}
		affected = result.RowsAffected
		return nil
	})
	if err != nil {
		return 0, err
	}
	return affected, nil
}

// ScopedGetByPagination is the tenant-scoped form of GetByPagination. It runs inside
// WithTenantTx (DB-level RLS GUC) with the app-level utils.TenantScope applied BEFORE
// the user filters, so a caller cannot widen scope through search filters. Fails
// closed (PermissionDenied) when tenantID <= 0.
func (d *DB) ScopedGetByPagination(data interface{}, tenantID int64, p utils.Pagination, f []utils.Filter, join string, getDeleted bool) (int64, error) {
	var count int64
	err := d.WithTenantTx(tenantID, func(tx *gorm.DB) error {
		q := tx.Model(data).Scopes(utils.TenantScope(tenantID)).Scopes(utils.FilterScope(f)).Count(&count).Scopes(p.PagingScope)
		if getDeleted {
			q = q.Unscoped()
		}
		if join != "" {
			q = q.Joins(join)
		}
		return q.Find(data).Error
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}

// SystemContextFind is an EXPLICIT, all-tenant read for system-context callers that
// legitimately need every tenant's rows (boot-time credential cache warm-up, the
// event-processor's ListConnectorAuthorization revocation-reconciliation, and
// VerifyConnectorIdentity — which has no request tenant). It runs on the SEPARATE
// system-context pool (d.sysConn), which is intended to be a BYPASSRLS role, so
// these reads are not subject to the per-transaction tenant GUC and never fail
// closed under RLS. It is the ONLY method that uses d.sysConn — keep it that way so
// cross-tenant access stays greppable and review-gated. Never use it for a
// tenant-facing endpoint read.
func (d *DB) SystemContextFind(data interface{}, query string, args ...interface{}) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	tx := d.sysConn
	if query != "" {
		tx = tx.Where(query, args...)
	}
	result := tx.Find(data)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

// SystemContextGetFirst is the system-pool (BYPASSRLS) form of GetFirst, for
// VerifyConnectorIdentity — a connector lookup by id that has NO request tenant (the
// presented key is the authenticator). Runs on d.sysConn so it is not subject to the
// tenant RLS policy. Same tight-surface rule as SystemContextFind.
func (d *DB) SystemContextGetFirst(data interface{}, query string, args ...interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	return d.sysConn.Where(query, args...).First(data).Error
}

// SystemContextGetByPagination is the system-pool (BYPASSRLS) form of
// GetByPagination, for ListConnectorAuthorization — the event-processor's all-tenant
// revocation-reconciliation projection (internal endpoint, no request tenant). Runs
// on d.sysConn. Same tight-surface rule as SystemContextFind.
func (d *DB) SystemContextGetByPagination(data interface{}, p utils.Pagination, f []utils.Filter) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	var count int64
	tx := d.sysConn.Model(data).Scopes(utils.FilterScope(f)).Count(&count).Scopes(p.PagingScope)
	if err := tx.Find(data).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// WithTenantTx runs fn inside a single transaction whose transaction-local GUC
// app.current_tenant is set to tenantID FIRST, so a Postgres RLS tenant_isolation
// policy (P0-A2-7 §3.2a) evaluates against it for every statement fn issues on the
// passed tx. Because the GUC is transaction-local (set_config(..., true)), it cannot
// leak to the next borrower of a pooled connection. fn MUST use the passed tx handle
// for all tenant SQL — never d.conn or the d.* helpers, which would run outside this
// tx (and, being locked helpers, would also deadlock the non-reentrant mutex).
//
// Fails closed: a non-positive tenantID is rejected before any query, so a missing
// tenant can never run an unscoped statement.
func (d *DB) WithTenantTx(tenantID int64, fn func(tx *gorm.DB) error) error {
	if tenantID <= 0 {
		return status.Error(codes.PermissionDenied,
			"tenant scope is required for this operation but no tenant was supplied")
	}
	d.locker.Lock()
	defer d.locker.Unlock()
	return d.conn.Transaction(func(tx *gorm.DB) error {
		// Transaction-local GUC (is_local = true): scoped to THIS tx only.
		if err := tx.Exec("SELECT set_config('app.current_tenant', ?::text, true)", tenantID).Error; err != nil {
			return err
		}
		return fn(tx)
	})
}


func (d *DB) Delete(data interface{}, query string, hardDelete bool, args ...interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	tx := d.conn
	if hardDelete {
		tx = tx.Unscoped()
	}
	err := tx.Where(query, args...).Delete(data).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return nil
}

// Transaction executes fn under the database transaction boundary. The DB-wide
// mutex prevents an in-process create/consume race while PostgreSQL row locks
// protect concurrent agent-manager replicas.
func (d *DB) Transaction(fn func(*gorm.DB) error) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	return d.conn.Transaction(fn)
}

func GetDB() *DB {
	dbOnce.Do(func() {
		dbInstance = &DB{}
		var err error
		dbInstance.conn, err = gorm.Open(postgres.Open(dsnFor(config.DBUser, config.DBPassword)), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err != nil {
			panic(err)
		}
		// P0-A2-7 §3.2b — the system-context pool. Uses DB_SYSTEM_USER/PASSWORD when
		// set (an operator's BYPASSRLS role), else falls back to the app creds so this
		// is inert until roles are provisioned.
		sysUser, sysPass := config.DBUser, config.DBPassword
		if config.DBSystemUser != "" {
			sysUser, sysPass = config.DBSystemUser, config.DBSystemPassword
		}
		dbInstance.sysConn, err = gorm.Open(postgres.Open(dsnFor(sysUser, sysPass)), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err != nil {
			panic(err)
		}
	})
	return dbInstance
}

// dsnFor builds a Postgres DSN for the given role, reusing the shared host/port/db.
func dsnFor(user, password string) string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s",
		config.DBHost, config.DBPort, user, password, config.DBName)
}
