package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent policy document schema v1 — must match {@code agent/agent/policy_schema.go}.
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY. Unknown fields ignored by the agent.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AgentPolicySchemaV1 {

    public static final int SCHEMA_VERSION = 1;
    public static final String FIM_MODE_MERGE = "merge";
    public static final String FIM_MODE_REPLACE = "replace";

    @JsonProperty("schema_version")
    private int schemaVersion = SCHEMA_VERSION;

    private FimSection fim;

    private Map<String, Boolean> collectors;

    private ResponseSection response;

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

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FimSection {
        private String mode;
        private List<FimRule> rules = new ArrayList<>();

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
