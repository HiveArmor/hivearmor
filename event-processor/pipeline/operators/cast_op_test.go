package operators

import "testing"

func TestCastOpLowerUpper(t *testing.T) {
	data := map[string]any{
		"log": map[string]any{
			"sev":   "High",
			"proto": "tcp",
			"num":   int64(5),
		},
	}

	// lower: capitalized severity -> lowercase (the PAN CEF PanOSSeverity case)
	CastOp([]string{"log.sev"}, "lower", data)
	if got := getString(data, "log.sev"); got != "high" {
		t.Errorf("lower: log.sev = %q, want %q", got, "high")
	}

	// upper
	CastOp([]string{"log.proto"}, "upper", data)
	if got := getString(data, "log.proto"); got != "TCP" {
		t.Errorf("upper: log.proto = %q, want %q", got, "TCP")
	}

	// lower on a non-string is a no-op (must not panic or corrupt)
	CastOp([]string{"log.num"}, "lower", data)
	if v, _ := getDeep(data, "log.num"); v != int64(5) {
		t.Errorf("lower on int should be a no-op, got %v", v)
	}

	// missing field is a no-op
	CastOp([]string{"log.absent"}, "lower", data)
	if _, ok := getDeep(data, "log.absent"); ok {
		t.Error("lower on absent field should not create it")
	}
}
