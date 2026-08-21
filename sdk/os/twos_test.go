package os_test

import (
	"testing"
	"time"

	twos "github.com/hivearmor/sdk/os"
)

type TestStruct struct {
	Field1 string `json:"field1"`
	Field2 int    `json:"field2"`
}

func TestParseSource(t *testing.T) {
	source := twos.HitSource{
		"field1": "value1",
		"field2": 123,
	}

	expected := TestStruct{
		Field1: "value1",
		Field2: 123,
	}

	var result TestStruct

	err := source.ParseSource(&result)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	if result != expected {
		t.Errorf("Expected %v, but got %v", expected, result)
	}
}

func TestBuildGenericIndexPattern(t *testing.T) {
	if twos.BuildGenericIndexPattern(twos.CommentPrefix) != "comment-*" {
		t.Error("expected comment-*")
	}

	if twos.BuildGenericIndexPattern(twos.EntityPrefix, twos.ConsolidatedPrefix) != "entity-consolidated-*" {
		t.Error("expected entity-consolidated-*")
	}
}

func TestBuildIndex(t *testing.T) {
	date, err := time.Parse(time.RFC3339, "1993-10-21T20:54:05Z")
	if err != nil {
		t.Error(err)
	}

	gen := twos.BuildIndex(date, "2006-01", twos.RelationPrefix, twos.HistoryPrefix)

	if gen != "relation-history-1993-10" {
		t.Error("expected relation-history-1993-10")
	}
}
