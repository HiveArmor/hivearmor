package client

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
)

type OpenSearchConfig struct {
	Host string
	Port string
	User string
	Pass string
	URL  string
}

func LoadOpenSearchConfig() OpenSearchConfig {
	host := envOrDefault("OPENSEARCH_HOST", "opensearch")
	port := envOrDefault("OPENSEARCH_PORT", "9200")
	user := envOrDefault("OPENSEARCH_USER", "admin")
	pass := os.Getenv("OPENSEARCH_PASSWORD")

	return OpenSearchConfig{
		Host: host,
		Port: port,
		User: user,
		Pass: pass,
		URL:  fmt.Sprintf("https://%s:%s", host, port),
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func NewOpenSearchHTTPClient() *http.Client {
	const caCertPath = "/cert/ca.crt"
	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		return &http.Client{Transport: &http.Transport{}}
	}
	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(caCert) {
		return &http.Client{Transport: &http.Transport{}}
	}
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{RootCAs: certPool},
		},
	}
}
