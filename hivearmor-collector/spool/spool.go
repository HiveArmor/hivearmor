package spool

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/sdk/plugins"

	"github.com/hivearmor/hivearmor-collector/database"
	"github.com/hivearmor/hivearmor-collector/models"
	"github.com/hivearmor/hivearmor-collector/utils"
)

var (
	errSpoolUnavailable = errors.New("durable spool is unavailable")
	errSpoolFull        = errors.New("durable spool is at quota")
)

const (
	defaultSpoolRetentionMB = 512
	maxSpoolRetentionMB     = 4096
)

// RetentionLookup returns the configured spool retention in megabytes.
// Injected so this package does not depend on logservice (avoids import cycles).
var RetentionLookup = func() (int, error) {
	return 0, errors.New("retention not configured")
}

// EnqueueDurable writes the log to SQLite before it is eligible for network send.
// The memory queue holds a reference, not the only copy.
func EnqueueDurable(log *plugins.Log) error {
	if log == nil {
		return errors.New("log is required")
	}
	if log.Id == "" {
		id, err := uuid.NewRandom()
		if err != nil {
			return fmt.Errorf("generate log id: %w", err)
		}
		log.Id = id.String()
	}
	if log.Timestamp == "" {
		log.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	db, err := database.GetDB()
	if err != nil {
		return fmt.Errorf("%w: %v", errSpoolUnavailable, err)
	}
	if err := enforceSpoolQuota(db); err != nil {
		return err
	}
	row := models.Log{
		ID:         log.Id,
		CreatedAt:  time.Now().UTC(),
		DataSource: log.DataSource,
		Type:       log.DataType,
		Log:        log.Raw,
		Processed:  false,
	}
	if err := db.Create(&row); err != nil {
		return fmt.Errorf("spool log: %w", err)
	}
	return nil
}

// Offer persists the log, then makes a non-blocking attempt to place a
// reference on the send queue. A full queue is not a drop when the spool write
// succeeded; the retry scanner resends unprocessed rows.
func Offer(queue chan<- *plugins.Log, source string, log *plugins.Log) {
	spoolErr := EnqueueDurable(log)
	if spoolErr != nil && !errors.Is(spoolErr, errSpoolUnavailable) {
		LogsDropped.Add(1)
		WriteToDLQ(source, log)
		logSpool(400, "%s: durable spool rejected: %v", source, spoolErr)
		return
	}
	select {
	case queue <- log:
	default:
		if spoolErr != nil {
			LogsDropped.Add(1)
			WriteToDLQ(source, log)
			logSpool(400, "%s: LogQueue full and spool unavailable; quarantining event", source)
		}
		// Successful spool + full queue: retained in SQLite; no drop.
	}
}

func logSpool(level int, format string, args ...interface{}) {
	if utils.Logger != nil {
		utils.Logger.LogF(level, format, args...)
	}
}

func enforceSpoolQuota(db *database.Database) error {
	retention, err := RetentionLookup()
	if err != nil || retention < 1 {
		retention = defaultSpoolRetentionMB
	}
	if retention > maxSpoolRetentionMB {
		retention = maxSpoolRetentionMB
	}
	size, err := database.GetDatabaseSizeInMB()
	if err != nil {
		return nil
	}
	for size >= retention {
		deleted, delErr := db.DeleteOldestProcessed(500)
		if delErr != nil {
			return fmt.Errorf("reclaim spool: %w", delErr)
		}
		if deleted == 0 {
			return errSpoolFull
		}
		size, err = database.GetDatabaseSizeInMB()
		if err != nil {
			return err
		}
	}
	return nil
}
