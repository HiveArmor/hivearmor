// Package os provides OpenSearch client helpers for HiveArmor.
package os

import (
	"fmt"
	"strings"
	"time"
)

// indexPrefix is the immutable version prefix shared by all HiveArmor OpenSearch indices.
// The format v3-hive-<type>-YYYY.MM.DD is locked across all services.
// Changing it requires migrating every existing index and every query across all services.
const indexPrefix = "v3-hive"

// dateFormat is the date suffix format used in all HiveArmor index names.
// It is defined here so that index name construction is always consistent.
const dateFormat = "2006.01.02"

// BuildCurrentDayIndex returns the standard non-tenant index name for the current UTC day.
//
// Format: v3-hive-<dataType>-YYYY.MM.DD
//
// Examples:
//   - BuildCurrentDayIndex("alert") → "v3-hive-alert-2026.07.25"
//   - BuildCurrentDayIndex("event") → "v3-hive-event-2026.07.25"
//
// This is the default write index for single-tenant (non-MSSP) deployments.
func BuildCurrentDayIndex(dataType string) string {
	return fmt.Sprintf("%s-%s-%s",
		indexPrefix,
		sanitizeIndexPart(dataType),
		time.Now().UTC().Format(dateFormat),
	)
}

// BuildTenantIndex returns the MSSP tenant-scoped index name for the current UTC day.
//
// Format: v3-hive-<dataType>-<tenantPrefix>-YYYY.MM.DD
//
// If tenantPrefix is empty, falls back to BuildCurrentDayIndex (single-tenant behaviour).
//
// Examples:
//   - BuildTenantIndex("alert", "acme")   → "v3-hive-alert-acme-2026.07.25"
//   - BuildTenantIndex("event", "globex") → "v3-hive-event-globex-2026.07.25"
//   - BuildTenantIndex("alert", "")       → "v3-hive-alert-2026.07.25"  (no tenant prefix)
func BuildTenantIndex(dataType, tenantPrefix string) string {
	if tenantPrefix == "" {
		return BuildCurrentDayIndex(dataType)
	}
	return fmt.Sprintf("%s-%s-%s-%s",
		indexPrefix,
		sanitizeIndexPart(dataType),
		sanitizeIndexPart(tenantPrefix),
		time.Now().UTC().Format(dateFormat),
	)
}

// BuildIndexPattern returns the wildcard index pattern matching all dates for a data type.
//
// Format: v3-hive-<dataType>-*
//
// Examples:
//   - BuildIndexPattern("alert") → "v3-hive-alert-*"
//   - BuildIndexPattern("event") → "v3-hive-event-*"
//
// Use this for search queries that must span multiple days.
func BuildIndexPattern(dataType string) string {
	return fmt.Sprintf("%s-%s-*", indexPrefix, sanitizeIndexPart(dataType))
}

// BuildTenantIndexPattern returns the wildcard index pattern for a specific tenant
// across all dates.
//
// Format: v3-hive-<dataType>-<tenantPrefix>-*
//
// If tenantPrefix is empty, falls back to BuildIndexPattern (non-tenant wildcard).
//
// Examples:
//   - BuildTenantIndexPattern("alert", "acme") → "v3-hive-alert-acme-*"
//   - BuildTenantIndexPattern("event", "")     → "v3-hive-event-*"
//
// Use this for MSSP search queries that must be scoped to a single tenant.
func BuildTenantIndexPattern(dataType, tenantPrefix string) string {
	if tenantPrefix == "" {
		return BuildIndexPattern(dataType)
	}
	return fmt.Sprintf("%s-%s-%s-*",
		indexPrefix,
		sanitizeIndexPart(dataType),
		sanitizeIndexPart(tenantPrefix),
	)
}

// sanitizeIndexPart lowercases and strips characters that are not safe in
// OpenSearch index names. Valid characters are: a-z, 0-9, hyphen.
// This prevents index injection and ensures consistent naming.
func sanitizeIndexPart(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
		// Everything else (spaces, underscores, dots, uppercase, etc.) is silently dropped
	}
	return b.String()
}
