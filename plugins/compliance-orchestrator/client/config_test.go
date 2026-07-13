package client

import (
	"os"
	"testing"
)

func TestLoadOpenSearchConfig_Defaults(t *testing.T) {
	os.Unsetenv("OPENSEARCH_HOST")
	os.Unsetenv("OPENSEARCH_PORT")
	os.Unsetenv("OPENSEARCH_USER")
	os.Unsetenv("OPENSEARCH_PASSWORD")

	cfg := LoadOpenSearchConfig()

	if cfg.Host != "opensearch" {
		t.Errorf("expected default host=opensearch, got %q", cfg.Host)
	}
	if cfg.Port != "9200" {
		t.Errorf("expected default port=9200, got %q", cfg.Port)
	}
	if cfg.User != "admin" {
		t.Errorf("expected default user=admin, got %q", cfg.User)
	}
	if cfg.URL != "https://opensearch:9200" {
		t.Errorf("expected URL=https://opensearch:9200, got %q", cfg.URL)
	}
}

func TestLoadOpenSearchConfig_FromEnv(t *testing.T) {
	os.Setenv("OPENSEARCH_HOST", "myhost")
	os.Setenv("OPENSEARCH_PORT", "9201")
	os.Setenv("OPENSEARCH_USER", "myuser")
	os.Setenv("OPENSEARCH_PASSWORD", "mypass")
	t.Cleanup(func() {
		os.Unsetenv("OPENSEARCH_HOST")
		os.Unsetenv("OPENSEARCH_PORT")
		os.Unsetenv("OPENSEARCH_USER")
		os.Unsetenv("OPENSEARCH_PASSWORD")
	})

	cfg := LoadOpenSearchConfig()

	if cfg.Host != "myhost" {
		t.Errorf("expected host=myhost, got %q", cfg.Host)
	}
	if cfg.Port != "9201" {
		t.Errorf("expected port=9201, got %q", cfg.Port)
	}
	if cfg.User != "myuser" {
		t.Errorf("expected user=myuser, got %q", cfg.User)
	}
	if cfg.Pass != "mypass" {
		t.Errorf("expected pass=mypass, got %q", cfg.Pass)
	}
	if cfg.URL != "https://myhost:9201" {
		t.Errorf("expected URL=https://myhost:9201, got %q", cfg.URL)
	}
}

func TestNewBackendClient_DefaultURL(t *testing.T) {
	os.Unsetenv("BACKEND_URL")
	os.Unsetenv("INTERNAL_KEY")

	bc := NewBackendClient()

	if bc.baseURL != "http://backend:8080" {
		t.Errorf("expected baseURL=http://backend:8080, got %q", bc.baseURL)
	}
	if bc.internalKey != "" {
		t.Errorf("expected empty internalKey, got %q", bc.internalKey)
	}
}

func TestNewBackendClient_FromEnv(t *testing.T) {
	os.Setenv("BACKEND_URL", "http://mybackend:9090")
	os.Setenv("INTERNAL_KEY", "secret-key")
	t.Cleanup(func() {
		os.Unsetenv("BACKEND_URL")
		os.Unsetenv("INTERNAL_KEY")
	})

	bc := NewBackendClient()

	if bc.baseURL != "http://mybackend:9090" {
		t.Errorf("expected baseURL=http://mybackend:9090, got %q", bc.baseURL)
	}
	if bc.internalKey != "secret-key" {
		t.Errorf("expected internalKey=secret-key, got %q", bc.internalKey)
	}
}
