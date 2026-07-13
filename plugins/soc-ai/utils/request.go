package utils

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"sync"
	"time"
)

// Connection pooling - reusable HTTP clients
var (
	defaultClient  *http.Client
	opensearchClient *http.Client
	clientOnce     sync.Once
)

func buildCACertTLSConfig() *tls.Config {
	const caCertPath = "/cert/ca.crt"
	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		// CA cert absent (e.g. local dev); use system defaults
		return &tls.Config{}
	}
	certPool := x509.NewCertPool()
	if certPool.AppendCertsFromPEM(caCert) {
		return &tls.Config{RootCAs: certPool}
	}
	return &tls.Config{}
}

// initClients initializes the pooled HTTP clients
func initClients() {
	clientOnce.Do(func() {
		defaultClient = &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		}

		opensearchClient = &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
				TLSClientConfig:     buildCACertTLSConfig(),
			},
		}
	})
}

// RequestOptions configures HTTP request behavior
type RequestOptions struct {
	URL              string
	Data             []byte
	Method           string
	Headers          map[string]string
	TimeoutSec       int
	BasicAuthUser    string
	BasicAuthPass    string
	UseOpenSearchTLS bool
}

// doRequest is the base HTTP request function with connection pooling
func doRequest(opts RequestOptions) ([]byte, int, error) {
	initClients()

	// Create context with timeout for this specific request
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(opts.TimeoutSec)*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, opts.Method, opts.URL, bytes.NewBuffer(opts.Data))
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("error creating request: %v", err)
	}

	for k, v := range opts.Headers {
		req.Header.Add(k, v)
	}

	if opts.BasicAuthUser != "" {
		req.SetBasicAuth(opts.BasicAuthUser, opts.BasicAuthPass)
	}

	// Select the appropriate pooled client
	client := defaultClient
	if opts.UseOpenSearchTLS {
		client = opensearchClient
	}

	resp, err := client.Do(req)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return nil, http.StatusInternalServerError, fmt.Errorf("request timed out: %v: %s", err, opts.Data)
		}
		return nil, http.StatusInternalServerError, fmt.Errorf("error performing request: %v: %s", err, opts.Data)
	}

	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("error reading response body: %v", err)
	}

	return body, resp.StatusCode, nil
}

// DoParseReq makes an HTTP request and parses JSON response into the specified type
func DoParseReq[response any](url string, data []byte, method string, headers map[string]string, timeoutInSec int) (response, int, error) {
	body, status, err := DoReq(url, data, method, headers, timeoutInSec)
	if err != nil {
		return *new(response), status, fmt.Errorf("error reading response body: %v", err)
	}

	var result response

	err = json.Unmarshal(body, &result)
	if err != nil {
		return *new(response), http.StatusInternalServerError, fmt.Errorf("error decoding response: %v", err)
	}

	if status != http.StatusAccepted && status != http.StatusOK {
		return result, status, fmt.Errorf("status code '%d' received '%s' while sending '%s'", status, body, data)
	}

	return result, status, nil
}

// DoReq makes a standard HTTP request using the connection pool
func DoReq(url string, data []byte, method string, headers map[string]string, timeoutInSec int) ([]byte, int, error) {
	return doRequest(RequestOptions{
		URL:        url,
		Data:       data,
		Method:     method,
		Headers:    headers,
		TimeoutSec: timeoutInSec,
	})
}

// DoOpenSearchReq makes an HTTP request to OpenSearch with basic auth and CA-validated TLS.
func DoOpenSearchReq(url string, data []byte, method string, headers map[string]string, user, password string, timeoutInSec int) ([]byte, int, error) {
	return doRequest(RequestOptions{
		URL:              url,
		Data:             data,
		Method:           method,
		Headers:          headers,
		TimeoutSec:       timeoutInSec,
		BasicAuthUser:    user,
		BasicAuthPass:    password,
		UseOpenSearchTLS: true,
	})
}
