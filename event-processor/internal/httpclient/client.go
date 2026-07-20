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
	tlsCfg := &tls.Config{}

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

	return &http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
	}, nil
}
