#!/usr/bin/env python3
"""Seed realistic log events into OpenSearch for UTMStack dashboard visualizations."""

import json
import random
import urllib.request
import urllib.error
import ssl
import base64
from datetime import datetime, timedelta, timezone

ES_URL = "https://localhost:9200"
ES_USER = "admin"
ES_PASS = "LocalDev@2024!"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def es_bulk(body):
    auth = base64.b64encode(f"{ES_USER}:{ES_PASS}".encode()).decode()
    req = urllib.request.Request(
        f"{ES_URL}/_bulk",
        data=body.encode("utf-8"),
        headers={"Content-Type": "application/x-ndjson", "Authorization": f"Basic {auth}"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            result = json.loads(resp.read())
            if result.get("errors"):
                errs = [i for i in result["items"] if "error" in i.get("index", {})]
                if errs:
                    print(f"  WARNING: {len(errs)} indexing errors")
    except urllib.error.URLError as e:
        print(f"  ERROR: {e}")

DATA_SOURCES = [
    "workstation-01", "workstation-02", "workstation-03", "workstation-05",
    "workstation-07", "workstation-12", "dc-01", "dc-02", "file-server-01",
    "web-server-01", "web-server-02", "mail-server", "db-server-01",
    "app-server-01", "linux-server-01", "linux-server-02", "linux-server-03",
    "fw-edge-01", "fw-core-01", "proxy-01"
]

USERS = [
    "admin", "jdoe", "mwilson", "svc_backup", "svc_web", "administrator",
    "root", "deploy", "jenkins", "www-data", "postgres", "nginx", "elastic",
    "tomcat", "asmith", "bjohnson", "clee", "dgarcia", "ekim", "fwang"
]

INTERNAL_IPS = [
    "10.0.1.10", "10.0.1.13", "10.0.1.15", "10.0.1.20", "10.0.1.25",
    "10.0.1.30", "10.0.1.35", "10.0.1.40", "10.0.1.45", "10.0.1.50",
    "192.168.1.100", "192.168.1.104", "192.168.1.110", "192.168.1.113",
    "192.168.1.114", "192.168.1.120", "192.168.1.130", "192.168.1.140"
]

EXTERNAL_IPS = [
    "185.220.101.33", "45.155.205.12", "103.75.201.5", "91.219.236.18",
    "177.54.145.100", "198.51.100.42", "203.0.113.55", "192.0.2.99",
    "185.100.87.41", "78.128.113.66", "209.141.55.26", "162.247.74.7"
]

LOG_CONFIGS = {
    "wineventlog": {
        "index_prefix": "v11-log-wineventlog-",
        "events": [
            ("An account was successfully logged on", "logon_success", "4624", 1),
            ("An account failed to log on", "logon_failure", "4625", 2),
            ("A new process has been created", "process_created", "4688", 1),
            ("A service was installed in the system", "service_installed", "4697", 3),
            ("Special privileges assigned to new logon", "special_logon", "4672", 2),
            ("An attempt was made to access an object", "object_access", "4663", 1),
            ("A user account was changed", "account_changed", "4738", 2),
            ("The audit log was cleared", "audit_cleared", "1102", 4),
            ("A scheduled task was created", "task_created", "4698", 2),
            ("Windows Defender detected malware", "malware_detected", "1116", 4),
            ("PowerShell script block logging", "powershell", "4104", 3),
            ("Remote Desktop connection established", "rdp_connect", "4778", 2),
            ("Group membership was enumerated", "group_enum", "4799", 1),
            ("A user account was locked out", "account_locked", "4740", 3),
            ("Kerberos pre-authentication failed", "kerberos_fail", "4771", 2),
            ("Network share object was accessed", "share_access", "5140", 1),
            ("System audit policy was changed", "policy_changed", "4719", 3),
            ("A logon was attempted using explicit credentials", "explicit_logon", "4648", 2),
            ("Process terminated", "process_exit", "4689", 1),
            ("New Windows service was started", "service_start", "7036", 1),
        ]
    },
    "linux": {
        "index_prefix": "v11-log-linux-",
        "events": [
            ("Failed password for invalid user", "authentication_failure", "sshd", 3),
            ("Accepted publickey for root from", "session_open", "sshd", 1),
            ("Service started", "service_start", "systemd", 1),
            ("Service stopped unexpectedly", "service_stop", "systemd", 2),
            ("Disk space critical on /dev/sda1", "disk_alert", "monitoring", 3),
            ("Connection refused from", "connection_refused", "kernel", 2),
            ("Out of memory: Kill process", "oom_kill", "kernel", 4),
            ("segfault at address", "segfault", "kernel", 3),
            ("New session opened for user", "session_new", "pam", 1),
            ("PAM authentication failure", "pam_failure", "pam", 3),
            ("sudo command executed by", "sudo_exec", "sudo", 2),
            ("Firewall rule updated", "fw_update", "iptables", 2),
            ("Package installed successfully", "package_install", "apt", 1),
            ("Cron job execution failed", "cron_fail", "cron", 2),
            ("SSH brute force detected", "brute_force", "fail2ban", 4),
            ("File permission changed", "chmod", "auditd", 1),
            ("User account created", "useradd", "useradd", 2),
            ("Network interface down", "ifdown", "NetworkManager", 3),
            ("Certificate expiring soon", "cert_warn", "certbot", 2),
            ("Login session closed", "session_close", "systemd-logind", 1),
        ]
    },
    "firewall": {
        "index_prefix": "v11-log-firewall-",
        "events": [
            ("Connection blocked - port scan detected", "block", "ids", 3),
            ("Outbound connection to known malicious IP", "alert", "threat-intel", 4),
            ("Inbound connection from blocked country", "block", "geo-filter", 2),
            ("Rate limit exceeded from source", "rate_limit", "rate-limiter", 2),
            ("DDoS mitigation activated", "ddos_mitigate", "ddos-protection", 4),
            ("VPN tunnel established", "vpn_connect", "vpn", 1),
            ("NAT translation created", "nat_create", "nat", 1),
            ("Intrusion prevention rule triggered", "ips_trigger", "ips", 3),
            ("Connection allowed", "allow", "acl", 1),
            ("Connection denied by policy", "deny", "acl", 2),
            ("SSL inspection bypass for trusted domain", "ssl_bypass", "ssl-proxy", 1),
            ("Application layer gateway event", "alg_event", "alg", 1),
            ("URL category blocked: gambling", "url_block", "url-filter", 2),
            ("Bandwidth threshold exceeded", "bw_alert", "qos", 2),
            ("Session timeout for idle connection", "session_timeout", "session-mgr", 1),
            ("DNS sinkhole redirect", "dns_sinkhole", "dns-security", 3),
            ("Botnet communication detected", "botnet_detect", "threat-intel", 4),
            ("GeoIP block: traffic from sanctioned country", "geo_block", "geo-filter", 3),
            ("TLS handshake failure", "tls_error", "ssl-proxy", 2),
            ("Traffic shaping applied", "traffic_shape", "qos", 1),
        ]
    },
    "generic": {
        "index_prefix": "v11-log-generic-",
        "events": [
            ("System health check passed", "health_check", "info", 1),
            ("Application error detected", "app_error", "error", 3),
            ("Database connection pool exhausted", "db_pool_exhaust", "error", 4),
            ("API rate limit approaching", "rate_limit_warn", "warning", 2),
            ("Backup completed successfully", "backup_complete", "info", 1),
            ("Configuration change detected", "config_change", "warning", 2),
            ("License expiration warning", "license_warn", "warning", 2),
            ("High CPU utilization detected", "high_cpu", "warning", 3),
            ("Memory threshold exceeded", "memory_alert", "error", 3),
            ("SSL certificate renewal needed", "ssl_renewal", "warning", 2),
            ("DNS resolution timeout", "dns_timeout", "error", 2),
            ("Load balancer health check failed", "lb_fail", "error", 3),
            ("Container restart detected", "container_restart", "warning", 2),
            ("Deployment rollback triggered", "rollback", "error", 3),
            ("Webhook delivery failed", "webhook_fail", "warning", 2),
            ("Queue backlog increasing", "queue_backlog", "warning", 2),
            ("Scheduled maintenance window started", "maintenance", "info", 1),
            ("Audit log rotation completed", "log_rotate", "info", 1),
            ("Third-party service degradation", "svc_degraded", "warning", 2),
            ("Compliance scan completed", "compliance_scan", "info", 1),
        ]
    }
}

def generate_timestamp(date, hour=None):
    if hour is None:
        hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return date.replace(hour=hour, minute=minute, second=second).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def generate_logs():
    now = datetime.now(timezone.utc)
    
    for log_type, config in LOG_CONFIGS.items():
        print(f"Generating {log_type} logs...")
        total = 0
        bulk = ""
        
        for days_ago in range(7):
            date = now - timedelta(days=days_ago)
            date_str = date.strftime("%Y-%m-%d")
            index = f"{config['index_prefix']}{date_str}"
            
            # More events on recent days, with hourly variance
            if days_ago < 2:
                num_events = random.randint(250, 350)
            elif days_ago < 4:
                num_events = random.randint(180, 250)
            else:
                num_events = random.randint(120, 180)
            
            for _ in range(num_events):
                msg, action, evt_id, base_sev = random.choice(config["events"])
                # Add some severity variance
                sev = max(1, min(4, base_sev + random.choice([-1, 0, 0, 0, 1])))
                
                src_ip = random.choice(INTERNAL_IPS)
                dst_ip = random.choice(INTERNAL_IPS)
                
                # Firewall logs should sometimes have external IPs
                if log_type == "firewall" and random.random() < 0.4:
                    src_ip = random.choice(EXTERNAL_IPS)
                
                doc = {
                    "@timestamp": generate_timestamp(date),
                    "message": msg,
                    "dataType": log_type,
                    "dataSource": random.choice(DATA_SOURCES),
                    "severity": sev,
                    "event": {
                        "action": action,
                        "id": evt_id
                    },
                    "source": {
                        "ip": src_ip,
                        "host": random.choice(DATA_SOURCES)
                    },
                    "destination": {
                        "ip": dst_ip,
                        "host": random.choice(DATA_SOURCES)
                    },
                    "user": {
                        "name": random.choice(USERS)
                    }
                }
                
                bulk += json.dumps({"index": {"_index": index}}) + "\n"
                bulk += json.dumps(doc) + "\n"
                total += 1
                
                if total % 500 == 0:
                    es_bulk(bulk)
                    bulk = ""
                    print(f"  {log_type} logs indexed: {total}")
        
        if bulk:
            es_bulk(bulk)
        print(f"  Total {log_type} logs: {total}")
        print()

def generate_extra_alerts():
    """Generate additional alerts with better time distribution."""
    print("Generating additional alerts for time-series coverage...")
    now = datetime.now(timezone.utc)
    
    ALERT_NAMES = [
        "Brute Force Authentication Attempt", "Suspicious PowerShell Execution",
        "Lateral Movement Detected", "Data Exfiltration Attempt",
        "Unauthorized Service Installation", "Privilege Escalation Attempt",
        "Malware Communication Detected", "SQL Injection Attempt",
        "Port Scan Detected", "Unauthorized Access Attempt",
        "Ransomware Behavior Detected", "Credential Dumping Attempt",
        "DNS Tunneling Detected", "Phishing Link Clicked",
        "Anomalous Network Traffic", "Remote Code Execution Attempt",
        "Command and Control Communication", "Account Compromise Detected",
        "Suspicious Login from New Location", "Data Loss Prevention Alert",
    ]
    
    CATEGORIES = [
        "Credential Access", "Execution", "Lateral Movement", "Exfiltration",
        "Persistence", "Privilege Escalation", "Command and Control",
        "Initial Access", "Discovery", "Defense Evasion", "Impact", "Collection"
    ]
    
    TECHNIQUES = [
        "T1110 - Brute Force", "T1059 - Command and Scripting Interpreter",
        "T1021 - Remote Services", "T1048 - Exfiltration Over Alternative Protocol",
        "T1543 - Create or Modify System Process", "T1068 - Exploitation for Privilege Escalation",
        "T1071 - Application Layer Protocol", "T1190 - Exploit Public-Facing Application",
        "T1046 - Network Service Scanning", "T1078 - Valid Accounts",
        "T1486 - Data Encrypted for Impact", "T1003 - OS Credential Dumping"
    ]
    
    COUNTRIES = ["China", "Russia", "North Korea", "Iran", "Brazil", "United States", "Germany", "Romania", "Netherlands", "Ukraine"]
    CITIES = ["Beijing", "Moscow", "Pyongyang", "Tehran", "São Paulo", "New York", "Berlin", "Bucharest", "Amsterdam", "Kyiv"]
    
    SEV_WEIGHTS = [(1, 0.15), (2, 0.30), (3, 0.35), (4, 0.20)]
    STATUS_OPTIONS = [(2, "Open"), (3, "In Review"), (4, "Completed"), (5, "Auto-Resolved")]
    DATA_TYPES = ["wineventlog", "linux", "generic", "firewall"]
    
    total = 0
    bulk = ""
    
    for days_ago in range(7):
        date = now - timedelta(days=days_ago)
        date_str = date.strftime("%Y-%m-%d")
        index = f"v11-alert-{date_str}"
        
        if days_ago < 2:
            num_alerts = random.randint(60, 90)
        elif days_ago < 4:
            num_alerts = random.randint(40, 60)
        else:
            num_alerts = random.randint(25, 40)
        
        for i in range(num_alerts):
            # Weighted severity
            r = random.random()
            cum = 0
            sev = 2
            sev_label = "MEDIUM"
            for s, w in SEV_WEIGHTS:
                cum += w
                if r <= cum:
                    sev = s
                    sev_label = ["LOW", "MEDIUM", "HIGH", "CRITICAL"][s-1]
                    break
            
            status_idx = random.randint(0, 3)
            country_idx = random.randint(0, len(COUNTRIES)-1)
            
            doc = {
                "@timestamp": generate_timestamp(date),
                "name": f"{random.choice(ALERT_NAMES)} - {date_str}-{total}",
                "severity": sev,
                "severityLabel": sev_label,
                "status": STATUS_OPTIONS[status_idx][0],
                "statusLabel": STATUS_OPTIONS[status_idx][1],
                "category": random.choice(CATEGORIES),
                "technique": random.choice(TECHNIQUES),
                "dataType": random.choice(DATA_TYPES),
                "dataSource": random.choice(DATA_SOURCES),
                "target": {
                    "ip": random.choice(INTERNAL_IPS),
                    "host": random.choice(DATA_SOURCES),
                    "user": random.choice(USERS)
                },
                "adversary": {
                    "ip": random.choice(EXTERNAL_IPS),
                    "host": "external",
                    "geolocation": {
                        "country": COUNTRIES[country_idx],
                        "city": CITIES[country_idx]
                    }
                },
                "source": {
                    "ip": random.choice(EXTERNAL_IPS),
                    "host": "external",
                    "port": random.randint(1024, 65535)
                },
                "destination": {
                    "ip": random.choice(INTERNAL_IPS),
                    "host": random.choice(DATA_SOURCES),
                    "port": random.choice([22, 80, 443, 445, 3389, 5985, 8080, 8443])
                },
                "tags": [],
                "notes": "",
                "isIncident": random.random() < 0.1,
                "description": "Alert triggered by correlation rule",
                "impact": {
                    "confidentiality": random.randint(1, 3),
                    "integrity": random.randint(1, 3),
                    "availability": random.randint(1, 3)
                },
                "events": [{
                    "dataType": random.choice(DATA_TYPES),
                    "action": "detected",
                    "timestamp": generate_timestamp(date)
                }]
            }
            
            bulk += json.dumps({"index": {"_index": index}}) + "\n"
            bulk += json.dumps(doc) + "\n"
            total += 1
            
            if total % 200 == 0:
                es_bulk(bulk)
                bulk = ""
                print(f"  Extra alerts indexed: {total}")
    
    if bulk:
        es_bulk(bulk)
    print(f"  Total extra alerts: {total}")
    print()

if __name__ == "__main__":
    print("=== UTMStack Log & Alert Data Seeder (Python) ===\n")
    generate_logs()
    generate_extra_alerts()
    
    # Refresh indices
    auth = base64.b64encode(f"{ES_USER}:{ES_PASS}".encode()).decode()
    req = urllib.request.Request(
        f"{ES_URL}/_refresh",
        headers={"Authorization": f"Basic {auth}"},
        method="POST"
    )
    urllib.request.urlopen(req, context=ssl_ctx)
    
    # Print summary
    for idx_pattern in ["v11-alert-*", "v11-log-wineventlog-*", "v11-log-linux-*", "v11-log-firewall-*", "v11-log-generic-*"]:
        req = urllib.request.Request(
            f"{ES_URL}/{idx_pattern}/_count",
            headers={"Authorization": f"Basic {auth}"}
        )
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            count = json.loads(resp.read())["count"]
            print(f"  {idx_pattern}: {count} documents")
    
    print("\nDone! Your dashboards should now have rich data for all visualizations.")
