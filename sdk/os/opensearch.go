package os

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	stdos "os"
	"sync"

	"github.com/opensearch-project/opensearch-go/v4"
	"github.com/opensearch-project/opensearch-go/v4/opensearchapi"
)

var (
	client    *opensearch.Client
	apiClient *opensearchapi.Client
	err       error
)

var once = sync.Once{}

// Connect establishes a singleton connection to OpenSearch.
// Only the first successful call takes effect; later calls return the existing connection.
// TLS verifies the server certificate. OPENSEARCH_CA_CERT, when set, is the trusted root.
func Connect(nodes []string, user, password string) error {
	if apiClient != nil {
		return nil
	}

	once.Do(func() {
		tlsCfg, tlsErr := newTLSConfig()
		if tlsErr != nil {
			err = tlsErr
			return
		}
		apiClient, err = opensearchapi.NewClient(opensearchapi.Config{
			Client: opensearch.Config{
				Transport: &http.Transport{TLSClientConfig: tlsCfg},
				Addresses: nodes,
				Username:  user,
				Password:  password,
			},
		})
		if err == nil {
			client = apiClient.Client
		}
	})

	if err != nil {
		// Reset once to allow retry on next call if initial attempt failed
		once = sync.Once{}
	}

	return err
}

func newTLSConfig() (*tls.Config, error) {
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}
	caCertPath := stdos.Getenv("OPENSEARCH_CA_CERT")
	if caCertPath == "" {
		return tlsCfg, nil
	}
	caCert, readErr := stdos.ReadFile(caCertPath)
	if readErr != nil {
		return nil, fmt.Errorf("reading CA cert %s: %w", caCertPath, readErr)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("no valid PEM certificate found in %s", caCertPath)
	}
	tlsCfg.RootCAs = pool
	return tlsCfg, nil
}
