package utils

import (
	"bytes"
	"io"
	"os"
	"strings"
	"testing"
)

func TestPrintBannerHiveArmorBranding(t *testing.T) {
	orig := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w

	PrintBanner()

	_ = w.Close()
	os.Stdout = orig

	var buf bytes.Buffer
	_, _ = io.Copy(&buf, r)
	out := buf.String()

	if strings.Contains(out, "_    _   _                  _____") {
		t.Fatalf("legacy UTM STACK ascii art must not be printed")
	}
	if !strings.Contains(out, "_   _ _") {
		t.Fatalf("expected HiveArmor ascii banner marker, got: %q", out)
	}
}
