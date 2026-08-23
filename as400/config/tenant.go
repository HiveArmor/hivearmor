package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

var ErrTenantRequired = errors.New("collector tenant binding required")

func (c *Config) TenantString() string {
	if c == nil || c.TenantID <= 0 {
		return ""
	}
	return strconv.FormatInt(c.TenantID, 10)
}

func (c *Config) RequireTenant() error {
	if c == nil || c.TenantID <= 0 {
		return ErrTenantRequired
	}
	return nil
}

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
