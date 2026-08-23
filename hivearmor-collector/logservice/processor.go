package logservice

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/sdk/plugins"

	"github.com/hivearmor/hivearmor-collector/agent"
	"github.com/hivearmor/hivearmor-collector/config"
	"github.com/hivearmor/hivearmor-collector/conn"
	"github.com/hivearmor/hivearmor-collector/database"
	"github.com/hivearmor/hivearmor-collector/models"
	"github.com/hivearmor/hivearmor-collector/spool"
	"github.com/hivearmor/hivearmor-collector/utils"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type LogProcessor struct {
	db             *database.Database
	connErrWritten bool
	ackErrWritten  bool
	sendErrWritten bool
}

var (
	processor     LogProcessor
	processorOnce sync.Once
	processorInitErr error
	LogQueue      = make(chan *plugins.Log, 10000)
	timeToSleep   = 10 * time.Second
	timeCLeanLogs = 10 * time.Minute
	// unprocessedRetryInterval re-queues durable spool rows after a send or
	// broker failure. Retention reclaim stays on the slower ticker.
	unprocessedRetryInterval = 15 * time.Second
)

func init() {
	spool.RetentionLookup = GetDataRetention
}

func GetLogProcessor() (*LogProcessor, error) {
	processorOnce.Do(func() {
		db, err := database.GetDB()
		if err != nil {
			processorInitErr = err
			return
		}
		processor = LogProcessor{
			db:             db,
			connErrWritten: false,
			ackErrWritten:  false,
			sendErrWritten: false,
		}
	})
	if processorInitErr != nil {
		return nil, processorInitErr
	}
	return &processor, nil
}

func (l *LogProcessor) ProcessLogs(cnf *config.Config, ctx context.Context) {
	go l.CleanCountedLogs()
	go l.monitorQueueDepth(ctx)

	for {
		select {
		case <-ctx.Done():
			utils.Logger.Info("ProcessLogs stopping due to context cancellation")
			return
		default:
		}

		connection, err := conn.GetCorrelationConnection(cnf)
		if err != nil {
			if !l.connErrWritten {
				utils.Logger.ErrorF("error connecting to Correlation: %v", err)
				l.connErrWritten = true
			}
			time.Sleep(10 * time.Second)
			continue
		}

		client := plugins.NewIntegrationClient(connection)
		plClient := createClient(client, ctx)
		l.connErrWritten = false

		ctxEof, cancelEof := context.WithCancel(context.Background())
		go l.handleAcknowledgements(plClient, ctxEof, cancelEof)
		l.processLogs(cnf, plClient, ctxEof, cancelEof)
	}
}

func (l *LogProcessor) handleAcknowledgements(plClient plugins.Integration_ProcessLogClient, ctx context.Context, cancel context.CancelFunc) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			ack, err := plClient.Recv()
			if err != nil {
				if strings.Contains(err.Error(), "EOF") {
					time.Sleep(timeToSleep)
					cancel()
					return
				}
				st, ok := status.FromError(err)
				if ok && (st.Code() == codes.Unavailable || st.Code() == codes.Canceled) {
					if !l.ackErrWritten {
						utils.Logger.ErrorF("failed to receive ack: %v", err)
						l.ackErrWritten = true
					}
					time.Sleep(timeToSleep)
					cancel()
					return
				} else {
					if !l.ackErrWritten {
						utils.Logger.ErrorF("failed to receive ack: %v", err)
						l.ackErrWritten = true
					}
					time.Sleep(timeToSleep)
					continue
				}
			}

			l.ackErrWritten = false

			err = l.db.Update(&models.Log{}, "id", ack.LastId, "processed", true)
			if err != nil {
				utils.Logger.ErrorF("failed to update log: %v", err)
			}
		}
	}
}

func (l *LogProcessor) processLogs(cnf *config.Config, plClient plugins.Integration_ProcessLogClient, ctx context.Context, cancel context.CancelFunc) {
	for {
		select {
		case <-ctx.Done():
			utils.Logger.Info("context done, exiting processLogs")
			return
		case newLog := <-LogQueue:
			// Collectors spool before enqueue. Only persist here when the
			// durable path was unavailable and the memory queue still accepted
			// the record.
			if newLog.Id == "" {
				id, err := uuid.NewRandom()
				if err != nil {
					utils.Logger.ErrorF("failed to generate uuid: %v", err)
					continue
				}

				newLog.Id = id.String()
				err = l.db.Create(&models.Log{ID: newLog.Id, Log: newLog.Raw, Type: newLog.DataType, CreatedAt: time.Now(), DataSource: newLog.DataSource, Processed: false})
				if err != nil {
					utils.Logger.ErrorF("failed to save log: %v", err)
				}
			}

			if err := BindTenant(cnf, newLog); err != nil {
				spool.WriteToDLQ("send:tenant-unbound", newLog)
				continue
			}

			err := plClient.Send(newLog)
			if err != nil {
				if strings.Contains(err.Error(), "EOF") {
					time.Sleep(timeToSleep)
					cancel()
					return
				}
				st, ok := status.FromError(err)
				if ok && (st.Code() == codes.Unavailable || st.Code() == codes.Canceled) {
					if !l.sendErrWritten {
						utils.Logger.ErrorF("failed to send log: %v", err)
						l.sendErrWritten = true
					}
					time.Sleep(timeToSleep)
					cancel()
					return
				} else {
					if !l.sendErrWritten {
						utils.Logger.ErrorF("failed to send log: %v", err)
						l.sendErrWritten = true
					}
					time.Sleep(timeToSleep)
					continue
				}
			}
			l.sendErrWritten = false
		}
	}
}

func (l *LogProcessor) CleanCountedLogs() {
	retryTicker := time.NewTicker(unprocessedRetryInterval)
	retentionTicker := time.NewTicker(timeCLeanLogs)
	defer retryTicker.Stop()
	defer retentionTicker.Stop()
	for {
		select {
		case <-retryTicker.C:
			l.enqueueUnprocessed(500)
		case <-retentionTicker.C:
			l.reclaimProcessedRetention()
		}
	}
}

func (l *LogProcessor) reclaimProcessedRetention() {
	dataRetention, err := GetDataRetention()
	if err != nil {
		utils.Logger.ErrorF("error getting data retention: %s", err)
		return
	}
	_, err = l.db.DeleteOld(&models.Log{}, dataRetention)
	if err != nil {
		utils.Logger.ErrorF("error deleting old logs: %s", err)
	}
}

func (l *LogProcessor) enqueueUnprocessed(limit int) {
	cnf, cnfErr := config.GetCurrentConfig()
	unprocessed := make([]models.Log, 0, limit)
	if err := l.db.FindUnprocessed(&unprocessed, limit); err != nil {
		if utils.Logger != nil {
			utils.Logger.LogF(400, "logprocessor: error finding unprocessed logs: %s", err)
		}
		return
	}
	for _, log := range unprocessed {
		entry := &plugins.Log{
			Id:         log.ID,
			Raw:        log.Log,
			DataType:   log.Type,
			DataSource: log.DataSource,
			Timestamp:  log.CreatedAt.Format(time.RFC3339Nano),
		}
		if cnfErr != nil || BindTenant(cnf, entry) != nil {
			// Leave unprocessed for retry once tenant is configured; avoid DLQ spam.
			if utils.Logger != nil {
				utils.Logger.LogF(400, "logprocessor: skipping unprocessed log without tenant binding id=%s", log.ID)
			}
			continue
		}
		select {
		case LogQueue <- entry:
		default:
			// Queue still full — record remains processed=false and will be
			// retried on the next tick. Not a silent drop.
			if utils.Logger != nil {
				utils.Logger.LogF(400, "logprocessor: LogQueue full during retry; deferring log id=%s", log.ID)
			}
		}
	}
}

// monitorQueueDepth logs when the queue is under backpressure. It does not
// drop events; unprocessed SQLite rows remain until acknowledged.
func (l *LogProcessor) monitorQueueDepth(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			depth := len(LogQueue)
			cap := cap(LogQueue)
			if cap == 0 {
				continue
			}
			pct := float64(depth) / float64(cap) * 100
			dropped := spool.LogsDropped.Load()
			if dropped > 0 {
				utils.Logger.LogF(400, "logprocessor: total logs dropped since start (spool quota/unavailable): %d", dropped)
			}
			if pct > 90 {
				utils.Logger.ErrorF("logprocessor: LogQueue near capacity: depth=%d/%d (%.0f%%); unprocessed rows remain in spool", depth, cap, pct)
			} else if pct > 50 {
				utils.Logger.LogF(400, "logprocessor: LogQueue depth=%d/%d (%.0f%%)", depth, cap, pct)
			}
		}
	}
}

func createClient(client plugins.IntegrationClient, ctx context.Context) plugins.Integration_ProcessLogClient {
	var connErrMsgWritten bool
	invalidKeyCounter := 0
	for {
		plClient, err := client.ProcessLog(ctx)
		if err != nil {
			if strings.Contains(err.Error(), "invalid agent key") {
				invalidKeyCounter++
				if invalidKeyCounter >= 20 {
					utils.Logger.Info("Uninstalling agent: reason: agent has been removed from the panel...")
					_ = agent.UninstallAll()
					os.Exit(1)
				}
			} else {
				invalidKeyCounter = 0
			}
			if !connErrMsgWritten {
				utils.Logger.ErrorF("failed to create input client: %v", err)
				connErrMsgWritten = true
			}
			time.Sleep(timeToSleep)
			continue
		}
		return plClient
	}
}

func SetDataRetention(retention string) error {
	if retention == "" {
		retention = "20"
	}

	retentionInt, err := strconv.Atoi(retention)
	if err != nil {
		return errors.New("retention must be a number (number of megabytes)")
	}

	if retentionInt < 1 {
		return errors.New("retention must be greater than 0")
	}

	return utils.WriteJSON(config.RetentionConfigFile, models.DataRetention{Retention: retentionInt})
}

func GetDataRetention() (int, error) {
	retention := models.DataRetention{}
	err := utils.ReadJson(config.RetentionConfigFile, &retention)
	if err != nil {
		return 0, err
	}

	return retention.Retention, nil
}
