package agent

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/agent/database"
	"github.com/hivearmor/agent/models"
	"github.com/hivearmor/sdk/plugins"
)

func withTestSpool(t *testing.T) *database.Database {
	t.Helper()
	dir := t.TempDir()
	db, err := database.OpenSQLite(filepath.Join(dir, "logs.db"))
	if err != nil {
		t.Fatalf("open test spool: %v", err)
	}
	database.SetTestDB(db)
	t.Cleanup(func() {
		database.SetTestDB(nil)
		_ = db.Close()
	})
	return db
}

func TestEnqueueDurablePersistsUnprocessedBeforeQueue(t *testing.T) {
	db := withTestSpool(t)
	log := &plugins.Log{DataType: "windows", DataSource: "host", Raw: "payload"}
	if err := EnqueueDurable(log); err != nil {
		t.Fatalf("EnqueueDurable: %v", err)
	}
	if log.Id == "" {
		t.Fatal("expected log id to be assigned before persist")
	}
	var rows []models.Log
	if err := db.FindUnprocessed(&rows, 10); err != nil {
		t.Fatalf("FindUnprocessed: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != log.Id || rows[0].Processed {
		t.Fatalf("unexpected spool rows: %+v", rows)
	}
}

func TestOfferDoesNotDropWhenQueueIsFullAfterSuccessfulSpool(t *testing.T) {
	_ = withTestSpool(t)
	LogsDropped.Store(0)
	queue := make(chan *plugins.Log, 1)
	queue <- &plugins.Log{Id: "fill"}
	log := &plugins.Log{DataType: "windows", DataSource: "host", Raw: "payload"}
	Offer(queue, "test", log)
	if LogsDropped.Load() != 0 {
		t.Fatalf("LogsDropped = %d, want 0 after successful spool", LogsDropped.Load())
	}
	if len(queue) != 1 {
		t.Fatalf("queue length = %d, want 1", len(queue))
	}
	var rows []models.Log
	db, err := database.GetDB()
	if err != nil {
		t.Fatal(err)
	}
	if err := db.FindUnprocessed(&rows, 10); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("spool rows = %d, want 1", len(rows))
	}
}

func TestDeleteOldestProcessedLeavesUnprocessed(t *testing.T) {
	db := withTestSpool(t)
	if err := db.Create(&models.Log{ID: "keep", Log: "unprocessed", Processed: false}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Log{ID: "drop", Log: "processed", Processed: true}); err != nil {
		t.Fatal(err)
	}
	deleted, err := db.DeleteOldestProcessed(10)
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Fatalf("deleted = %d, want 1", deleted)
	}
	var remaining []models.Log
	if err := db.FindUnprocessed(&remaining, 10); err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 1 || remaining[0].ID != "keep" {
		t.Fatalf("unprocessed rows = %+v", remaining)
	}
}

func TestEnqueueDurableRequiresLog(t *testing.T) {
	if err := EnqueueDurable(nil); err == nil {
		t.Fatal("expected error for nil log")
	}
}

func TestDefaultRetentionIsBoundedPilotQuota(t *testing.T) {
	if defaultSpoolRetentionMB != 512 {
		t.Fatalf("default spool quota = %d, want 512", defaultSpoolRetentionMB)
	}
}
