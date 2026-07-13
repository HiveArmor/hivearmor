package main

import "github.com/threatwinds/go-sdk/plugins"

// logEntry wraps a Log with a delivery result channel.
// sendLog() writes nil on successful engine delivery, error otherwise.
// The channel is buffered(1) so sendLog never blocks if ProcessLog has moved on.
type logEntry struct {
	log    *plugins.Log
	result chan error
}
