package extractor

import "strings"

// Entity types extracted from HiveArmor log events.

type IpEntity struct {
	Address     string
	Country     string
	ASN         string
	IsMalicious bool
}

type HostEntity struct {
	Hostname string
}

type UserEntity struct {
	Username string
}

type ProcessEntity struct {
	Name   string
	SHA256 string
}

type FileEntity struct {
	Path string
}

type DomainEntity struct {
	Name string
}

type AlertEntity struct {
	AlertID      string
	Severity     int // 1-10 normalised from string
	InvolvedIPs  []string
	InvolvedHosts []string
	InvolvedUsers []string
}

type ExtractedEntities struct {
	IPs       []IpEntity
	Hosts     []HostEntity
	Users     []UserEntity
	Processes []ProcessEntity
	Files     []FileEntity
	Domains   []DomainEntity
	Alert     *AlertEntity
}

// ExtractFromEvent pulls entity values from a flat HiveArmor event document.
// The event map uses dot-notation keys as they come off Kafka (processed.events).
func ExtractFromEvent(event map[string]any) ExtractedEntities {
	var out ExtractedEntities

	addIP := func(v any) {
		if s := str(v); s != "" {
			out.IPs = appendUnique(out.IPs, IpEntity{Address: s}, func(e IpEntity) string { return e.Address })
		}
	}
	addHost := func(v any) {
		if s := str(v); s != "" {
			out.Hosts = appendUnique(out.Hosts, HostEntity{Hostname: s}, func(e HostEntity) string { return e.Hostname })
		}
	}
	addUser := func(v any) {
		if s := str(v); s != "" {
			out.Users = appendUnique(out.Users, UserEntity{Username: s}, func(e UserEntity) string { return e.Username })
		}
	}

	// IPs
	addIP(event["logx.srcIp"])
	addIP(event["logx.dstIp"])
	addIP(event["logx.origin.ip"])
	addIP(event["logx.winlog.event_data.IpAddress"])
	addIP(event["origin.ip"])
	addIP(event["target.ip"])

	// Hosts
	addHost(event["logx.hostname"])
	addHost(event["logx.srcHost"])
	addHost(event["logx.dstHost"])
	addHost(event["logx.winlog.computer_name"])
	addHost(event["origin.host"])
	addHost(event["target.host"])

	// Users
	addUser(event["logx.srcUser"])
	addUser(event["logx.dstUser"])
	addUser(event["logx.winlog.event_data.SubjectUserName"])
	addUser(event["origin.user"])
	addUser(event["target.user"])

	// Processes
	processName := str(event["logx.process.name"])
	if processName == "" {
		processName = str(event["logx.winlog.event_data.NewProcessName"])
	}
	if processName != "" {
		out.Processes = append(out.Processes, ProcessEntity{
			Name:   processName,
			SHA256: str(event["logx.process.hash.sha256"]),
		})
	}

	// Files
	filePath := str(event["logx.file.path"])
	if filePath == "" {
		filePath = str(event["logx.winlog.event_data.ObjectName"])
	}
	if filePath != "" {
		out.Files = append(out.Files, FileEntity{Path: filePath})
	}

	// Domains
	domain := str(event["logx.dns.question.name"])
	if domain == "" {
		domain = str(event["logx.url.domain"])
	}
	if domain != "" {
		out.Domains = append(out.Domains, DomainEntity{Name: domain})
	}

	// Alert (present when the event is also an alert)
	alertID := str(event["alertId"])
	if alertID == "" {
		alertID = str(event["id"])
	}
	if str(event["type"]) == "alert" || str(event["@type"]) == "alert" {
		severityStr := strings.ToLower(str(event["severity"]))
		out.Alert = &AlertEntity{
			AlertID:  alertID,
			Severity: severityToInt(severityStr),
		}
		for _, ip := range out.IPs {
			out.Alert.InvolvedIPs = append(out.Alert.InvolvedIPs, ip.Address)
		}
		for _, h := range out.Hosts {
			out.Alert.InvolvedHosts = append(out.Alert.InvolvedHosts, h.Hostname)
		}
		for _, u := range out.Users {
			out.Alert.InvolvedUsers = append(out.Alert.InvolvedUsers, u.Username)
		}
	}

	return out
}

func str(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

func severityToInt(s string) int {
	switch s {
	case "critical":
		return 10
	case "high":
		return 7
	case "medium":
		return 5
	case "low":
		return 3
	default:
		return 1
	}
}

// appendUnique appends item to slice only if keyFn(item) is not already present.
func appendUnique[T any](slice []T, item T, keyFn func(T) string) []T {
	k := keyFn(item)
	for _, existing := range slice {
		if keyFn(existing) == k {
			return slice
		}
	}
	return append(slice, item)
}
