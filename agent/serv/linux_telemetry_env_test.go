package serv

import (
	"strings"
	"testing"
)

func TestTelemetryDropInHasEnvFileAndNoSecrets(t *testing.T) {
	body := telemetryDropInContents()
	if !strings.Contains(body, "EnvironmentFile=-/etc/hivearmor/agent.env") {
		t.Fatalf("drop-in missing EnvironmentFile:\n%s", body)
	}
	if strings.Contains(body, "HA_INTERNAL_KEY=") {
		t.Fatal("drop-in must not embed HA_INTERNAL_KEY")
	}
}

func TestTelemetryEnvTemplateIsCommentsOnly(t *testing.T) {
	body := telemetryEnvTemplate()
	for _, line := range strings.Split(body, "\n") {
		trim := strings.TrimSpace(line)
		if trim == "" || strings.HasPrefix(trim, "#") {
			continue
		}
		t.Fatalf("env template must not assign values, found %q", line)
	}
}
