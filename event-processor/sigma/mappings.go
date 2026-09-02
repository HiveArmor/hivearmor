package sigma

import "strings"

// epFieldMap maps a Sigma field name to the event-processor event JSON path.
// The event-processor event model is flatter than ECS (origin.*, target.*,
// log.*, raw, action, dataType) — see the shipped CEL rules. A field not found
// here falls back to a regex over `raw` (see resolveField), so an unmapped
// field never hard-fails a rule; it degrades to a raw-substring match.
//
// Keys are matched case-insensitively (Sigma field names vary in case across
// products), so this table is normalized to lower-case at init.
var epFieldMap = map[string]string{
	// process / command line
	"commandline":       "origin.command",
	"cs-uri-query":      "origin.command",
	"image":             "origin.process",
	"exe":               "origin.process",
	"commandname":       "origin.process",
	"originalfilename":  "origin.process",
	"parentimage":       "origin.parentProcess",
	"parentcommandline": "origin.parentCommand",
	// identity
	"user":            "origin.user",
	"subjectusername": "origin.user",
	"targetusername":  "target.user",
	// host
	"computername":    "origin.host",
	"workstationname": "origin.host",
	"host.hostname":   "origin.host",
	"hostname":        "origin.host",
	// event id
	"eventid":    "log.eventCode",
	"event.code": "log.eventCode",
	// network
	"ipaddress":       "origin.ip",
	"sourceip":        "origin.ip",
	"source.ip":       "origin.ip",
	"c-ip":            "origin.ip",
	"sourceipaddress": "origin.ip",
	"ip":              "origin.ip",
	"destinationip":   "target.ip",
	"destination.ip":  "target.ip",
	"r-ip":            "target.ip",
	"destinationport": "target.port",
	"destination.port": "target.port",
	"sourceport":      "origin.port",
	// files / registry
	"targetfilename": "origin.file",
	"targetobject":   "origin.registryKey",
	"objectname":     "origin.file",
	"imageloaded":    "origin.file",
	// service / task / pipe
	"servicename": "origin.service",
	"taskname":    "origin.task",
	"pipename":    "origin.pipe",
	// cloud
	"eventname":       "action",
	"details":         "raw",
}

// logSourceDataTypes maps a Sigma logsource (matched most-specific-first) to the
// event-processor dataTypes the compiled rule is evaluated against. A rule with
// no resolvable dataType is dropped by the loader ("missing dataTypes"), so an
// unmapped logsource is reported as an unsupported skip.
type logSourceKey struct {
	Product  string
	Category string
	Service  string
}

// resolveDataTypes returns the dataTypes for a logsource, matching from most to
// least specific. Returns nil if nothing matches.
func resolveDataTypes(ls LogSource) []string {
	p := strings.ToLower(strings.TrimSpace(ls.Product))
	c := strings.ToLower(strings.TrimSpace(ls.Category))
	s := strings.ToLower(strings.TrimSpace(ls.Service))

	switch {
	case p == "windows" && c == "process_creation":
		return []string{"windows", "wineventlog", "process", "windows-etw"}
	case p == "windows" && (c == "registry_event" || c == "registry_set" || c == "registry_add"):
		return []string{"windows", "wineventlog", "registry"}
	case s == "security":
		return []string{"windows", "wineventlog"}
	case s == "sysmon" || p == "windows":
		return []string{"windows", "wineventlog", "process"}
	case s == "auditd" || p == "linux":
		return []string{"linux", "auditd", "process"}
	case s == "dns" || c == "dns_query" || c == "dns":
		return []string{"dns", "netconn"}
	case s == "firewall" || s == "flow" || p == "network" || c == "firewall":
		return []string{"netflow", "netconn"}
	case s == "cloudtrail" || p == "aws":
		return []string{"cloudtrail", "aws"}
	case p == "azure" || s == "activitylogs" || s == "auditlogs" || s == "keyvault" || s == "signinlogs":
		return []string{"azure"}
	case c == "webserver" || c == "proxy" || s == "http":
		return []string{"http", "netconn"}
	default:
		return nil
	}
}

// levelToSeverity maps a Sigma level word to the event-processor severity int (1..5).
func levelToSeverity(level string) int {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "critical":
		return 5
	case "high":
		return 4
	case "medium":
		return 3
	case "low":
		return 2
	case "informational", "info":
		return 1
	default:
		return 3 // sensible default: medium
	}
}

// impactWord maps a low/medium/high/critical word to the uint32 1..4 scale used
// by the event-processor Impact struct. Empty/unknown → 0.
func impactWord(w string) uint32 {
	switch strings.ToLower(strings.TrimSpace(w)) {
	case "critical":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	default:
		return 0
	}
}

// init lower-cases the epFieldMap keys once so lookups are case-insensitive.
func init() {
	lowered := make(map[string]string, len(epFieldMap))
	for k, v := range epFieldMap {
		lowered[strings.ToLower(k)] = v
	}
	epFieldMap = lowered
}
