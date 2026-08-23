package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

var ErrTenantRequired = errors.New("collector tenant binding required")

// TenantString returns the decimal tenant id for plugins.Log.TenantId.
// Empty means unbound.
func (c *Config) TenantString() string {
	if c == nil || c.TenantID <= 0 {
		return ""
	}
	return strconv.FormatInt(c.TenantID, 10)
}

// RequireTenant fails closed when the collector has no tenant binding.
func (c *Config) RequireTenant() error {
	if c == nil || c.TenantID <= 0 {
		return ErrTenantRequired
	}
	return nil
}

// ParseTenantID reads a positive int64 tenant id from env or install args.
// HA_TENANT_ID is preferred; optional install arg os.Args[5] is accepted.
func ParseTenantID() (int64, error) {
	raw := strings.TrimSpace(os.Getenv("HA_TENANT_ID"))
	if raw == "" && len(os.Args) > 5 {
		raw = strings.TrimSpace(os.Args[5])
	}
	if raw == "" {
		return 0, ErrTenantRequired
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrTenantRequired
	}
	return id, nil
}
