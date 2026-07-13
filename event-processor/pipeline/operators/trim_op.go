package operators

import "strings"

// TrimOp strips a prefix or suffix substring from the listed fields.
func TrimOp(function, substring string, fields []string, data map[string]any) {
	for _, f := range fields {
		s := getString(data, f)
		if s == "" {
			continue
		}
		var result string
		switch function {
		case "prefix":
			result = strings.TrimPrefix(s, substring)
		case "suffix":
			result = strings.TrimSuffix(s, substring)
		default: // "substring" — trim both ends
			result = strings.TrimSpace(strings.Trim(s, substring))
		}
		setDeep(data, f, result)
	}
}
