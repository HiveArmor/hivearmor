package spool

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/hivearmor/sdk/plugins"

	"github.com/hivearmor/hivearmor-collector/utils"
)

// LogsDropped counts events that could not be durably spooled and also
// could not be placed on the memory queue. Unprocessed SQLite rows are not
// counted here; they are retried by the log processor.
var LogsDropped atomic.Int64

// dlqMaxBytes is the per-file size limit for the dead-letter queue file.
const dlqMaxBytes = 50 * 1024 * 1024 // 50 MiB

// WriteToDLQ appends a dropped log entry when durable spool cannot accept it
// (quota exhausted or SQLite unavailable with a full memory queue).
func WriteToDLQ(source string, l *plugins.Log) {
	if l == nil {
		return
	}
	dlqPath := filepath.Join(utils.GetMyPath(), "dlq", "dropped-logs.jsonl")
	if err := os.MkdirAll(filepath.Dir(dlqPath), 0755); err != nil {
		return
	}

	if info, err := os.Stat(dlqPath); err == nil && info.Size() >= dlqMaxBytes {
		rotated := fmt.Sprintf("%s.%d", dlqPath, time.Now().UnixNano())
		if renameErr := os.Rename(dlqPath, rotated); renameErr != nil {
			if utils.Logger != nil {
				utils.Logger.LogF(400, "logprocessor: DLQ rotation failed (%v); skipping write", renameErr)
			}
			return
		}
	}

	f, err := os.OpenFile(dlqPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	entry, _ := json.Marshal(map[string]any{
		"ts":         time.Now().UTC().Format(time.RFC3339Nano),
		"source":     source,
		"id":         l.Id,
		"dataType":   l.DataType,
		"dataSource": l.DataSource,
		"tenantId":   l.TenantId,
		"raw":        l.Raw,
	})
	_, _ = f.Write(append(entry, '\n'))
}
