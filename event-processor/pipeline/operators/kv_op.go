package operators

import "strings"

// KVOp parses key=value pairs and stores them under "log.".
//
// It reads from the given `source` dot-path (e.g. "log.cefExtension") when that path
// resolves to a non-empty string; otherwise it falls back to data["raw"]. The fallback
// preserves the historical behavior for callers that pass no source, or whose source field
// has not been populated by an earlier step — so honoring `source` here cannot regress an
// existing parser: a parser only sees the isolated source when that source actually exists.
func KVOp(fieldSplit, valueSplit, source string, data map[string]any) {
	text := ""
	if source != "" && source != "raw" {
		text = getString(data, source)
	}
	if text == "" {
		text = getString(data, "raw")
	}
	if text == "" {
		return
	}
	logMap := getOrCreateMap(data, "log")
	pairs := strings.Split(text, fieldSplit)
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
