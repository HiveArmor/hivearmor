// Seed realistic SIEM data into HiveArmor OpenSearch indices.
// Generates Linux, Windows, Suricata, NetFlow events + alerts.
package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"
)

var (
	osHost = getEnv("OPENSEARCH_HOST", "localhost")
	osPort = getEnv("OPENSEARCH_PORT", "9200")
	osUser = getEnv("OPENSEARCH_USER", "admin")
	osPass = getEnv("OPENSEARCH_PASSWORD", "LocalDev@2024!")
	base   = fmt.Sprintf("https://%s:%s", osHost, osPort)
	client = &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
)

type doc map[string]any

func main() {
	now := time.Now().UTC()
	today := now.Format("2006.01.02")
	rng := rand.New(rand.NewSource(42))

	total := 0

	fmt.Println("→ Seeding Linux auth events...")
	total += seedLinux(today, now, rng)

	fmt.Println("→ Seeding Windows events...")
	total += seedWindows(today, now, rng)

	fmt.Println("→ Seeding Suricata NIDS events...")
	total += seedSuricata(today, now, rng)

	fmt.Println("→ Seeding NetFlow records...")
	total += seedNetflow(today, now, rng)

	fmt.Println("→ Seeding alerts...")
	total += seedAlerts(today, now, rng)

	fmt.Println("→ Seeding lookup tables (assets + identities)...")
	total += seedLookupTables(now)

	fmt.Printf("\n✓ Seeded %d documents total.\n", total)
}

// ─── sample data ─────────────────────────────────────────────────────────────

var linuxHosts = []string{
	"web-prod-01.hivearmor.local",
	"web-prod-02.hivearmor.local",
	"db-primary.hivearmor.local",
	"db-replica.hivearmor.local",
	"bastion.hivearmor.local",
	"api-gateway.hivearmor.local",
}

var windowsHosts = []string{
	"WIN-DC-01.corp.local",
	"WIN-WKSTN-042.corp.local",
	"WIN-WKSTN-103.corp.local",
	"WIN-SRV-IIS-01.corp.local",
	"WIN-SQLSRV-02.corp.local",
}

var attackerIPs = []string{
	"185.220.101.47", "45.142.212.100", "91.108.56.200",
	"194.165.16.99", "103.75.190.50", "198.98.51.189",
	"196.201.239.38", "5.188.86.172",
}

var internalIPs = []string{
	"10.0.1.10", "10.0.1.11", "10.0.1.12",
	"10.0.2.50", "10.0.2.51",
	"172.16.0.5", "172.16.0.6",
	"192.168.1.100", "192.168.1.101",
}

var users = []string{
	"alice", "bob", "charlie", "dave", "root", "admin",
	"svc_backup", "svc_monitor", "jenkins", "deploy",
}

var windowsUsers = []string{
	"jdoe", "msmith", "awilson", "rlee", "administrator",
	"svc_sql", "svc_iis", "SYSTEM",
}

func pickRandom(rng *rand.Rand, items []string) string {
	return items[rng.Intn(len(items))]
}

func ts(base time.Time, rng *rand.Rand, maxSecsAgo int) string {
	d := time.Duration(rng.Intn(maxSecsAgo)) * time.Second
	return base.Add(-d).Format(time.RFC3339Nano)
}

// ─── Linux ───────────────────────────────────────────────────────────────────

func seedLinux(today string, now time.Time, rng *rand.Rand) int {
	var docs []doc

	// 60 successful SSH logins
	for i := 0; i < 60; i++ {
		src := pickRandom(rng, internalIPs)
		host := pickRandom(rng, linuxHosts)
		user := pickRandom(rng, users)
		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 86400),
			"id":         newID(rng),
			"dataType":   "linux",
			"dataSource": host,
			"raw":        fmt.Sprintf("sshd[1234]: Accepted publickey for %s from %s port %d ssh2", user, src, 1024+rng.Intn(60000)),
			"action":     "system.auth",
			"actionResult": "accepted",
			"severity":   "low",
			"origin": doc{"ip": src, "user": user, "port": 1024 + rng.Intn(60000)},
			"target": doc{"host": host, "port": 22},
			"log":    doc{"message": fmt.Sprintf("Accepted publickey for %s from %s", user, src), "hostId": host},
		})
	}

	// 120 failed SSH logins (brute force pattern — same attacker IP)
	attackerIP := attackerIPs[0]
	bruteUser := "root"
	for i := 0; i < 120; i++ {
		host := pickRandom(rng, linuxHosts)
		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 3600),
			"id":         newID(rng),
			"dataType":   "linux",
			"dataSource": host,
			"raw":        fmt.Sprintf("sshd[5678]: Failed password for %s from %s port %d ssh2", bruteUser, attackerIP, 1024+rng.Intn(60000)),
			"action":     "system.auth",
			"actionResult": "denied",
			"severity":   "medium",
			"origin": doc{"ip": attackerIP, "user": bruteUser, "port": 1024 + rng.Intn(60000)},
			"target": doc{"host": host, "port": 22},
			"log": doc{
				"message": fmt.Sprintf("Failed password for %s from %s", bruteUser, attackerIP),
				"hostId":  host,
			},
		})
	}

	// 40 sudo commands
	for i := 0; i < 40; i++ {
		src := pickRandom(rng, internalIPs)
		host := pickRandom(rng, linuxHosts)
		user := pickRandom(rng, users[:5]) // non-root users
		cmds := []string{"/bin/cat /etc/passwd", "/usr/bin/apt update", "/sbin/reboot", "/bin/systemctl restart nginx", "/usr/bin/crontab -e"}
		cmd := cmds[rng.Intn(len(cmds))]
		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 86400),
			"id":         newID(rng),
			"dataType":   "linux",
			"dataSource": host,
			"raw":        fmt.Sprintf("%s : TTY=pts/0 ; PWD=/home/%s ; USER=root ; COMMAND=%s", user, user, cmd),
			"action":     "sudo",
			"actionResult": "executed",
			"severity":   "info",
			"origin": doc{"ip": src, "user": user, "process": "sudo"},
			"target": doc{"host": host, "user": "root"},
			"log":    doc{"message": fmt.Sprintf("sudo: %s executed: %s", user, cmd), "hostId": host, "command": cmd},
		})
	}

	// 50 auditd syscall events
	syscalls := []string{"execve", "open", "unlink", "rename", "chmod", "connect", "bind"}
	for i := 0; i < 50; i++ {
		src := pickRandom(rng, internalIPs)
		host := pickRandom(rng, linuxHosts)
		user := pickRandom(rng, users)
		syscall := syscalls[rng.Intn(len(syscalls))]
		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 86400),
			"id":         newID(rng),
			"dataType":   "linux",
			"dataSource": host,
			"raw":        fmt.Sprintf("type=SYSCALL msg=audit(...): arch=c000003e syscall=%s success=yes", syscall),
			"action":     syscall,
			"actionResult": "success",
			"severity":   "info",
			"origin": doc{"ip": src, "user": user, "process": "bash"},
			"target": doc{"host": host},
			"log":    doc{"message": fmt.Sprintf("auditd: syscall %s by %s", syscall, user), "hostId": host, "syscall": syscall},
		})
	}

	// 30 SELinux disable attempts (matches a detection rule)
	for i := 0; i < 30; i++ {
		src := pickRandom(rng, attackerIPs)
		host := pickRandom(rng, linuxHosts)
		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 43200),
			"id":         newID(rng),
			"dataType":   "linux",
			"dataSource": host,
			"raw":        "bash: setenforce 0",
			"action":     "setenforce",
			"actionResult": "attempted",
			"severity":   "high",
			"origin": doc{"ip": src, "user": "root", "process": "bash"},
			"target": doc{"host": host},
			"log":    doc{"message": "setenforce 0", "hostId": host, "command": "setenforce 0"},
		})
	}

	return bulkIndex("_v3_hive_log-linux-"+today, docs)
}

// ─── Windows ─────────────────────────────────────────────────────────────────

var eventNames = map[int]string{
	4624: "An account was successfully logged on",
	4625: "An account failed to log on",
	4688: "A new process has been created",
	4697: "A service was installed in the system",
	4720: "A user account was created",
	4732: "A member was added to a security-enabled local group",
	4768: "A Kerberos authentication ticket was requested",
	4776: "The computer attempted to validate the credentials for an account",
	4103: "Module logging",
	4104: "Script block logging",
}

func seedWindows(today string, now time.Time, rng *rand.Rand) int {
	var docs []doc

	eventCodes := []int{4624, 4625, 4688, 4697, 4720, 4732, 4768, 4776, 4103, 4104}

	for i := 0; i < 200; i++ {
		host := pickRandom(rng, windowsHosts)
		user := pickRandom(rng, windowsUsers)
		code := eventCodes[rng.Intn(len(eventCodes))]
		srcIP := pickRandom(rng, append(internalIPs, attackerIPs...))
		name := eventNames[code]

		severity := "info"
		if code == 4625 || code == 4697 || code == 4104 {
			severity = "medium"
		}
		if code == 4720 || code == 4732 {
			severity = "high"
		}

		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 86400),
			"id":         newID(rng),
			"dataType":   "wineventlog",
			"dataSource": host,
			"raw":        fmt.Sprintf("EventID=%d Category=Security User=%s Source=%s", code, user, srcIP),
			"action":     "windows.event",
			"actionResult": "logged",
			"severity":   severity,
			"origin": doc{"ip": srcIP, "user": user, "host": host},
			"target": doc{"host": host, "user": user},
			"log": doc{
				"eventCode":                        code,
				"eventName":                        name,
				"hostId":                           host,
				"data": doc{
					"SubjectUserName":  user,
					"TargetUserName":   user,
					"IpAddress":        srcIP,
					"LogonType":        rng.Intn(10) + 2,
					"WorkstationName":  host,
				},
			},
		})
	}

	return bulkIndex("_v3_hive_log-wineventlog-"+today, docs)
}

// ─── Suricata ─────────────────────────────────────────────────────────────────

var suricataSigs = []struct {
	id       int
	msg      string
	category string
	severity int
}{
	{2001219, "ET SCAN Potential SSH Scan", "Attempted Information Leak", 2},
	{2019284, "ET EXPLOIT Apache Log4j RCE", "Attempted Administrator Privilege Gain", 1},
	{2030973, "ET DROP Spamhaus DROP Listed Traffic Inbound", "Misc Attack", 2},
	{2008446, "ET POLICY PE EXE or DLL Windows file download HTTP", "Potential Corporate Privacy Violation", 3},
	{2023478, "ET MALWARE CobaltStrike Beacon Observed", "A Network Trojan was Detected", 1},
	{2014726, "ET DNS Query for .bit TLD", "Potentially Bad Traffic", 3},
	{2022959, "ET INFO Commonly Abused Domain *.ngrok.io", "Potentially Bad Traffic", 3},
}

func seedSuricata(today string, now time.Time, rng *rand.Rand) int {
	var docs []doc

	for i := 0; i < 100; i++ {
		sig := suricataSigs[rng.Intn(len(suricataSigs))]
		srcIP := pickRandom(rng, attackerIPs)
		dstIP := pickRandom(rng, internalIPs)
		dstHost := pickRandom(rng, linuxHosts)
		proto := []string{"tcp", "udp", "icmp"}[rng.Intn(3)]

		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 43200),
			"id":         newID(rng),
			"dataType":   "suricata",
			"dataSource": dstHost,
			"raw":        fmt.Sprintf(`{"event_type":"alert","src_ip":"%s","dest_ip":"%s","proto":"%s","alert":{"signature_id":%d,"signature":"%s","category":"%s","severity":%d}}`, srcIP, dstIP, proto, sig.id, sig.msg, sig.category, sig.severity),
			"action":     "alert",
			"actionResult": "detected",
			"severity":   []string{"critical", "high", "medium", "low"}[sig.severity-1],
			"protocol":   proto,
			"origin": doc{
				"ip":   srcIP,
				"port": 1024 + rng.Intn(60000),
			},
			"target": doc{
				"ip":   dstIP,
				"host": dstHost,
				"port": []int{80, 443, 22, 8080, 3389, 445}[rng.Intn(6)],
			},
			"log": doc{
				"alert": doc{
					"signature_id": sig.id,
					"signature":    sig.msg,
					"category":     sig.category,
					"severity":     sig.severity,
				},
				"hostId": dstHost,
			},
		})
	}

	return bulkIndex("_v3_hive_log-suricata-"+today, docs)
}

// ─── NetFlow ─────────────────────────────────────────────────────────────────

func seedNetflow(today string, now time.Time, rng *rand.Rand) int {
	var docs []doc
	protos := []string{"6", "17", "1", "132"} // TCP, UDP, ICMP, SCTP
	protoNames := map[string]string{"6": "tcp", "17": "udp", "1": "icmp", "132": "sctp"}

	for i := 0; i < 50; i++ {
		srcIP := pickRandom(rng, append(internalIPs, attackerIPs...))
		dstIP := pickRandom(rng, internalIPs)
		proto := protos[rng.Intn(len(protos))]
		bytesSent := int64(rng.Intn(1048576) + 64)
		pkts := bytesSent / int64(rng.Intn(1400)+64)

		docs = append(docs, doc{
			"@timestamp": ts(now, rng, 86400),
			"id":         newID(rng),
			"dataType":   "netflow",
			"dataSource": "netflow-collector.hivearmor.local",
			"raw":        fmt.Sprintf("src=%s dst=%s proto=%s bytes=%d pkts=%d", srcIP, dstIP, proto, bytesSent, pkts),
			"action":     "netflow",
			"actionResult": "recorded",
			"severity":   "info",
			"protocol":   protoNames[proto],
			"origin": doc{
				"ip":        srcIP,
				"port":      1024 + rng.Intn(60000),
				"bytesSent": bytesSent,
				"packagesSent": pkts,
			},
			"target": doc{
				"ip":   dstIP,
				"port": []int{80, 443, 22, 25, 53, 3306, 5432, 6379, 9200}[rng.Intn(9)],
			},
			"log": doc{
				"flow": doc{
					"bytestoserver":   bytesSent,
					"pktstoserver":    pkts,
					"bytestoclient":   bytesSent / 3,
					"pktstoclient":    pkts / 3,
				},
			},
		})
	}

	return bulkIndex("_v3_hive_log-netflow-"+today, docs)
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

func seedAlerts(today string, now time.Time, rng *rand.Rand) int {
	var docs []doc

	// 10 brute force alerts
	for i := 0; i < 10; i++ {
		srcIP := pickRandom(rng, attackerIPs)
		host := pickRandom(rng, linuxHosts)
		t := ts(now, rng, 7200)
		docs = append(docs, buildAlert(rng, alertSpec{
			id: newID(rng), ts: t,
			name:      "System Linux: Possible Brute Force Attack",
			category:  "Credential Access",
			technique: "T1110 - Brute Force",
			severity:  2, severityLabel: "Medium",
			dataType: "linux", dataSource: host,
			status: 1, statusLabel: "Automatic review",
			impact:         doc{"confidentiality": 2, "integrity": 2, "availability": 3},
			impactScore:    7,
			adversaryIP:    srcIP, adversaryUser: "root",
			targetHost:     host,
			description:    "Possible brute force attack detected. Multiple failed SSH authentication attempts from the same source IP within a short time window.",
			technique_url:  "https://attack.mitre.org/techniques/T1110/",
			deduplicatedBy: []string{"origin.ip", "origin.user"},
			groupedBy:      []string{"origin.ip"},
		}))
	}

	// 5 Windows credential dumping
	for i := 0; i < 5; i++ {
		srcIP := pickRandom(rng, attackerIPs)
		host := pickRandom(rng, windowsHosts)
		t := ts(now, rng, 14400)
		docs = append(docs, buildAlert(rng, alertSpec{
			id: newID(rng), ts: t,
			name:      "Windows: OS Credential Dumping via Mimikatz",
			category:  "Credential Access",
			technique: "T1003.001 - OS Credential Dumping: LSASS Memory",
			severity:  3, severityLabel: "High",
			dataType: "wineventlog", dataSource: host,
			status: 2, statusLabel: "Open",
			impact:         doc{"confidentiality": 3, "integrity": 2, "availability": 1},
			impactScore:    9,
			adversaryIP:    srcIP, adversaryUser: pickRandom(rng, windowsUsers),
			targetHost:     host,
			description:    "Mimikatz-style credential dumping detected via LSASS memory access. Indicates an attacker attempting to harvest credential material.",
			technique_url:  "https://attack.mitre.org/techniques/T1003/001/",
			deduplicatedBy: []string{"origin.ip", "target.host"},
			groupedBy:      []string{"origin.ip"},
		}))
	}

	// 3 Suricata port scan
	for i := 0; i < 3; i++ {
		srcIP := pickRandom(rng, attackerIPs)
		host := pickRandom(rng, linuxHosts)
		t := ts(now, rng, 21600)
		docs = append(docs, buildAlert(rng, alertSpec{
			id: newID(rng), ts: t,
			name:      "Suricata: Network Port Scan Detected",
			category:  "Reconnaissance",
			technique: "T1046 - Network Service Scanning",
			severity:  1, severityLabel: "Low",
			dataType: "suricata", dataSource: host,
			status: 1, statusLabel: "Automatic review",
			impact:         doc{"confidentiality": 1, "integrity": 0, "availability": 1},
			impactScore:    2,
			adversaryIP:    srcIP, adversaryUser: "",
			targetHost:     host,
			description:    "Network port scan detected. Source IP is probing multiple destination ports indicating reconnaissance activity.",
			technique_url:  "https://attack.mitre.org/techniques/T1046/",
			deduplicatedBy: []string{"origin.ip"},
			groupedBy:      []string{},
		}))
	}

	// 2 ransomware file deletion
	for i := 0; i < 2; i++ {
		srcIP := pickRandom(rng, attackerIPs)
		host := pickRandom(rng, windowsHosts)
		t := ts(now, rng, 3600)
		docs = append(docs, buildAlert(rng, alertSpec{
			id: newID(rng), ts: t,
			name:      "Windows: Possible ransomware attack detected. Multiple File Deletion.",
			category:  "Impact",
			technique: "T1486 - Data Encrypted for Impact",
			severity:  3, severityLabel: "High",
			dataType: "wineventlog", dataSource: host,
			status: 2, statusLabel: "Open",
			isIncident:     true,
			impact:         doc{"confidentiality": 1, "integrity": 3, "availability": 2},
			impactScore:    10,
			adversaryIP:    srcIP, adversaryUser: pickRandom(rng, windowsUsers),
			targetHost:     host,
			description:    "Possible ransomware activity. Multiple file deletion/encryption events detected in user directories within a 5-minute window.",
			technique_url:  "https://attack.mitre.org/techniques/T1486/",
			deduplicatedBy: []string{"origin.ip", "target.user"},
			groupedBy:      []string{"origin.ip"},
		}))
	}

	// 3 SELinux disable alerts
	for i := 0; i < 3; i++ {
		srcIP := pickRandom(rng, attackerIPs)
		host := pickRandom(rng, linuxHosts)
		t := ts(now, rng, 28800)
		docs = append(docs, buildAlert(rng, alertSpec{
			id: newID(rng), ts: t,
			name:      "System Linux: Potential Disabling of SELinux",
			category:  "Defense Evasion",
			technique: "T1562.001 - Impair Defenses",
			severity:  2, severityLabel: "Medium",
			dataType: "linux", dataSource: host,
			status: 1, statusLabel: "Automatic review",
			impact:         doc{"confidentiality": 1, "integrity": 2, "availability": 3},
			impactScore:    6,
			adversaryIP:    srcIP, adversaryUser: "root",
			targetHost:     host,
			description:    "A process attempted to disable SELinux by executing 'setenforce 0'. This may indicate an attacker attempting to disable host-based security controls.",
			technique_url:  "https://attack.mitre.org/techniques/T1562/001/",
			deduplicatedBy: []string{"origin.ip"},
			groupedBy:      []string{"origin.ip"},
		}))
	}

	// 2 CobaltStrike beacon
	for i := 0; i < 2; i++ {
		srcIP := pickRandom(rng, attackerIPs)
		host := pickRandom(rng, windowsHosts)
		t := ts(now, rng, 10800)
		docs = append(docs, buildAlert(rng, alertSpec{
			id: newID(rng), ts: t,
			name:      "Suricata: CobaltStrike Beacon C2 Communication",
			category:  "Command and Control",
			technique: "T1071.001 - Application Layer Protocol: Web Protocols",
			severity:  3, severityLabel: "High",
			dataType: "suricata", dataSource: host,
			status: 2, statusLabel: "Open",
			isIncident:     true,
			impact:         doc{"confidentiality": 3, "integrity": 3, "availability": 2},
			impactScore:    10,
			adversaryIP:    srcIP, adversaryUser: "",
			targetHost:     host,
			description:    "CobaltStrike Beacon C2 communication detected. The affected host appears to have an active command-and-control channel to a known attacker IP.",
			technique_url:  "https://attack.mitre.org/techniques/T1071/001/",
			deduplicatedBy: []string{"origin.ip", "target.host"},
			groupedBy:      []string{"origin.ip"},
		}))
	}

	return bulkIndex("_v3_hive_alert-"+today, docs)
}

type alertSpec struct {
	id, ts         string
	name           string
	category       string
	technique      string
	severity       int
	severityLabel  string
	dataType       string
	dataSource     string
	status         int
	statusLabel    string
	isIncident     bool
	impact         doc
	impactScore    int
	adversaryIP    string
	adversaryUser  string
	targetHost     string
	description    string
	technique_url  string
	deduplicatedBy []string
	groupedBy      []string
}

func buildAlert(rng *rand.Rand, s alertSpec) doc {
	adversary := doc{
		"ip":   s.adversaryIP,
		"host": s.adversaryIP,
	}
	if s.adversaryUser != "" {
		adversary["user"] = s.adversaryUser
	}
	// add fake geo
	adversary["geolocation"] = doc{
		"country":     []string{"Russia", "China", "Romania", "Netherlands", "Germany"}[rng.Intn(5)],
		"city":        []string{"Moscow", "Beijing", "Bucharest", "Amsterdam", "Berlin"}[rng.Intn(5)],
		"countryCode": []string{"RU", "CN", "RO", "NL", "DE"}[rng.Intn(5)],
		"latitude":    rng.Float64()*180 - 90,
		"longitude":   rng.Float64()*360 - 180,
	}

	return doc{
		"@timestamp":     s.ts,
		"id":             s.id,
		"name":           s.name,
		"category":       s.category,
		"technique":      s.technique,
		"description":    s.description,
		"reference":      []string{s.technique_url},
		"severity":       s.severity,
		"severityLabel":  s.severityLabel,
		"status":         s.status,
		"statusLabel":    s.statusLabel,
		"statusObservation": "",
		"isIncident":     s.isIncident,
		"dataType":       s.dataType,
		"dataSource":     s.dataSource,
		"impact":         s.impact,
		"impactScore":    s.impactScore,
		"adversary":      adversary,
		"target": doc{
			"host": s.targetHost,
			"ip":   pickRandom(rng, internalIPs),
		},
		"tags":           []string{},
		"notes":          "",
		"deduplicatedBy": s.deduplicatedBy,
		"groupedBy":      s.groupedBy,
		"errors":         []string{},
		"events":         []doc{},
	}
}

// ─── Lookup tables ──────────────────────────────────────────────────────────

func seedLookupTables(now time.Time) int {
	var docs []doc
	ts := now.UTC().Format(time.RFC3339)

	// Assets
	type asset struct {
		ip, hostname, biz, criticality, owner string
	}
	assets := []asset{
		{"10.0.1.10", "web-prod-01.hivearmor.local", "Engineering", "critical", "ops-team"},
		{"10.0.1.11", "web-prod-02.hivearmor.local", "Engineering", "critical", "ops-team"},
		{"10.0.2.50", "db-primary.hivearmor.local", "Engineering", "critical", "dba-team"},
		{"10.0.2.51", "db-replica.hivearmor.local", "Engineering", "high", "dba-team"},
		{"172.16.0.5", "bastion.hivearmor.local", "Security", "critical", "security-team"},
		{"172.16.0.6", "api-gateway.hivearmor.local", "Engineering", "high", "ops-team"},
		{"192.168.1.100", "WIN-DC-01.corp.local", "IT", "critical", "it-team"},
		{"192.168.1.101", "WIN-WKSTN-042.corp.local", "Finance", "medium", "finance-dept"},
	}
	for _, a := range assets {
		docs = append(docs, doc{
			"@timestamp":   ts,
			"type":         "asset",
			"ip":           a.ip,
			"hostname":     a.hostname,
			"businessUnit": a.biz,
			"criticality":  a.criticality,
			"owner":        a.owner,
			"updatedAt":    ts,
		})
	}

	// Identities
	type identity struct {
		username, displayName, email, dept, accessTier, manager string
	}
	identities := []identity{
		{"alice", "Alice Chen", "alice@hivearmor.local", "Engineering", "elevated", "bob"},
		{"bob", "Bob Martinez", "bob@hivearmor.local", "Engineering", "admin", "charlie"},
		{"charlie", "Charlie Davis", "charlie@hivearmor.local", "Engineering", "admin", "cto"},
		{"jdoe", "John Doe", "jdoe@corp.local", "Finance", "standard", "msmith"},
		{"msmith", "Mary Smith", "msmith@corp.local", "Finance", "elevated", "cfo"},
		{"administrator", "Local Admin", "admin@corp.local", "IT", "admin", "it-director"},
		{"svc_sql", "SQL Service Account", "svc_sql@corp.local", "IT", "service", "it-director"},
	}
	for _, id := range identities {
		docs = append(docs, doc{
			"@timestamp":  ts,
			"type":        "identity",
			"username":    id.username,
			"displayName": id.displayName,
			"email":       id.email,
			"department":  id.dept,
			"accessTier":  id.accessTier,
			"manager":     id.manager,
			"updatedAt":   ts,
		})
	}

	// Threat intel: known malicious IPs
	for _, ip := range attackerIPs {
		docs = append(docs, doc{
			"@timestamp": ts,
			"type":       "threat-intel",
			"ip":         ip,
			"malicious":  true,
			"source":     "spamhaus-drop",
			"confidence": 90,
			"firstSeen":  now.Add(-720 * time.Hour).Format(time.RFC3339),
			"lastSeen":   ts,
			"tags":       []string{"botnet", "scanner"},
		})
	}

	return bulkIndex("_v3_hive_lookup-assets", docs[:len(assets)]) +
		bulkIndex("_v3_hive_lookup-identities", docs[len(assets):len(assets)+len(identities)]) +
		bulkIndex("_v3_hive_lookup-threat-intel", docs[len(assets)+len(identities):])
}

// ─── OpenSearch bulk helpers ─────────────────────────────────────────────────

func bulkIndex(index string, docs []doc) int {
	if len(docs) == 0 {
		return 0
	}
	var buf bytes.Buffer
	for _, d := range docs {
		id, _ := d["id"].(string)
		if id == "" {
			id = newID(rand.New(rand.NewSource(time.Now().UnixNano())))
		}
		meta := fmt.Sprintf(`{"index":{"_index":%q,"_id":%q}}`, index, id)
		buf.WriteString(meta + "\n")
		b, _ := json.Marshal(d)
		buf.Write(b)
		buf.WriteByte('\n')
	}

	req, _ := http.NewRequest("POST", base+"/_bulk", bytes.NewReader(buf.Bytes()))
	req.SetBasicAuth(osUser, osPass)
	req.Header.Set("Content-Type", "application/x-ndjson")
	resp, err := client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  bulk error %s: %v\n", index, err)
		return 0
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		fmt.Fprintf(os.Stderr, "  bulk HTTP %d for %s: %s\n", resp.StatusCode, index, string(b))
		return 0
	}
	// check for errors in response
	var result struct {
		Errors bool `json:"errors"`
		Items  []map[string]struct {
			Status int    `json:"status"`
			Error  string `json:"error"`
		} `json:"items"`
	}
	json.Unmarshal(b, &result)
	errCount := 0
	for _, item := range result.Items {
		for _, v := range item {
			if v.Status >= 300 {
				errCount++
			}
		}
	}
	if errCount > 0 {
		fmt.Fprintf(os.Stderr, "  %s: %d docs had errors\n", index, errCount)
	}
	fmt.Printf("   %s: %d docs indexed\n", index, len(docs)-errCount)
	return len(docs) - errCount
}

// hex-like ID without importing crypto
func newID(rng *rand.Rand) string {
	const chars = "abcdef0123456789"
	parts := []string{}
	for _, l := range []int{8, 4, 4, 4, 12} {
		var sb strings.Builder
		for i := 0; i < l; i++ {
			sb.WriteByte(chars[rng.Intn(len(chars))])
		}
		parts = append(parts, sb.String())
	}
	return strings.Join(parts, "-")
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
