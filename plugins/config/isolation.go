package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"
	"gopkg.in/yaml.v3"
)

// DET-MSSP-002a — shared engine YAML must never include tenant-owned exceptions.
const (
	platformActiveExceptionsSQL = `SELECT id, rule_id, title, conditions_json FROM ha_detection_exception WHERE active = true AND tenant_id IS NULL ORDER BY id`
	platformExceptionMaxSQL     = `SELECT MAX(updated_at) FROM ha_detection_exception WHERE tenant_id IS NULL`
	platformExceptionCountSQL   = `SELECT COUNT(*) FROM ha_detection_exception WHERE active = true AND tenant_id IS NULL`

	tenantActiveExceptionsSQL = `SELECT id, rule_id, title, conditions_json FROM ha_detection_exception WHERE active = true AND tenant_id = $1 ORDER BY id`
	tenantRulesSQL            = `SELECT id,rule_name,rule_confidentiality,rule_integrity,rule_availability,rule_category,rule_technique,rule_description,rule_references_def,rule_definition_def,rule_adversary,rule_deduplicate_by_def,rule_after_events_def,rule_group_by_def FROM hive_correlation_rules WHERE rule_active = true AND tenant_id = $1`
	tenantIDsSQL              = `SELECT tenant_id FROM hive_correlation_rules WHERE tenant_id IS NOT NULL UNION SELECT tenant_id FROM ha_detection_exception WHERE tenant_id IS NOT NULL`

	tenantRulesMaxSQL       = `SELECT MAX(rule_last_update) FROM hive_correlation_rules WHERE tenant_id IS NOT NULL`
	tenantRulesCountSQL     = `SELECT COUNT(*) FROM hive_correlation_rules WHERE rule_active = true AND tenant_id IS NOT NULL`
	tenantExceptionMaxSQL   = `SELECT MAX(updated_at) FROM ha_detection_exception WHERE tenant_id IS NOT NULL`
	tenantExceptionCountSQL = `SELECT COUNT(*) FROM ha_detection_exception WHERE active = true AND tenant_id IS NOT NULL`
)

// TenantRulesDir is $WORK_DIR/tenants/{id}/rules (DET-MSSP-002).
func TenantRulesDir(workDir string, tenantID int64) string {
	return filepath.Join(workDir, "tenants", strconv.FormatInt(tenantID, 10), "rules")
}

func isSoftSchemaErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "ha_detection_exception") || strings.Contains(msg, "tenant_id")
}

func listDetectionTenantIDs(db *sql.DB) ([]int64, error) {
	rows, err := db.Query(tenantIDsSQL)
	if err != nil {
		if isSoftSchemaErr(err) {
			return nil, nil
		}
		return nil, catcher.Error("failed to list detection tenant ids", err, map[string]any{"process": "plugin_com.hivearmor.config"})
	}
	defer func() { _ = rows.Close() }()

	seen := map[int64]struct{}{}
	out := make([]int64, 0)
	for rows.Next() {
		var id sql.NullInt64
		if err := rows.Scan(&id); err != nil {
			return nil, catcher.Error("failed to scan detection tenant id", err, map[string]any{"process": "plugin_com.hivearmor.config"})
		}
		if !id.Valid || id.Int64 <= 0 {
			continue
		}
		if _, ok := seen[id.Int64]; ok {
			continue
		}
		seen[id.Int64] = struct{}{}
		out = append(out, id.Int64)
	}
	return out, nil
}

func getActiveExceptionsForTenant(db *sql.DB, tenantID int64) ([]DetectionException, error) {
	return scanActiveExceptions(db, tenantActiveExceptionsSQL, tenantID)
}

func scanActiveExceptions(db *sql.DB, query string, args ...any) ([]DetectionException, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		if isSoftSchemaErr(err) {
			return []DetectionException{}, nil
		}
		return nil, catcher.Error("failed to get active detection exceptions", err, map[string]any{"process": "plugin_com.hivearmor.config"})
	}
	defer func() { _ = rows.Close() }()

	out := make([]DetectionException, 0)
	for rows.Next() {
		var (
			id             int64
			ruleID         string
			title          sql.NullString
			conditionsJSON string
		)
		if err := rows.Scan(&id, &ruleID, &title, &conditionsJSON); err != nil {
			return nil, catcher.Error("failed to scan detection exception", err, map[string]any{"process": "plugin_com.hivearmor.config"})
		}
		conds := make([]DetectionExceptionCond, 0)
		if strings.TrimSpace(conditionsJSON) != "" {
			if err := json.Unmarshal([]byte(conditionsJSON), &conds); err != nil {
				_ = catcher.Error("failed to unmarshal exception conditions", err, map[string]any{"id": id, "process": "plugin_com.hivearmor.config"})
				continue
			}
		}
		ex := DetectionException{
			ID:         id,
			RuleID:     ruleID,
			Active:     true,
			Conditions: conds,
		}
		if title.Valid {
			ex.Title = title.String
		}
		out = append(out, ex)
	}
	return out, nil
}

func writeExceptionsTo(rulesRoot string, exceptions []DetectionException) error {
	folder := filepath.Join(rulesRoot, "exceptions")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return catcher.Error("cannot create exceptions directory", err, map[string]any{"dir": folder})
	}
	path := filepath.Join(folder, "exceptions.yaml")
	file, err := os.Create(path)
	if err != nil {
		return catcher.Error("failed to create exceptions.yaml", err, map[string]any{"process": "plugin_com.hivearmor.config", "path": path})
	}
	defer func() {
		if cerr := file.Close(); cerr != nil {
			_ = catcher.Error("failed to close exceptions.yaml", cerr, map[string]any{"process": "plugin_com.hivearmor.config"})
		}
	}()

	payload := exceptionsFile{Exceptions: exceptions}
	if payload.Exceptions == nil {
		payload.Exceptions = []DetectionException{}
	}
	b, err := yaml.Marshal(payload)
	if err != nil {
		return catcher.Error("failed to marshal exceptions", err, map[string]any{"process": "plugin_com.hivearmor.config"})
	}
	if _, err := file.Write(b); err != nil {
		return catcher.Error("failed to write exceptions.yaml", err, map[string]any{"process": "plugin_com.hivearmor.config"})
	}
	return nil
}

func writeRulesTo(rulesRoot string, rules []Rule) error {
	hivearmorDir := filepath.Join(rulesRoot, "hivearmor")
	if err := os.MkdirAll(hivearmorDir, 0o755); err != nil {
		return catcher.Error("cannot create rules directory", err, map[string]any{"dir": hivearmorDir})
	}
	for _, rule := range rules {
		path := filepath.Join(hivearmorDir, fmt.Sprintf("%d.yaml", rule.Id))
		file, err := os.Create(path)
		if err != nil {
			return catcher.Error("failed to create file", err, map[string]any{"process": "plugin_com.hivearmor.config", "path": path})
		}
		bRule, err := yaml.Marshal([]Rule{rule})
		if err != nil {
			_ = file.Close()
			return catcher.Error("failed to marshal rule", err, map[string]any{"process": "plugin_com.hivearmor.config"})
		}
		_, werr := file.Write(bRule)
		cerr := file.Close()
		if werr != nil {
			return catcher.Error("failed to write to file", werr, map[string]any{"process": "plugin_com.hivearmor.config"})
		}
		if cerr != nil {
			return catcher.Error("failed to close file", cerr, map[string]any{"process": "plugin_com.hivearmor.config"})
		}
	}
	return nil
}

func cleanUpRulesIn(rulesRoot string, rules []Rule) error {
	hivearmorDir := filepath.Join(rulesRoot, "hivearmor")
	if err := os.MkdirAll(hivearmorDir, 0o755); err != nil {
		return catcher.Error("cannot create rules directory", err, map[string]any{"dir": hivearmorDir})
	}
	files, err := listFiles(hivearmorDir)
	if err != nil {
		return err
	}
	keep := map[string]struct{}{}
	for _, rule := range rules {
		keep[filepath.Join(hivearmorDir, fmt.Sprintf("%d.yaml", rule.Id))] = struct{}{}
	}
	for _, file := range files {
		if _, ok := keep[file]; ok {
			continue
		}
		if err := os.Remove(file); err != nil {
			return fmt.Errorf("failed to remove file: %v", err)
		}
	}
	return nil
}

func syncTenantWorkdirs(db *sql.DB) error {
	ids, err := listDetectionTenantIDs(db)
	if err != nil {
		return err
	}
	for _, id := range ids {
		rules, err := getRulesForTenant(db, id)
		if err != nil {
			return err
		}
		exceptions, err := getActiveExceptionsForTenant(db, id)
		if err != nil {
			return err
		}
		root := TenantRulesDir(plugins.WorkDir, id)
		if err := cleanUpRulesIn(root, rules); err != nil {
			return err
		}
		if err := writeRulesTo(root, rules); err != nil {
			return err
		}
		if err := writeExceptionsTo(root, exceptions); err != nil {
			return err
		}
	}
	return nil
}
