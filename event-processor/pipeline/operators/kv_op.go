package operators

import "strings"

// KVOp parses key=value pairs from data["raw"] and stores them under "log.".
func KVOp(fieldSplit, valueSplit string, data map[string]any) {
	raw := getString(data, "raw")
	if raw == "" {
		return
	}
	logMap := getOrCreateMap(data, "log")
	pairs := strings.Split(raw, fieldSplit)
	for _, pair := range pairs {
		parts := strings.SplitN(pair, valueSplit, 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.TrimSpace(parts[1])
		if k != "" {
			logMap[k] = v
		}
	}
}
