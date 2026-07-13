package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/hivearmor/agent/config"
)

// EdrEvent is the payload POSTed to /api/edr/events/ingest
type EdrEvent struct {
	AgentID     string `json:"agentId"`
	Hostname    string `json:"hostname,omitempty"`
	EventType   string `json:"eventType"`
	EventTime   string `json:"eventTime"`
	ProcessName string `json:"processName,omitempty"`
	ProcessPid  int    `json:"processPid,omitempty"`
	ProcessPath string `json:"processPath,omitempty"`
	ProcessCmd  string `json:"processCmdline,omitempty"`
	ProcessUser string `json:"processUser,omitempty"`
	ProcessHash string `json:"processHash,omitempty"`
	FilePath    string `json:"filePath,omitempty"`
	FileHash    string `json:"fileHash,omitempty"`
	NetworkSrc  string `json:"networkSrcIp,omitempty"`
	NetworkDst  string `json:"networkDstIp,omitempty"`
	NetworkPort int    `json:"networkDstPort,omitempty"`
	NetworkProt string `json:"networkProto,omitempty"`
	Severity    string `json:"severity"`
	RawEvent    string `json:"rawEvent,omitempty"`
}

// HandleEdrCommand dispatches EDR_* commands received via the gRPC command channel.
// Returns (handled bool, result string).
func HandleEdrCommand(cnf *config.Config, command string) (bool, string) {
	switch {
	case strings.HasPrefix(command, "EDR_QUARANTINE:"):
		return true, handleEdrQuarantine(cnf, command)
	case strings.HasPrefix(command, "EDR_RESTORE:"):
		return true, handleEdrRestore(cnf, command)
	case strings.HasPrefix(command, "EDR_KILL:"):
		return true, handleEdrKill(cnf, command)
	case strings.HasPrefix(command, "EDR_ISOLATE:"):
		return true, handleEdrIsolate(cnf, command)
	case command == "EDR_LIFT_ISOLATION":
		return true, handleEdrLiftIsolation(cnf)
	}
	return false, ""
}

// IngestEdrEvent ships an event to the backend ingest endpoint.
func IngestEdrEvent(cnf *config.Config, evt EdrEvent) error {
	evt.AgentID = strconv.Itoa(int(cnf.AgentID))
	if evt.EventTime == "" {
		evt.EventTime = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if evt.Severity == "" {
		evt.Severity = "INFO"
	}

	body, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("edr_handler: marshal event: %w", err)
	}

	url := fmt.Sprintf("https://%s/api/edr/events/ingest", cnf.Server)
	resp, err := edrHTTPClient().Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("edr_handler: ingest POST: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("edr_handler: ingest response %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func handleEdrQuarantine(cnf *config.Config, command string) string {
	// format: EDR_QUARANTINE:<filePath>
	filePath := strings.TrimPrefix(command, "EDR_QUARANTINE:")
	if filePath == "" {
		return "EDR_QUARANTINE error: missing filePath"
	}
	quarPath, err := quarantineFile(filePath)
	if err != nil {
		return fmt.Sprintf("EDR_QUARANTINE error: %v", err)
	}
	return quarPath
}

func handleEdrRestore(cnf *config.Config, command string) string {
	// format: EDR_RESTORE:<quarantineId>
	qidStr := strings.TrimPrefix(command, "EDR_RESTORE:")
	qid, err := strconv.ParseInt(qidStr, 10, 64)
	if err != nil {
		return fmt.Sprintf("EDR_RESTORE error: invalid id %q", qidStr)
	}
	if err := restoreFile(cnf, qid); err != nil {
		return fmt.Sprintf("EDR_RESTORE error: %v", err)
	}
	return fmt.Sprintf("file restored for quarantine %d", qid)
}

func handleEdrKill(cnf *config.Config, command string) string {
	// format: EDR_KILL:<pid>
	pidStr := strings.TrimPrefix(command, "EDR_KILL:")
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return fmt.Sprintf("EDR_KILL error: invalid pid %q", pidStr)
	}
	if err := killProcessByPID(pid); err != nil {
		return fmt.Sprintf("EDR_KILL error: %v", err)
	}
	return fmt.Sprintf("killed PID %d", pid)
}

func handleEdrIsolate(cnf *config.Config, command string) string {
	// format: EDR_ISOLATE:<type>[:<allowedIps>]
	rest := strings.TrimPrefix(command, "EDR_ISOLATE:")
	parts := strings.SplitN(rest, ":", 2)
	isoType := parts[0]
	var allowedIPs []string
	if len(parts) == 2 && parts[1] != "" {
		allowedIPs = strings.Split(parts[1], ",")
	}
	if err := applyNetworkIsolation(isoType, allowedIPs); err != nil {
		return fmt.Sprintf("EDR_ISOLATE error: %v", err)
	}
	return fmt.Sprintf("isolation applied: %s", isoType)
}

func handleEdrLiftIsolation(cnf *config.Config) string {
	if err := liftNetworkIsolation(); err != nil {
		return fmt.Sprintf("EDR_LIFT_ISOLATION error: %v", err)
	}
	return "isolation lifted"
}

func edrHTTPClient() *http.Client {
	return &http.Client{Timeout: 15 * time.Second}
}
