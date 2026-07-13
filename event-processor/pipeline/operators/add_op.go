package operators

import "fmt"

// AddOp sets data[key] to value.
func AddOp(key string, value any, data map[string]any) {
	if key == "" {
		return
	}
	switch v := value.(type) {
	case int, int32, int64, uint, uint32, uint64, float32, float64, bool:
		setDeep(data, key, v)
	default:
		setDeep(data, key, fmt.Sprintf("%v", v))
	}
}
