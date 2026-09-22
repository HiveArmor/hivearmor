package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent policy document schema v1 / v1.1 — must match {@code agent/agent/policy_schema.go}.
 *
 * <p>Wire {@code schema_version} remains {@code 1} for agent compatibility.
 * Optional {@link TelemetrySection} is the additive <strong>v1.1</strong> extension
 * ({@code sca_interval_hours}, {@code sbom_interval_hours}). Unknown fields ignored by the agent.
 *
 * <p><strong>PT-0 additive extension (feature level 1.3):</strong> the FortiSIEM-style monitor
 * template sections — {@link MonitorSection monitor}, {@link EventSection event},
 * {@link UebaSection ueba}, {@code userLog}, {@link ChangeSection change},
 * {@link ScriptSection script}, {@code certificate}, {@link OsquerySection osquery}, and the
 * net-new {@link ScansSection scans} block — are all optional top-level fields serialized
 * {@code NON_NULL}. A policy that carries only FIM/collectors/response/telemetry emits exactly
 * today's document (no new keys), so existing policies round-trip byte-identically. Wire
 * {@code schema_version} stays {@code 1}; older agents ignore unknown sections
 * ({@code @JsonIgnoreProperties(ignoreUnknown = true)}). No runtime behavior in PT-0 —
 * these are contract carriers for PT-1…PT-6.
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AgentPolicySchemaV1 {

    /** Wire major version emitted in {@code schema_version} (agent accepts 0 or 1). */
    public static final int SCHEMA_VERSION = 1;
    /** Feature level documenting additive telemetry + optional fim.registry + PT-0 template sections. */
    public static final String SCHEMA_FEATURE = "1.3";
    public static final String FIM_MODE_MERGE = "merge";
    public static final String FIM_MODE_REPLACE = "replace";
    public static final int DEFAULT_TELEMETRY_INTERVAL_HOURS = 6;
    public static final int MIN_TELEMETRY_INTERVAL_HOURS = 1;
    public static final int MAX_TELEMETRY_INTERVAL_HOURS = 168;

    @JsonProperty("schema_version")
    private int schemaVersion = SCHEMA_VERSION;

    private FimSection fim;

    private Map<String, Boolean> collectors;

    private ResponseSection response;

    /** Optional v1.1 SCA/SBOM schedule (hours). Omitted when unset. */
    private TelemetrySection telemetry;

    /** PT-0 additive: perf/discovery monitor items (intervalSec is the only perf cadence knob). */
    private MonitorSection monitor;

    /** PT-0 additive: OS event / file-log collection. */
    private EventSection event;

    /** PT-0 additive: UEBA kernel behavioral telemetry on/off. */
    private UebaSection ueba;

    /** PT-0 additive: arbitrary file-tail specs. */
    private List<UserLogEntry> userLog;

    /** PT-0 additive: registry root-key + installed-software change monitoring. */
    private ChangeSection change;

    /** PT-0 additive: WMI classes + PowerShell collection scripts. */
    private ScriptSection script;

    /** PT-0 additive: per-store certificate lifecycle monitoring. */
    private List<CertificateEntry> certificate;

    /** PT-0 additive: attached named osqueries. */
    private OsquerySection osquery;

    /** PT-0 additive (net-new): native CIS + Vuln scan cadence (Option A, source=agent). */
    private ScansSection scans;

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public FimSection getFim() {
        return fim;
    }

    public void setFim(FimSection fim) {
        this.fim = fim;
    }

    public Map<String, Boolean> getCollectors() {
        return collectors;
    }

    public void setCollectors(Map<String, Boolean> collectors) {
        this.collectors = collectors;
    }

    public ResponseSection getResponse() {
        return response;
    }

    public void setResponse(ResponseSection response) {
        this.response = response;
    }

    public TelemetrySection getTelemetry() {
        return telemetry;
    }

    public void setTelemetry(TelemetrySection telemetry) {
        this.telemetry = telemetry;
    }

    public MonitorSection getMonitor() {
        return monitor;
    }

    public void setMonitor(MonitorSection monitor) {
        this.monitor = monitor;
    }

    public EventSection getEvent() {
        return event;
    }

    public void setEvent(EventSection event) {
        this.event = event;
    }

    public UebaSection getUeba() {
        return ueba;
    }

    public void setUeba(UebaSection ueba) {
        this.ueba = ueba;
    }

    public List<UserLogEntry> getUserLog() {
        return userLog;
    }

    public void setUserLog(List<UserLogEntry> userLog) {
        this.userLog = userLog;
    }

    public ChangeSection getChange() {
        return change;
    }

    public void setChange(ChangeSection change) {
        this.change = change;
    }

    public ScriptSection getScript() {
        return script;
    }

    public void setScript(ScriptSection script) {
        this.script = script;
    }

    public List<CertificateEntry> getCertificate() {
        return certificate;
    }

    public void setCertificate(List<CertificateEntry> certificate) {
        this.certificate = certificate;
    }

    public OsquerySection getOsquery() {
        return osquery;
    }

    public void setOsquery(OsquerySection osquery) {
        this.osquery = osquery;
    }

    public ScansSection getScans() {
        return scans;
    }

    public void setScans(ScansSection scans) {
        this.scans = scans;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FimSection {
        private String mode;
        private List<FimRule> rules = new ArrayList<>();
        /** Optional Windows registry FIM (agent ignores on non-Windows). */
        private FimRegistrySection registry;

        public String getMode() {
            return mode;
        }

        public void setMode(String mode) {
            this.mode = mode;
        }

        public List<FimRule> getRules() {
            return rules;
        }

        public void setRules(List<FimRule> rules) {
            this.rules = rules;
        }

        public FimRegistrySection getRegistry() {
            return registry;
        }

        public void setRegistry(FimRegistrySection registry) {
            this.registry = registry;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FimRegistrySection {
        private String mode;
        private List<String> keys = new ArrayList<>();

        public String getMode() {
            return mode;
        }

        public void setMode(String mode) {
            this.mode = mode;
        }

        public List<String> getKeys() {
            return keys;
        }

        public void setKeys(List<String> keys) {
            this.keys = keys;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FimRule {
        private String path;
        private boolean recursive;
        private List<String> exclude;

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public boolean isRecursive() {
            return recursive;
        }

        public void setRecursive(boolean recursive) {
            this.recursive = recursive;
        }

        public List<String> getExclude() {
            return exclude;
        }

        public void setExclude(List<String> exclude) {
            this.exclude = exclude;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ResponseSection {
        @JsonProperty("allow_shell")
        private boolean allowShell;

        public boolean isAllowShell() {
            return allowShell;
        }

        public void setAllowShell(boolean allowShell) {
            this.allowShell = allowShell;
        }
    }

    /**
     * Host telemetry schedule (schema v1.1 additive). Agent may ignore until it
     * reads these fields; defaults match today's hardcoded 6h loop.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TelemetrySection {
        @JsonProperty("sca_interval_hours")
        private Integer scaIntervalHours;

        @JsonProperty("sbom_interval_hours")
        private Integer sbomIntervalHours;

        public Integer getScaIntervalHours() {
            return scaIntervalHours;
        }

        public void setScaIntervalHours(Integer scaIntervalHours) {
            this.scaIntervalHours = scaIntervalHours;
        }

        public Integer getSbomIntervalHours() {
            return sbomIntervalHours;
        }

        public void setSbomIntervalHours(Integer sbomIntervalHours) {
            this.sbomIntervalHours = sbomIntervalHours;
        }
    }

    // ---------------------------------------------------------------------
    // PT-0 additive template sections (feature level 1.3). Design-only:
    // contract carriers, no runtime behavior in this wave. All NON_NULL so
    // a FIM-only policy round-trips byte-identically.
    // ---------------------------------------------------------------------

    /** Perf/discovery items; {@code intervalSec} is the only perf cadence knob. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MonitorSection {
        private List<MonitorItem> items;

        public List<MonitorItem> getItems() {
            return items;
        }

        public void setItems(List<MonitorItem> items) {
            this.items = items;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MonitorItem {
        private String metric;
        private Integer intervalSec;

        public String getMetric() {
            return metric;
        }

        public void setMetric(String metric) {
            this.metric = metric;
        }

        public Integer getIntervalSec() {
            return intervalSec;
        }

        public void setIntervalSec(Integer intervalSec) {
            this.intervalSec = intervalSec;
        }
    }

    /** OS event / file-log collection (event-driven, no cadence). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EventSection {
        private Map<String, Boolean> fileLog;
        private List<EventLogRow> eventLogs;

        public Map<String, Boolean> getFileLog() {
            return fileLog;
        }

        public void setFileLog(Map<String, Boolean> fileLog) {
            this.fileLog = fileLog;
        }

        public List<EventLogRow> getEventLogs() {
            return eventLogs;
        }

        public void setEventLogs(List<EventLogRow> eventLogs) {
            this.eventLogs = eventLogs;
        }
    }

    /** Event-log row. {@code include}/{@code exclude} accept ALL/NONE or an id list (kept as Object). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EventLogRow {
        private String type;
        private String channel;
        private Object include;
        private Object exclude;

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getChannel() {
            return channel;
        }

        public void setChannel(String channel) {
            this.channel = channel;
        }

        public Object getInclude() {
            return include;
        }

        public void setInclude(Object include) {
            this.include = include;
        }

        public Object getExclude() {
            return exclude;
        }

        public void setExclude(Object exclude) {
            this.exclude = exclude;
        }
    }

    /** UEBA kernel behavioral telemetry on/off. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class UebaSection {
        private Boolean enabled;

        public Boolean getEnabled() {
            return enabled;
        }

        public void setEnabled(Boolean enabled) {
            this.enabled = enabled;
        }
    }

    /** Arbitrary file-tail spec. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class UserLogEntry {
        private String fullFileName;
        private String logPrefix;
        private UserLogMultiline multiline;

        public String getFullFileName() {
            return fullFileName;
        }

        public void setFullFileName(String fullFileName) {
            this.fullFileName = fullFileName;
        }

        public String getLogPrefix() {
            return logPrefix;
        }

        public void setLogPrefix(String logPrefix) {
            this.logPrefix = logPrefix;
        }

        public UserLogMultiline getMultiline() {
            return multiline;
        }

        public void setMultiline(UserLogMultiline multiline) {
            this.multiline = multiline;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class UserLogMultiline {
        private String start;
        private String end;
        private Integer maxLines;

        public String getStart() {
            return start;
        }

        public void setStart(String start) {
            this.start = start;
        }

        public String getEnd() {
            return end;
        }

        public void setEnd(String end) {
            this.end = end;
        }

        public Integer getMaxLines() {
            return maxLines;
        }

        public void setMaxLines(Integer maxLines) {
            this.maxLines = maxLines;
        }
    }

    /** Registry root-key + installed-software change monitoring. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ChangeSection {
        private List<ChangeRegistryEntry> registry;
        private Boolean installedSoftware;

        public List<ChangeRegistryEntry> getRegistry() {
            return registry;
        }

        public void setRegistry(List<ChangeRegistryEntry> registry) {
            this.registry = registry;
        }

        public Boolean getInstalledSoftware() {
            return installedSoftware;
        }

        public void setInstalledSoftware(Boolean installedSoftware) {
            this.installedSoftware = installedSoftware;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ChangeRegistryEntry {
        private String rootKey;
        private List<String> excludeSubkeys;

        public String getRootKey() {
            return rootKey;
        }

        public void setRootKey(String rootKey) {
            this.rootKey = rootKey;
        }

        public List<String> getExcludeSubkeys() {
            return excludeSubkeys;
        }

        public void setExcludeSubkeys(List<String> excludeSubkeys) {
            this.excludeSubkeys = excludeSubkeys;
        }
    }

    /** WMI classes + PowerShell collection scripts. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ScriptSection {
        private List<String> wmi;
        private List<String> powershell;

        public List<String> getWmi() {
            return wmi;
        }

        public void setWmi(List<String> wmi) {
            this.wmi = wmi;
        }

        public List<String> getPowershell() {
            return powershell;
        }

        public void setPowershell(List<String> powershell) {
            this.powershell = powershell;
        }
    }

    /** Per-store certificate lifecycle monitoring. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class CertificateEntry {
        private String store;
        private Boolean add;
        private Boolean delete;
        private Boolean expiring;
        private Boolean expired;

        public String getStore() {
            return store;
        }

        public void setStore(String store) {
            this.store = store;
        }

        public Boolean getAdd() {
            return add;
        }

        public void setAdd(Boolean add) {
            this.add = add;
        }

        public Boolean getDelete() {
            return delete;
        }

        public void setDelete(Boolean delete) {
            this.delete = delete;
        }

        public Boolean getExpiring() {
            return expiring;
        }

        public void setExpiring(Boolean expiring) {
            this.expiring = expiring;
        }

        public Boolean getExpired() {
            return expired;
        }

        public void setExpired(Boolean expired) {
            this.expired = expired;
        }
    }

    /** Attached named osqueries (schedule lives on the osquery, not the template). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OsquerySection {
        private List<String> queries;

        public List<String> getQueries() {
            return queries;
        }

        public void setQueries(List<String> queries) {
            this.queries = queries;
        }
    }

    /**
     * NET-NEW scan cadence block (beyond FortiSIEM). Option A: native, reuse-first.
     * {@code source=agent} is the only value PT-5 implements; {@code source=ingest} is reserved.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ScansSection {
        private ScanSpec cis;
        private ScanSpec vuln;

        public ScanSpec getCis() {
            return cis;
        }

        public void setCis(ScanSpec cis) {
            this.cis = cis;
        }

        public ScanSpec getVuln() {
            return vuln;
        }

        public void setVuln(ScanSpec vuln) {
            this.vuln = vuln;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ScanSpec {
        private Boolean enabled;
        private String profile;
        /** {@code scheduled} | {@code realtime}. */
        private String mode;
        private String cronOrInterval;
        /** {@code agent} (native, built PT-5) | {@code ingest} (external scanner, reserved). */
        private String source;

        public Boolean getEnabled() {
            return enabled;
        }

        public void setEnabled(Boolean enabled) {
            this.enabled = enabled;
        }

        public String getProfile() {
            return profile;
        }

        public void setProfile(String profile) {
            this.profile = profile;
        }

        public String getMode() {
            return mode;
        }

        public void setMode(String mode) {
            this.mode = mode;
        }

        public String getCronOrInterval() {
            return cronOrInterval;
        }

        public void setCronOrInterval(String cronOrInterval) {
            this.cronOrInterval = cronOrInterval;
        }

        public String getSource() {
            return source;
        }

        public void setSource(String source) {
            this.source = source;
        }
    }

    /**
     * Default collector enablement map (agent treats missing keys as enabled).
     */
    public static Map<String, Boolean> defaultCollectors() {
        Map<String, Boolean> map = new LinkedHashMap<>();
        map.put("fim", true);
        map.put("dns", true);
        map.put("netconn", true);
        map.put("usb", true);
        map.put("netflow", true);
        map.put("syslog", true);
        map.put("file", true);
        return map;
    }
}
