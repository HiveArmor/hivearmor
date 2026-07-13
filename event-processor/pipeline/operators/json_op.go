package operators

import (
	"encoding/json"
	"strings"
)

// JSONOp parses a JSON string from data[source] and merges the result under data["log"]
// preserving nested structure so that filter rename paths like "log.data.IpAddress" resolve correctly.
func JSONOp(source string, data map[string]any) {
	raw := getString(data, source)
	if raw == "" {
		return
	}
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "{") && !strings.HasPrefix(raw, "[") {
		return
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return
	}
	logMap := getOrCreateMap(data, "log")
	mergeInto(logMap, parsed)
}

// mergeInto deep-merges src into dst, preserving nested maps.
func mergeInto(dst map[string]any, src map[string]any) {
	for k, v := range src {
		if sub, ok := v.(map[string]any); ok {
			existing := getOrCreateMap(dst, k)
			mergeInto(existing, sub)
		} else {
			dst[k] = v
		}
	}
}
