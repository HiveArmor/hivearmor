package database

import (
	"errors"
	"fmt"
	"sync"

	"github.com/hivearmor/agent-manager/config"
	"github.com/hivearmor/agent-manager/metrics"
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

// ScopedCommandsByPagination is the tenant-scoped list read for a table that has NO
// tenant_id column of its own (agent_commands), whose tenancy is the owning agent's.
// It runs inside WithTenantTx so the per-transaction GUC is set and the DB-layer RLS
// policy (agent_commands' parent-subquery to agents.tenant_id) enforces — the
// backstop that ScopedGetByPagination's utils.TenantScope cannot provide here,
// because that scope forces a "<table>.tenant_id = ?" predicate and agent_commands
// has no such column. The caller supplies the forced JOIN + qualified
// "agents.tenant_id = ?" app-layer filter (see agent.tenantScopedCommandFilters),
// applied ahead of any user filter. Fails closed (PermissionDenied) when
// tenantID <= 0, via WithTenantTx.
func (d *DB) ScopedCommandsByPagination(data interface{}, tenantID int64, p utils.Pagination, f []utils.Filter, join string, getDeleted bool) (int64, error) {
	var count int64
	err := d.WithTenantTx(tenantID, func(tx *gorm.DB) error {
		q := tx.Model(data).Scopes(utils.FilterScope(f)).Count(&count).Scopes(p.PagingScope)
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
	metrics.SystemContextQueries.WithLabelValues("find").Inc()
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
	metrics.SystemContextQueries.WithLabelValues("get_first").Inc()
	return d.sysConn.Where(query, args...).First(data).Error
}

// SystemContextGetByPagination is the system-pool (BYPASSRLS) form of
// GetByPagination, for ListConnectorAuthorization — the event-processor's all-tenant
// revocation-reconciliation projection (internal endpoint, no request tenant). Runs
// on d.sysConn. Same tight-surface rule as SystemContextFind.
func (d *DB) SystemContextGetByPagination(data interface{}, p utils.Pagination, f []utils.Filter) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	metrics.SystemContextQueries.WithLabelValues("get_by_pagination").Inc()
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
		metrics.RLSMissingTenant.Inc()
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

// P0-A2-7 §3.2b step 3 — tenant-scoped WRITE helpers. Each runs inside WithTenantTx,
// so the RLS tenant_isolation policy (§3.2a) enforces the tenant on the write and a
// WITH CHECK rejects a cross-tenant INSERT/UPDATE. Delete/Upsert return the affected
// row count so a caller can DETECT a silent no-op (a write that matched zero rows
// under RLS because the GUC did not match) instead of assuming success.

// ScopedCreate inserts data within tenantID's transaction. The row's tenant_id must
// equal tenantID or the RLS WITH CHECK rejects it.
func (d *DB) ScopedCreate(tenantID int64, data interface{}) error {
	return d.WithTenantTx(tenantID, func(tx *gorm.DB) error {
		return tx.Create(data).Error
	})
}

// ScopedUpsert mirrors Upsert but inside tenantID's transaction. Returns the number
// of rows the update touched (0 when a matching row was not visible under the tenant
// GUC — a caller may treat 0 as "not found in tenant").
func (d *DB) ScopedUpsert(tenantID int64, data interface{}, query string, updates map[string]interface{}, args ...interface{}) (int64, error) {
	var affected int64
	err := d.WithTenantTx(tenantID, func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(data).Where(query, args...).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			var res *gorm.DB
			if updates != nil {
				res = tx.Model(data).Where(query, args...).Updates(updates)
			} else {
				res = tx.Model(data).Where(query, args...).Updates(data)
			}
			affected = res.RowsAffected
			return res.Error
		}
		if err := tx.Create(data).Error; err != nil {
			return err
		}
		affected = 1
		return nil
	})
	if err == nil && affected == 0 {
		metrics.RLSScopedNoop.WithLabelValues("upsert").Inc()
	}
	return affected, err
}

// ScopedDelete mirrors Delete but inside tenantID's transaction and RETURNS the
// affected row count. A count of 0 means the target row was not visible under the
// tenant GUC (RLS filtered it) — the caller MUST treat that as a not-in-tenant /
// no-op rather than a successful delete.
func (d *DB) ScopedDelete(tenantID int64, data interface{}, query string, hardDelete bool, args ...interface{}) (int64, error) {
	var affected int64
	err := d.WithTenantTx(tenantID, func(tx *gorm.DB) error {
		q := tx
		if hardDelete {
			q = q.Unscoped()
		}
		res := q.Where(query, args...).Delete(data)
		if res.Error != nil && !errors.Is(res.Error, gorm.ErrRecordNotFound) {
			return res.Error
		}
		affected = res.RowsAffected
		return nil
	})
	if err == nil && affected == 0 {
		metrics.RLSScopedNoop.WithLabelValues("delete").Inc()
	}
	return affected, err
}

// SystemContextUpsert performs an UPDATE on the SYSTEM pool (BYPASSRLS) for the
// narrow, system-authorized case of MOVING a row between tenants — specifically the
// collector re-enrollment tenant-rebind, where a single per-tenant GUC cannot satisfy
// both the RLS USING (old tenant, to see the row) and WITH CHECK (new tenant) at once.
// This is a deliberate, documented exception to the "system pool = reads only" rule;
// it is used ONLY for that rebind. Never use it for an ordinary tenant-scoped update.
func (d *DB) SystemContextUpsert(data interface{}, query string, updates map[string]interface{}, args ...interface{}) error {
	d.locker.Lock()
	defer d.locker.Unlock()
	metrics.SystemContextQueries.WithLabelValues("upsert").Inc()
	return d.sysConn.Model(data).Where(query, args...).Updates(updates).Error
}

// ResolveTenantByID looks up a single row's tenant_id via the SYSTEM pool (BYPASSRLS),
// for context/stream-authenticated write paths that hold only the row id and no
// request tenant (self-delete, command history). It reads the tenant with which the
// subsequent Scoped* write is GUC'd. Returns (0, nil) when no such row exists — the
// caller should then treat the operation as not-found rather than proceeding with an
// unscoped write. table and idColumn are constant literals supplied by call sites,
// never user input; id is a bound parameter.
func (d *DB) ResolveTenantByID(table, idColumn string, id interface{}) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	metrics.SystemContextQueries.WithLabelValues("resolve_tenant").Inc()
	var tenantID int64
	err := d.sysConn.Table(table).
		Where(idColumn+" = ?", id).
		Limit(1).
		Pluck("tenant_id", &tenantID).Error
	if err != nil {
		return 0, err
	}
	return tenantID, nil
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
		systemPoolDedicated := config.DBSystemUser != ""
		if systemPoolDedicated {
			sysUser, sysPass = config.DBSystemUser, config.DBSystemPassword
		}
		dbInstance.sysConn, err = gorm.Open(postgres.Open(dsnFor(sysUser, sysPass)), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err != nil {
			panic(err)
		}
		// P0-A2-7 §3.2 C4 — fail-fast cut-over guard. If the app role is unprivileged
		// (RLS actually ENFORCES) but no dedicated system role was provisioned, the
		// system pool silently fell back to the app creds — so the boot credential
		// caches (which read all tenants via sysConn) would fail closed to zero rows,
		// producing a total agent-authentication OUTAGE. Refuse to start instead of
		// booting into that state. Inert on the shipped superuser config (rlsWouldEnforce
		// is false), so this never trips an existing deployment.
		if !systemPoolDedicated {
			enforce, perr := rlsWouldEnforce(dbInstance.conn)
			if perr != nil {
				panic(fmt.Errorf("agent-manager: could not verify DB role privileges at startup: %w", perr))
			}
			if enforce {
				panic(fmt.Errorf(
					"agent-manager: refusing to start — DB_USER is a non-SUPERUSER, non-BYPASSRLS role " +
						"(RLS will enforce) but DB_SYSTEM_USER is not set, so the system-context pool fell " +
						"back to the app role and the boot credential caches would fail closed, breaking all " +
						"agent authentication. Provision a BYPASSRLS system role and set DB_SYSTEM_USER / " +
						"DB_SYSTEM_PASSWORD (see HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md)"))
			}
		}
	})
	return dbInstance
}

// dsnFor builds a Postgres DSN for the given role, reusing the shared host/port/db.
func dsnFor(user, password string) string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s",
		config.DBHost, config.DBPort, user, password, config.DBName)
}

// rlsWouldEnforce reports whether the role backing conn is subject to row-level
// security. RLS (even under FORCE ROW LEVEL SECURITY) is ignored by SUPERUSER and
// BYPASSRLS roles, so it enforces only when the current role is NEITHER. Used by the
// §3.2 C4 cut-over guard to decide whether a missing DB_SYSTEM_USER is fatal.
func rlsWouldEnforce(conn *gorm.DB) (bool, error) {
	var row struct {
		RolSuper     bool `gorm:"column:rolsuper"`
		RolBypassRls bool `gorm:"column:rolbypassrls"`
	}
	err := conn.Raw(
		"SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
	).Scan(&row).Error
	if err != nil {
		return false, err
	}
	return !row.RolSuper && !row.RolBypassRls, nil
}
