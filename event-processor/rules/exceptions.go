package rules

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hivearmor/sdk/plugins"
	"gopkg.in/yaml.v3"
)

// BaselineAnomalyRuleID is the synthetic exception ruleId for statistical baseline
// anomaly alerts (enterprise/baseline). Baseline has no correlation-rule row; FP packs
// bind to this stable key and use existing condition fields (host/user/dataSource/action).
// Example YAML: ruleId: "baseline:anomaly" with host.name / dataSource conditions.
const BaselineAnomalyRuleID = "baseline:anomaly"

// DetectionException is an active FP suppression loaded from config-plugin YAML (DET-FP-001).
// Enforcement is pre-alert: matching events never call buildAlert / sequence alertFn /
// graph emit / baseline alertFn.
type DetectionException struct {
	ID         int64                `yaml:"id" json:"id"`
	RuleID     string               `yaml:"ruleId" json:"ruleId"`
	Title      string               `yaml:"title,omitempty" json:"title,omitempty"`
	Active     bool                 `yaml:"active" json:"active"`
	Conditions []ExceptionCondition `yaml:"conditions" json:"conditions"`
}

// ExceptionCondition is a single field/operator/value predicate (AND within an exception).
type ExceptionCondition struct {
	Field    string `yaml:"field" json:"field"`
	Operator string `yaml:"operator" json:"operator"`
	Value    string `yaml:"value" json:"value"`
}

type exceptionsFile struct {
	Exceptions []DetectionException `yaml:"exceptions"`
}

var (
	exceptionsMu       sync.RWMutex
	exceptionsByRule   = map[string][]DetectionException{}
	exceptionsLoaded   int
	exceptionsLastLoad time.Time

	exceptionsSuppressed atomic.Uint64
)

// ExceptionCounters returns DET-FP / DET-OBS exception observability.
func ExceptionCounters() (suppressed uint64, activeCount int, lastLoad time.Time) {
	exceptionsMu.RLock()
	defer exceptionsMu.RUnlock()
	return exceptionsSuppressed.Load(), exceptionsLoaded, exceptionsLastLoad
}

// LoadExceptionsFromFile replaces the in-memory active-exception index.
// Inactive / draft rows must not be present in the file (config plugin filters active=true).
func LoadExceptionsFromFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			setExceptions(nil)
			return nil
		}
		return err
	}
	var file exceptionsFile
	if err := yaml.Unmarshal(data, &file); err != nil {
		return fmt.Errorf("parse exceptions: %w", err)
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
	setExceptions(active)
	return nil
}

func loadExceptionsAlongsideRules(rulesDirectory string) {
	path := filepath.Join(rulesDirectory, "exceptions", "exceptions.yaml")
	if err := LoadExceptionsFromFile(path); err != nil {
		fmt.Fprintf(os.Stderr, "rules: failed to load exceptions from %s: %v\n", path, err)
		setExceptions(nil)
	}
}

func setExceptions(list []DetectionException) {
	next := map[string][]DetectionException{}
	for _, ex := range list {
		key := strings.TrimSpace(ex.RuleID)
		next[key] = append(next[key], ex)
	}
	exceptionsMu.Lock()
	exceptionsByRule = next
	exceptionsLoaded = len(list)
	exceptionsLastLoad = time.Now().UTC()
	exceptionsMu.Unlock()
}

// ExceptionMatches returns true when any active exception for ruleID matches the event (AND conditions).
func ExceptionMatches(ruleID string, event *plugins.Event) bool {
	if event == nil || strings.TrimSpace(ruleID) == "" {
		return false
	}
	exceptionsMu.RLock()
	candidates := exceptionsByRule[ruleID]
	exceptionsMu.RUnlock()
	if len(candidates) == 0 {
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

// SuppressIfMatched returns true when an active exception matches, and increments
// exceptionsSuppressed (shared OBS counter for CEL / sequence / graph / baseline paths).
func SuppressIfMatched(ruleID string, event *plugins.Event) bool {
	if !ExceptionMatches(ruleID, event) {
		return false
	}
	exceptionsSuppressed.Add(1)
	return true
}

// SuppressBaselineIfMatched is SuppressIfMatched for the synthetic baseline anomaly key.
func SuppressBaselineIfMatched(event *plugins.Event) bool {
	return SuppressIfMatched(BaselineAnomalyRuleID, event)
}

// SuppressIfMatchedID is SuppressIfMatched for numeric rule IDs.
func SuppressIfMatchedID(id int64, event *plugins.Event) bool {
	return SuppressIfMatched(ruleIDKey(id), event)
}

// RuleIDKey formats a numeric rule ID the same way exception packs and sequence rules do.
func RuleIDKey(id int64) string {
	return ruleIDKey(id)
}

// ReplaceExceptionsForTest replaces the in-memory active-exception index (unit tests only).
func ReplaceExceptionsForTest(list []DetectionException) {
	setExceptions(list)
}

func exceptionAllMatch(conds []ExceptionCondition, fields map[string]string) bool {
	if len(conds) == 0 {
		return false
	}
	for _, c := range conds {
		if !exceptionCondMatch(c, fields) {
			return false
		}
	}
	return true
}

func exceptionCondMatch(c ExceptionCondition, fields map[string]string) bool {
	field := strings.TrimSpace(c.Field)
	op := strings.ToLower(strings.TrimSpace(c.Operator))
	want := c.Value
	if field == "" || op == "" {
		return false
	}
	got, ok := lookupExceptionField(fields, field)
	switch op {
	case "is":
		return ok && strings.EqualFold(got, want)
	case "is_not":
		return !ok || !strings.EqualFold(got, want)
	case "contains":
		return ok && strings.Contains(strings.ToLower(got), strings.ToLower(want))
	case "starts_with":
		return ok && strings.HasPrefix(strings.ToLower(got), strings.ToLower(want))
	case "ends_with":
		return ok && strings.HasSuffix(strings.ToLower(got), strings.ToLower(want))
	case "in":
		if !ok {
			return false
		}
		for _, part := range strings.Split(want, ",") {
			if strings.EqualFold(got, strings.TrimSpace(part)) {
				return true
			}
		}
		return false
	default:
		// Unknown operators fail closed (do not suppress).
		return false
	}
}

func lookupExceptionField(fields map[string]string, field string) (string, bool) {
	if v, ok := fields[field]; ok {
		return v, true
	}
	if alias, ok := exceptionFieldAliases[field]; ok {
		if v, ok2 := fields[alias]; ok2 {
			return v, true
		}
	}
	return "", false
}

// ECS-ish UI fields → event-processor flat keys used by exceptionFieldMap.
var exceptionFieldAliases = map[string]string{
	"host.name":         "origin.host",
	"host":              "origin.host",
	"user.name":         "origin.user",
	"user":              "origin.user",
	"source.ip":         "origin.ip",
	"source.host":       "origin.host",
	"source.user":       "origin.user",
	"destination.ip":    "target.ip",
	"destination.host":  "target.host",
	"destination.user":  "target.user",
	"target.host":       "target.host",
	"target.user":       "target.user",
	"target.ip":         "target.ip",
	"origin.host":       "origin.host",
	"origin.user":       "origin.user",
	"origin.ip":         "origin.ip",
}

func exceptionFieldMap(e *plugins.Event) map[string]string {
	out := map[string]string{
		"dataType":   e.DataType,
		"dataSource": e.DataSource,
		"action":     e.Action,
	}
	if e.Origin != nil {
		out["origin.host"] = e.Origin.Host
		out["origin.user"] = e.Origin.User
		out["origin.ip"] = e.Origin.Ip
		out["origin.process"] = e.Origin.Process
		out["host.name"] = e.Origin.Host
		out["user.name"] = e.Origin.User
		out["source.ip"] = e.Origin.Ip
	}
	if e.Target != nil {
		out["target.host"] = e.Target.Host
		out["target.user"] = e.Target.User
		out["target.ip"] = e.Target.Ip
		out["destination.host"] = e.Target.Host
		out["destination.ip"] = e.Target.Ip
	}
	for k, v := range e.Log {
		if v == nil {
			continue
		}
		out["log."+k] = fmt.Sprint(v.AsInterface())
	}
	return out
}

func ruleIDKey(id int64) string {
	return strconv.FormatInt(id, 10)
}
