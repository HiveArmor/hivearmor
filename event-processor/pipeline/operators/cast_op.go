package operators

import (
	"strconv"
	"strings"
)

// CastOp converts the listed fields to the target type.
// Supported targets: int/integer, float, string, lower, upper.
func CastOp(fields []string, to string, data map[string]any) {
	for _, f := range fields {
		v, exists := getDeep(data, f)
		if !exists {
			continue
		}
		switch to {
		case "int", "integer":
			switch val := v.(type) {
			case string:
				if n, err := strconv.ParseInt(val, 10, 64); err == nil {
					setDeep(data, f, n)
				}
			case float64:
				setDeep(data, f, int64(val))
			}
		case "float":
			switch val := v.(type) {
			case string:
				if n, err := strconv.ParseFloat(val, 64); err == nil {
					setDeep(data, f, n)
				}
			}
		case "string":
			setDeep(data, f, getString(data, f))
		case "lower":
			if s, ok := v.(string); ok {
				setDeep(data, f, strings.ToLower(s))
			}
		case "upper":
			if s, ok := v.(string); ok {
				setDeep(data, f, strings.ToUpper(s))
			}
		}
	}
}
