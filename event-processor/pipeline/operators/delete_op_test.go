package operators

import "testing"

func TestDeleteOpPrefixes(t *testing.T) {
	data := map[string]any{
		"log": map[string]any{
			"pa_type":   "DECRYPTION",
			"decTrash1": "x",
			"decTrash2": "y",
			"csvFoo":    "z",
			"keepMe":    "keep",
		},
	}

	// Explicit field + two prefixes.
	DeleteOp([]string{"log.pa_type"}, data, "decTrash", "csvFoo")

	logMap := data["log"].(map[string]any)
	if _, ok := logMap["pa_type"]; ok {
		t.Error("explicit field log.pa_type should have been deleted")
	}
	if _, ok := logMap["decTrash1"]; ok {
		t.Error("decTrash1 should have been deleted by prefix")
	}
	if _, ok := logMap["decTrash2"]; ok {
		t.Error("decTrash2 should have been deleted by prefix")
	}
	if _, ok := logMap["csvFoo"]; ok {
		t.Error("csvFoo should have been deleted by prefix")
	}
	if v, ok := logMap["keepMe"]; !ok || v != "keep" {
		t.Error("keepMe should NOT have been deleted")
	}

	// No prefixes = only explicit fields (backward compatible).
	data2 := map[string]any{"log": map[string]any{"a": "1", "b": "2"}}
	DeleteOp([]string{"log.a"}, data2)
	lm2 := data2["log"].(map[string]any)
	if _, ok := lm2["a"]; ok {
		t.Error("log.a should be deleted")
	}
	if _, ok := lm2["b"]; !ok {
		t.Error("log.b should survive when no prefixes given")
	}
}
