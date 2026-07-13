package pipeline

import (
	"os"
	"path/filepath"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// filterFile is the on-disk format of a filter YAML.
type filterFile struct {
	Pipeline []PipelineBlock `yaml:"pipeline"`
}

var (
	mu        sync.RWMutex
	byType    = map[string][]PipelineBlock{} // dataType → blocks
	lastLoad  time.Time
	filterDir string
)

// Init sets the directory to watch and performs an initial load.
func Init(dir string) {
	filterDir = dir
	reload()
	go watchLoop()
}

// GetBlocks returns all pipeline blocks that match dataType.
func GetBlocks(dataType string) []PipelineBlock {
	mu.RLock()
	defer mu.RUnlock()
	return byType[dataType]
}

func watchLoop() {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for range tick.C {
		reload()
	}
}

func reload() {
	newMap := map[string][]PipelineBlock{}
	filepath.WalkDir(filterDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		ext := filepath.Ext(d.Name())
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		var ff filterFile
		if err := yaml.Unmarshal(data, &ff); err != nil {
			return nil
		}
		for _, block := range ff.Pipeline {
			for _, dt := range block.DataTypes {
				newMap[dt] = append(newMap[dt], block)
			}
		}
		return nil
	})
	mu.Lock()
	byType = newMap
	lastLoad = time.Now()
	mu.Unlock()
}
