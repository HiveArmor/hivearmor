package database

import (
	"errors"
	"fmt"
	"sync"

	"github.com/hivearmor/agent-manager/config"
	"github.com/hivearmor/agent-manager/utils"
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
	locker sync.RWMutex
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
// tenant_id matches tenantID. An optional extra query (with args) is ANDed after
// the forced tenant predicate. Fails closed to zero rows when tenantID <= 0.
func (d *DB) ScopedFind(data interface{}, tenantID int64, query string, args ...interface{}) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	tx := d.conn.Scopes(utils.TenantScope(tenantID))
	if query != "" {
		tx = tx.Where(query, args...)
	}
	result := tx.Find(data)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

// ScopedGetByPagination is the tenant-scoped form of GetByPagination. The forced
// tenant predicate is applied via utils.TenantScope BEFORE the user filters, so a
// caller cannot widen scope through search filters. Fails closed when tenantID <= 0.
func (d *DB) ScopedGetByPagination(data interface{}, tenantID int64, p utils.Pagination, f []utils.Filter, join string, getDeleted bool) (int64, error) {
	d.locker.Lock()
	defer d.locker.Unlock()
	var count int64
	tx := d.conn.Model(data).Scopes(utils.TenantScope(tenantID)).Scopes(utils.FilterScope(f)).Count(&count).Scopes(p.PagingScope)
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

// SystemContextFind is an EXPLICIT, all-tenant read for system-context callers that
// legitimately need every tenant's rows (boot-time credential cache warm-up, the
// event-processor's ListConnectorAuthorization revocation-reconciliation). It is
// deliberately identical to GetAll — a distinctly-named alias so a reviewer can see
// at the call site that spanning all tenants is intentional, not a forgotten scope.
// Never use it for a tenant-facing endpoint read.
func (d *DB) SystemContextFind(data interface{}, query string, args ...interface{}) (int64, error) {
	return d.GetAll(data, query, args...)
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
		dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s", config.DBHost, config.DBPort, config.DBUser, config.DBPassword, config.DBName)
		var err error
		dbInstance.conn, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err != nil {
			panic(err)
		}
	})
	return dbInstance
}
