// validate-schema — validates that every rule YAML file in a directory tree
// conforms to the HiveArmor rule schema.
//
// Usage (from repo root):
//
//	cd event-processor && go run ./cmd/validate-schema/ --rules ../rules/
//
// Required per rule file:
//   - name         (string, non-empty)
//   - dataTypes    (sequence, at least one element)
//   - category     (string, non-empty)
//   - impact       (map with confidentiality/integrity/availability)
//   - where        (string, non-empty)  — OR sequence / riskScore
//
// List-format rule files (array at root) are validated entry-by-entry.
// Test fixtures (*.test.yml) are skipped.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ruleDoc mirrors the shape of a rule YAML without requiring the full type set.
type ruleDoc struct {
	Name      string         `yaml:"name"`
	DataTypes []string       `yaml:"dataTypes"`
	Category  string         `yaml:"category"`
	Impact    map[string]any `yaml:"impact"`
	Where     string         `yaml:"where"`
	RiskScore int            `yaml:"riskScore"`
	Sequence  []any          `yaml:"sequence"`
}

func (r *ruleDoc) violations() []string {
	var v []string
	if strings.TrimSpace(r.Name) == "" {
		v = append(v, "missing or empty 'name'")
	}
	if len(r.DataTypes) == 0 {
		v = append(v, "missing or empty 'dataTypes'")
	}
	if strings.TrimSpace(r.Category) == "" {
		v = append(v, "missing or empty 'category'")
	}
	if r.Impact == nil {
		v = append(v, "missing 'impact' block")
	} else {
		for _, sub := range []string{"confidentiality", "integrity", "availability"} {
			if _, ok := r.Impact[sub]; !ok {
				v = append(v, fmt.Sprintf("impact missing '%s'", sub))
			}
		}
	}
	hasEval := strings.TrimSpace(r.Where) != "" || r.RiskScore > 0 || len(r.Sequence) > 0
	if !hasEval {
		v = append(v, "must have at least one of: 'where', 'riskScore', 'sequence'")
	}
	if len(r.Sequence) == 1 {
		v = append(v, "'sequence' rules require at least 2 steps")
	}
	return v
}

func validateFile(path string) (int, int) {
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("  ✗ %s: cannot read: %v\n", path, err)
		return 0, 1
	}

	// Try list format first.
	var list []ruleDoc
	var single ruleDoc
	isList := false

	if err := yaml.Unmarshal(data, &list); err == nil && len(list) > 0 {
		// Non-nil map at first element means it really is a list of rules.
		if list[0].Name != "" || len(list[0].DataTypes) > 0 {
			isList = true
		}
	}
	if !isList {
		if err := yaml.Unmarshal(data, &single); err != nil {
			fmt.Printf("  ✗ %s: YAML parse error: %v\n", path, err)
			return 0, 1
		}
		list = []ruleDoc{single}
	}

	filePassed, fileFailed := 0, 0
	for i, rule := range list {
		label := path
		if isList {
			label = fmt.Sprintf("%s[%d]", path, i)
		}
		if viols := rule.violations(); len(viols) > 0 {
			fmt.Printf("  ✗ %s (%q):\n", label, rule.Name)
			for _, v := range viols {
				fmt.Printf("      – %s\n", v)
			}
			fileFailed++
		} else {
			fmt.Printf("  ✓ %s (%q)\n", label, rule.Name)
			filePassed++
		}
	}
	return filePassed, fileFailed
}

func main() {
	rulesDir := flag.String("rules", "../rules", "root directory containing rule YAML files")
	flag.Parse()

	var paths []string
	err := filepath.WalkDir(*rulesDir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(p))
		if ext != ".yml" && ext != ".yaml" {
			return nil
		}
		if strings.HasSuffix(p, ".test.yml") {
			return nil
		}
		paths = append(paths, p)
		return nil
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot walk %q: %v\n", *rulesDir, err)
		os.Exit(1)
	}
	if len(paths) == 0 {
		fmt.Printf("No rule files found under %q\n", *rulesDir)
		return
	}

	totalPassed, totalFailed := 0, 0
	for _, p := range paths {
		p2, f := validateFile(p)
		totalPassed += p2
		totalFailed += f
	}

	fmt.Printf("\nSchema validation: %d passed, %d failed\n", totalPassed, totalFailed)
	if totalFailed > 0 {
		os.Exit(1)
	}
}
