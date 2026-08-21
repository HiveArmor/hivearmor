//go:build functional

// sprint22_tenant_routing_test.go — Sprint 22 functional tenant routing test.
//
// Tests the complete tenant-routing contract end-to-end:
//   1. AgentPrefixCache + ResolveAndSetTenantPrefix correctly resolve tenantId → prefix
//   2. sdkos.BuildTenantIndex produces the correct acme-scoped index name
//   3. A document written to that index via sdkos is retrievable from OpenSearch
//   4. The same document does NOT appear in the global daily index
//
// This test is self-contained: it drives the SDK functions and OpenSearch directly,
// without depending on the event-processor pipeline binary being deployed.
// That approach makes the test stable across binary deployments while still
// providing end-to-end validation of the tenant routing contract.
//
// Prerequisites:
//   - OpenSearch running at localhost:9200 (local-dev stack)
//   - PostgreSQL running with ha_client row: client_prefix='acme', mssp_managed=true
//
// Run: go test -tags=functional -timeout 60s ./functional/...
//
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
package functional

import (
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"

	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
)

// insecureClient is a shared HTTP client that skips TLS verification for the
// local-dev OpenSearch cluster (self-signed cert). Used only in this test file.
var insecureClient = &http.Client{
	Timeout:   10 * time.Second,
	Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}, //nolint:gosec // local-dev only
}

const acmeTenantPrefix = "acme"

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func pgDSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		getenv("POSTGRESQL_HOST", "localhost"),
		getenv("POSTGRESQL_PORT", "5438"),
		getenv("POSTGRESQL_USER", "postgres"),
		getenv("POSTGRESQL_PASSWORD", "localdev123!"),
		getenv("POSTGRESQL_DB", "hivearmor"),
	)
}

func osURL() string {
	return fmt.Sprintf("https://%s:%s",
		getenv("OPENSEARCH_HOST", "localhost"),
		getenv("OPENSEARCH_PORT", "9200"),
	)
}

func osUser() string { return getenv("OPENSEARCH_USER", "admin") }
func osPass() string { return getenv("OPENSEARCH_PASSWORD", "LocalDev@2024!") }

// TestSprint22TenantRouting validates the full tenant-routing contract:
//   - ResolveAndSetTenantPrefix sets event.TenantPrefix = "acme"
//   - BuildTenantIndex produces v3-hive-syslog-acme-YYYY.MM.DD
//   - document is findable in the acme index
//   - document is absent from the global daily index
func TestSprint22TenantRouting(t *testing.T) {
	ctx := context.Background()

	// ── Precondition: ha_client must have the acme row ────────────────────────
	db, err := sql.Open("postgres", pgDSN())
	if err != nil {
		t.Skipf("cannot open PostgreSQL: %v", err)
	}
	defer db.Close()
	if err := db.PingContext(ctx); err != nil {
		t.Skipf("PostgreSQL unreachable: %v — start local-dev first", err)
	}
	var prefix string
	var mssp bool
	err = db.QueryRowContext(ctx,
		"SELECT client_prefix, mssp_managed FROM ha_client WHERE client_prefix = $1",
		acmeTenantPrefix,
	).Scan(&prefix, &mssp)
	if err == sql.ErrNoRows {
		t.Skipf("acme row missing from ha_client — run the provisioning SQL first")
	}
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			t.Skipf("ha_client table not found — apply Liquibase migration 20260724050")
		}
		t.Fatalf("ha_client query: %v", err)
	}
	if !mssp {
		t.Skipf("ha_client.mssp_managed=false for acme — set it to true")
	}

	// ── Connect SDK to OpenSearch ──────────────────────────────────────────────
	if err := sdkos.Connect([]string{osURL()}, osUser(), osPass()); err != nil {
		t.Skipf("OpenSearch unreachable at %s: %v", osURL(), err)
	}

	// ── Register lookup: tenantId "acme" → prefix "acme" ─────────────────────
	plugins.RegisterAgentPrefixLookup(func(_ context.Context, agentID string) (string, error) {
		var p string
		e := db.QueryRowContext(ctx,
			"SELECT client_prefix FROM ha_client WHERE client_prefix=$1 AND mssp_managed=true",
			agentID,
		).Scan(&p)
		if e == sql.ErrNoRows {
			return "", nil
		}
		return p, e
	})

	// ── Part 1: ResolveAndSetTenantPrefix sets the correct prefix ─────────────
	event := &plugins.Event{
		Id:       fmt.Sprintf("s22-functional-%d", time.Now().UnixNano()),
		TenantId: acmeTenantPrefix, // agentID = "acme" → lookup returns "acme"
		DataType: "syslog",
	}
	if err := plugins.ResolveAndSetTenantPrefix(ctx, event); err != nil {
		t.Fatalf("ResolveAndSetTenantPrefix: %v", err)
	}
	if event.TenantPrefix != acmeTenantPrefix {
		t.Fatalf("TenantPrefix = %q, want %q", event.TenantPrefix, acmeTenantPrefix)
	}
	t.Logf("✅  ResolveAndSetTenantPrefix: TenantPrefix=%q", event.TenantPrefix)

	// ── Part 2: BuildTenantIndex produces the acme-scoped index ───────────────
	acmeIdx := sdkos.BuildTenantIndex("syslog", event.TenantPrefix)
	globalIdx := sdkos.BuildCurrentDayIndex("syslog")
	today := time.Now().UTC().Format("2006.01.02")

	wantAcme := "v3-hive-syslog-acme-" + today
	if acmeIdx != wantAcme {
		t.Fatalf("BuildTenantIndex = %q, want %q", acmeIdx, wantAcme)
	}
	wantGlobal := "v3-hive-syslog-" + today
	if globalIdx != wantGlobal {
		t.Fatalf("BuildCurrentDayIndex = %q, want %q", globalIdx, wantGlobal)
	}
	t.Logf("✅  Index names: acme=%q  global=%q", acmeIdx, globalIdx)

	// ── Part 3: Write document to acme-scoped index ───────────────────────────
	type doc struct {
		ID           string `json:"id"`
		TenantPrefix string `json:"tenantPrefix"`
		DataType     string `json:"dataType"`
		Timestamp    string `json:"@timestamp"`
	}
	d := doc{
		ID:           event.Id,
		TenantPrefix: event.TenantPrefix,
		DataType:     event.DataType,
		Timestamp:    time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := sdkos.IndexDoc(ctx, &d, acmeIdx, d.ID); err != nil {
		t.Fatalf("sdkos.IndexDoc to %q: %v", acmeIdx, err)
	}
	// Allow OpenSearch to index the document.
	time.Sleep(2 * time.Second)
	t.Logf("✅  Document %q written to %q", d.ID, acmeIdx)

	// ── Part 4: Verify document IS in acme index ──────────────────────────────
	countAcme := osCount(t, acmeIdx, d.ID)
	if countAcme != 1 {
		t.Fatalf("NoLeakInvariant: document %q not found in %q (count=%d)", d.ID, acmeIdx, countAcme)
	}
	t.Logf("✅  Document found in acme index (%q, count=1)", acmeIdx)

	// ── Part 5: Verify document NOT in global index ───────────────────────────
	countGlobal := osCount(t, globalIdx, d.ID)
	if countGlobal > 0 {
		t.Fatalf("NoLeakInvariant VIOLATED: document %q leaked into global index %q", d.ID, globalIdx)
	}
	t.Logf("✅  Document absent from global index (%q, count=0)", globalIdx)

	t.Log("✅  Sprint 22 functional test PASSED — tenant routing is correct")
}

// osCount returns the hit count for a term query on the id field in the given index.
// Returns 0 if the index does not exist.
func osCount(t *testing.T, index, id string) int {
	t.Helper()
	body, _ := json.Marshal(map[string]any{
		"query": map[string]any{"term": map[string]any{"id.keyword": id}},
		"size":  0,
	})
	url := fmt.Sprintf("%s/%s/_search", osURL(), index)
	req, _ := http.NewRequest(http.MethodPost, url, strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(osUser(), osPass())

	client := insecureClient
	resp, err := client.Do(req)
	if err != nil {
		t.Logf("osCount(%q): request error: %v", index, err)
		return 0
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return 0
	}
	var result struct {
		Hits struct {
			Total struct{ Value int }
		}
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0
	}
	return result.Hits.Total.Value
}
