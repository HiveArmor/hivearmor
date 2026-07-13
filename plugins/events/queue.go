package main

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"

	sdkos "github.com/threatwinds/go-sdk/os"
	"github.com/tidwall/gjson"
)

var (
	maxStartupRetries = 30
	retryInterval     = 5 * time.Second
)

const osHealthPath = "/_cluster/health?wait_for_status=yellow&timeout=5s"

var logs = make(chan string, 100*runtime.NumCPU())

func addToQueue(l string) {
	if len(logs) >= 100*runtime.NumCPU() {
		_ = catcher.Error("cannot enqueue log", fmt.Errorf("queue is full"), map[string]any{
			"process": "plugin_com.hivearmor.events",
			"queue":   "logs",
		})

		return
	}

	logs <- l
}

func buildEventsTLSTransport() *http.Transport {
	const caCertPath = "/cert/ca.crt"
	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		return &http.Transport{}
	}
	certPool := x509.NewCertPool()
	if certPool.AppendCertsFromPEM(caCert) {
		return &http.Transport{TLSClientConfig: &tls.Config{RootCAs: certPool}}
	}
	return &http.Transport{}
}

// waitForOpenSearch polls the OpenSearch cluster health endpoint until it reports
// yellow or green status. Returns an error if the cluster is not ready after
// maxStartupRetries attempts.
func waitForOpenSearch(osURL, user, password string) error {
	client := &http.Client{Timeout: 10 * time.Second, Transport: buildEventsTLSTransport()}

	for attempt := 1; attempt <= maxStartupRetries; attempt++ {
		req, err := http.NewRequest("GET", osURL+osHealthPath, nil)
		if err != nil {
			return fmt.Errorf("cannot create health check request: %w", err)
		}
		if user != "" {
			req.SetBasicAuth(user, password)
		}

		resp, err := client.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			log.Printf("[events] OpenSearch ready after %d attempt(s)", attempt)
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}

		log.Printf("[events] OpenSearch not ready (attempt %d/%d): %v. Retrying in %s...",
			attempt, maxStartupRetries, err, retryInterval)
		time.Sleep(retryInterval)
	}

	return fmt.Errorf("OpenSearch not ready after %d attempts", maxStartupRetries)
}

func startQueue() {
	cfg := plugins.PluginCfg("org.opensearch").Get("opensearch")
	host := cfg.Get("host").String()
	port := cfg.Get("port").String()
	user := cfg.Get("user").String()
	password := cfg.Get("password").String()
	osUrl := "https://" + host + ":" + port

	if err := waitForOpenSearch(osUrl, user, password); err != nil {
		log.Fatalf("[events] FATAL: cannot start event writer: %v", err)
	}

	if err := sdkos.Connect([]string{osUrl}, user, password); err != nil {
		log.Fatalf("[events] FATAL: cannot connect to OpenSearch after health check passed: %v", err)
	}

	queue := sdkos.NewBulkQueue("plugin_com.hivearmor.events", sdkos.BulkQueueConfig{
		FlushInterval:  10 * time.Second,
		FlushThreshold: 50,
		MaxRetries:     0,
		RetryDelay:     time.Second,
	})

	numCPU := runtime.NumCPU() * 2
	for i := 0; i < numCPU; i++ {
		go func() {
			for {
				l := <-logs

				dataType := gjson.Get(l, "dataType").String()
				id := gjson.Get(l, "id").String()
				index := sdkos.BuildCurrentDayIndex("_v3_hive_", "log", dataType)

				queue.AddItem(sdkos.BulkItem{
					Index:      index,
					DocumentID: id,
					Document:   []byte(l),
					Operation:  "index",
				})
			}
		}()
	}
}
