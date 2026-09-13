package operators

import "strings"

// DeleteOp removes the listed fields from data. When prefixes are given, any
// key under the top-level "log" map whose name starts with one of the prefixes
// is also removed — a convenience for clearing the many scratch/positional
// fields a CSV parser produces without enumerating each one.
func DeleteOp(fields []string, data map[string]any, prefixes ...string) {
	for _, f := range fields {
		deleteDeep(data, f)
	}
	if len(prefixes) == 0 {
		return
	}
	logMap, ok := data["log"].(map[string]any)
	if !ok {
		return
	}
	for key := range logMap {
		for _, p := range prefixes {
			if p != "" && strings.HasPrefix(key, p) {
				delete(logMap, key)
				break
			}
		}
	}
}
