package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: yamlcheck <dir>")
		os.Exit(1)
	}
	dir := os.Args[1]
	failed := false
	_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		ext := strings.ToLower(filepath.Ext(p))
		if ext != ".yml" && ext != ".yaml" {
			return nil
		}
		data, readErr := os.ReadFile(p)
		if readErr != nil {
			fmt.Printf("  FAIL (read) %s: %v\n", p, readErr)
			failed = true
			return nil
		}
		var v interface{}
		if yamlErr := yaml.Unmarshal(data, &v); yamlErr != nil {
			fmt.Printf("  FAIL %s:\n       %v\n", p, yamlErr)
			failed = true
		} else {
			fmt.Printf("  OK   %s\n", p)
		}
		return nil
	})
	if failed {
		os.Exit(1)
	}
}
