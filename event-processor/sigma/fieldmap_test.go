// Package sigma — unit tests for the FieldMap loader and Translate method.
//
// **Validates: Requirements 1.6, 1.7, 1.9**
package sigma

import (
	"strings"
	"testing"
)

// resolveBasePath returns the path from event-processor/sigma/ up to the
// event-processor/ directory, where sigma-fieldmap.yml lives.
// The test binary's working directory is event-processor/sigma/, so "../"
// is the event-processor/ root.
const basePath = "../"

// ---------------------------------------------------------------------------
// TestLoadFieldMap_CountAtLeast60
// ---------------------------------------------------------------------------

// TestLoadFieldMap_CountAtLeast60 asserts that the loaded fieldmap contains at
// least 60 entries, satisfying Requirement 1.1 and 1.9.
func TestLoadFieldMap_CountAtLeast60(t *testing.T) {
	fm, err := LoadFieldMap(basePath)
	if err != nil {
		t.Fatalf("LoadFieldMap(%q) returned unexpected error: %v", basePath, err)
	}
	if fm == nil {
		t.Fatal("LoadFieldMap returned nil FieldMap without error")
	}
	count := len(fm.Fieldmap)
	if count < 60 {
		t.Errorf("expected at least 60 field mappings, got %d", count)
	}
}

// ---------------------------------------------------------------------------
// TestTranslate_AnchorMappings
// ---------------------------------------------------------------------------

// TestTranslate_AnchorMappings verifies the eight anchor translations that
// Requirement 1.3 mandates be present verbatim.
func TestTranslate_AnchorMappings(t *testing.T) {
	fm, err := LoadFieldMap(basePath)
	if err != nil {
		t.Fatalf("LoadFieldMap(%q) returned unexpected error: %v", basePath, err)
	}

	anchors := []struct {
		sigmaField string
		ecsField   string
	}{
		{"CommandLine", "process.command_line"},
		{"EventID", "event.code"},
		{"DestinationIp", "destination.ip"},
		{"TargetFilename", "file.path"},
		{"QueryName", "dns.question.name"},
		{"ScriptBlockText", "powershell.script_block_text"},
		{"comm", "process.name"},
		{"eventName", "event.action"},
	}

	for _, tc := range anchors {
		t.Run(tc.sigmaField, func(t *testing.T) {
			got := fm.Translate(tc.sigmaField)
			if got != tc.ecsField {
				t.Errorf("Translate(%q) = %q, want %q", tc.sigmaField, got, tc.ecsField)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestTranslate_Passthrough
// ---------------------------------------------------------------------------

// TestTranslate_Passthrough verifies that an unknown field name is returned
// unchanged, satisfying Requirement 1.7.
func TestTranslate_Passthrough(t *testing.T) {
	fm, err := LoadFieldMap(basePath)
	if err != nil {
		t.Fatalf("LoadFieldMap(%q) returned unexpected error: %v", basePath, err)
	}

	unknowns := []string{
		"ThisFieldDoesNotExist",
		"",
		"randomGibberish_12345",
		"my.custom.field",
	}

	for _, field := range unknowns {
		t.Run(field, func(t *testing.T) {
			got := fm.Translate(field)
			if got != field {
				t.Errorf("Translate(%q) = %q, want %q (passthrough)", field, got, field)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestLoadFieldMap_MissingFileError
// ---------------------------------------------------------------------------

// TestLoadFieldMap_MissingFileError asserts that LoadFieldMap returns a non-nil
// error whose message contains the attempted path, satisfying Requirement 1.8.
func TestLoadFieldMap_MissingFileError(t *testing.T) {
	invalidPath := "/nonexistent/path/that/cannot/exist"
	fm, err := LoadFieldMap(invalidPath)
	if err == nil {
		t.Fatalf("LoadFieldMap(%q) expected an error but got none", invalidPath)
	}
	if fm != nil {
		t.Errorf("LoadFieldMap(%q) expected nil FieldMap on error, got non-nil", invalidPath)
	}
	// The error message must contain the file path so callers can diagnose failures.
	if !strings.Contains(err.Error(), invalidPath) {
		t.Errorf("error message %q does not contain the invalid path %q", err.Error(), invalidPath)
	}
}

// ---------------------------------------------------------------------------
// TestTranslate_AllKeys — Property 1: Fieldmap Translate coverage
// ---------------------------------------------------------------------------

// TestTranslate_AllKeys iterates every key present in the loaded fieldmap and
// asserts that Translate returns the expected mapped ECS value.
//
// **Property 1: Fieldmap Translate coverage**
// **Validates: Requirements 1.6, 1.9**
func TestTranslate_AllKeys(t *testing.T) {
	fm, err := LoadFieldMap(basePath)
	if err != nil {
		t.Fatalf("LoadFieldMap(%q) returned unexpected error: %v", basePath, err)
	}

	for sigmaField, wantECS := range fm.Fieldmap {
		sigmaField, wantECS := sigmaField, wantECS // capture loop vars
		t.Run(sigmaField, func(t *testing.T) {
			got := fm.Translate(sigmaField)
			if got != wantECS {
				t.Errorf("Translate(%q) = %q, want %q", sigmaField, got, wantECS)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestTranslate_UnknownPassthrough — Property 2: Fieldmap Translate passthrough
// ---------------------------------------------------------------------------

// TestTranslate_UnknownPassthrough calls Translate with a variety of made-up
// field names and asserts each is returned unchanged.
//
// **Property 2: Fieldmap Translate passthrough**
// **Validates: Requirements 1.7, 1.9**
func TestTranslate_UnknownPassthrough(t *testing.T) {
	fm, err := LoadFieldMap(basePath)
	if err != nil {
		t.Fatalf("LoadFieldMap(%q) returned unexpected error: %v", basePath, err)
	}

	// A batch of field names that are deliberately absent from sigma-fieldmap.yml.
	unknownFields := []string{
		"Xyzzy",
		"foo.bar.baz",
		"NOT_A_REAL_SIGMA_FIELD",
		"_internal_meta",
		"1234numeric",
		"camelCaseUnknown",
		"UPPER_CASE_UNKNOWN",
		"dotted.unknown.field",
		"hyphen-field",
		"unicode_σ_field",
	}

	for _, field := range unknownFields {
		field := field // capture
		t.Run(field, func(t *testing.T) {
			got := fm.Translate(field)
			if got != field {
				t.Errorf("Translate(%q) = %q, want %q (passthrough)", field, got, field)
			}
		})
	}
}
