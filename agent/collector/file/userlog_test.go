package file

import "testing"

func TestUserLogDataType(t *testing.T) {
	cases := map[string]string{
		"":          "userlog",
		"APP":       "userlog:app",
		"  My App ": "userlog:my_app",
		"Nginx":     "userlog:nginx",
	}
	for in, want := range cases {
		if got := userLogDataType(in); got != want {
			t.Fatalf("userLogDataType(%q)=%q want %q", in, got, want)
		}
	}
}

// RegisterUserLogApplier must be safe to call and wire the agent applier without panic.
func TestRegisterUserLogApplier_NoPanic(t *testing.T) {
	RegisterUserLogApplier()
	// No live collector bound → applying tails is a safe no-op (stashing handled by the
	// agent package), must not panic.
	if err := applyUserLogTails(nil); err != nil {
		t.Fatalf("applyUserLogTails(nil) with no live collector: %v", err)
	}
}
