package rules

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/hivearmor/sdk/plugins"
	"gopkg.in/yaml.v3"
)

// TenantRulesDir is $WORK_DIR/tenants/{id}/rules (DET-MSSP-002).
func TenantRulesDir(workDir, tenantID string) string {
	id := strings.TrimSpace(tenantID)
	if id == "" {
		return ""
	}
	return filepath.Join(workDir, "tenants", id, "rules")
}

type tenantTree struct {
	byType           map[string][]*Rule
	exceptionsByRule map[string][]DetectionException
}

var (
	tenantTreesMu sync.RWMutex
	tenantTrees   = map[string]*tenantTree{}
)

func ResetTenantTreesForTest() {
	tenantTreesMu.Lock()
	tenantTrees = map[string]*tenantTree{}
	tenantTreesMu.Unlock()
}

// BindTenantTree loads $WORK_DIR/tenants/{id}/rules when that tree exists.
// Missing workdirs are a no-op so tenant packs stay REST-visible without
// engine enforcement. Does not mutate the shared LoadReport / platform maps.
func BindTenantTree(workDir, tenantID string) error {
	id := strings.TrimSpace(tenantID)
	if id == "" || id == "0" {
		return nil
	}
	dir := TenantRulesDir(workDir, id)
	if dir == "" {
		return nil
	}
	info, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			forgetTenantTree(id)
			return nil
		}
		return err
	}
	if !info.IsDir() {
		return nil
	}
	tree, err := loadTenantTree(dir)
	if err != nil {
		return err
	}
	tenantTreesMu.Lock()
	tenantTrees[id] = tree
	tenantTreesMu.Unlock()
	return nil
}

func forgetTenantTree(tenantID string) {
	tenantTreesMu.Lock()
	delete(tenantTrees, tenantID)
	tenantTreesMu.Unlock()
}

func loadTenantTree(dir string) (*tenantTree, error) {
	tree := &tenantTree{
		byType:           map[string][]*Rule{},
		exceptionsByRule: map[string][]DetectionException{},
	}
	err := filepath.Walk(dir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info == nil {
			return nil
		}
		if info.IsDir() {
			if info.Name() == "exceptions" {
				return filepath.SkipDir
			}
			return nil
		}
		ext := filepath.Ext(path)
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		var single Rule
		if err := yaml.Unmarshal(data, &single); err == nil && single.Name != "" {
			addTenantRule(tree, &single)
			return nil
		}
		var list []Rule
		if err := yaml.Unmarshal(data, &list); err == nil && len(list) > 0 {
			for i := range list {
				if list[i].Name == "" {
					continue
				}
				addTenantRule(tree, &list[i])
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	excPath := filepath.Join(dir, "exceptions", "exceptions.yaml")
	exceptions, err := parseExceptionsFile(excPath)
	if err != nil {
		return nil, err
	}
	for _, ex := range exceptions {
		key := strings.TrimSpace(ex.RuleID)
		tree.exceptionsByRule[key] = append(tree.exceptionsByRule[key], ex)
	}
	return tree, nil
}

func addTenantRule(tree *tenantTree, r *Rule) {
	r.Normalize()
	if err := compileRule(r); err != nil {
		return
	}
	if r.IsGraphOffense() || r.HasSequence() {
		return
	}
	if len(r.DataTypes) == 0 {
		return
	}
	for _, dt := range r.DataTypes {
		tree.byType[dt] = append(tree.byType[dt], r)
	}
}

func parseExceptionsFile(path string) ([]DetectionException, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var file exceptionsFile
	if err := yaml.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("parse tenant exceptions: %w", err)
	}
	active := make([]DetectionException, 0, len(file.Exceptions))
	for _, ex := range file.Exceptions {
		if !ex.Active {
			continue
		}
		if strings.TrimSpace(ex.RuleID) == "" || len(ex.Conditions) == 0 {
			continue
		}
		active = append(active, ex)
	}
	return active, nil
}

// GetRulesForEvent returns platform rules plus the bound tenant overlay.
func GetRulesForEvent(event *plugins.Event) []*Rule {
	if event == nil {
		return nil
	}
	platform := GetRules(event.DataType)
	overlay := tenantRulesFor(event.TenantId, event.DataType)
	if len(overlay) == 0 {
		return platform
	}
	out := make([]*Rule, 0, len(platform)+len(overlay))
	out = append(out, platform...)
	out = append(out, overlay...)
	return out
}

func tenantRulesFor(tenantID, dataType string) []*Rule {
	tree := lookupTenantTree(tenantID)
	if tree == nil {
		return nil
	}
	return tree.byType[dataType]
}

func tenantExceptionMatches(ruleID string, event *plugins.Event) bool {
	if event == nil {
		return false
	}
	tree := lookupTenantTree(event.TenantId)
	if tree == nil {
		return false
	}
	return exceptionListMatches(tree.exceptionsByRule[ruleID], event)
}

func lookupTenantTree(tenantID string) *tenantTree {
	id := strings.TrimSpace(tenantID)
	if id == "" || id == "0" {
		return nil
	}
	tenantTreesMu.RLock()
	defer tenantTreesMu.RUnlock()
	return tenantTrees[id]
}

func exceptionListMatches(candidates []DetectionException, event *plugins.Event) bool {
	if len(candidates) == 0 || event == nil {
		return false
	}
	fields := exceptionFieldMap(event)
	for _, ex := range candidates {
		if exceptionAllMatch(ex.Conditions, fields) {
			return true
		}
	}
	return false
}
