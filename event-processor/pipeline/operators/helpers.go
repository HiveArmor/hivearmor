package operators

import (
	"fmt"
	"strings"
)

// getString retrieves a field from data using dot-path notation.
func getString(data map[string]any, path string) string {
	v, _ := getDeep(data, path)
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

// getDeep retrieves a value from a nested map using dot-path notation.
func getDeep(data map[string]any, path string) (any, bool) {
	parts := strings.SplitN(path, ".", 2)
	v, ok := data[parts[0]]
	if !ok {
		return nil, false
	}
	if len(parts) == 1 {
		return v, true
	}
	sub, ok := v.(map[string]any)
	if !ok {
		return nil, false
	}
	return getDeep(sub, parts[1])
}

// setDeep sets a value in a nested map using dot-path notation, creating
// intermediate maps as needed.
func setDeep(data map[string]any, path string, value any) {
	parts := strings.SplitN(path, ".", 2)
	if len(parts) == 1 {
		data[parts[0]] = value
		return
	}
	sub, ok := data[parts[0]].(map[string]any)
	if !ok {
		sub = map[string]any{}
		data[parts[0]] = sub
	}
	setDeep(sub, parts[1], value)
}

// deleteDeep removes a field from a nested map using dot-path notation.
func deleteDeep(data map[string]any, path string) {
	parts := strings.SplitN(path, ".", 2)
	if len(parts) == 1 {
		delete(data, parts[0])
		return
	}
	sub, ok := data[parts[0]].(map[string]any)
	if !ok {
		return
	}
	deleteDeep(sub, parts[1])
}

// getOrCreateMap returns the map at data[key], creating it if absent.
func getOrCreateMap(data map[string]any, key string) map[string]any {
	if m, ok := data[key].(map[string]any); ok {
		return m
	}
	m := map[string]any{}
	data[key] = m
	return m
}
