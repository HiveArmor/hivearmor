package cmd

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestReadEnrollmentTokenFromStdin(t *testing.T) {
	got, err := readEnrollmentToken("-", strings.NewReader("  ha_enroll_test.secret\n"))
	if err != nil {
		t.Fatal(err)
	}
	if got != "ha_enroll_test.secret" {
		t.Fatalf("unexpected token %q", got)
	}
}

func TestReadEnrollmentTokenRejectsMissingSource(t *testing.T) {
	if _, err := readEnrollmentToken("", strings.NewReader("secret")); err == nil {
		t.Fatal("expected missing source to be rejected")
	}
}

func TestReadEnrollmentTokenFilePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission check")
	}
	dir := t.TempDir()
	protected := filepath.Join(dir, "protected-token")
	if err := os.WriteFile(protected, []byte("ha_enroll_test.secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readEnrollmentToken(protected, nil); err != nil {
		t.Fatalf("protected file rejected: %v", err)
	}
	exposed := filepath.Join(dir, "exposed-token")
	if err := os.WriteFile(exposed, []byte("ha_enroll_test.secret\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readEnrollmentToken(exposed, nil); err == nil {
		t.Fatal("expected exposed file permissions to be rejected")
	}
}
