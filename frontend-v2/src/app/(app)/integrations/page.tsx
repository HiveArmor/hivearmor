"use client";

import { useState, useMemo, useRef, useEffect, useCallback, useTransition } from "react";
import {
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plug,
  RefreshCw,
  ChevronRight,
  Loader2,
  Shield,
  Cloud,
  Monitor,
  Network,
  Users,
  Ticket,
  Brain,
  MessageSquare,
  Activity,
  Zap,
  Settings,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
} from "lucide-react";
import { cn, formatRelativeTime, formatNumber } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import {
  integrationService,
  type UtmIntegration as ApiIntegration,
} from "@/services/integration.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IntegrationStatus = "connected" | "not_connected" | "error" | "beta";
type Category =
  | "All"
  | "SIEM"
  | "Cloud"
  | "Endpoint"
  | "Network"
  | "Identity"
  | "Ticketing"
  | "Threat Intel"
  | "Communication";

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "number" | "select";
  placeholder?: string;
  required?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
}

interface Integration {
  id: string;
  name: string;
  shortName: string; // 2-char initials fallback
  category: Exclude<Category, "All">;
  status: IntegrationStatus;
  description: string;
  color: string; // bg color for icon area
  textColor: string; // text color for initials
  lastSync?: string; // ISO date string
  eventCount?: number;
  configFields: ConfigField[];
  docsUrl?: string;
  // Populated after API load; undefined means not yet fetched
  backendRecord?: ApiIntegration;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_INTEGRATIONS: Integration[] = [
  // ── SIEM ──────────────────────────────────────────────────────────────────
  {
    id: "splunk",
    name: "Splunk",
    shortName: "SP",
    category: "SIEM",
    status: "connected",
    description: "Forward events to Splunk via HEC or syslog for unified analysis.",
    color: "bg-orange-500/20",
    textColor: "text-orange-400",
    lastSync: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    eventCount: 1_482_310,
    docsUrl: "https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector",
    configFields: [
      { key: "hec_url", label: "HEC URL", type: "url", placeholder: "https://splunk.corp.com:8088", required: true },
      { key: "hec_token", label: "HEC Token", type: "password", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
      { key: "index", label: "Index", type: "text", placeholder: "hivearmor", hint: "Leave blank to use the default index" },
      { key: "sourcetype", label: "Source Type", type: "text", placeholder: "_json" },
      {
        key: "tls_verify",
        label: "TLS Verification",
        type: "select",
        options: [
          { value: "true", label: "Enabled (recommended)" },
          { value: "false", label: "Disabled" },
        ],
      },
    ],
  },
  {
    id: "qradar",
    name: "IBM QRadar",
    shortName: "QR",
    category: "SIEM",
    status: "error",
    description: "Ingest HiveArmor offenses and flows into IBM QRadar SIEM.",
    color: "bg-blue-900/30",
    textColor: "text-blue-400",
    lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    eventCount: 287_540,
    configFields: [
      { key: "host", label: "QRadar Host", type: "url", placeholder: "https://qradar.corp.com", required: true },
      { key: "sec_token", label: "SEC Token", type: "password", placeholder: "Your QRadar API token", required: true },
      { key: "log_source_id", label: "Log Source ID", type: "number", placeholder: "1001" },
    ],
  },
  {
    id: "sentinel",
    name: "Microsoft Sentinel",
    shortName: "MS",
    category: "SIEM",
    status: "connected",
    description: "Stream alerts and incidents to Azure Sentinel via DCR or CEF.",
    color: "bg-sky-500/20",
    textColor: "text-sky-400",
    lastSync: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    eventCount: 3_901_200,
    configFields: [
      { key: "workspace_id", label: "Workspace ID", type: "text", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
      { key: "primary_key", label: "Shared Key", type: "password", placeholder: "Base64-encoded workspace key", required: true },
      { key: "log_type", label: "Log Type", type: "text", placeholder: "HiveArmorAlerts" },
    ],
  },
  {
    id: "elastic",
    name: "Elastic SIEM",
    shortName: "EL",
    category: "SIEM",
    status: "not_connected",
    description: "Push enriched logs and detections to Elasticsearch / Elastic Security.",
    color: "bg-yellow-500/20",
    textColor: "text-yellow-400",
    configFields: [
      { key: "endpoint", label: "Elasticsearch URL", type: "url", placeholder: "https://es.corp.com:9200", required: true },
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "index_prefix", label: "Index Prefix", type: "text", placeholder: "hivearmor-" },
    ],
  },

  // ── Cloud ─────────────────────────────────────────────────────────────────
  {
    id: "aws_cloudtrail",
    name: "AWS CloudTrail",
    shortName: "AT",
    category: "Cloud",
    status: "connected",
    description: "Ingest CloudTrail management & data events from S3 or EventBridge.",
    color: "bg-amber-500/20",
    textColor: "text-amber-400",
    lastSync: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    eventCount: 8_120_450,
    configFields: [
      { key: "aws_region", label: "AWS Region", type: "text", placeholder: "us-east-1", required: true },
      { key: "access_key_id", label: "Access Key ID", type: "text", required: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", required: true },
      { key: "s3_bucket", label: "S3 Bucket", type: "text", placeholder: "my-cloudtrail-bucket", hint: "Required for S3-based ingestion" },
    ],
  },
  {
    id: "azure_monitor",
    name: "Azure Monitor",
    shortName: "AM",
    category: "Cloud",
    status: "connected",
    description: "Collect Azure Activity Logs, Diagnostics and Security Center alerts.",
    color: "bg-blue-500/20",
    textColor: "text-blue-400",
    lastSync: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    eventCount: 2_670_000,
    configFields: [
      { key: "tenant_id", label: "Tenant ID", type: "text", required: true },
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
      { key: "subscription_id", label: "Subscription ID", type: "text", required: true },
    ],
  },
  {
    id: "gcp_logging",
    name: "GCP Cloud Logging",
    shortName: "GC",
    category: "Cloud",
    status: "not_connected",
    description: "Collect GCP audit, access transparency and VPC flow logs.",
    color: "bg-red-500/20",
    textColor: "text-red-400",
    configFields: [
      { key: "project_id", label: "Project ID", type: "text", required: true },
      { key: "service_account_key", label: "Service Account JSON", type: "password", placeholder: "Paste service account key JSON", required: true },
      { key: "pubsub_topic", label: "Pub/Sub Topic", type: "text", placeholder: "projects/my-project/topics/hivearmor" },
    ],
  },
  {
    id: "office365",
    name: "Office 365",
    shortName: "O3",
    category: "Cloud",
    status: "connected",
    description: "Pull Exchange, SharePoint, Teams and audit log events via Management API.",
    color: "bg-red-600/20",
    textColor: "text-red-400",
    lastSync: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    eventCount: 1_230_800,
    configFields: [
      { key: "tenant_id", label: "Tenant ID", type: "text", required: true },
      { key: "client_id", label: "App (Client) ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
      {
        key: "content_types",
        label: "Content Types",
        type: "select",
        options: [
          { value: "all", label: "All (Audit.General, Audit.Exchange, Audit.SharePoint, DLP.All)" },
          { value: "audit_general", label: "Audit.General only" },
          { value: "exchange", label: "Audit.Exchange only" },
        ],
      },
    ],
  },

  // ── Endpoint ──────────────────────────────────────────────────────────────
  {
    id: "crowdstrike",
    name: "CrowdStrike Falcon",
    shortName: "CF",
    category: "Endpoint",
    status: "connected",
    description: "Stream Falcon detections, incidents and real-time events via Streaming API.",
    color: "bg-red-700/20",
    textColor: "text-red-400",
    lastSync: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    eventCount: 5_490_120,
    configFields: [
      { key: "client_id", label: "OAuth2 Client ID", type: "text", required: true },
      { key: "client_secret", label: "OAuth2 Client Secret", type: "password", required: true },
      {
        key: "cloud",
        label: "Falcon Cloud",
        type: "select",
        options: [
          { value: "us-1", label: "US-1" },
          { value: "us-2", label: "US-2" },
          { value: "eu-1", label: "EU-1" },
          { value: "us-gov-1", label: "US-GOV-1" },
        ],
      },
    ],
  },
  {
    id: "sentinelone",
    name: "SentinelOne",
    shortName: "S1",
    category: "Endpoint",
    status: "connected",
    description: "Ingest SentinelOne threats, activities and deep visibility data.",
    color: "bg-purple-500/20",
    textColor: "text-purple-400",
    lastSync: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    eventCount: 2_810_900,
    configFields: [
      { key: "console_url", label: "Console URL", type: "url", placeholder: "https://myorg.sentinelone.net", required: true },
      { key: "api_token", label: "API Token", type: "password", required: true },
      { key: "site_id", label: "Site ID (optional)", type: "text", hint: "Leave blank to collect from all sites" },
    ],
  },
  {
    id: "carbon_black",
    name: "Carbon Black",
    shortName: "CB",
    category: "Endpoint",
    status: "error",
    description: "Collect CB Cloud endpoint events, alerts and audit logs.",
    color: "bg-slate-500/20",
    textColor: "text-slate-400",
    lastSync: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    eventCount: 441_300,
    configFields: [
      { key: "org_key", label: "Org Key", type: "text", required: true },
      { key: "api_id", label: "API ID", type: "text", required: true },
      { key: "api_secret", label: "API Secret Key", type: "password", required: true },
      {
        key: "environment",
        label: "Environment",
        type: "select",
        options: [
          { value: "prod05", label: "Production (prod05.conferdeploy.net)" },
          { value: "prod06", label: "Production (prod06.conferdeploy.net)" },
          { value: "prodeu", label: "EU Production" },
        ],
      },
    ],
  },
  {
    id: "ms_defender",
    name: "Microsoft Defender",
    shortName: "MD",
    category: "Endpoint",
    status: "not_connected",
    description: "Pull MDE alerts, incidents and advanced hunting results via Graph API.",
    color: "bg-blue-600/20",
    textColor: "text-blue-400",
    configFields: [
      { key: "tenant_id", label: "Tenant ID", type: "text", required: true },
      { key: "client_id", label: "App ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
    ],
  },

  // ── Network ───────────────────────────────────────────────────────────────
  {
    id: "palo_alto",
    name: "Palo Alto Firewall",
    shortName: "PA",
    category: "Network",
    status: "connected",
    description: "Stream PAN-OS traffic, threat and system logs via Syslog or API.",
    color: "bg-orange-600/20",
    textColor: "text-orange-400",
    lastSync: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    eventCount: 12_304_000,
    configFields: [
      { key: "host", label: "Firewall / Panorama Host", type: "url", placeholder: "https://10.0.0.1", required: true },
      { key: "api_key", label: "API Key", type: "password", required: true, hint: "Generate via Device > Administrators" },
      {
        key: "log_types",
        label: "Log Types",
        type: "select",
        options: [
          { value: "all", label: "All (Traffic, Threat, Config, System)" },
          { value: "threat", label: "Threat only" },
          { value: "traffic_threat", label: "Traffic + Threat" },
        ],
      },
    ],
  },
  {
    id: "cisco_asa",
    name: "Cisco ASA",
    shortName: "CA",
    category: "Network",
    status: "connected",
    description: "Receive Cisco ASA/FTD syslog events including NAT, VPN and ACL denies.",
    color: "bg-teal-500/20",
    textColor: "text-teal-400",
    lastSync: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    eventCount: 4_520_800,
    configFields: [
      { key: "syslog_host", label: "Syslog Listener IP", type: "text", placeholder: "0.0.0.0", required: true },
      { key: "syslog_port", label: "Syslog Port", type: "number", placeholder: "514" },
      {
        key: "protocol",
        label: "Protocol",
        type: "select",
        options: [
          { value: "udp", label: "UDP" },
          { value: "tcp", label: "TCP" },
          { value: "tls", label: "TLS (TCP)" },
        ],
      },
    ],
  },
  {
    id: "fortinet",
    name: "Fortinet FortiGate",
    shortName: "FG",
    category: "Network",
    status: "not_connected",
    description: "Ingest FortiGate traffic, intrusion, and UTM logs via Syslog or FortiAnalyzer.",
    color: "bg-red-500/20",
    textColor: "text-red-400",
    configFields: [
      { key: "host", label: "FortiGate / FortiAnalyzer Host", type: "url", placeholder: "https://192.168.1.1", required: true },
      { key: "api_key", label: "REST API Key", type: "password", required: true },
    ],
  },
  {
    id: "zeek",
    name: "Zeek / Bro",
    shortName: "ZK",
    category: "Network",
    status: "beta",
    description: "Parse Zeek network flow logs (conn, dns, http, ssl, files) for deep inspection.",
    color: "bg-cyan-500/20",
    textColor: "text-cyan-400",
    configFields: [
      { key: "log_dir", label: "Zeek Log Directory", type: "text", placeholder: "/opt/zeek/logs/current", required: true },
      {
        key: "log_format",
        label: "Log Format",
        type: "select",
        options: [
          { value: "tsv", label: "TSV (default)" },
          { value: "json", label: "JSON" },
        ],
      },
    ],
  },

  // ── Identity ──────────────────────────────────────────────────────────────
  {
    id: "active_directory",
    name: "Active Directory",
    shortName: "AD",
    category: "Identity",
    status: "connected",
    description: "Collect Windows Security Event logs and AD authentication events via WMI/WEF.",
    color: "bg-blue-700/20",
    textColor: "text-blue-400",
    lastSync: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    eventCount: 7_890_100,
    configFields: [
      { key: "domain_controller", label: "Domain Controller", type: "text", placeholder: "dc01.corp.local", required: true },
      { key: "username", label: "Service Account", type: "text", placeholder: "CORP\\svc-hivearmor", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "ldap_port", label: "LDAP Port", type: "number", placeholder: "389" },
    ],
  },
  {
    id: "okta",
    name: "Okta",
    shortName: "OK",
    category: "Identity",
    status: "connected",
    description: "Stream Okta system log events including auth, MFA and user lifecycle.",
    color: "bg-sky-400/20",
    textColor: "text-sky-400",
    lastSync: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    eventCount: 980_600,
    configFields: [
      { key: "domain", label: "Okta Domain", type: "url", placeholder: "https://yourorg.okta.com", required: true },
      { key: "api_token", label: "API Token", type: "password", required: true },
    ],
  },
  {
    id: "azure_ad",
    name: "Azure AD",
    shortName: "AA",
    category: "Identity",
    status: "not_connected",
    description: "Ingest Azure AD sign-in logs, audit logs and risky identity detections.",
    color: "bg-indigo-500/20",
    textColor: "text-indigo-400",
    configFields: [
      { key: "tenant_id", label: "Tenant ID", type: "text", required: true },
      { key: "client_id", label: "App ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
    ],
  },
  {
    id: "cyberark",
    name: "CyberArk",
    shortName: "CK",
    category: "Identity",
    status: "beta",
    description: "Collect privileged access recordings and vault audit events from CyberArk PAM.",
    color: "bg-green-700/20",
    textColor: "text-green-400",
    configFields: [
      { key: "pvwa_url", label: "PVWA URL", type: "url", placeholder: "https://cyberark.corp.com/PasswordVault", required: true },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password", type: "password", required: true },
    ],
  },

  // ── Ticketing ─────────────────────────────────────────────────────────────
  {
    id: "jira",
    name: "Jira",
    shortName: "JR",
    category: "Ticketing",
    status: "connected",
    description: "Auto-create Jira issues from HiveArmor incidents with bidirectional sync.",
    color: "bg-blue-500/20",
    textColor: "text-blue-400",
    lastSync: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    eventCount: 1_240,
    configFields: [
      { key: "base_url", label: "Jira Base URL", type: "url", placeholder: "https://myorg.atlassian.net", required: true },
      { key: "email", label: "Account Email", type: "text", required: true },
      { key: "api_token", label: "API Token", type: "password", required: true },
      { key: "project_key", label: "Default Project Key", type: "text", placeholder: "SEC" },
    ],
  },
  {
    id: "servicenow",
    name: "ServiceNow",
    shortName: "SN",
    category: "Ticketing",
    status: "not_connected",
    description: "Push high-severity incidents into ServiceNow ITSM as security incidents.",
    color: "bg-green-500/20",
    textColor: "text-green-400",
    configFields: [
      { key: "instance_url", label: "Instance URL", type: "url", placeholder: "https://myorg.service-now.com", required: true },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "assignment_group", label: "Assignment Group", type: "text", placeholder: "SOC Team" },
    ],
  },
  {
    id: "pagerduty",
    name: "PagerDuty",
    shortName: "PD",
    category: "Ticketing",
    status: "connected",
    description: "Trigger and resolve PagerDuty incidents from critical HiveArmor alerts.",
    color: "bg-green-600/20",
    textColor: "text-green-400",
    lastSync: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    eventCount: 318,
    configFields: [
      { key: "routing_key", label: "Integration / Routing Key", type: "password", required: true, hint: "From PagerDuty Service > Integrations" },
      {
        key: "severity_threshold",
        label: "Minimum Severity",
        type: "select",
        options: [
          { value: "critical", label: "Critical only" },
          { value: "high", label: "High and above" },
          { value: "medium", label: "Medium and above" },
        ],
      },
    ],
  },

  // ── Communication ──────────────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    shortName: "SL",
    category: "Communication",
    status: "connected",
    description: "Send HiveArmor alert notifications to Slack channels via Webhook or OAuth.",
    color: "bg-purple-600/20",
    textColor: "text-purple-400",
    lastSync: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    eventCount: 4_820,
    configFields: [
      { key: "webhook_url", label: "Webhook URL", type: "url", placeholder: "https://hooks.slack.com/services/...", required: true },
      { key: "channel", label: "Default Channel", type: "text", placeholder: "#soc-alerts" },
      {
        key: "severity_threshold",
        label: "Minimum Severity",
        type: "select",
        options: [
          { value: "critical", label: "Critical only" },
          { value: "high", label: "High and above" },
          { value: "medium", label: "Medium and above" },
          { value: "all", label: "All severities" },
        ],
      },
    ],
  },

  // ── Threat Intel ──────────────────────────────────────────────────────────
  {
    id: "virustotal",
    name: "VirusTotal",
    shortName: "VT",
    category: "Threat Intel",
    status: "connected",
    description: "Enrich IOCs with VirusTotal file, URL, IP and domain reputation data.",
    color: "bg-blue-400/20",
    textColor: "text-blue-400",
    lastSync: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    eventCount: 82_400,
    configFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      {
        key: "plan",
        label: "API Plan",
        type: "select",
        options: [
          { value: "public", label: "Public (4 req/min)" },
          { value: "premium", label: "Premium (unlimited)" },
        ],
      },
    ],
  },
  {
    id: "misp",
    name: "MISP",
    shortName: "MI",
    category: "Threat Intel",
    status: "not_connected",
    description: "Sync threat intelligence events and attributes from your MISP instance.",
    color: "bg-red-600/20",
    textColor: "text-red-400",
    configFields: [
      { key: "base_url", label: "MISP URL", type: "url", placeholder: "https://misp.corp.com", required: true },
      { key: "api_key", label: "Auth Key", type: "password", required: true },
      { key: "verify_ssl", label: "Verify SSL", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
    ],
  },
  {
    id: "alienvault_otx",
    name: "AlienVault OTX",
    shortName: "OT",
    category: "Threat Intel",
    status: "beta",
    description: "Subscribe to OTX pulses and enrich events with community threat intelligence.",
    color: "bg-teal-600/20",
    textColor: "text-teal-400",
    configFields: [
      { key: "api_key", label: "OTX API Key", type: "password", required: true },
      { key: "subscribed_only", label: "Subscribed Pulses Only", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No (all public)" }] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper constants
// ---------------------------------------------------------------------------

const CATEGORIES: Category[] = [
  "All", "SIEM", "Cloud", "Endpoint", "Network",
  "Identity", "Ticketing", "Threat Intel", "Communication",
];

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  All: <Activity className="w-3.5 h-3.5" />,
  SIEM: <Shield className="w-3.5 h-3.5" />,
  Cloud: <Cloud className="w-3.5 h-3.5" />,
  Endpoint: <Monitor className="w-3.5 h-3.5" />,
  Network: <Network className="w-3.5 h-3.5" />,
  Identity: <Users className="w-3.5 h-3.5" />,
  Ticketing: <Ticket className="w-3.5 h-3.5" />,
  "Threat Intel": <Brain className="w-3.5 h-3.5" />,
  Communication: <MessageSquare className="w-3.5 h-3.5" />,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 text-tiny font-medium text-success">
        <span className="w-1.5 h-1.5 rounded-full bg-[--color-success] shadow-[0_0_4px_var(--color-success)]" />
        Connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-tiny font-medium text-critical">
        <span className="w-1.5 h-1.5 rounded-full bg-[--color-critical] shadow-[0_0_4px_var(--color-critical)]" />
        Error
      </span>
    );
  }
  if (status === "beta") {
    return (
      <span className="inline-flex items-center gap-1.5 text-tiny font-medium text-brand">
        <Zap className="w-3 h-3" />
        Beta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-tiny font-medium text-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-surface-tertiary border border-surface-border" />
      Not Connected
    </span>
  );
}

function CategoryBadge({ category }: { category: Exclude<Category, "All"> }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-tiny font-medium bg-surface-tertiary text-muted border border-surface-border">
      {CATEGORY_ICONS[category]}
      {category}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Configure Drawer
// ---------------------------------------------------------------------------

interface DrawerProps {
  integration: Integration | null;
  onClose: () => void;
  onSaved: (updated: Integration) => void;
}

function ConfigureDrawer({ integration, onClose, onSaved }: DrawerProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state when integration changes
  useEffect(() => {
    if (integration) {
      setValues({});
      setShowSecrets({});
      setTestResult("idle");
    }
  }, [integration]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!integration) return null;

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setTestResult("idle");
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult("idle");
    try {
      // No dedicated test endpoint — validate by fetching the record if connected
      if (integration.backendRecord?.id != null) {
        await integrationService.getIntegration(integration.backendRecord.id);
        setTestResult("success");
        toast("success", "Connection successful", `${integration.name} responded`);
      } else {
        // Not yet saved — can only test once credentials are configured
        setTestResult("error");
        toast("error", "Not configured", "Save the configuration first to test the connection");
      }
    } catch {
      setTestResult("error");
      toast("error", "Connection failed", "Check your credentials and try again");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const requiredMissing = integration.configFields
      .filter((f) => f.required && !values[f.key]?.trim())
      .map((f) => f.label);
    if (requiredMissing.length > 0) {
      toast("error", "Missing required fields", requiredMissing.join(", "));
      return;
    }
    setSaving(true);
    try {
      const payload: ApiIntegration = integration.backendRecord
        ? { ...integration.backendRecord, url: values["url"] ?? integration.backendRecord.url }
        : {
            id: 0,
            integrationName: integration.name,
            integrationDescription: integration.description,
            url: values["url"] ?? "",
          };

      const saved = integration.backendRecord
        ? await integrationService.updateIntegration(payload)
        : await integrationService.createIntegration(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (({ id: _id, ...rest }) => rest)(payload)
          );

      onSaved({ ...integration, backendRecord: saved, status: "connected" });
      toast("success", "Configuration saved", `${integration.name} has been updated`);
      onClose();
    } catch (err) {
      toast("error", "Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const isSyncActive = integration.status === "connected" || integration.status === "error";

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-surface-primary border-l border-surface-border z-[300] flex flex-col animate-slide-in-right shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-surface-border shrink-0">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm", integration.color, integration.textColor)}>
            {integration.shortName}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-h3 truncate">{integration.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={integration.status} />
              <span className="text-muted text-tiny">·</span>
              <CategoryBadge category={integration.category} />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {integration.docsUrl && (
              <a
                href={integration.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="toolbar-btn"
                title="View documentation"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button className="toolbar-btn" onClick={onClose} title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Status section (if ever connected) */}
          {isSyncActive && (
            <div className="p-5 border-b border-surface-border">
              <h3 className="text-small font-semibold text-primary mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                Connection Health
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-secondary rounded-lg p-3 border border-surface-border">
                  <div className="text-tiny text-muted mb-1">Last Sync</div>
                  <div className="text-small font-medium text-primary">
                    {integration.lastSync ? formatRelativeTime(integration.lastSync) : "—"}
                  </div>
                </div>
                <div className="bg-surface-secondary rounded-lg p-3 border border-surface-border">
                  <div className="text-tiny text-muted mb-1">Events Ingested</div>
                  <div className="text-small font-medium text-primary">
                    {integration.eventCount != null ? formatNumber(integration.eventCount) : "—"}
                  </div>
                </div>
                <div className="col-span-2 bg-surface-secondary rounded-lg p-3 border border-surface-border">
                  <div className="text-tiny text-muted mb-1">Status</div>
                  <div className="flex items-center gap-2">
                    {integration.status === "connected" ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-success" />
                        <span className="text-small text-success font-medium">Healthy — data flowing normally</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-critical" />
                        <span className="text-small text-critical font-medium">Authentication error — check credentials</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Configuration fields */}
          <div className="p-5 space-y-4">
            <h3 className="text-small font-semibold text-primary flex items-center gap-2">
              <Settings className="w-4 h-4 text-brand" />
              Configuration
            </h3>

            {integration.configFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-small font-medium text-secondary">
                  {field.label}
                  {field.required && <span className="text-critical ml-1">*</span>}
                </label>

                {field.type === "select" ? (
                  <select
                    className="input-base w-full"
                    value={values[field.key] ?? ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "password" ? (
                  <div className="relative">
                    <input
                      type={showSecrets[field.key] ? "text" : "password"}
                      className="input-base w-full pr-9"
                      placeholder={field.placeholder ?? "••••••••••••"}
                      value={values[field.key] ?? ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors"
                      onClick={() => toggleSecret(field.key)}
                      tabIndex={-1}
                    >
                      {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    className="input-base w-full"
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                  />
                )}

                {field.hint && (
                  <p className="text-tiny text-muted flex items-start gap-1.5">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    {field.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-5 border-t border-surface-border space-y-3 shrink-0 bg-surface-primary">
          {/* Test result banner */}
          {testResult === "success" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/30 text-small text-success">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Connection test passed
            </div>
          )}
          {testResult === "error" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-critical/10 border border-critical/30 text-small text-critical">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Connection test failed — check credentials
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="btn btn-secondary btn-sm flex-1"
              onClick={handleTest}
              disabled={testing || saving}
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Testing…
                </>
              ) : (
                <>
                  <Plug className="w-3.5 h-3.5" />
                  Test Connection
                </>
              )}
            </button>
            <button
              className="btn btn-primary btn-sm flex-1"
              onClick={handleSave}
              disabled={saving || testing}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Configuration"
              )}
            </button>
          </div>
          <button className="btn btn-ghost btn-sm w-full" onClick={onClose} disabled={saving || testing}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Integration Card
// ---------------------------------------------------------------------------

interface CardProps {
  integration: Integration;
  onConfigure: (integration: Integration) => void;
}

function IntegrationCard({ integration, onConfigure }: CardProps) {
  return (
    <div className="card card-hover flex flex-col gap-3 p-4 transition-all duration-150">
      {/* Top row: logo + status */}
      <div className="flex items-start justify-between gap-2">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0", integration.color, integration.textColor)}>
          {integration.shortName}
        </div>
        <StatusBadge status={integration.status} />
      </div>

      {/* Name + category */}
      <div className="space-y-1.5">
        <h3 className="text-small font-semibold text-primary leading-snug">{integration.name}</h3>
        <CategoryBadge category={integration.category} />
      </div>

      {/* Description */}
      <p className="text-tiny text-muted leading-relaxed line-clamp-2 flex-1">{integration.description}</p>

      {/* Sync info */}
      {(integration.lastSync || integration.eventCount != null) && (
        <div className="flex items-center gap-3 text-tiny text-muted pt-1 border-t border-surface-border">
          {integration.lastSync && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(integration.lastSync)}
            </span>
          )}
          {integration.eventCount != null && (
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {formatNumber(integration.eventCount)} events
            </span>
          )}
        </div>
      )}

      {/* CTA */}
      <button
        className={cn(
          "btn btn-sm w-full justify-center mt-auto",
          integration.status === "connected" || integration.status === "error"
            ? "btn-secondary"
            : "btn-primary"
        )}
        onClick={() => onConfigure(integration)}
      >
        {integration.status === "connected" || integration.status === "error" ? (
          <>
            <Settings className="w-3.5 h-3.5" />
            Configure
          </>
        ) : (
          <>
            <Plug className="w-3.5 h-3.5" />
            Connect
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>(DEMO_INTEGRATIONS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadFromApi = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        const apiRecords = await integrationService.listIntegrations();
        // Build a lookup: integrationName → backend record
        const byName = new Map(
          apiRecords.map((r) => [r.integrationName?.toLowerCase() ?? "", r])
        );
        setIntegrations((prev) =>
          prev.map((integration) => {
            const record = byName.get(integration.name.toLowerCase());
            if (!record) return integration;
            return {
              ...integration,
              status: "connected" as IntegrationStatus,
              backendRecord: record,
            };
          })
        );
      } catch {
        setLoadError("Failed to load integration status from server");
      }
    });
  }, []);

  useEffect(() => {
    loadFromApi();
  }, [loadFromApi]);

  // Derived stats
  const stats = useMemo(() => {
    const total = integrations.length;
    const connected = integrations.filter((i) => i.status === "connected").length;
    const errors = integrations.filter((i) => i.status === "error").length;
    const pending = integrations.filter((i) => i.status === "not_connected" || i.status === "beta").length;
    return { total, connected, errors, pending };
  }, [integrations]);

  // Filtered list
  const filtered = useMemo(() => {
    return integrations.filter((i) => {
      const matchesCategory = activeCategory === "All" || i.category === activeCategory;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [integrations, activeCategory, search]);

  const handleConfigure = useCallback((integration: Integration) => {
    setSelectedIntegration(integration);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedIntegration(null);
  }, []);

  const handleDrawerSaved = useCallback((updated: Integration) => {
    setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }, []);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Integrations</h1>
          <p className="text-secondary text-body mt-1">
            Connect security tools, cloud platforms, and services to HiveArmor.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm shrink-0" onClick={loadFromApi} disabled={isPending}>
          <RefreshCw className={cn("w-4 h-4", isPending && "animate-spin")} />
          Refresh Status
        </button>
      </div>

      {/* API load error */}
      {loadError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-critical/10 border border-critical/30 text-small text-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 space-y-1">
          <div className="text-tiny text-muted font-medium uppercase tracking-wider">Total</div>
          <div className="kpi-md text-primary">{stats.total}</div>
          <div className="text-tiny text-muted">Connectors</div>
        </div>
        <div className="card p-4 space-y-1">
          <div className="text-tiny text-muted font-medium uppercase tracking-wider">Connected</div>
          <div className="kpi-md text-success">{stats.connected}</div>
          <div className="text-tiny text-muted">Active ingestion</div>
        </div>
        <div className="card p-4 space-y-1">
          <div className="text-tiny text-muted font-medium uppercase tracking-wider">Errors</div>
          <div className="kpi-md text-critical">{stats.errors}</div>
          <div className="text-tiny text-muted">Need attention</div>
        </div>
        <div className="card p-4 space-y-1">
          <div className="text-tiny text-muted font-medium uppercase tracking-wider">Pending Setup</div>
          <div className="kpi-md text-warning">{stats.pending}</div>
          <div className="text-tiny text-muted">Not configured</div>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            type="text"
            className="input-base w-full pl-9 pr-8"
            placeholder="Search integrations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors"
              onClick={() => setSearch("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-tiny font-medium transition-all border",
                activeCategory === cat
                  ? "bg-brand/15 border-brand/40 text-brand"
                  : "bg-surface-tertiary border-surface-border text-muted hover:text-secondary hover:border-surface-border-strong"
              )}
            >
              {CATEGORY_ICONS[cat]}
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Result count hint */}
      {(search || activeCategory !== "All") && (
        <p className="text-tiny text-muted">
          Showing {filtered.length} of {integrations.length} integrations
          {activeCategory !== "All" && ` in ${activeCategory}`}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* Integration grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title="No integrations found"
          description={`Try adjusting your search or category filter.`}
          action={
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(""); setActiveCategory("All"); }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConfigure={handleConfigure}
            />
          ))}
        </div>
      )}

      {/* Configure drawer */}
      <ConfigureDrawer
        integration={selectedIntegration}
        onClose={handleCloseDrawer}
        onSaved={handleDrawerSaved}
      />
    </div>
  );
}
