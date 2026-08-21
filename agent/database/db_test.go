package database

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/agent/models"
)

func TestDeleteOldDoesNotRemoveUnprocessed(t *testing.T) {
	db, err := OpenSQLite(filepath.Join(t.TempDir(), "logs.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if err := db.Create(&models.Log{ID: "live", Log: "keep", Processed: false}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Log{ID: "done", Log: "reclaim", Processed: true}); err != nil {
		t.Fatal(err)
	}

	deleted, err := db.DeleteOldestProcessed(10)
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Fatalf("deleted processed = %d, want 1", deleted)
	}

	var unprocessed []models.Log
	if err := db.FindUnprocessed(&unprocessed, 10); err != nil {
		t.Fatal(err)
	}
	if len(unprocessed) != 1 || unprocessed[0].ID != "live" {
		t.Fatalf("unprocessed = %+v", unprocessed)
	}
}
