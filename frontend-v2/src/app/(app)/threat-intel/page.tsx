"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Shield,
  Activity,
  Database,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Globe,
  Hash,
  Link as LinkIcon,
  Mail,
  Cpu,
  Clock,
  Layers,
  Target,
  Eye,
  Info,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { threatIntelService } from "@/services/threat-intel.service";
import { Drawer } from "@/components/ui/drawer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "ioc-search" | "feed-management" | "mitre-attack";

type IocType = "all" | "ip" | "domain" | "hash" | "url" | "email";

interface IocResult {
  value: string;
  type: "ip" | "domain" | "hash" | "url" | "email";
  firstSeen: string;
  lastSeen: string;
  threatScore: number;
  classification: string;
  sourceFeds: SourceFeed[];
  mitreTechniques: MitreTechniqueRef[];
  alertCount: number;
  relatedIocs: RelatedIoc[];
  tags: string[];
  country?: string;
  asn?: string;
  description: string;
}

interface SourceFeed {
  name: string;
  confidence: number;
  reportedAt: string;
}

interface MitreTechniqueRef {
  id: string;
  name: string;
  tactic: string;
}

interface RelatedIoc {
  value: string;
  type: "ip" | "domain" | "hash" | "url" | "email";
  threatScore: number;
}

interface RecentLookup {
  value: string;
  type: "ip" | "domain" | "hash" | "url" | "email";
  threatScore: number;
  classification: string;
  searchedAt: string;
}

interface ThreatFeed {
  id: string;
  name: string;
  type: string;
  source: string;
  lastUpdated: string;
  iocCount: number;
  status: "active" | "paused" | "error";
  enabled: boolean;
  description: string;
}

interface MitreTactic {
  id: string;
  name: string;
  shortName: string;
}

interface MitreTechniqueCell {
  id: string;
  name: string;
  tactic: string;
  coverage: "full" | "partial" | "none";
  iocCount: number;
  ruleCount: number;
  description: string;
  remediationTips: string[];
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------


const RECENT_LOOKUPS: RecentLookup[] = [
  {
    value: "185.220.101.45",
    type: "ip",
    threatScore: 94,
    classification: "Malware C2 / Tor Exit",
    searchedAt: "2026-07-04T08:12:00Z",
  },
  {
    value: "malware-payload-ru.com",
    type: "domain",
    threatScore: 87,
    classification: "Phishing",
    searchedAt: "2026-07-04T07:55:00Z",
  },
  {
    value: "44d88612fea8a8f36de82e1278abb02f",
    type: "hash",
    threatScore: 76,
    classification: "Malware",
    searchedAt: "2026-07-04T07:30:00Z",
  },
  {
    value: "103.42.91.220",
    type: "ip",
    threatScore: 62,
    classification: "Scanner",
    searchedAt: "2026-07-03T22:14:00Z",
  },
  {
    value: "credential-harvest.xyz",
    type: "domain",
    threatScore: 91,
    classification: "Phishing",
    searchedAt: "2026-07-03T20:01:00Z",
  },
  {
    value: "phish@login-secure-update.com",
    type: "email",
    threatScore: 83,
    classification: "Spam / Phishing",
    searchedAt: "2026-07-03T18:45:00Z",
  },
];


const MITRE_TACTICS: MitreTactic[] = [
  { id: "TA0043", name: "Reconnaissance", shortName: "Recon" },
  { id: "TA0042", name: "Resource Development", shortName: "Resource Dev" },
  { id: "TA0001", name: "Initial Access", shortName: "Initial Access" },
  { id: "TA0002", name: "Execution", shortName: "Execution" },
  { id: "TA0003", name: "Persistence", shortName: "Persistence" },
  { id: "TA0004", name: "Privilege Escalation", shortName: "Priv Esc" },
  { id: "TA0005", name: "Defense Evasion", shortName: "Def Evasion" },
  { id: "TA0006", name: "Credential Access", shortName: "Cred Access" },
  { id: "TA0007", name: "Discovery", shortName: "Discovery" },
  { id: "TA0008", name: "Lateral Movement", shortName: "Lateral Mov" },
  { id: "TA0009", name: "Collection", shortName: "Collection" },
  { id: "TA0011", name: "Command and Control", shortName: "C2" },
];

const MITRE_TECHNIQUES: MitreTechniqueCell[] = [
  {
    id: "T1595",
    name: "Active Scanning",
    tactic: "TA0043",
    coverage: "full",
    iocCount: 234,
    ruleCount: 8,
    description: "Adversaries scan victim infrastructure to gather information for targeting.",
    remediationTips: [
      "Block known scanner IPs at perimeter firewall.",
      "Enable port-scan detection on IDS/IPS.",
      "Alert on >50 unique port hits from a single source in 60 seconds.",
    ],
  },
  {
    id: "T1589",
    name: "Gather Victim Identity",
    tactic: "TA0043",
    coverage: "partial",
    iocCount: 41,
    ruleCount: 2,
    description: "Adversaries gather information about victim identities to enable targeting.",
    remediationTips: [
      "Limit public exposure of employee directory data.",
      "Monitor dark-web sources for leaked credentials.",
    ],
  },
  {
    id: "T1583",
    name: "Acquire Infrastructure",
    tactic: "TA0042",
    coverage: "partial",
    iocCount: 89,
    ruleCount: 3,
    description: "Adversaries acquire infrastructure to stage operations.",
    remediationTips: [
      "Monitor newly-registered domains similar to your brand.",
      "Track passive DNS for sudden registrations from known-bad ASNs.",
    ],
  },
  {
    id: "T1566",
    name: "Phishing",
    tactic: "TA0001",
    coverage: "full",
    iocCount: 1420,
    ruleCount: 22,
    description: "Adversaries send phishing messages to gain access to victim systems.",
    remediationTips: [
      "Enforce DMARC/DKIM/SPF on all mail domains.",
      "Deploy email gateway with URL sandboxing.",
      "Conduct regular phishing simulation training.",
    ],
  },
  {
    id: "T1190",
    name: "Exploit Public-Facing App",
    tactic: "TA0001",
    coverage: "full",
    iocCount: 608,
    ruleCount: 19,
    description: "Adversaries exploit weaknesses in internet-facing applications.",
    remediationTips: [
      "Apply patches within 72 hours of CISA KEV publication.",
      "Deploy WAF in blocking mode for internet-facing apps.",
      "Enable virtual patching for critical vulnerabilities.",
    ],
  },
  {
    id: "T1059",
    name: "Command Scripting",
    tactic: "TA0002",
    coverage: "full",
    iocCount: 2103,
    ruleCount: 41,
    description: "Adversaries abuse command/script interpreters to execute commands.",
    remediationTips: [
      "Enable Script Block Logging in PowerShell.",
      "Restrict script execution via AppLocker / WDAC.",
      "Alert on encoded PowerShell or Base64 command-line arguments.",
    ],
  },
  {
    id: "T1055",
    name: "Process Injection",
    tactic: "TA0004",
    coverage: "partial",
    iocCount: 417,
    ruleCount: 11,
    description: "Adversaries inject code into processes to evade defenses and elevate privileges.",
    remediationTips: [
      "Enable Credential Guard to protect LSASS.",
      "Deploy EDR with memory protection capabilities.",
      "Alert on CreateRemoteThread / VirtualAllocEx API usage.",
    ],
  },
  {
    id: "T1078",
    name: "Valid Accounts",
    tactic: "TA0005",
    coverage: "full",
    iocCount: 891,
    ruleCount: 17,
    description: "Adversaries use legitimate credentials to bypass security controls.",
    remediationTips: [
      "Enforce MFA for all privileged and remote access.",
      "Implement just-in-time (JIT) privileged access.",
      "Alert on impossible-travel login events.",
    ],
  },
  {
    id: "T1003",
    name: "OS Credential Dumping",
    tactic: "TA0006",
    coverage: "full",
    iocCount: 742,
    ruleCount: 28,
    description: "Adversaries attempt to dump credentials to obtain account login information.",
    remediationTips: [
      "Enable LSA Protection (RunAsPPL).",
      "Protect LSASS with Credential Guard.",
      "Alert on procdump, mimikatz, or sekurlsa references in process args.",
    ],
  },
  {
    id: "T1087",
    name: "Account Discovery",
    tactic: "TA0007",
    coverage: "partial",
    iocCount: 198,
    ruleCount: 6,
    description: "Adversaries enumerate accounts to identify targets for further compromise.",
    remediationTips: [
      "Alert on bulk LDAP queries from non-admin accounts.",
      "Restrict net user / net group enumeration via Group Policy.",
    ],
  },
  {
    id: "T1021",
    name: "Remote Services",
    tactic: "TA0008",
    coverage: "full",
    iocCount: 530,
    ruleCount: 14,
    description: "Adversaries use valid accounts to log into remote services for lateral movement.",
    remediationTips: [
      "Disable RDP where not required; restrict via firewall.",
      "Require MFA for all remote service access.",
      "Alert on lateral RDP or WMI from workstations to servers.",
    ],
  },
  {
    id: "T1560",
    name: "Archive Collected Data",
    tactic: "TA0009",
    coverage: "none",
    iocCount: 0,
    ruleCount: 0,
    description: "Adversaries archive collected data before exfiltration.",
    remediationTips: [
      "Alert on large zip/rar operations in unusual directories.",
      "Deploy DLP to detect mass data staging.",
    ],
  },
  {
    id: "T1071",
    name: "App Layer Protocol",
    tactic: "TA0011",
    coverage: "full",
    iocCount: 1876,
    ruleCount: 33,
    description: "Adversaries communicate using OSI application layer protocols to blend in.",
    remediationTips: [
      "Proxy and inspect all outbound HTTPS traffic.",
      "Block direct-IP HTTP/HTTPS to non-CDN destinations.",
      "Alert on DNS tunneling indicators (long queries, high entropy).",
    ],
  },
  {
    id: "T1090",
    name: "Proxy",
    tactic: "TA0011",
    coverage: "partial",
    iocCount: 312,
    ruleCount: 9,
    description: "Adversaries use proxy infrastructure to direct victim traffic to C2.",
    remediationTips: [
      "Block Tor exit nodes and known VPN ranges at perimeter.",
      "Deploy DNS RPZ for known-bad proxy infrastructure.",
    ],
  },
  {
    id: "T1547",
    name: "Boot/Logon Autostart",
    tactic: "TA0003",
    coverage: "partial",
    iocCount: 276,
    ruleCount: 7,
    description: "Adversaries achieve persistence through startup mechanisms.",
    remediationTips: [
      "Alert on new Run/RunOnce registry key modifications.",
      "Monitor startup folder changes for non-admin users.",
    ],
  },
  {
    id: "T1068",
    name: "Exploitation for Privilege Esc.",
    tactic: "TA0004",
    coverage: "partial",
    iocCount: 134,
    ruleCount: 5,
    description: "Adversaries exploit vulnerabilities to execute code with higher privileges.",
    remediationTips: [
      "Prioritize kernel-level vulnerability patching.",
      "Enable Windows Exploit Guard memory protections.",
    ],
  },
  {
    id: "T1027",
    name: "Obfuscated Files",
    tactic: "TA0005",
    coverage: "full",
    iocCount: 667,
    ruleCount: 15,
    description: "Adversaries obfuscate files or information to make detection difficult.",
    remediationTips: [
      "Deploy ML-based file analysis to detect obfuscated payloads.",
      "Alert on high-entropy script content or packed executables.",
    ],
  },
  {
    id: "T1110",
    name: "Brute Force",
    tactic: "TA0006",
    coverage: "full",
    iocCount: 3241,
    ruleCount: 24,
    description: "Adversaries use brute force to gain access to accounts.",
    remediationTips: [
      "Enforce account lockout after 5 failed attempts.",
      "Deploy CAPTCHA on all public-facing login portals.",
      "Alert on >10 failed logins per account per minute.",
    ],
  },
  {
    id: "T1135",
    name: "Network Share Discovery",
    tactic: "TA0007",
    coverage: "none",
    iocCount: 0,
    ruleCount: 0,
    description: "Adversaries enumerate network shares to find accessible resources.",
    remediationTips: [
      "Alert on Net View / SMB enumeration from non-admin accounts.",
      "Restrict anonymous SMB share enumeration via GPO.",
    ],
  },
  {
    id: "T1570",
    name: "Lateral Tool Transfer",
    tactic: "TA0008",
    coverage: "partial",
    iocCount: 87,
    ruleCount: 3,
    description:
      "Adversaries transfer tools or other files between systems in a compromised environment.",
    remediationTips: [
      "Alert on SMBExec, PSExec, and WMI-based tool transfer patterns.",
      "Block execution of unsigned binaries dropped via network shares.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-critical";
  if (score >= 60) return "text-high";
  if (score >= 40) return "text-medium";
  if (score >= 20) return "text-low";
  return "text-success";
}

function scoreBorderColor(score: number): string {
  if (score >= 80) return "border-red-500/40";
  if (score >= 60) return "border-orange-500/40";
  if (score >= 40) return "border-yellow-500/40";
  return "border-surface-border";
}

function scoreBgAccent(score: number): string {
  if (score >= 80) return "bg-red-500/5";
  if (score >= 60) return "bg-orange-500/5";
  if (score >= 40) return "bg-yellow-500/5";
  return "";
}

function scoreRingColor(score: number): string {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#f97316";
  if (score >= 40) return "#eab308";
  if (score >= 20) return "#22c55e";
  return "#16a34a";
}

function iocTypeIcon(type: IocType | "all") {
  switch (type) {
    case "ip":
      return <Globe className="w-3.5 h-3.5" />;
    case "domain":
      return <Globe className="w-3.5 h-3.5" />;
    case "hash":
      return <Hash className="w-3.5 h-3.5" />;
    case "url":
      return <LinkIcon className="w-3.5 h-3.5" />;
    case "email":
      return <Mail className="w-3.5 h-3.5" />;
    default:
      return <Search className="w-3.5 h-3.5" />;
  }
}

function iocTypeBadgeColor(type: string): string {
  switch (type) {
    case "ip":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "domain":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "hash":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "url":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "email":
      return "bg-pink-500/15 text-pink-400 border-pink-500/30";
    default:
      return "bg-surface-tertiary text-primary border-surface-border";
  }
}

function coverageCellColor(cov: "full" | "partial" | "none"): string {
  if (cov === "full")
    return "bg-green-500/20 border-green-500/45 hover:bg-green-500/30 cursor-pointer";
  if (cov === "partial")
    return "bg-amber-500/15 border-amber-500/35 hover:bg-amber-500/25 cursor-pointer";
  return "bg-surface-tertiary/20 border-surface-border hover:bg-surface-tertiary/40 cursor-pointer";
}

function coverageDotColor(cov: "full" | "partial" | "none"): string {
  if (cov === "full") return "bg-green-400";
  if (cov === "partial") return "bg-amber-400";
  return "bg-surface-border";
}

function feedStatusBadge(status: ThreatFeed["status"]) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny font-medium bg-green-500/15 text-green-400 border border-green-500/30">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <PauseCircle className="w-3 h-3" /> Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny font-medium bg-red-500/15 text-critical border border-red-500/30">
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
}

// ---------------------------------------------------------------------------
// ThreatScoreRing
// ---------------------------------------------------------------------------

function ThreatScoreRing({ score }: { score: number }) {
  const size = 88;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreRingColor(score);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surface-tertiary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-h3 font-bold leading-none", scoreColor(score))}>{score}</span>
        <span className="text-tiny text-muted leading-none mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: IOC Search
// ---------------------------------------------------------------------------

function IocSearchTab() {
  const [query, setQuery] = useState("");
  const [iocType, setIocType] = useState<IocType>("all");
  const [result, setResult] = useState<IocResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const IOC_TYPES: { value: IocType; label: string }[] = [
    { value: "all", label: "All Types" },
    { value: "ip", label: "IP Address" },
    { value: "domain", label: "Domain" },
    { value: "hash", label: "File Hash" },
    { value: "url", label: "URL" },
    { value: "email", label: "Email" },
  ];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const performSearch = useCallback(
    async (value: string) => {
      if (!value.trim()) return;
      setLoading(true);
      setResult(null);

      try {
        const data = await threatIntelService.lookupIoc(value);
        setResult(data);
      } catch {
        toast("error", "IOC lookup failed", "Unable to reach threat intelligence service");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSearch = () => performSearch(query);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };
  const handleRecentClick = (lookup: RecentLookup) => {
    setQuery(lookup.value);
    setIocType(lookup.type);
    performSearch(lookup.value);
  };

  const selectedTypeLabel =
    IOC_TYPES.find((t) => t.value === iocType)?.label ?? "All Types";

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="card p-5">
        <div className="flex gap-2">
          {/* Type selector */}
          <div className="relative flex-shrink-0" ref={typeDropdownRef}>
            <button
              className={cn(
                "flex items-center gap-2 h-10 px-3 rounded-lg border border-surface-border bg-surface-secondary",
                "text-small text-primary hover:bg-surface-tertiary transition-colors"
              )}
              onClick={() => setTypeDropdownOpen((o) => !o)}
            >
              {iocTypeIcon(iocType)}
              <span className="hidden sm:inline">{selectedTypeLabel}</span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted transition-transform",
                  typeDropdownOpen && "rotate-180"
                )}
              />
            </button>
            {typeDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-surface-primary border border-surface-border rounded-lg shadow-xl z-20 py-1">
                {IOC_TYPES.map((t) => (
                  <button
                    key={t.value}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-small hover:bg-surface-secondary transition-colors",
                      iocType === t.value ? "text-brand" : "text-primary"
                    )}
                    onClick={() => {
                      setIocType(t.value);
                      setTypeDropdownOpen(false);
                    }}
                  >
                    {iocTypeIcon(t.value)}
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <input
            className="input-base flex-1 h-10"
            placeholder="Search IP, domain, file hash, URL or email address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {/* Search button */}
          <button
            className="btn btn-primary h-10 px-5 flex items-center gap-2 flex-shrink-0"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>

      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="card p-6 space-y-4">
          <div className="flex gap-4">
            <div className="h-20 w-20 rounded-full bg-surface-secondary animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-5 bg-surface-secondary rounded animate-pulse w-3/4" />
              <div className="h-4 bg-surface-secondary rounded animate-pulse w-1/2" />
              <div className="h-4 bg-surface-secondary rounded animate-pulse w-2/3" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-surface-secondary rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Result card */}
      {!loading && result && (
        <div
          className={cn(
            "card border",
            scoreBorderColor(result.threatScore),
            scoreBgAccent(result.threatScore)
          )}
        >
          {/* Header row */}
          <div className="p-5 border-b border-surface-border">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <ThreatScoreRing score={result.threatScore} />

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny font-semibold border",
                      iocTypeBadgeColor(result.type)
                    )}
                  >
                    {iocTypeIcon(result.type as IocType)}
                    {result.type.toUpperCase()}
                  </span>
                  {result.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-tiny bg-surface-tertiary text-secondary border border-surface-border"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="font-mono text-h4 text-primary break-all mb-1">
                  {result.value}
                </p>
                <p className="text-small text-secondary mb-2">{result.description}</p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-tiny text-muted">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> First seen: {formatDate(result.firstSeen)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Last seen: {formatDate(result.lastSeen)}
                  </span>
                  {result.country && (
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" /> {result.country}
                    </span>
                  )}
                  {result.asn && (
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> {result.asn}
                    </span>
                  )}
                </div>
              </div>

              {/* Classification + alert count */}
              <div className="flex sm:flex-col gap-3 sm:items-end flex-shrink-0">
                <div className="text-center">
                  <p className="text-tiny text-muted mb-0.5">Classification</p>
                  <span className="text-small font-semibold text-primary">
                    {result.classification}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-tiny text-muted mb-0.5">Env. Alerts</p>
                  <span
                    className={cn(
                      "text-h3 font-bold",
                      result.alertCount > 0 ? "text-critical" : "text-success"
                    )}
                  >
                    {result.alertCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Source feeds */}
          <div className="p-5 border-b border-surface-border">
            <h4 className="text-small font-semibold text-primary mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-muted" /> Source Intelligence Feeds
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {result.sourceFeds.map((feed) => (
                <div
                  key={feed.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary border border-surface-border"
                >
                  <div>
                    <p className="text-small font-medium text-primary">{feed.name}</p>
                    <p className="text-tiny text-muted">{formatDate(feed.reportedAt)}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={cn("text-small font-bold", scoreColor(feed.confidence))}
                    >
                      {feed.confidence}%
                    </span>
                    <span className="text-tiny text-muted">confidence</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MITRE techniques */}
          {result.mitreTechniques.length > 0 && (
            <div className="p-5 border-b border-surface-border">
              <h4 className="text-small font-semibold text-primary mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-muted" /> Associated MITRE ATT&CK Techniques
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.mitreTechniques.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border"
                  >
                    <span className="text-tiny font-mono font-semibold text-brand">
                      {t.id}
                    </span>
                    <span className="text-tiny text-primary">{t.name}</span>
                    <span className="text-tiny text-muted">· {t.tactic}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related IOCs */}
          {result.relatedIocs.length > 0 && (
            <div className="p-5">
              <h4 className="text-small font-semibold text-primary mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted" /> Related IOCs
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {result.relatedIocs.map((rel) => (
                  <button
                    key={rel.value}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary border border-surface-border hover:border-brand/50 hover:bg-surface-tertiary transition-colors text-left"
                    onClick={() => {
                      setQuery(rel.value);
                      setIocType(rel.type);
                      performSearch(rel.value);
                    }}
                  >
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-tiny font-semibold border mb-1",
                          iocTypeBadgeColor(rel.type)
                        )}
                      >
                        {rel.type.toUpperCase()}
                      </span>
                      <p className="text-tiny font-mono text-primary truncate">
                        {rel.value}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-small font-bold ml-2 flex-shrink-0",
                        scoreColor(rel.threatScore)
                      )}
                    >
                      {rel.threatScore}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent lookups — shown when no search active */}
      {!loading && !result && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted" />
            <h3 className="text-h4 text-primary">Recent IOC Lookups</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {RECENT_LOOKUPS.map((lookup) => (
              <button
                key={lookup.value}
                className="card p-4 text-left hover:border-brand/50 hover:bg-surface-secondary/80 transition-colors"
                onClick={() => handleRecentClick(lookup)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny font-semibold border",
                      iocTypeBadgeColor(lookup.type)
                    )}
                  >
                    {iocTypeIcon(lookup.type as IocType)}
                    {lookup.type.toUpperCase()}
                  </span>
                  <span className={cn("text-small font-bold", scoreColor(lookup.threatScore))}>
                    {lookup.threatScore}
                  </span>
                </div>
                <p className="font-mono text-small text-primary truncate mb-1">
                  {lookup.value}
                </p>
                <p className="text-tiny text-secondary truncate">{lookup.classification}</p>
                <p className="text-tiny text-muted mt-1">{formatDate(lookup.searchedAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Feed Management
// ---------------------------------------------------------------------------

function FeedManagementTab() {
  const [feeds, setFeeds] = useState<ThreatFeed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [feedsError, setFeedsError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    threatIntelService.getFeeds()
      .then(setFeeds)
      .catch(() => setFeedsError("Failed to load threat feeds"))
      .finally(() => setFeedsLoading(false));
  }, []);

  const totalIocs = feeds
    .filter((f) => f.enabled)
    .reduce((sum, f) => sum + f.iocCount, 0);
  const activeFeeds = feeds.filter(
    (f) => f.status === "active" && f.enabled
  ).length;
  const lastSync = feeds
    .map((f) => f.lastUpdated)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const handleToggle = async (id: string) => {
    const feed = feeds.find((f) => f.id === id);
    if (!feed) return;
    const nextEnabled = !feed.enabled;

    setFeeds((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, enabled: nextEnabled, status: nextEnabled ? "active" : "paused" }
          : f
      )
    );

    try {
      const updated = await threatIntelService.toggleFeed(id, nextEnabled);
      setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, ...updated } : f)));
      toast("success", `Feed ${nextEnabled ? "enabled" : "paused"}`, feed.name);
    } catch {
      // Revert optimistic update
      setFeeds((prev) =>
        prev.map((f) => (f.id === id ? feed : f))
      );
      toast("error", "Failed to update feed", feed.name);
    }
  };

  const handleSync = async (id: string) => {
    const feed = feeds.find((f) => f.id === id);
    if (!feed) return;
    setSyncingId(id);

    try {
      const updated = await threatIntelService.syncFeed(id);
      setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, ...updated } : f)));
      toast("success", "Feed sync triggered", feed.name);
    } catch {
      toast("error", "Sync failed", feed.name);
    } finally {
      setSyncingId(null);
    }
  };

  if (feedsError) {
    return (
      <div className="card p-6 text-center text-secondary">
        {feedsError}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-tiny text-muted mb-1">Total IOCs</p>
          {feedsLoading ? (
            <div className="h-8 bg-surface-secondary rounded animate-pulse mx-auto w-24 mt-1" />
          ) : (
            <p className="text-h3 font-bold text-primary">{formatCount(totalIocs)}</p>
          )}
          <p className="text-tiny text-muted mt-0.5">across active feeds</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-tiny text-muted mb-1">Active Feeds</p>
          {feedsLoading ? (
            <div className="h-8 bg-surface-secondary rounded animate-pulse mx-auto w-16 mt-1" />
          ) : (
            <p className="text-h3 font-bold text-success">{activeFeeds}</p>
          )}
          <p className="text-tiny text-muted mt-0.5">of {feeds.length} configured</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-tiny text-muted mb-1">Last Sync</p>
          {feedsLoading ? (
            <div className="h-5 bg-surface-secondary rounded animate-pulse mx-auto w-32 mt-1" />
          ) : (
            <p className="text-small font-semibold text-primary">
              {lastSync ? formatDate(lastSync) : "—"}
            </p>
          )}
          <p className="text-tiny text-muted mt-0.5">most recent feed update</p>
        </div>
      </div>

      {/* Feeds table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-h4 text-primary flex items-center gap-2">
            <Database className="w-4 h-4 text-muted" />
            Intelligence Feeds
          </h3>
          <button
            className="btn btn-secondary btn-sm flex items-center gap-2"
            onClick={async () => {
              toast("info", "Syncing all feeds...");
              await Promise.all(
                feeds.filter((f) => f.enabled).map((f) => handleSync(f.id))
              );
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync All
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-surface-border bg-surface-secondary/50">
                <th className="text-left px-5 py-3 text-tiny font-semibold text-muted uppercase tracking-wide">
                  Feed Name
                </th>
                <th className="text-left px-4 py-3 text-tiny font-semibold text-muted uppercase tracking-wide hidden md:table-cell">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-tiny font-semibold text-muted uppercase tracking-wide hidden lg:table-cell">
                  Last Updated
                </th>
                <th className="text-right px-4 py-3 text-tiny font-semibold text-muted uppercase tracking-wide">
                  IOC Count
                </th>
                <th className="text-center px-4 py-3 text-tiny font-semibold text-muted uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-5 py-3 text-tiny font-semibold text-muted uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {feedsLoading && [...Array(4)].map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-4">
                    <div className="h-4 bg-surface-secondary rounded animate-pulse w-32" />
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <div className="h-4 bg-surface-secondary rounded animate-pulse w-20" />
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell">
                    <div className="h-4 bg-surface-secondary rounded animate-pulse w-28" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 bg-surface-secondary rounded animate-pulse w-12 ml-auto" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-5 bg-surface-secondary rounded-full animate-pulse w-16 mx-auto" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-4 bg-surface-secondary rounded animate-pulse w-16 ml-auto" />
                  </td>
                </tr>
              ))}
              {!feedsLoading && feeds.map((feed) => (
                <tr
                  key={feed.id}
                  className={cn(
                    "hover:bg-surface-secondary/40 transition-colors",
                    !feed.enabled && "opacity-50"
                  )}
                >
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium text-primary">{feed.name}</p>
                      <p className="text-tiny text-muted hidden sm:block mt-0.5 truncate max-w-[220px]">
                        {feed.description}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <span className="text-secondary">{feed.type}</span>
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell text-muted">
                    {formatDate(feed.lastUpdated)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-primary font-medium">
                    {formatCount(feed.iocCount)}
                  </td>
                  <td className="px-4 py-4 text-center">{feedStatusBadge(feed.status)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="toolbar-btn flex items-center gap-1.5 text-tiny"
                        onClick={() => handleSync(feed.id)}
                        disabled={syncingId === feed.id || !feed.enabled}
                        title="Sync now"
                      >
                        <RefreshCw
                          className={cn(
                            "w-3.5 h-3.5",
                            syncingId === feed.id && "animate-spin"
                          )}
                        />
                        <span className="hidden sm:inline">Sync</span>
                      </button>

                      <button
                        className={cn(
                          "flex items-center gap-1.5 text-tiny px-2 py-1 rounded transition-colors",
                          feed.enabled
                            ? "text-success hover:text-success/80"
                            : "text-muted hover:text-primary"
                        )}
                        onClick={() => handleToggle(feed.id)}
                        title={feed.enabled ? "Pause feed" : "Enable feed"}
                      >
                        {feed.enabled ? (
                          <ToggleRight className="w-5 h-5" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: MITRE ATT&CK Intel
// ---------------------------------------------------------------------------

function MitreAttackTab() {
  const [selectedTechnique, setSelectedTechnique] =
    useState<MitreTechniqueCell | null>(null);

  const fullCount = MITRE_TECHNIQUES.filter((t) => t.coverage === "full").length;
  const partialCount = MITRE_TECHNIQUES.filter(
    (t) => t.coverage === "partial"
  ).length;
  const noneCount = MITRE_TECHNIQUES.filter((t) => t.coverage === "none").length;
  const totalCoverage = Math.round(
    ((fullCount + partialCount * 0.5) / MITRE_TECHNIQUES.length) * 100
  );

  const maxTechPerTactic = Math.max(
    ...MITRE_TACTICS.map(
      (tactic) =>
        MITRE_TECHNIQUES.filter((t) => t.tactic === tactic.id).length
    ),
    1
  );

  return (
    <div className="space-y-5">
      {/* Coverage summary */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="flex-1">
            <h3 className="text-h4 text-primary mb-1">Intel Coverage</h3>
            <p className="text-small text-secondary">
              Coverage across {MITRE_TECHNIQUES.length} tracked MITRE ATT&CK
              techniques
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-h2 font-bold text-brand">{totalCoverage}%</span>
            <span className="text-small text-muted">overall</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-surface-tertiary rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all"
            style={{ width: `${totalCoverage}%` }}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-tiny text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-500/50 border border-green-500/70 flex-shrink-0" />
            Full coverage ({fullCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500/40 border border-amber-500/60 flex-shrink-0" />
            Partial coverage ({partialCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-surface-tertiary/50 border border-surface-border flex-shrink-0" />
            No coverage ({noneCount})
          </span>
        </div>
      </div>

      {/* Navigator grid */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border">
          <p className="text-tiny text-muted">
            Click any technique cell to view associated IOCs, detection rules, and
            remediation guidance.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <div
            className="grid gap-2 min-w-max"
            style={{
              gridTemplateColumns: `repeat(${MITRE_TACTICS.length}, minmax(118px, 1fr))`,
            }}
          >
            {/* Tactic headers */}
            {MITRE_TACTICS.map((tactic) => (
              <div
                key={tactic.id}
                className="px-2 py-2 rounded-lg bg-surface-secondary border border-surface-border text-center"
              >
                <p className="text-tiny font-semibold text-brand">{tactic.id}</p>
                <p className="text-tiny font-medium text-primary leading-tight mt-0.5">
                  {tactic.shortName}
                </p>
              </div>
            ))}

            {/* Technique rows */}
            {[...Array(maxTechPerTactic)].map((_, rowIdx) =>
              MITRE_TACTICS.map((tactic) => {
                const techs = MITRE_TECHNIQUES.filter(
                  (t) => t.tactic === tactic.id
                );
                const tech = techs[rowIdx];
                if (!tech) {
                  return (
                    <div
                      key={`${tactic.id}-empty-${rowIdx}`}
                      className="h-14 rounded-lg"
                    />
                  );
                }
                return (
                  <button
                    key={tech.id}
                    className={cn(
                      "relative h-14 px-2 py-1.5 rounded-lg border text-left transition-all",
                      coverageCellColor(tech.coverage),
                      "focus:outline-none focus:ring-2 focus:ring-brand/50"
                    )}
                    onClick={() => setSelectedTechnique(tech)}
                    title={`${tech.id}: ${tech.name}`}
                  >
                    <div className="flex items-start gap-1 h-full">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0 mt-0.5",
                          coverageDotColor(tech.coverage)
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-tiny font-mono text-muted leading-none">
                          {tech.id}
                        </p>
                        <p className="text-tiny text-primary leading-tight mt-0.5 line-clamp-2">
                          {tech.name}
                        </p>
                      </div>
                    </div>
                    {tech.iocCount > 0 && (
                      <span className="absolute bottom-1 right-1.5 text-tiny text-muted font-mono">
                        {tech.iocCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Technique detail drawer */}
      <Drawer
        open={selectedTechnique !== null}
        onClose={() => setSelectedTechnique(null)}
        title={
          selectedTechnique
            ? `${selectedTechnique.id} · ${selectedTechnique.name}`
            : ""
        }
        width="500px"
      >
        {selectedTechnique && (
          <div className="space-y-5 p-1">
            {/* Coverage badge + tactic */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-tiny font-semibold border",
                  selectedTechnique.coverage === "full"
                    ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : selectedTechnique.coverage === "partial"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-surface-tertiary text-muted border-surface-border"
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    coverageDotColor(selectedTechnique.coverage)
                  )}
                />
                {selectedTechnique.coverage === "full"
                  ? "Full Coverage"
                  : selectedTechnique.coverage === "partial"
                  ? "Partial Coverage"
                  : "No Coverage"}
              </span>
              <span className="text-tiny text-muted">
                Tactic:{" "}
                {MITRE_TACTICS.find(
                  (t) => t.id === selectedTechnique.tactic
                )?.name ?? selectedTechnique.tactic}
              </span>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-small font-semibold text-primary mb-1.5 flex items-center gap-2">
                <Info className="w-4 h-4 text-muted" /> Description
              </h4>
              <p className="text-small text-secondary leading-relaxed">
                {selectedTechnique.description}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-surface-secondary border border-surface-border text-center">
                <p className="text-h3 font-bold text-primary">
                  {selectedTechnique.iocCount}
                </p>
                <p className="text-tiny text-muted mt-0.5">Associated IOCs</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-secondary border border-surface-border text-center">
                <p className="text-h3 font-bold text-primary">
                  {selectedTechnique.ruleCount}
                </p>
                <p className="text-tiny text-muted mt-0.5">Detection Rules</p>
              </div>
            </div>

            {/* Remediation tips */}
            <div>
              <h4 className="text-small font-semibold text-primary mb-2.5 flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted" /> Remediation Guidance
              </h4>
              <ul className="space-y-2">
                {selectedTechnique.remediationTips.map((tip, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-secondary border border-surface-border"
                  >
                    <span className="w-5 h-5 rounded-full bg-brand/15 text-brand text-tiny font-bold flex-shrink-0 flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-small text-secondary leading-snug">{tip}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* External link */}
            <a
              href={`https://attack.mitre.org/techniques/${selectedTechnique.id.replace(".", "/")}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-small text-brand hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on MITRE ATT&CK
            </a>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function ThreatIntelPage() {
  const [activeTab, setActiveTab] = useState<TabId>("ioc-search");

  const tabs: {
    id: TabId;
    label: string;
    icon: React.ReactNode;
    description: string;
  }[] = [
    {
      id: "ioc-search",
      label: "IOC Search",
      icon: <Search className="w-4 h-4" />,
      description: "Enrich and investigate indicators of compromise",
    },
    {
      id: "feed-management",
      label: "Feed Management",
      icon: <Database className="w-4 h-4" />,
      description: "Manage and synchronize threat intelligence feeds",
    },
    {
      id: "mitre-attack",
      label: "MITRE ATT&CK",
      icon: <Layers className="w-4 h-4" />,
      description: "Visualize intel coverage across the ATT&CK framework",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-h1">Threat Intelligence Hub</h1>
          <p className="text-secondary mt-1">
            IOC enrichment, feed management, and MITRE ATT&CK coverage for HiveArmor
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-tiny font-medium text-green-400">Feeds Active</span>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-secondary border border-surface-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-small font-medium transition-all flex-1 justify-center",
              activeTab === tab.id
                ? "bg-surface-primary text-primary shadow-sm border border-surface-border"
                : "text-secondary hover:text-primary hover:bg-surface-tertiary/50"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab subtitle */}
      <p className="text-small text-muted -mt-3">
        {tabs.find((t) => t.id === activeTab)?.description}
      </p>

      {/* Tab content */}
      <div>
        {activeTab === "ioc-search" && <IocSearchTab />}
        {activeTab === "feed-management" && <FeedManagementTab />}
        {activeTab === "mitre-attack" && <MitreAttackTab />}
      </div>
    </div>
  );
}
