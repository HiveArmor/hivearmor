package rules

import (
	"os"
	"path/filepath"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

var (
	mu       sync.RWMutex
	byType   = map[string][]*Rule{}
	lastLoad time.Time
	rulesDir string
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

// AllRules returns all loaded rules.
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

func watchLoop() {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for range tick.C {
		reload()
	}
}

func reload() {
	newMap := map[string][]*Rule{}
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
			single.Normalize()
			for _, dt := range single.DataTypes {
				newMap[dt] = append(newMap[dt], &single)
			}
			return nil
		}
		var list []Rule
		if err := yaml.Unmarshal(data, &list); err == nil {
			for i := range list {
				r := &list[i]
				r.Normalize()
				for _, dt := range r.DataTypes {
					newMap[dt] = append(newMap[dt], r)
				}
			}
		}
		return nil
	})
	if err != nil {
		return
	}
	mu.Lock()
	byType = newMap
	lastLoad = time.Now()
	mu.Unlock()
}
