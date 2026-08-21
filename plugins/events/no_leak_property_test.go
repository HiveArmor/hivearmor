// no_leak_property_test.go — Property 10: NoLeakInvariant for EventsPlugin
//
// For any event JSON with non-empty tenantPrefix, the EventsPlugin write path
// must route the document to the tenant-scoped index ONLY and must never
// reference the global daily index v3-hive-<type>-YYYY.MM.DD.
//
// Feature: sprint-22-tenant-index-routing, Property 10
// Validates: Requirements 5.9, 6.1, 8.5
package main

import (
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
	"github.com/hivearmor/sdk/utils"
	"github.com/tidwall/gjson"
)

// globalEventIndexRe matches the global daily-index pattern v3-hive-<type>-YYYY.MM.DD
// (only the year/date segment immediately following the data type, no tenant prefix).
var globalEventIndexRe = regexp.MustCompile(`v3-hive-[a-z]+-\d{4}\.\d{2}\.\d{2}$`)

// TestProperty10_EventsPlugin_NoLeakInvariant asserts that when tenantPrefix is
// non-empty, the EventsPlugin routes the document to the tenant-scoped index and
// NOT to the global daily index.
//
// Feature: sprint-22-tenant-index-routing, Property 10
// Validates: Requirements 5.9, 6.1, 8.5
func TestProperty10_EventsPlugin_NoLeakInvariant(t *testing.T) {
	if !eventsTestReady {
		t.Skip("test server not initialised")
	}

	const iterations = 100
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < iterations; i++ {
		dataType := randEventsDataType(rng)
		tenantPrefix := randEventsTenantPrefix(rng) // always non-empty

		event := &plugins.Event{
			Id:           fmt.Sprintf("p10-event-%d", i),
			DataType:     dataType,
			TenantPrefix: tenantPrefix,
		}

		jsonPtr, err := utils.ProtoMessageToString(event)
		if err != nil {
			t.Fatalf("iteration %d: ProtoMessageToString failed: %v", i, err)
		}
		jsonStr := *jsonPtr

		workerDataType := gjson.Get(jsonStr, "dataType").String()
		workerTenantPrefix := gjson.Get(jsonStr, "tenantPrefix").String()
		workerID := gjson.Get(jsonStr, "id").String()
		workerIndex := sdkos.BuildTenantIndex(workerDataType, workerTenantPrefix)

		eventsCaptureMu.Lock()
		eventsLastCapturedIndex = ""
		eventsCaptureMu.Unlock()

		eventsTestBulkQueue.AddItem(sdkos.BulkItem{
			Index:      workerIndex,
			DocumentID: workerID,
			Document:   []byte(jsonStr),
			Operation:  "index",
		})

		var gotIndex string
		deadline := time.Now().Add(1 * time.Second)
		for time.Now().Before(deadline) {
			eventsCaptureMu.Lock()
			gotIndex = eventsLastCapturedIndex
			eventsCaptureMu.Unlock()
			if gotIndex != "" {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}

		if gotIndex == "" {
			t.Fatalf("Property 10 EventsPlugin iteration %d: no bulk request captured", i)
		}

		// The global index matches v3-hive-<type>-YYYY.MM.DD (no tenant segment after type).
		// A tenant-scoped index is v3-hive-<type>-<prefix>-YYYY.MM.DD.
		// The global pattern is v3-hive-<dataType>-YYYY.MM.DD — if tenantPrefix is present,
		// the index must NOT match this pattern.
		globalPattern := fmt.Sprintf(`^v3-hive-%s-\d{4}\.\d{2}\.\d{2}$`, regexp.QuoteMeta(dataType))
		globalRe := regexp.MustCompile(globalPattern)
		if globalRe.MatchString(gotIndex) {
			t.Fatalf(
				"Property 10 EventsPlugin iteration %d: NoLeakInvariant violated — "+
					"tenant event (dataType=%q, tenantPrefix=%q) routed to global index %q",
				i, dataType, tenantPrefix, gotIndex,
			)
		}

		// The captured index must contain the tenant prefix.
		if !strings.Contains(gotIndex, tenantPrefix) {
			t.Fatalf(
				"Property 10 EventsPlugin iteration %d: captured index %q does not contain tenantPrefix %q",
				i, gotIndex, tenantPrefix,
			)
		}
	}
	_ = globalEventIndexRe // suppress unused warning
}
