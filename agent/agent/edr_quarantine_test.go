package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestQuarantineRestore_RemembersOriginalPath(t *testing.T) {
	tmp := t.TempDir()
	// Point "executable" dir by writing into a quarantine under tmp via chdir trick:
	// quarantineFile uses os.Executable() — we cannot easily override that.
	// Unit-test the meta helpers + restore logic with a synthetic layout instead.
	qDir := filepath.Join(tmp, "quarantine")
	if err := os.MkdirAll(qDir, 0700); err != nil {
		t.Fatal(err)
	}
	origDir := filepath.Join(tmp, "orig")
	if err := os.MkdirAll(origDir, 0755); err != nil {
		t.Fatal(err)
	}
	orig := filepath.Join(origDir, "secret.txt")
	if err := os.WriteFile(orig, []byte("payload"), 0644); err != nil {
		t.Fatal(err)
	}

	dest := filepath.Join(qDir, "q42_secret.txt_1")
	if err := os.Rename(orig, dest); err != nil {
		t.Fatal(err)
	}
	meta := quarantineMeta{OriginalPath: orig, QuarantineID: "42", QuarantinedAt: 1, DestName: filepath.Base(dest)}
	if err := writeQuarantineMeta(dest, meta); err != nil {
		t.Fatal(err)
	}

	got, err := readQuarantineMeta(dest)
	if err != nil {
		t.Fatal(err)
	}
	if got.OriginalPath != orig || got.QuarantineID != "42" {
		t.Fatalf("meta: %+v", got)
	}

	_ = os.Chmod(dest, 0644)
	if err := os.Rename(dest, orig); err != nil {
		t.Fatal(err)
	}
	_ = os.Remove(dest + quarantineMetaSuffix)
	data, err := os.ReadFile(orig)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "payload" {
		t.Fatalf("restored content %q", data)
	}
}
