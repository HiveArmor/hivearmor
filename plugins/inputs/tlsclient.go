package main

import (
	"crypto/tls"
	"crypto/x509"
	"os"
)

const caCertPath = "/cert/ca.crt"

// buildGRPCTLSConfig returns a TLS config that validates server certificates
// using the CA cert at /cert/ca.crt. Falls back to system defaults when absent.
func buildGRPCTLSConfig() *tls.Config {
	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		return &tls.Config{}
	}
	certPool := x509.NewCertPool()
	if certPool.AppendCertsFromPEM(caCert) {
		return &tls.Config{RootCAs: certPool}
	}
	return &tls.Config{}
}
