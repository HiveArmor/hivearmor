package httpclient

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
	"time"
)

// NewSecureClient returns an *http.Client with proper TLS verification.
// If OPENSEARCH_CA_CERT is set, loads that PEM file as the trusted root CA.
// Otherwise uses the system certificate pool.
// Fails loudly — never falls back to InsecureSkipVerify.
func NewSecureClient(timeout time.Duration) (*http.Client, error) {
	tlsCfg, err := NewTLSConfig()
	if err != nil {
		return nil, err
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
	}, nil
}

// NewTLSConfig returns a TLS config that verifies certificates. If
// OPENSEARCH_CA_CERT is set, that PEM is the trusted root. Hostname
// verification uses the connection URL host. Never sets InsecureSkipVerify.
func NewTLSConfig() (*tls.Config, error) {
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}

	if caCertPath := os.Getenv("OPENSEARCH_CA_CERT"); caCertPath != "" {
		caCert, err := os.ReadFile(caCertPath)
		if err != nil {
			return nil, fmt.Errorf("reading CA cert %s: %w", caCertPath, err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caCert) {
			return nil, fmt.Errorf("no valid PEM certificate found in %s", caCertPath)
		}
		tlsCfg.RootCAs = pool
	}

	return tlsCfg, nil
}

// MustClient returns a verified TLS HTTP client or exits. Use at process start.
func MustClient(timeout time.Duration) *http.Client {
	client, err := NewSecureClient(timeout)
	if err != nil {
		panic(fmt.Sprintf("secure http client: %v", err))
	}
	return client
}
