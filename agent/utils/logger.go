package utils

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/hivearmor/shared/fs"
	"gopkg.in/natefinch/lumberjack.v2"
)

// Thin local logger — replaces github.com/threatwinds/logger to avoid
// pulling gin (and its codec stack) into the agent binary (AGT-SIZE-01).

var (
	Logger             = newHaLogger(200, "stdout")
	loggerOnceInstance sync.Once
	logLevelConfigFile = filepath.Join(fs.GetExecutablePath(), "log_level.yml")
	LogLevelMap        = map[string]int{
		"debug":    100,
		"info":     200,
		"notice":   300,
		"warning":  400,
		"error":    500,
		"critical": 502,
		"alert":    509,
	}
)

type LogLevels struct {
	Level string `yaml:"level"`
}

// HaLogger is a minimal level-filtered logger compatible with prior call sites.
type HaLogger struct {
	level  int
	logger *log.Logger
}

func InitLogger(filename string) {
	logLevel := LogLevels{}
	err := fs.ReadYAML(logLevelConfigFile, &logLevel)
	if err != nil {
		logLevel.Level = "info"
	}
	logLevelInt := 200
	if val, ok := LogLevelMap[logLevel.Level]; ok {
		logLevelInt = val
	}
	loggerOnceInstance.Do(func() {
		Logger = newHaLogger(logLevelInt, filename)
	})
}

func newHaLogger(level int, output string) *HaLogger {
	var w io.Writer = os.Stdout
	if output != "" && output != "stdout" {
		w = &lumberjack.Logger{
			Filename:   output,
			MaxSize:    5,
			MaxBackups: 100,
			MaxAge:     30,
		}
	}
	return &HaLogger{
		level:  level,
		logger: log.New(w, "", 0),
	}
}

func (l *HaLogger) enabled(code int) bool {
	return l != nil && l.logger != nil && code >= l.level
}

func (l *HaLogger) emit(code int, format string, args ...any) {
	if !l.enabled(code) {
		return
	}
	l.logger.Output(2, fmt.Sprintf(format, args...))
}

// LogF logs at the given numeric severity (100=debug … 500=error).
func (l *HaLogger) LogF(statusCode int, format string, args ...any) {
	l.emit(statusCode, format, args...)
}

// Info logs at info level (200).
func (l *HaLogger) Info(format string, args ...any) {
	l.emit(200, format, args...)
}

// ErrorF logs at error level (500).
func (l *HaLogger) ErrorF(format string, args ...any) {
	l.emit(500, format, args...)
}

// Fatal logs at critical level and exits the process.
func (l *HaLogger) Fatal(format string, args ...any) {
	l.emit(502, format, args...)
	os.Exit(1)
}
