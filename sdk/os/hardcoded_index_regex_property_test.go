// hardcoded_index_regex_property_test.go — Property 12: HardcodedIndexRegex-zero invariant
//
// Walks the plugins/ file tree and sdk/os/ file tree, asserting that the
// regex v3-hive-[a-z]+-[0-9]{4} appears zero times in plugin source files
// and only in comment blocks or _test.go files within sdk/os/.
//
// Fixed-input test (not random). Runs under go test -short.
// Feature: sprint-22-tenant-index-routing, Property 12
// Validates: Requirements 6.5, 6.6
package os_test

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// hardcodedIndexRe is the regex that must NOT appear in production plugin source.
var hardcodedIndexRe = regexp.MustCompile(`v3-hive-[a-z]+-[0-9]{4}`)

// repoRoot returns the repository root by walking up from this file's directory.
// The test file lives at sdk/os/; the repo root is two levels up.
func repoRoot(t *testing.T) string {
	t.Helper()
	// This file lives at <repo>/sdk/os/hardcoded_index_regex_property_test.go
	// Runtime working directory during tests is the package directory.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("cannot determine working directory: %v", err)
	}
	// Walk up to find the repo root (directory that contains both sdk/ and plugins/)
	dir := cwd
	for i := 0; i < 5; i++ {
		if dirHasBoth(dir, "sdk", "plugins") {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatalf("cannot locate repository root from %s", cwd)
	return ""
}

func dirHasBoth(base string, a, b string) bool {
	fi1, e1 := os.Stat(filepath.Join(base, a))
	fi2, e2 := os.Stat(filepath.Join(base, b))
	return e1 == nil && fi1.IsDir() && e2 == nil && fi2.IsDir()
}

// TestProperty12_HardcodedIndexRegexZeroInvariant asserts:
//
//  1. Under plugins/, every .go file contains zero lines matching
//     v3-hive-[a-z]+-[0-9]{4}.
//
//  2. Under sdk/os/, matches may only appear in:
//     - files whose name ends in _test.go
//     - non-test lines that start with // (comment blocks in tenant_index.go)
func TestProperty12_HardcodedIndexRegexZeroInvariant(t *testing.T) {
	// Feature: sprint-22-tenant-index-routing, Property 12
	root := repoRoot(t)

	pluginsDir := filepath.Join(root, "plugins")
	sdkOsDir := filepath.Join(root, "sdk", "os")

	// --- Gate 1: plugins/ must have zero matches ---
	t.Run("plugins_zero_matches", func(t *testing.T) {
		violations := walkAndFind(t, pluginsDir, func(path, line string) bool {
			return hardcodedIndexRe.MatchString(line)
		})
		if len(violations) > 0 {
			for _, v := range violations {
				t.Errorf("hardcoded index pattern found: %s", v)
			}
		}
	})

	// --- Gate 2: sdk/os/ matches only in test files or comment lines ---
	t.Run("sdk_os_allowed_only_in_tests_and_comments", func(t *testing.T) {
		violations := walkAndFind(t, sdkOsDir, func(path, line string) bool {
			if !hardcodedIndexRe.MatchString(line) {
				return false // no match — not a violation
			}
			// Allowed: file is a _test.go
			if strings.HasSuffix(path, "_test.go") {
				return false
			}
			// Allowed: line is a comment (after trimming leading whitespace)
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "//") {
				return false
			}
			// Everything else is a violation
			return true
		})
		if len(violations) > 0 {
			for _, v := range violations {
				t.Errorf("disallowed hardcoded index in sdk/os/ non-test non-comment: %s", v)
			}
		}
	})
}

// walkAndFind walks dir recursively, opens every .go file, and calls predicate
// on each line.  Returns a slice of "<path>:<linenum>: <line>" for violations.
func walkAndFind(t *testing.T, dir string, predicate func(path, line string) bool) []string {
	t.Helper()
	var violations []string

	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".go") {
			return nil
		}

		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		lineNum := 0
		for scanner.Scan() {
			lineNum++
			text := scanner.Text()
			if predicate(path, text) {
				violations = append(violations, formatViolation(path, lineNum, text))
			}
		}
		return nil
	})
	if err != nil {
		t.Logf("walkAndFind: walk error (non-fatal): %v", err)
	}
	return violations
}

func formatViolation(path string, lineNum int, line string) string {
	return path + ":" + itoa(lineNum) + ": " + strings.TrimSpace(line)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
