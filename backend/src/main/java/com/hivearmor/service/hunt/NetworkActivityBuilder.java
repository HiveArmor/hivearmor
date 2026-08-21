package com.hivearmor.service.hunt;

import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Aggregates network events into connections, DNS records, TLS metadata, and IP reputation.
 *
 * <p>Workflow:
 * <ol>
 *   <li>Map each event → Connection object with protocol derived from destination port</li>
 *   <li>Extract DNS records from events containing dns.question.name</li>
 *   <li>Extract TLS metadata from events containing tls.client.ja3 or tls.server_name</li>
 *   <li>Build IP reputation map from threat.indicator.ip_reputation fields</li>
 * </ol>
 */
@Service
public class NetworkActivityBuilder {

    private static final Map<Integer, String> PORT_TO_PROTOCOL = Map.of(
        443, "https",
        80, "http",
        53, "dns",
        22, "ssh",
        445, "smb",
        3389, "rdp",
        25, "smtp",
        21, "ftp"
    );

    private static final List<String> INTERNAL_PREFIXES = List.of(
        "10.",
        "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.",
        "172.24.", "172.25.", "172.26.", "172.27.",
        "172.28.", "172.29.", "172.30.", "172.31.",
        "192.168."
    );

    /**
     * Result container for network activity build operation.
     */
    public static class NetworkActivityResult {
        private final List<Map<String, Object>> connections;
        private final List<Map<String, Object>> dns;
        private final List<Map<String, Object>> tls;
        private final Map<String, Map<String, Object>> reputation;
        private final int totalConnections;

        public NetworkActivityResult(List<Map<String, Object>> connections,
                                     List<Map<String, Object>> dns,
                                     List<Map<String, Object>> tls,
                                     Map<String, Map<String, Object>> reputation,
                                     int totalConnections) {
            this.connections = connections;
            this.dns = dns;
            this.tls = tls;
            this.reputation = reputation;
            this.totalConnections = totalConnections;
        }

        public List<Map<String, Object>> getConnections() { return connections; }
        public List<Map<String, Object>> getDns() { return dns; }
        public List<Map<String, Object>> getTls() { return tls; }
        public Map<String, Map<String, Object>> getReputation() { return reputation; }
        public int getTotalConnections() { return totalConnections; }
    }

    /**
     * Aggregates network events into connections, DNS, TLS, and reputation data.
     *
     * @param networkEvents list of event source maps from OpenSearch
     * @return NetworkActivityResult containing all aggregated data
     */
    @SuppressWarnings("unchecked")
    public NetworkActivityResult build(List<Map<String, Object>> networkEvents) {
        if (networkEvents == null || networkEvents.isEmpty()) {
            return new NetworkActivityResult(
                Collections.emptyList(), Collections.emptyList(),
                Collections.emptyList(), Collections.emptyMap(), 0);
        }

        List<Map<String, Object>> connections = new ArrayList<>();
        List<Map<String, Object>> dnsRecords = new ArrayList<>();
        List<Map<String, Object>> tlsRecords = new ArrayList<>();
        Map<String, Map<String, Object>> reputationMap = new LinkedHashMap<>();

        int connIndex = 0;
        for (Map<String, Object> event : networkEvents) {
            // Build connection object for every event
            connIndex++;
            Map<String, Object> conn = buildConnection(event, connIndex);
            connections.add(conn);

            // Extract DNS record if applicable
            String dnsQueryName = extractNested(event, "dns.question.name");
            if (dnsQueryName != null && !dnsQueryName.isBlank()) {
                Map<String, Object> dnsRecord = buildDnsRecord(event, dnsQueryName);
                dnsRecords.add(dnsRecord);
            }

            // Extract TLS record if applicable
            String ja3 = extractNested(event, "tls.client.ja3");
            String serverName = extractNested(event, "tls.server_name");
            if (ja3 != null || serverName != null) {
                Map<String, Object> tlsRecord = buildTlsRecord(event, ja3, serverName);
                tlsRecords.add(tlsRecord);
            }

            // Build reputation from threat.indicator.ip_reputation
            String destIp = extractNested(event, "destination.ip");
            if (destIp != null && !isInternal(destIp)) {
                Object repObj = extractNestedObject(event, "threat.indicator.ip_reputation");
                if (repObj instanceof Map) {
                    Map<String, Object> repData = (Map<String, Object>) repObj;
                    if (!reputationMap.containsKey(destIp)) {
                        Map<String, Object> rep = new LinkedHashMap<>();
                        rep.put("score", repData.get("score"));
                        rep.put("category", repData.get("category"));
                        rep.put("source", repData.get("source"));
                        reputationMap.put(destIp, rep);
                    }
                }
            }
        }

        return new NetworkActivityResult(connections, dnsRecords, tlsRecords,
            reputationMap, connections.size());
    }

    /**
     * Builds a single Connection map from a network event.
     */
    private Map<String, Object> buildConnection(Map<String, Object> event, int index) {
        Map<String, Object> conn = new LinkedHashMap<>();

        String sourceIp = extractNested(event, "source.ip");
        String destIp = extractNested(event, "destination.ip");
        String destPortStr = extractNested(event, "destination.port");

        int destPort = 0;
        if (destPortStr != null) {
            try {
                destPort = Integer.parseInt(destPortStr);
            } catch (NumberFormatException e) {
                // leave as 0
            }
        }

        String protocol = PORT_TO_PROTOCOL.getOrDefault(destPort, "unknown");
        String direction = classifyDirection(sourceIp, destIp);

        conn.put("id", "conn-" + String.format("%03d", index));
        conn.put("timestamp", event.get("@timestamp"));
        conn.put("protocol", protocol);
        conn.put("transport", extractNested(event, "network.transport"));
        conn.put("sourceIp", sourceIp);
        conn.put("sourcePort", parseIntOrNull(extractNested(event, "source.port")));
        conn.put("destIp", destIp);
        conn.put("destPort", destPort);
        conn.put("bytesIn", parseIntOrNull(extractNested(event, "network.bytes")));
        conn.put("bytesOut", parseIntOrNull(extractNested(event, "network.bytes_out")));
        conn.put("duration", parseIntOrNull(extractNested(event, "event.duration")));
        conn.put("direction", direction);
        conn.put("processId", extractNested(event, "process.pid"));
        conn.put("processName", extractNested(event, "process.name"));

        return conn;
    }

    /**
     * Builds a DNS record from an event containing dns.question.name.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildDnsRecord(Map<String, Object> event, String queryName) {
        Map<String, Object> dns = new LinkedHashMap<>();
        dns.put("queryName", queryName);
        dns.put("queryType", extractNested(event, "dns.question.type"));

        // Extract resolved IPs
        Object resolvedRaw = extractNestedObject(event, "dns.resolved_ip");
        List<String> responseIps = new ArrayList<>();
        if (resolvedRaw instanceof List) {
            for (Object ip : (List<?>) resolvedRaw) {
                if (ip != null) responseIps.add(ip.toString());
            }
        } else if (resolvedRaw != null) {
            responseIps.add(resolvedRaw.toString());
        }
        dns.put("responseIps", responseIps);
        dns.put("timestamp", event.get("@timestamp"));

        return dns;
    }

    /**
     * Builds a TLS record from an event containing tls.* fields.
     */
    private Map<String, Object> buildTlsRecord(Map<String, Object> event, String ja3, String serverName) {
        Map<String, Object> tls = new LinkedHashMap<>();
        tls.put("serverName", serverName != null ? serverName : extractNested(event, "tls.server_name"));
        tls.put("ja3Hash", ja3);
        tls.put("ja3sHash", extractNested(event, "tls.server.ja3s"));
        tls.put("version", extractNested(event, "tls.version"));
        tls.put("issuer", extractNested(event, "tls.server.issuer"));
        tls.put("subject", extractNested(event, "tls.server.subject"));
        tls.put("notAfter", extractNested(event, "tls.server.not_after"));
        return tls;
    }

    /**
     * Classifies network direction based on source and destination IPs.
     *
     * @return "outbound" if internal→external, "inbound" if external→internal, "lateral" if internal→internal
     */
    String classifyDirection(String sourceIp, String destIp) {
        if (sourceIp == null || destIp == null) return "unknown";

        boolean srcInternal = isInternal(sourceIp);
        boolean dstInternal = isInternal(destIp);

        if (srcInternal && !dstInternal) return "outbound";
        if (!srcInternal && dstInternal) return "inbound";
        if (srcInternal && dstInternal) return "lateral";
        return "external";
    }

    /**
     * Checks if an IP address is internal (RFC 1918).
     */
    boolean isInternal(String ip) {
        if (ip == null) return false;
        return INTERNAL_PREFIXES.stream().anyMatch(ip::startsWith);
    }

    private Integer parseIntOrNull(String value) {
        if (value == null) return null;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            try {
                return (int) Double.parseDouble(value);
            } catch (NumberFormatException e2) {
                return null;
            }
        }
    }

    /**
     * Extracts a dot-notation nested field value as a String from a map.
     */
    @SuppressWarnings("unchecked")
    private String extractNested(Map<String, Object> src, String path) {
        Object val = extractNestedObject(src, path);
        return val != null ? val.toString() : null;
    }

    /**
     * Extracts a dot-notation nested field value as an Object from a map.
     */
    @SuppressWarnings("unchecked")
    private Object extractNestedObject(Map<String, Object> src, String path) {
        if (src == null || path == null) return null;

        String[] parts = path.split("\\.");
        Object current = src;

        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }
        return current;
    }
}
