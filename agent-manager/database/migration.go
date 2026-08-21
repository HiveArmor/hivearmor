package database

import "github.com/hivearmor/agent-manager/models"

func MigrateDatabase() error {
	db := GetDB()
	err := db.Migrate(&models.Agent{}, &models.EnrollmentToken{}, &models.EnrollmentAuditEvent{}, &models.AgentCommand{}, &models.LastSeen{}, &models.Collector{})
	if err != nil {
		return err
	}
	return installEnrollmentAuditImmutability(db)
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
