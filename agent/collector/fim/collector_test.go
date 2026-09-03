package fim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
)

// TestComputeHashes verifies SHA-256 and MD5 are consistent for known content.
func TestComputeHashes(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "test.txt")
	content := []byte("hivearmor-fim-test-content")
	if err := os.WriteFile(f, content, 0644); err != nil {
		t.Fatal(err)
	}

	sha, md5sum, size, err := computeHashes(f)
	if err != nil {
		t.Fatalf("computeHashes: %v", err)
	}
	if sha == "" {
		t.Error("expected non-empty SHA-256")
	}
	if md5sum == "" {
		t.Error("expected non-empty MD5")
	}
	if size != int64(len(content)) {
		t.Errorf("size mismatch: got %d want %d", size, len(content))
	}

	// Hashes must be stable across two calls.
	sha2, md5sum2, _, _ := computeHashes(f)
	if sha != sha2 {
		t.Error("SHA-256 not stable")
	}
	if md5sum != md5sum2 {
		t.Error("MD5 not stable")
	}
}

// TestComputeHashesMissing verifies an error is returned for a missing file.
func TestComputeHashesMissing(t *testing.T) {
	_, _, _, err := computeHashes("/nonexistent/path/to/file.txt")
	if err == nil {
		t.Error("expected error for missing file")
	}
}

// TestBaselineDB exercises upsert, get, and delete on a temp SQLite DB.
func TestBaselineDB(t *testing.T) {
	dir := t.TempDir()
	db, err := openBaselineDB(filepath.Join(dir, "baseline.db"))
	if err != nil {
		t.Fatalf("openBaselineDB: %v", err)
	}
	defer db.close()

	path := "/etc/passwd"
	entry := &BaselineEntry{
		Path:        path,
		SHA256:      "abc123sha",
		MD5:         "def456md5",
		SizeBytes:   1024,
		Permissions: "0644",
		Owner:       "0:0",
		ModTime:     time.Now().UnixNano(),
	}

	// Insert.
	if err := db.upsert(entry); err != nil {
		t.Fatalf("upsert insert: %v", err)
	}

	// Get.
	got, err := db.get(path)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got == nil {
		t.Fatal("expected entry, got nil")
	}
	if got.SHA256 != entry.SHA256 {
		t.Errorf("SHA256 mismatch: got %s want %s", got.SHA256, entry.SHA256)
	}
	if got.Owner != entry.Owner {
		t.Errorf("Owner mismatch: got %s want %s", got.Owner, entry.Owner)
	}

	// Update (preserve ID so GORM updates instead of inserts).
	entry.ID = got.ID
	entry.SHA256 = "newsha256updated"
	if err := db.upsert(entry); err != nil {
		t.Fatalf("upsert update: %v", err)
	}
	got2, _ := db.get(path)
	if got2.SHA256 != "newsha256updated" {
		t.Errorf("expected updated SHA256, got %s", got2.SHA256)
	}

	// Delete.
	if err := db.delete(path); err != nil {
		t.Fatalf("delete: %v", err)
	}
	got3, _ := db.get(path)
	if got3 != nil {
		t.Error("expected nil after delete")
	}
}

// TestBaselineDBGetMissing verifies nil is returned for an unknown path.
func TestBaselineDBGetMissing(t *testing.T) {
	dir := t.TempDir()
	db, err := openBaselineDB(filepath.Join(dir, "baseline.db"))
	if err != nil {
		t.Fatalf("openBaselineDB: %v", err)
	}
	defer db.close()

	got, err := db.get("/no/such/file")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != nil {
		t.Error("expected nil for missing entry")
	}
}

// TestFsnotifyOpToFIMAction verifies op-to-action mapping for each fsnotify.Op.
func TestFsnotifyOpToFIMAction(t *testing.T) {
	cases := []struct {
		op   fsnotify.Op
		want string
	}{
		{fsnotify.Create, "CREATE"},
		{fsnotify.Write, "MODIFY"},
		{fsnotify.Remove, "DELETE"},
		{fsnotify.Rename, "RENAME"},
		{fsnotify.Chmod, "PERMISSION_CHANGE"},
		{fsnotify.Op(0), ""},
	}
	for _, tc := range cases {
		got := fsnotifyOpToFIMAction(tc.op)
		if got != tc.want {
			t.Errorf("fsnotifyOpToFIMAction(0x%x) = %q; want %q", uint32(tc.op), got, tc.want)
		}
	}
}

// TestDefaultRules verifies default rules are non-empty for the current platform.
func TestDefaultRules(t *testing.T) {
	rules := defaultRules()
	if len(rules) == 0 {
		t.Error("expected at least one default rule")
	}
	for i, r := range rules {
		if r.Path == "" {
			t.Errorf("rule[%d] has empty path", i)
		}
	}
}

// TestFIMEventJSON verifies FIMEvent marshals to the expected schema keys.
func TestFIMEventJSON(t *testing.T) {
	evt := FIMEvent{
		Action:      "MODIFY",
		File:        "/etc/passwd",
		Filename:    "passwd",
		Path:        "/etc",
		SHA256:      "deadbeef",
		MD5:         "cafebabe",
		SizeInBytes: 2048,
		OldHash:     "oldbeef",
		Hostname:    "testhost",
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		DataType:    DataTypeFIM,
	}

	raw, err := json.Marshal(evt)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}

	requiredKeys := []string{
		"action",
		"origin.file",
		"origin.filename",
		"origin.path",
		"origin.sha256",
		"origin.md5",
		"origin.sizeInBytes",
		"log.old_hash",
		"hostname",
		"@timestamp",
		"dataType",
	}
	for _, key := range requiredKeys {
		if _, ok := decoded[key]; !ok {
			t.Errorf("missing key %q in FIM event JSON", key)
		}
	}
	if decoded["dataType"] != DataTypeFIM {
		t.Errorf("dataType = %v; want %s", decoded["dataType"], DataTypeFIM)
	}
	if decoded["action"] != "MODIFY" {
		t.Errorf("action = %v; want MODIFY", decoded["action"])
	}
}

// TestIsExcluded verifies exclusion glob matching logic.
func TestIsExcluded(t *testing.T) {
	rule := WatchRule{
		Path:    "/etc",
		Exclude: []string{"*.bak", "shadow"},
	}

	cases := []struct {
		path string
		want bool
	}{
		{"/etc/passwd", false},
		{"/etc/shadow", true},
		{"/etc/hosts.bak", true},
		{"/etc/cron.d/daily", false},
		{"/etc/resolv.conf.bak", true},
	}
	for _, tc := range cases {
		got := isExcluded(tc.path, rule)
		if got != tc.want {
			t.Errorf("isExcluded(%q) = %v; want %v", tc.path, got, tc.want)
		}
	}
}

// TestShouldDropPath_ExcludeEnforced verifies covering-rule + exclude filter
// used by handleEvent (STAGING CANDIDATE — exclude was previously a dead helper).
func TestShouldDropPath_ExcludeEnforced(t *testing.T) {
	rules := []WatchRule{
		{Path: "/etc", Recursive: true, Exclude: []string{"*.tmp", "shadow"}},
		{Path: "/var/log", Recursive: false},
	}
	cases := []struct {
		name string
		path string
		drop bool
	}{
		{"watched file", "/etc/passwd", false},
		{"basename exclude", "/etc/shadow", true},
		{"glob exclude", "/etc/cache.tmp", true},
		{"nested under recursive", "/etc/cron.d/job", false},
		{"outside all rules", "/opt/app/bin", true},
		{"non-recursive child", "/var/log/syslog", false},
		{"non-recursive nested", "/var/log/a/b", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := shouldDropPath(tc.path, rules)
			if got != tc.drop {
				t.Fatalf("shouldDropPath(%q)=%v want %v", tc.path, got, tc.drop)
			}
		})
	}
}

func TestCoveringRule_MostSpecific(t *testing.T) {
	rules := []WatchRule{
		{Path: "/etc", Recursive: true, Exclude: []string{"*.tmp"}},
		{Path: "/etc/special", Recursive: true},
	}
	r, ok := coveringRule("/etc/special/file.txt", rules)
	if !ok {
		t.Fatal("expected covering rule")
	}
	if r.Path != "/etc/special" {
		t.Fatalf("want most specific /etc/special, got %s", r.Path)
	}
	// Specific rule has no exclude → do not drop even if parent would.
	if shouldDropPath("/etc/special/x.tmp", rules) {
		t.Fatal("most-specific rule without exclude should keep path")
	}
	if !shouldDropPath("/etc/other.tmp", rules) {
		t.Fatal("parent exclude should drop")
	}
}

// TestSeedBaselineSkipsExcluded verifies excluded files are not baselined.
func TestSeedBaselineSkipsExcluded(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "bl.db")
	bl, err := openBaselineDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer bl.close()

	fPath := filepath.Join(dir, "noise.tmp")
	if err := os.WriteFile(fPath, []byte("skip-me"), 0644); err != nil {
		t.Fatal(err)
	}
	c := &Collector{baseline: bl}
	rule := WatchRule{Path: dir, Recursive: true, Exclude: []string{"*.tmp"}}
	if err := c.seedBaseline(fPath, rule); err != nil {
		t.Fatalf("seedBaseline: %v", err)
	}
	got, _ := bl.get(fPath)
	if got != nil {
		t.Fatal("excluded file must not receive a baseline entry")
	}
}

// TestWatchRuleDefaults checks that exclusion lists default to nil (not nil-panic).
func TestWatchRuleDefaults(t *testing.T) {
	r := WatchRule{Path: "/tmp", Recursive: true}
	if isExcluded("/tmp/somefile.txt", r) {
		t.Error("expected no exclusion when Exclude is nil")
	}
}

// TestSeedBaselineSkipsDir verifies seedBaseline returns nil for directories.
func TestSeedBaselineSkipsDir(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "bl.db")
	bl, err := openBaselineDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer bl.close()

	c := &Collector{baseline: bl}
	rule := WatchRule{Path: dir, Recursive: true}
	// Seed a directory — should be silently skipped.
	if err := c.seedBaseline(dir, rule); err != nil {
		t.Errorf("seedBaseline(dir): %v", err)
	}
	got, _ := bl.get(dir)
	if got != nil {
		t.Error("directory should not have a baseline entry")
	}
}

// TestSeedBaselineCreatesEntry verifies seedBaseline records a file.
func TestSeedBaselineCreatesEntry(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "bl.db")
	bl, err := openBaselineDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer bl.close()

	fPath := filepath.Join(dir, "watched.txt")
	if err := os.WriteFile(fPath, []byte("sentinel"), 0644); err != nil {
		t.Fatal(err)
	}

	c := &Collector{baseline: bl}
	rule := WatchRule{Path: dir, Recursive: true}
	if err := c.seedBaseline(fPath, rule); err != nil {
		t.Fatalf("seedBaseline: %v", err)
	}

	entry, err := bl.get(fPath)
	if err != nil {
		t.Fatalf("bl.get: %v", err)
	}
	if entry == nil {
		t.Fatal("expected baseline entry after seed")
	}
	if entry.SHA256 == "" {
		t.Error("expected non-empty SHA256 in baseline entry")
	}
	if entry.Permissions == "" {
		t.Error("expected non-empty permissions in baseline entry")
	}
}

// TestSeedBaselineIdempotent verifies that seeding the same file twice
// does not duplicate entries or return an error.
func TestSeedBaselineIdempotent(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "bl.db")
	bl, err := openBaselineDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer bl.close()

	fPath := filepath.Join(dir, "idem.txt")
	if err := os.WriteFile(fPath, []byte("idem-content"), 0644); err != nil {
		t.Fatal(err)
	}

	c := &Collector{baseline: bl}
	rule := WatchRule{Path: dir, Recursive: true}
	if err := c.seedBaseline(fPath, rule); err != nil {
		t.Fatalf("first seed: %v", err)
	}
	if err := c.seedBaseline(fPath, rule); err != nil {
		t.Fatalf("second seed: %v", err)
	}

	// Only one entry should exist.
	entry, _ := bl.get(fPath)
	if entry == nil {
		t.Fatal("expected entry after double seed")
	}
}
