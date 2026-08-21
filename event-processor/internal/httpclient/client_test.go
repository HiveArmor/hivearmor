package httpclient

import (
	"crypto/tls"
	"testing"
)

func TestNewTLSConfig_neverSkipsVerify(t *testing.T) {
	cfg, err := NewTLSConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.InsecureSkipVerify {
		t.Fatal("InsecureSkipVerify must stay false")
	}
	if cfg.MinVersion < tls.VersionTLS12 {
		t.Fatalf("min TLS version %d", cfg.MinVersion)
	}
}

func TestNewTLSConfig_rejectsMissingCAFile(t *testing.T) {
	t.Setenv("OPENSEARCH_CA_CERT", "/no/such/ca.pem")
	if _, err := NewTLSConfig(); err == nil {
		t.Fatal("expected error for missing CA file")
	}
}
