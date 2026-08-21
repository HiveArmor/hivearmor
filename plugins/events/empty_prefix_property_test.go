// empty_prefix_property_test.go — Property 11: EventsPlugin empty-prefix fallback
//
// For any event JSON with tenantPrefix == "", the EventsPlugin write path
// must route the document to the global daily index, which must equal
// sdkos.BuildCurrentDayIndex(dataType) byte-for-byte.
//
// Feature: sprint-22-tenant-index-routing, Property 11
// Validates: Requirements 6.3
package main

import (
	"fmt"
	"math/rand"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
	"github.com/hivearmor/sdk/utils"
	"github.com/tidwall/gjson"
)

// TestProperty11_EventsPlugin_EmptyPrefixFallback asserts that when tenantPrefix
// is empty the EventsPlugin write path produces the same global daily index as
// sdkos.BuildCurrentDayIndex(dataType), preserving pre-sprint behaviour.
//
// Feature: sprint-22-tenant-index-routing, Property 11
// Validates: Requirements 6.3
func TestProperty11_EventsPlugin_EmptyPrefixFallback(t *testing.T) {
	if !eventsTestReady {
		t.Skip("test server not initialised")
	}

	const iterations = 100
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + 200))

	for i := 0; i < iterations; i++ {
		dataType := randEventsDataType(rng)

		event := &plugins.Event{
			Id:           fmt.Sprintf("p11-event-%d", i),
			DataType:     dataType,
			TenantPrefix: "", // empty — must fall back to global daily index
		}

		jsonPtr, err := utils.ProtoMessageToString(event)
		if err != nil {
			t.Fatalf("iteration %d: ProtoMessageToString failed: %v", i, err)
		}
		jsonStr := *jsonPtr

		workerDataType := gjson.Get(jsonStr, "dataType").String()
		workerTenantPrefix := gjson.Get(jsonStr, "tenantPrefix").String() // ""
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
			t.Fatalf("Property 11 EventsPlugin iteration %d: no bulk request captured", i)
		}

		expected := sdkos.BuildCurrentDayIndex(dataType)
		if gotIndex != expected {
			t.Fatalf(
				"Property 11 EventsPlugin iteration %d: captured _index %q != sdkos.BuildCurrentDayIndex(%q) = %q",
				i, gotIndex, dataType, expected,
			)
		}
	}
}
