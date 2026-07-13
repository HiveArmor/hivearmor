package client

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
)

const certPath = "/cert/ca.crt"

func buildTLSTransport() *http.Transport {
	caCert, err := os.ReadFile(certPath)
	if err != nil {
		// CA cert not present (e.g. local dev); use system defaults
		return &http.Transport{}
	}
	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(caCert) {
		panic(fmt.Sprintf("failed to append CA cert from %s", certPath))
	}
	return &http.Transport{
		TLSClientConfig: &tls.Config{RootCAs: certPool},
	}
}
