package rules

import (
	"os"
	"path/filepath"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

var (
	mu               sync.RWMutex
	byType           = map[string][]*Rule{}
	graphOffenseList []*Rule
	lastLoad         time.Time
	rulesDir         string
)

// Init sets the rules directory and performs an initial load.
func Init(dir string) {
	rulesDir = dir
	reload()
	go watchLoop()
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
	newMap := map[string][]*Rule{}
	var newGraphOffense []*Rule

	addRule := func(r *Rule) {
		r.Normalize()
		if r.IsGraphOffense() {
			newGraphOffense = append(newGraphOffense, r)
			return
		}
		for _, dt := range r.DataTypes {
			newMap[dt] = append(newMap[dt], r)
		}
	}

	err := filepath.Walk(rulesDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
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
		// Rule files may be a single Rule or a list of Rules
		var single Rule
		if err := yaml.Unmarshal(data, &single); err == nil && single.Name != "" {
			addRule(&single)
			return nil
		}
		var list []Rule
		if err := yaml.Unmarshal(data, &list); err == nil {
			for i := range list {
				addRule(&list[i])
			}
		}
		return nil
	})
	if err != nil {
		return
	}
	mu.Lock()
	byType = newMap
	graphOffenseList = newGraphOffense
	lastLoad = time.Now()
	mu.Unlock()
}
