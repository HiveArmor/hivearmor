package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Maps OSV querybatch JSON onto vulnerability rows. Only CVE-* ids are kept.
 * CVSS is stored only when OSV supplies a numeric score; EPSS is never derived.
 */
public final class OsvFindingMapper {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private OsvFindingMapper() {
    }

    public static final class ComponentQuery {
        public final String name;
        public final String version;
        public final String purl;

        public ComponentQuery(String name, String version, String purl) {
            this.name = name;
            this.version = version;
            this.purl = purl;
        }
    }

    public static final class FindingRow {
        public final String cveId;
        public final String purl;
        public final String packageName;
        public final String installedVersion;
        public final Double cvssV3;
        public final String severity;
        public final String description;

        public FindingRow(String cveId, String purl, String packageName, String installedVersion,
                          Double cvssV3, String severity, String description) {
            this.cveId = cveId;
            this.purl = purl;
            this.packageName = packageName;
            this.installedVersion = installedVersion;
            this.cvssV3 = cvssV3;
            this.severity = severity;
            this.description = description;
        }
    }

    public static List<FindingRow> mapQueryBatch(List<ComponentQuery> queries, String responseJson) throws Exception {
        JsonNode root = MAPPER.readTree(responseJson);
        JsonNode results = root.path("results");
        List<FindingRow> rows = new ArrayList<>();
        if (!results.isArray()) {
            return rows;
        }
        int i = 0;
        for (JsonNode result : results) {
            if (i >= queries.size()) {
                break;
            }
            ComponentQuery q = queries.get(i);
            i++;
            JsonNode vulns = result.path("vulns");
            if (!vulns.isArray()) {
                continue;
            }
            for (JsonNode vuln : vulns) {
                for (String cve : cveIds(vuln)) {
                    rows.add(new FindingRow(
                            cve,
                            q.purl == null ? "" : q.purl,
                            q.name,
                            q.version,
                            numericCvss(vuln),
                            severityLabel(vuln),
                            textOrNull(vuln, "summary")));
                }
            }
        }
        return rows;
    }

    static List<String> cveIds(JsonNode vuln) {
        List<String> ids = new ArrayList<>();
        addIfCve(ids, textOrNull(vuln, "id"));
        JsonNode aliases = vuln.path("aliases");
        if (aliases.isArray()) {
            for (JsonNode a : aliases) {
                addIfCve(ids, a.asText(null));
            }
        }
        return ids;
    }

    private static void addIfCve(List<String> ids, String value) {
        if (value == null) {
            return;
        }
        String upper = value.toUpperCase(Locale.ROOT);
        if (upper.startsWith("CVE-") && !ids.contains(upper)) {
            ids.add(upper);
        }
    }

    static Double numericCvss(JsonNode vuln) {
        JsonNode severity = vuln.path("severity");
        if (!severity.isArray()) {
            return null;
        }
        for (JsonNode s : severity) {
            String score = textOrNull(s, "score");
            if (score == null) {
                continue;
            }
            try {
                return Double.parseDouble(score);
            } catch (NumberFormatException ignored) {
                // Vector strings are not converted into invented numeric scores.
            }
        }
        return null;
    }

    static String severityLabel(JsonNode vuln) {
        JsonNode ds = vuln.path("database_specific").path("severity");
        if (ds.isTextual()) {
            return ds.asText().toUpperCase(Locale.ROOT);
        }
        return null;
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode n = node.path(field);
        if (n.isMissingNode() || n.isNull()) {
            return null;
        }
        String t = n.asText(null);
        return t == null || t.isBlank() ? null : t;
    }
}
