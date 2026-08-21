package geo

import (
	"os"
	"testing"
)

func TestInitWithEmptyPath(t *testing.T) {
	// Reset package state
	Close()

	err := Init("")
	if err != nil {
		t.Fatalf("Init(\"\") returned non-nil error: %v", err)
	}

	loc := Lookup("8.8.8.8")
	if loc.Country != "Unknown" {
		t.Errorf("expected Country=\"Unknown\", got %q", loc.Country)
	}
	if loc.CountryCode != "XX" {
		t.Errorf("expected CountryCode=\"XX\", got %q", loc.CountryCode)
	}
}

func TestInitWithNonExistentFile(t *testing.T) {
	// Reset package state
	Close()

	err := Init("/does/not/exist.mmdb")
	if err != nil {
		t.Fatalf("Init(\"/does/not/exist.mmdb\") returned non-nil error: %v", err)
	}

	loc := Lookup("8.8.8.8")
	if loc.Country != "Unknown" {
		t.Errorf("expected Country=\"Unknown\", got %q", loc.Country)
	}
	if loc.CountryCode != "XX" {
		t.Errorf("expected CountryCode=\"XX\", got %q", loc.CountryCode)
	}
}

func TestInitWithInvalidFile(t *testing.T) {
	// Reset package state
	Close()

	// Create a temp file with invalid (non-MMDB) content
	tmpFile, err := os.CreateTemp("", "invalid-*.mmdb")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString("this is not a valid mmdb file"); err != nil {
		t.Fatalf("failed to write to temp file: %v", err)
	}
	tmpFile.Close()

	initErr := Init(tmpFile.Name())
	if initErr != nil {
		t.Fatalf("Init(invalidFile) returned non-nil error: %v", initErr)
	}

	loc := Lookup("8.8.8.8")
	if loc.Country != "Unknown" {
		t.Errorf("expected Country=\"Unknown\", got %q", loc.Country)
	}
	if loc.CountryCode != "XX" {
		t.Errorf("expected CountryCode=\"XX\", got %q", loc.CountryCode)
	}
}

func TestLookupInvalidIP(t *testing.T) {
	// Reset package state
	Close()

	loc := Lookup("not-an-ip")
	if loc.Country != "Unknown" {
		t.Errorf("expected Country=\"Unknown\", got %q", loc.Country)
	}
	if loc.CountryCode != "XX" {
		t.Errorf("expected CountryCode=\"XX\", got %q", loc.CountryCode)
	}
}

func TestLookupEmptyString(t *testing.T) {
	// Reset package state
	Close()

	loc := Lookup("")
	if loc.Country != "Unknown" {
		t.Errorf("expected Country=\"Unknown\", got %q", loc.Country)
	}
	if loc.CountryCode != "XX" {
		t.Errorf("expected CountryCode=\"XX\", got %q", loc.CountryCode)
	}
}
