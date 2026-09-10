package database

import (
	"fmt"

	"github.com/hivearmor/agent-manager/models"
	"gorm.io/gorm"
)

func MigrateDatabase() error {
	db := GetDB()
	// P0A1-T13 — reshape the hostname unique index from global (hostname, deleted_at)
	// to per-tenant (tenant_id, hostname, deleted_at). GORM AutoMigrate does NOT
	// rewrite an existing index whose column set changed, so the old index is dropped
	// here (guarded) and AutoMigrate recreates it with the new columns below.
	if err := migrateAgentHostnameTenantUnique(db); err != nil {
		return err
	}
	err := db.Migrate(&models.Agent{}, &models.EnrollmentToken{}, &models.EnrollmentAuditEvent{}, &models.AgentCommand{}, &models.LastSeen{}, &models.Collector{})
	if err != nil {
		return err
	}
	return installEnrollmentAuditImmutability(db)
}

// migrateAgentHostnameTenantUnique drops the legacy global (hostname, deleted_at)
// unique index so AutoMigrate can recreate idx_hostname_deleted as the per-tenant
// (tenant_id, hostname, deleted_at) unique index. It first fails closed if any
// within-tenant hostname collision already exists (which the new constraint would
// reject), so the reshape never silently drops uniqueness enforcement on bad data.
func migrateAgentHostnameTenantUnique(db *DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		// If the agents table does not exist yet (fresh database), AutoMigrate will
		// create it with the correct 3-column index; nothing to reshape.
		if !tx.Migrator().HasTable(&models.Agent{}) {
			return nil
		}
		// Pre-check: refuse to proceed if a within-tenant hostname collision already
		// exists among rows — the new (tenant_id, hostname, deleted_at) unique index
		// would reject it, so an operator must resolve it first. Fail closed.
		var duplicateCount int64
		if err := tx.Raw(`
			SELECT COUNT(*) FROM (
				SELECT tenant_id, hostname, deleted_at
				FROM agents
				GROUP BY tenant_id, hostname, deleted_at
				HAVING COUNT(*) > 1
			) dups`).Scan(&duplicateCount).Error; err != nil {
			return err
		}
		if duplicateCount > 0 {
			return fmt.Errorf("P0A1-T13: %d within-tenant hostname collisions exist in agents; "+
				"resolve them before the per-tenant unique index can be applied", duplicateCount)
		}
		// Drop the legacy (hostname, deleted_at) index; AutoMigrate recreates
		// idx_hostname_deleted as the per-tenant (tenant_id, hostname, deleted_at) index.
		return tx.Exec(`DROP INDEX IF EXISTS idx_hostname_deleted`).Error
	})
}

func installEnrollmentAuditImmutability(db *DB) error {
	statements := []string{
		`CREATE OR REPLACE FUNCTION reject_enrollment_audit_mutation() RETURNS trigger AS $$
		BEGIN
			RAISE EXCEPTION 'enrollment audit events are append-only' USING ERRCODE = '55000';
		END;
		$$ LANGUAGE plpgsql`,
		`DROP TRIGGER IF EXISTS enrollment_audit_events_append_only ON enrollment_audit_events`,
		`CREATE TRIGGER enrollment_audit_events_append_only
		BEFORE UPDATE OR DELETE ON enrollment_audit_events
		FOR EACH ROW EXECUTE FUNCTION reject_enrollment_audit_mutation()`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}
