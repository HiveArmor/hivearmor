package rules

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/hivearmor/event-processor/enterprise/sequence"
	"gopkg.in/yaml.v3"
)

const pilotPackDirName = "pilot"

var (
	mu               sync.RWMutex
	byType           = map[string][]*Rule{}
	graphOffenseList []*Rule
	lastLoad         time.Time
	rulesDir         string
	lastReport       LoadReport
)

// LoadReport is the compile-at-start inventory used by health and staging gates.
type LoadReport struct {
	Loaded         int       `json:"loaded"`
	Skipped        int       `json:"skipped"`
	Invalid        []string  `json:"invalid,omitempty"`
	PilotPackOK    bool      `json:"pilotPackOk"`
	PilotMissing   []string  `json:"pilotMissing,omitempty"`
	PilotRuleNames []string  `json:"pilotRuleNames,omitempty"`
	LastLoad       time.Time `json:"lastLoad"`
}

var requiredPilotRules = []string{
	"PILOT-WIN-PS-ENCODED",
	"PILOT-WIN-FAILED-LOGON",
	"PILOT-LIN-AUTH-FAIL",
}

// Init sets the rules directory and performs an initial load.
func Init(dir string) {
	rulesDir = dir
	reload()
	go watchLoop()
}

// LastLoadReport returns the most recent compile inventory.
func LastLoadReport() LoadReport {
	mu.RLock()
	defer mu.RUnlock()
	return lastReport
}

// GetRules returns all rules matching dataType.
func GetRules(dataType string) []*Rule {
	mu.RLock()
	defer mu.RUnlock()
	return byType[dataType]
}

// AllRules returns all loaded rules (excludes graph_offense rules).
func AllRules() []*Rule {
	mu.RLock()
	defer mu.RUnlock()
	var all []*Rule
	seen := map[int64]bool{}
	for _, rs := range byType {
		for _, r := range rs {
			if !seen[r.ID] {
				all = append(all, r)
				seen[r.ID] = true
			}
		}
	}
	return all
}

// GraphOffenseRules returns all loaded graph_offense rules.
func GraphOffenseRules() []*Rule {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]*Rule, len(graphOffenseList))
	copy(out, graphOffenseList)
	return out
}

// SequenceRules returns all loaded rules with sequence steps,
// converted to the sequence.SequenceRule format.
func SequenceRules() []sequence.SequenceRule {
	var result []sequence.SequenceRule
	for _, r := range AllRules() {
		if !r.HasSequence() {
			continue
		}
		sr := sequence.SequenceRule{
			ID:   fmt.Sprintf("%d", r.ID),
			Name: r.Name,
		}
		for _, step := range r.Sequence {
			d, _ := time.ParseDuration(step.Within)
			if d == 0 {
				d = 5 * time.Minute
			}
			sr.Steps = append(sr.Steps, sequence.StepDef{
				Where:  step.Where,
				Within: d,
			})
		}
		result = append(result, sr)
	}
	return result
}

func watchLoop() {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for range tick.C {
		reload()
	}
}

// Reload triggers an immediate out-of-band rules reload. Called by the webhook handler.
func Reload() error {
	reload()
	return nil
}

func reload() {
	report := LoadFromDir(rulesDir)
	mu.Lock()
	lastReport = report
	mu.Unlock()
	if !report.PilotPackOK && requiresPilotPack(rulesDir) {
		fmt.Fprintf(os.Stderr, "rules: pilot pack incomplete missing=%v invalid=%v\n", report.PilotMissing, report.Invalid)
	}
}

// LoadFromDir compiles HiveArmor CEL rules from dir. Sigma-style files without
// a `where` expression are skipped, not loaded as detections.
func LoadFromDir(dir string) LoadReport {
	newMap := map[string][]*Rule{}
	var newGraphOffense []*Rule
	report := LoadReport{}
	loadedNames := map[string]struct{}{}

	addRule := func(r *Rule, path string) {
		r.Normalize()
		if err := compileRule(r); err != nil {
			report.Skipped++
			report.Invalid = append(report.Invalid, fmt.Sprintf("%s: %v", filepath.Base(path), err))
			return
		}
		if r.IsGraphOffense() {
			newGraphOffense = append(newGraphOffense, r)
			report.Loaded++
			loadedNames[r.Name] = struct{}{}
			return
		}
		if len(r.DataTypes) == 0 {
			report.Skipped++
			report.Invalid = append(report.Invalid, fmt.Sprintf("%s: missing dataTypes", filepath.Base(path)))
			return
		}
		for _, dt := range r.DataTypes {
			newMap[dt] = append(newMap[dt], r)
		}
		report.Loaded++
		loadedNames[r.Name] = struct{}{}
	}

	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		ext := filepath.Ext(path)
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			report.Skipped++
			report.Invalid = append(report.Invalid, filepath.Base(path)+": read error")
			return nil
		}
		var single Rule
		if err := yaml.Unmarshal(data, &single); err == nil && single.Name != "" {
			addRule(&single, path)
			return nil
		}
		var list []Rule
		if err := yaml.Unmarshal(data, &list); err == nil && len(list) > 0 {
			for i := range list {
				if list[i].Name == "" {
					report.Skipped++
					continue
				}
				addRule(&list[i], path)
			}
			return nil
		}
		report.Skipped++
		return nil
	})

	for _, name := range requiredPilotRules {
		if _, ok := loadedNames[name]; ok {
			report.PilotRuleNames = append(report.PilotRuleNames, name)
			continue
		}
		if requiresPilotPack(dir) {
			report.PilotMissing = append(report.PilotMissing, name)
		}
	}
	if requiresPilotPack(dir) {
		report.PilotPackOK = len(report.PilotMissing) == 0
	} else {
		report.PilotPackOK = true
	}
	report.LastLoad = time.Now()

	mu.Lock()
	byType = newMap
	graphOffenseList = newGraphOffense
	lastLoad = report.LastLoad
	mu.Unlock()
	return report
}

func requiresPilotPack(dir string) bool {
	if strings.EqualFold(filepath.Base(dir), "pilot") {
		return true
	}
	_, err := os.Stat(filepath.Join(dir, "pilot"))
	return err == nil
}

func compileRule(r *Rule) error {
	if r == nil || strings.TrimSpace(r.Name) == "" {
		return fmt.Errorf("missing name")
	}
	if r.IsGraphOffense() {
		return nil
	}
	if r.HasSequence() {
		return nil
	}
	if strings.TrimSpace(r.Where) == "" {
		return fmt.Errorf("missing CEL where")
	}
	fixture := `{"id":"compile","@timestamp":"2026-01-01T00:00:00Z","dataType":"windows","dataSource":"compile","raw":"compile","action":"","actionResult":"","severity":0,"protocol":"","log":{"eventCode":4625,"eventId":"4625"},"origin":{"ip":"","host":"","user":"","process":"powershell.exe","command":""},"target":{"ip":"","host":"","user":""}}`
	_, err := getCEL().Evaluate(&fixture, r.Where)
	if err != nil {
		return fmt.Errorf("CEL compile: %w", err)
	}
	return nil
}
