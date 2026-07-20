package otlp

import (
	"testing"
)

func TestNestK8sAttributes(t *testing.T) {
	t.Run("k8s attrs nested and originals removed", func(t *testing.T) {
		attrs := map[string]any{
			"k8s.pod.name":       "my-pod",
			"k8s.namespace.name": "production",
			"k8s.container.name": "app",
			"k8s.node.name":      "node-1",
			"k8s.cluster.name":   "prod-cluster",
			"service.name":       "my-service",
			"other.key":          "untouched",
		}
		nestK8sAttributes(attrs)

		k8s, ok := attrs["k8s"].(map[string]any)
		if !ok {
			t.Fatal("expected attrs[\"k8s\"] to be a map")
		}
		cases := []struct{ field, want string }{
			{"podName", "my-pod"},
			{"namespace", "production"},
			{"containerName", "app"},
			{"nodeName", "node-1"},
			{"clusterName", "prod-cluster"},
			{"serviceName", "my-service"},
		}
		for _, c := range cases {
			if got, _ := k8s[c.field].(string); got != c.want {
				t.Errorf("k8s[%q] = %q, want %q", c.field, got, c.want)
			}
		}
		// Originals must be removed
		for _, flat := range []string{"k8s.pod.name", "k8s.namespace.name", "k8s.container.name", "k8s.node.name", "k8s.cluster.name", "service.name"} {
			if _, exists := attrs[flat]; exists {
				t.Errorf("flat key %q should have been removed", flat)
			}
		}
		// Unrelated keys must be untouched
		if attrs["other.key"] != "untouched" {
			t.Errorf("unrelated key was modified")
		}
	})

	t.Run("non-k8s event is a no-op", func(t *testing.T) {
		attrs := map[string]any{
			"service.name": "standalone-app",
			"host.name":    "bare-metal-1",
		}
		nestK8sAttributes(attrs)
		if _, ok := attrs["k8s"]; ok {
			t.Error("k8s key must not be created for non-k8s events")
		}
		// service.name must be preserved when there are no k8s attrs
		if attrs["service.name"] != "standalone-app" {
			t.Error("service.name must be preserved for non-k8s events")
		}
	})

	t.Run("partial k8s attrs", func(t *testing.T) {
		attrs := map[string]any{
			"k8s.pod.name":       "partial-pod",
			"k8s.namespace.name": "staging",
		}
		nestK8sAttributes(attrs)
		k8s, ok := attrs["k8s"].(map[string]any)
		if !ok {
			t.Fatal("expected k8s map")
		}
		if k8s["podName"] != "partial-pod" {
			t.Error("podName mismatch")
		}
		if _, present := k8s["containerName"]; present {
			t.Error("containerName must be absent when not set")
		}
	})
}
