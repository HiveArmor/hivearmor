package cis

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/shared/fs"
)

// SCAP content is shipped and versioned OUT-OF-BAND, NOT baked into the binary
// (SPEC-PT-5 constraint). The engine resolves content from a directory tree:
//
//	<exe>/scap-content/<profile>.xml
//
// overridable via HIVEARMOR_SCAP_CONTENT_DIR for packaging/testing. A profile maps
// to exactly one datastream/XCCDF file; a missing file means the profile's content
// has not been distributed to this host yet — the engine reports parsed-only for CIS
// rather than inventing a scan.

// EnvScapContentDir overrides the default SCAP content directory.
const EnvScapContentDir = "HIVEARMOR_SCAP_CONTENT_DIR"

const scapContentSubdir = "scap-content"

// ContentDir returns the resolved SCAP content directory (env override or default).
func ContentDir() string {
	if dir := strings.TrimSpace(os.Getenv(EnvScapContentDir)); dir != "" {
		return dir
	}
	return filepath.Join(fs.GetExecutablePath(), scapContentSubdir)
}

// contentFileFor returns the SCAP datastream path for a profile, or empty when the
// profile name is unsafe or the file is absent. The profile name is sanitised to a
// single path element to prevent traversal from a policy value.
func contentFileFor(profile string) string {
	p := sanitizeProfile(profile)
	if p == "" {
		return ""
	}
	path := filepath.Join(ContentDir(), p+".xml")
	if !fileReadable(path) {
		return ""
	}
	return path
}

// sanitizeProfile keeps only a safe filename element from a profile string. Any path
// separator, traversal or control char yields an empty (rejected) name.
func sanitizeProfile(profile string) string {
	p := strings.TrimSpace(profile)
	if p == "" {
		return ""
	}
	// Reject anything that is not a conservative profile token.
	for _, r := range p {
		if !(r == '-' || r == '_' || r == '.' ||
			(r >= '0' && r <= '9') ||
			(r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z')) {
			utils.Logger.ErrorF("cis: rejecting unsafe profile name %q", p)
			return ""
		}
	}
	// A leading dot or ".." is never a valid profile file.
	if strings.HasPrefix(p, ".") {
		return ""
	}
	return p
}

func fileReadable(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	f, err := os.Open(path) //nolint:gosec // path is sanitized, under content dir
	if err != nil {
		return false
	}
	_ = f.Close()
	return true
}

// contentHash returns a short sha256 of the content file so the backend can tell
// which content version produced a result. Best-effort — an unreadable file yields
// an empty hash rather than an error (the scan still records what it ran).
func contentHash(path string) string {
	if path == "" {
		return ""
	}
	f, err := os.Open(path) //nolint:gosec // path is sanitized, under content dir
	if err != nil {
		return ""
	}
	defer func() { _ = f.Close() }()
	h := sha256.New()
	if _, err := io.Copy(h, io.LimitReader(f, 64<<20)); err != nil {
		return ""
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// hasContentForProfile reports whether SCAP content is present for the profile.
func hasContentForProfile(profile string) bool {
	return contentFileFor(profile) != ""
}

// errNoContent is returned when a scan is requested for a profile with no content.
func errNoContent(profile string) error {
	return fmt.Errorf("cis: no SCAP content for profile %q in %s", profile, ContentDir())
}
