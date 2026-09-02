package telemetry

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type ingestAuth struct {
	agentID     string
	agentKey    string
	internalKey string
}

func postJSON(url string, auth ingestAuth, body any, skipTLS bool) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(auth.agentID) != "" && strings.TrimSpace(auth.agentKey) != "" {
		req.Header.Set("X-HiveArmor-Agent-Id", auth.agentID)
		req.Header.Set("X-Agent-Key", auth.agentKey)
	} else if strings.TrimSpace(auth.internalKey) != "" {
		req.Header.Set("X-Internal-Key", auth.internalKey)
	}

	client := &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: skipTLS}, //nolint:gosec
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("telemetry POST %s status %d", url, resp.StatusCode)
	}
	return nil
}

func telemetryBaseURL(server string) string {
	s := strings.TrimSpace(server)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		return strings.TrimRight(s, "/")
	}
	return "https://" + s
}

func agentIDHeader(cnfAgentID uint, envID string) string {
	if strings.TrimSpace(envID) != "" {
		return strings.TrimSpace(envID)
	}
	if cnfAgentID > 0 {
		return strconv.Itoa(int(cnfAgentID))
	}
	return ""
}
