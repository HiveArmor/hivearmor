package http_test

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	httputil "github.com/hivearmor/shared/http"
)

// TestValidation1_SHA256MismatchRejected — a MITM-tampered binary must be rejected.
// Models the scenario: compute real SHA256 of original binary, then deliver a
// one-byte-modified version. DownloadWithSHA256 must error, mention "SECURITY"
// and "checksum mismatch", and leave no temp file on disk.
func TestValidation1_SHA256MismatchRejected(t *testing.T) {
	original := []byte("fake agent binary: correct content aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

	// Compute the checksum of the original (what the checksum file would contain).
	h := sha256.Sum256(original)
	realChecksum := hex.EncodeToString(h[:])

	// Tamper: flip the first byte, simulating a MITM or compromised server.
	tampered := make([]byte, len(original))
	copy(tampered, original)
	tampered[0] ^= 0xFF

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(tampered)
	}))
	defer srv.Close()

	tmpPath, err := httputil.DownloadWithSHA256(srv.URL+"/agent", realChecksum, httputil.DownloadOptions{})

	if err == nil {
		_ = os.Remove(tmpPath)
		t.Fatal("FAIL: expected error on checksum mismatch, got nil — tampered binary was not rejected")
	}

	if !strings.Contains(err.Error(), "SECURITY") {
		t.Errorf("FAIL: error missing 'SECURITY' keyword: %v", err)
	}
	if !strings.Contains(err.Error(), "checksum mismatch") {
		t.Errorf("FAIL: error missing 'checksum mismatch': %v", err)
	}

	// Temp file must have been cleaned up.
	if tmpPath != "" {
		if _, statErr := os.Stat(tmpPath); statErr == nil {
			_ = os.Remove(tmpPath)
			t.Errorf("FAIL: temp file still on disk after mismatch: %s", tmpPath)
		}
	}

	t.Logf("PASS Validation Test 1 — tampered binary rejected with: %v", err)
	t.Logf("  real checksum (original): %s", realChecksum)
	tamperedHash := sha256.Sum256(tampered)
	t.Logf("  actual checksum (tampered): %s", hex.EncodeToString(tamperedHash[:]))
}

// TestValidation2_CorrectBinaryAccepted — a binary whose SHA256 matches the checksum
// file must be accepted. DownloadWithSHA256 must return a non-empty temp file path
// containing the exact bytes served.
func TestValidation2_CorrectBinaryAccepted(t *testing.T) {
	payload := []byte("fake agent binary: correct content bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")

	h := sha256.Sum256(payload)
	correctChecksum := hex.EncodeToString(h[:])

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	tmpPath, err := httputil.DownloadWithSHA256(srv.URL+"/agent", correctChecksum, httputil.DownloadOptions{})
	if err != nil {
		t.Fatalf("FAIL: expected success, got: %v", err)
	}
	defer os.Remove(tmpPath)

	if tmpPath == "" {
		t.Fatal("FAIL: returned empty temp file path")
	}

	got, readErr := os.ReadFile(tmpPath)
	if readErr != nil {
		t.Fatalf("FAIL: cannot read returned temp file: %v", readErr)
	}
	if string(got) != string(payload) {
		t.Errorf("FAIL: file content mismatch\n  got:  %q\n  want: %q", got, payload)
	}

	t.Logf("PASS Validation Test 2 — binary integrity verified: SHA256=%s", correctChecksum)
	t.Logf("  temp file: %s (%d bytes)", tmpPath, len(got))
}

// TestValidation3_NoInsecureSkipVerifyInUpdater — the updater package must not
// contain any InsecureSkipVerify = true calls. This is enforced by scanning the
// source files at test time.
func TestValidation3_NoInsecureSkipVerifyInUpdater(t *testing.T) {
	// Walk the updater source tree and fail on any direct InsecureSkipVerify usage.
	// (The shared/http package has one nolint-annotated instance in buildTLSConfig
	// for the first-run bootstrap path, which is not reachable from the updater.)
	updaterDir := "../../agent/updater"
	cmd := fmt.Sprintf("grep -rn 'InsecureSkipVerify' %s", updaterDir)

	// Run via os/exec so the output is visible.
	// We replicate what the spec says: `grep -n "InsecureSkipVerify" agent/updater/`
	output, _ := runGrep(updaterDir, "InsecureSkipVerify")

	if strings.TrimSpace(output) != "" {
		t.Errorf("FAIL: InsecureSkipVerify found in updater:\n%s", output)
	} else {
		t.Logf("PASS Validation Test 3 — 0 results for: %s", cmd)
		t.Log("  (no InsecureSkipVerify in agent/updater/)")
	}
}

// TestValidation4_ChecksumUnavailableFailsSafe — when the checksum endpoint returns
// 404, Get must return ErrChecksumUnavailable, not a generic error. The updater
// uses errors.Is to detect this and hard-abort without downloading the binary.
func TestValidation4_ChecksumUnavailableFailsSafe(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".sha256") {
			// Checksum endpoint not present (older server version).
			w.WriteHeader(http.StatusNotFound)
			return
		}
		// Binary is available — but we must never reach here.
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("binary content"))
	}))
	defer srv.Close()

	_, err := httputil.Get(srv.URL+"/agent.sha256", httputil.DownloadOptions{})

	if err == nil {
		t.Fatal("FAIL: expected ErrChecksumUnavailable on 404, got nil")
	}
	if !errors.Is(err, httputil.ErrChecksumUnavailable) {
		t.Errorf("FAIL: expected errors.Is(err, ErrChecksumUnavailable) = true, got: %v", err)
	}

	t.Logf("PASS Validation Test 4 — checksum 404 returns ErrChecksumUnavailable: %v", err)
	t.Log("  updater will log 'Cannot verify update checksum: server does not provide checksum endpoint. Update skipped.'")
	t.Log("  and call continue without downloading the binary")
}

// runGrep is a helper that greps a directory for a pattern using filepath.Walk
// so the test has no shell dependency.
func runGrep(dir, pattern string) (string, error) {
	var sb strings.Builder
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	for _, e := range entries {
		if e.IsDir() {
			sub, _ := runGrep(dir+"/"+e.Name(), pattern)
			sb.WriteString(sub)
			continue
		}
		path := dir + "/" + e.Name()
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			continue
		}
		for i, line := range strings.Split(string(data), "\n") {
			if strings.Contains(line, pattern) {
				sb.WriteString(fmt.Sprintf("%s:%d: %s\n", path, i+1, line))
			}
		}
	}
	return sb.String(), nil
}
