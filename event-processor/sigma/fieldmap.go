// Package sigma provides Sigma rule field mapping and translation utilities
// for the HiveArmor event-processor.
//
// The FieldMap loaded here is a Go-only artefact; the Java backend never reads
// this file and stores raw Sigma YAML verbatim in the ha_sigma_rule table.
package sigma

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

const fieldmapFilename = "sigma-fieldmap.yml"

// FieldMap holds the Sigma field name → ECS field path translations loaded
// from sigma-fieldmap.yml.
type FieldMap struct {
	Fieldmap map[string]string `yaml:"fieldmap"`
}

// LoadFieldMap reads sigma-fieldmap.yml from basePath and returns a *FieldMap.
// If the file cannot be read or parsed, an error is returned whose message
// includes the resolved file path.
func LoadFieldMap(basePath string) (*FieldMap, error) {
	path := filepath.Join(basePath, fieldmapFilename)

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("sigma: failed to read field map file %q: %w", path, err)
	}

	var fm FieldMap
	if err := yaml.Unmarshal(data, &fm); err != nil {
		return nil, fmt.Errorf("sigma: failed to parse field map file %q: %w", path, err)
	}

	return &fm, nil
}

// Translate returns the ECS field path for the given Sigma field name.
// If no mapping is defined for fieldName, the input is returned unchanged.
func (fm *FieldMap) Translate(fieldName string) string {
	if fm == nil || fm.Fieldmap == nil {
		return fieldName
	}
	if mapped, ok := fm.Fieldmap[fieldName]; ok {
		return mapped
	}
	return fieldName
}
