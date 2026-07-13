package utils

import (
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
	"strings"
)

const caCertPath = "/cert/ca.crt"

func buildTLSClient() (*http.Client, error) {
	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		// CA cert not present (e.g. local dev without cert volume); use system defaults
		return &http.Client{}, nil
	}
	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("failed to append CA cert from %s", caCertPath)
	}
	tlsConfig := &tls.Config{RootCAs: certPool}
	return &http.Client{Transport: &http.Transport{TLSClientConfig: tlsConfig}}, nil
}

func IsConnectionKeyValid(panelUrl string, token string) bool {
	requestBody := strings.NewReader(token)
	client, err := buildTLSClient()
	if err != nil {
		return false
	}
	resp, err := client.Post(panelUrl, "application/json", requestBody)
	if err != nil || resp.StatusCode != http.StatusOK {
		return false
	}
	return true
}

func IsKeyPairValid(key string, id uint, cache map[uint]string) (string, bool) {
	agentKey, ok := cache[id]
	if !ok {
		return "", false
	}
	if subtle.ConstantTimeCompare([]byte(key), []byte(agentKey)) == 1 {
		return agentKey, true
	}
	return "", false
}
