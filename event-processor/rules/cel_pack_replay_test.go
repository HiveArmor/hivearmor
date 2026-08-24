package rules

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/hivearmor/sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

// celFixture is one synthetic event used by the CEL pack replay harness.
type celFixture struct {
	Rule        string `json:"rule"`
	Expect      string `json:"expect"` // "match" | "nomatch"
	Description string `json:"description"`
	Event       struct {
		ID         string         `json:"id"`
		DataType   string         `json:"dataType"`
		DataSource string         `json:"dataSource"`
		TenantID   string         `json:"tenantId"`
		Raw        string         `json:"raw"`
		Log        map[string]any `json:"log"`
		Origin     *struct {
			Host    string `json:"host"`
			IP      string `json:"ip"`
			User    string `json:"user"`
			Process string `json:"process"`
			Command string `json:"command"`
		} `json:"origin"`
	} `json:"event"`
}

func celFixturesDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	return filepath.Join(filepath.Dir(file), "fixtures", "cel")
}

// loadCelPackIntoEngine copies builtin cel-*.yaml rules into a temp dir and LoadFromDir.
func loadCelPackIntoEngine(t *testing.T) {
	t.Helper()
	root := builtinRulesDir(t)
	dirs := []string{
		filepath.Join(root, "windows"),
		filepath.Join(root, "linux"),
		filepath.Join(root, "network"),
		filepath.Join(root, "cloud", "aws"),
		filepath.Join(root, "cloud", "azure"),
	}

	tmp, err := os.MkdirTemp("", "cel-pack-replay-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(tmp) })

	copied := 0
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("read %s: %v", dir, err)
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			if !strings.HasPrefix(name, "cel-") || !strings.HasSuffix(name, ".yaml") {
				continue
			}
			src := filepath.Join(dir, name)
			data, err := os.ReadFile(src)
			if err != nil {
				t.Fatalf("read %s: %v", src, err)
			}
			if err := os.WriteFile(filepath.Join(tmp, name), data, 0o644); err != nil {
				t.Fatalf("copy %s: %v", name, err)
			}
			copied++
		}
	}
	if copied < 100 {
		t.Fatalf("expected at least 100 cel-*.yaml files to copy, got %d", copied)
	}

	report := LoadFromDir(tmp)
	if report.Loaded < 100 {
		t.Fatalf("expected at least 100 CEL rules, loaded=%d skipped=%d invalid=%v", report.Loaded, report.Skipped, report.Invalid)
	}
	if len(report.Invalid) > 0 {
		t.Fatalf("CEL pack compile errors: %v", report.Invalid)
	}
}

func fixtureToEvent(fx celFixture) (*plugins.Event, error) {
	ev := &plugins.Event{
		Id:         fx.Event.ID,
		DataType:   fx.Event.DataType,
		DataSource: fx.Event.DataSource,
		TenantId:   fx.Event.TenantID,
		Raw:        fx.Event.Raw,
	}
	if len(fx.Event.Log) > 0 {
		logMap := make(map[string]*structpb.Value, len(fx.Event.Log))
		for k, v := range fx.Event.Log {
			sv, err := structpb.NewValue(v)
			if err != nil {
				return nil, err
			}
			logMap[k] = sv
		}
		ev.Log = logMap
	}
	if fx.Event.Origin != nil {
		ev.Origin = &plugins.Side{
			Host:    fx.Event.Origin.Host,
			Ip:      fx.Event.Origin.IP,
			User:    fx.Event.Origin.User,
			Process: fx.Event.Origin.Process,
			Command: fx.Event.Origin.Command,
		}
	}
	return ev, nil
}

// TestCelPack_fixtureReplay loads the CEL pack and asserts each fixture event
// matches (or does not match) the named rule via Evaluate.
func TestCelPack_fixtureReplay(t *testing.T) {
	snapshotRules(t)
	loadCelPackIntoEngine(t)

	dir := celFixturesDir(t)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read fixtures: %v", err)
	}

	var fixtures []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		fixtures = append(fixtures, filepath.Join(dir, e.Name()))
	}
	if len(fixtures) < 10 {
		t.Fatalf("expected at least 10 CEL fixtures, found %d in %s", len(fixtures), dir)
	}

	for _, path := range fixtures {
		path := path
		name := filepath.Base(path)
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read: %v", err)
			}
			var fx celFixture
			if err := json.Unmarshal(data, &fx); err != nil {
				t.Fatalf("json: %v", err)
			}
			if fx.Rule == "" {
				t.Fatal("fixture missing rule")
			}
			expect := strings.ToLower(strings.TrimSpace(fx.Expect))
			if expect != "match" && expect != "nomatch" {
				t.Fatalf("expect must be match|nomatch, got %q", fx.Expect)
			}

			ev, err := fixtureToEvent(fx)
			if err != nil {
				t.Fatalf("event: %v", err)
			}
			alerts := Evaluate(ev)
			got := containsRule(alerts, fx.Rule)
			switch expect {
			case "match":
				if !got {
					t.Fatalf("expected rule %s to match (%s); alerts=%v", fx.Rule, fx.Description, alertNames(alerts))
				}
			case "nomatch":
				if got {
					t.Fatalf("expected rule %s not to match (%s)", fx.Rule, fx.Description)
				}
			}
		})
	}
}
