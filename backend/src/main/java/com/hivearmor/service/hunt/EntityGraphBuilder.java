package com.hivearmor.service.hunt;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Builds an entity relationship graph from alert events retrieved from OpenSearch.
 *
 * <p>Workflow:
 * <ol>
 *   <li>Scan event fields to extract entity nodes (host, user, ip, process, file, domain)</li>
 *   <li>Deduplicate nodes by (type + canonical identifier)</li>
 *   <li>Build edges from event relationships (spawned, communicated_with, authenticated_as, etc.)</li>
 *   <li>Assign roles based on entity position (attacker, victim, lateral, c2, unknown)</li>
 *   <li>Compute risk scores based on roles</li>
 *   <li>Cap at 50 nodes / 100 edges; set truncated flag if exceeded</li>
 * </ol>
 */
@Service
public class EntityGraphBuilder {

    private static final int MAX_NODES = 50;
    private static final int MAX_EDGES = 100;

    private static final List<String> INTERNAL_PREFIXES = List.of(
        "10.",
        "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.",
        "172.24.", "172.25.", "172.26.", "172.27.",
        "172.28.", "172.29.", "172.30.", "172.31.",
        "192.168."
    );

    private static final Set<String> SUSPICIOUS_PROCESS_NAMES = Set.of(
        "mimikatz", "beacon", "cobalt", "meterpreter", "nc.exe", "ncat",
        "psexec", "wmic", "certutil", "bitsadmin", "mshta", "regsvr32"
    );

    /**
     * Result container for the entity graph build operation.
     */
    public static class EntityGraphResult {
        private final List<Map<String, Object>> nodes;
        private final List<Map<String, Object>> edges;
        private final Map<String, Object> metadata;

        public EntityGraphResult(List<Map<String, Object>> nodes,
                                 List<Map<String, Object>> edges,
                                 Map<String, Object> metadata) {
            this.nodes = nodes;
            this.edges = edges;
            this.metadata = metadata;
        }

        public List<Map<String, Object>> getNodes() { return nodes; }
        public List<Map<String, Object>> getEdges() { return edges; }
        public Map<String, Object> getMetadata() { return metadata; }
    }

    /**
     * Builds the entity relationship graph from events linked to an alert.
     *
     * @param events    list of event source maps from OpenSearch
     * @param alertDoc  the alert document source map
     * @return EntityGraphResult containing nodes, edges, and metadata
     */
    @SuppressWarnings("unchecked")
    public EntityGraphResult build(List<Map<String, Object>> events, Map<String, Object> alertDoc) {
        if (events == null || events.isEmpty()) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("totalNodes", 0);
            meta.put("totalEdges", 0);
            meta.put("truncated", false);
            return new EntityGraphResult(Collections.emptyList(), Collections.emptyList(), meta);
        }

        // Node map keyed by "type:identifier" for deduplication
        Map<String, Map<String, Object>> nodeMap = new LinkedHashMap<>();
        // Edge list (deduplicated by sourceId+targetId+type)
        Set<String> edgeKeys = new LinkedHashSet<>();
        List<Map<String, Object>> edges = new ArrayList<>();
        AtomicInteger edgeCounter = new AtomicInteger(1);

        // Determine primary entity ID from alert
        String primaryEntityId = extractPrimaryEntityId(alertDoc);

        // Track IP relationships for role assignment
        Set<String> lateralDestinationIps = new HashSet<>();
        Set<String> externalIpsWithReputation = new HashSet<>();
        Map<String, Integer> ipReputationScores = new HashMap<>();

        // Step 1: Extract entities from each event
        for (Map<String, Object> event : events) {
            extractEntities(event, nodeMap);
            extractEdges(event, nodeMap, edges, edgeKeys, edgeCounter);
            trackIpRelationships(event, lateralDestinationIps, externalIpsWithReputation, ipReputationScores);
        }

        // Step 2: Assign roles
        assignRoles(nodeMap, primaryEntityId, lateralDestinationIps, externalIpsWithReputation, ipReputationScores);

        // Step 3: Compute risk scores
        computeRiskScores(nodeMap, ipReputationScores);

        // Step 4: Determine truncation
        int totalNodes = nodeMap.size();
        int totalEdges = edges.size();
        boolean truncated = false;

        List<Map<String, Object>> nodeList = new ArrayList<>(nodeMap.values());

        if (nodeList.size() > MAX_NODES) {
            nodeList = nodeList.subList(0, MAX_NODES);
            truncated = true;
        }
        if (edges.size() > MAX_EDGES) {
            edges = edges.subList(0, MAX_EDGES);
            truncated = true;
        }

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("totalNodes", totalNodes);
        metadata.put("totalEdges", totalEdges);
        metadata.put("truncated", truncated);

        return new EntityGraphResult(nodeList, edges, metadata);
    }

    /**
     * Extracts entity nodes from a single event document.
     */
    @SuppressWarnings("unchecked")
    private void extractEntities(Map<String, Object> event, Map<String, Map<String, Object>> nodeMap) {
        // host.name → host node
        String hostName = extractNested(event, "host.name");
        if (hostName != null && !hostName.isBlank()) {
            String key = "host:" + hostName.toLowerCase();
            nodeMap.computeIfAbsent(key, k -> {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", buildNodeId("host", hostName));
                node.put("type", "host");
                node.put("label", hostName);
                node.put("role", "unknown");
                node.put("riskScore", 0);
                Map<String, Object> meta = new LinkedHashMap<>();
                String os = extractNested(event, "host.os.name");
                if (os != null) meta.put("os", os);
                String criticality = extractNested(event, "host.risk.static_level");
                meta.put("criticality", criticality != null ? criticality : "medium");
                node.put("metadata", meta);
                return node;
            });
        }

        // user.name → user node
        String userName = extractNested(event, "user.name");
        if (userName != null && !userName.isBlank() && !userName.equals("SYSTEM") && !userName.equals("-")) {
            String key = "user:" + userName.toLowerCase();
            nodeMap.computeIfAbsent(key, k -> {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", buildNodeId("user", userName));
                node.put("type", "user");
                node.put("label", userName);
                node.put("role", "unknown");
                node.put("riskScore", 0);
                Map<String, Object> meta = new LinkedHashMap<>();
                String dept = extractNested(event, "user.group.name");
                if (dept != null) meta.put("department", dept);
                node.put("metadata", meta);
                return node;
            });
        }

        // source.ip → ip node
        String sourceIp = extractNested(event, "source.ip");
        if (sourceIp != null && !sourceIp.isBlank()) {
            addIpNode(sourceIp, event, nodeMap);
        }

        // destination.ip → ip node
        String destIp = extractNested(event, "destination.ip");
        if (destIp != null && !destIp.isBlank()) {
            addIpNode(destIp, event, nodeMap);
        }

        // process.name + process.pid → process node
        String processName = extractNested(event, "process.name");
        String processPid = extractNested(event, "process.pid");
        if (processName != null && processPid != null) {
            String key = "process:" + processName.toLowerCase() + "-" + processPid;
            nodeMap.computeIfAbsent(key, k -> {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", buildNodeId("proc", processName + "-" + processPid));
                node.put("type", "process");
                node.put("label", processName + " (" + processPid + ")");
                node.put("role", "unknown");
                node.put("riskScore", 0);
                Map<String, Object> meta = new LinkedHashMap<>();
                meta.put("pid", Integer.parseInt(processPid));
                String cmdLine = extractNested(event, "process.command_line");
                if (cmdLine != null) meta.put("commandLine", cmdLine);
                String user = extractNested(event, "user.name");
                if (user != null) meta.put("user", user);
                node.put("metadata", meta);
                return node;
            });
        }

        // file.hash.sha256 + file.name → file node
        String fileHash = extractNested(event, "file.hash.sha256");
        String fileName = extractNested(event, "file.name");
        if (fileHash != null && fileName != null) {
            String key = "file:" + fileHash.toLowerCase();
            nodeMap.computeIfAbsent(key, k -> {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", buildNodeId("file", fileName));
                node.put("type", "file");
                node.put("label", fileName);
                node.put("role", "unknown");
                node.put("riskScore", 0);
                Map<String, Object> meta = new LinkedHashMap<>();
                meta.put("hash", fileHash);
                String path = extractNested(event, "file.path");
                if (path != null) meta.put("path", path);
                String size = extractNested(event, "file.size");
                if (size != null) {
                    try { meta.put("size", Long.parseLong(size)); } catch (NumberFormatException ignored) {}
                }
                node.put("metadata", meta);
                return node;
            });
        }

        // dns.question.name → domain node
        String dnsName = extractNested(event, "dns.question.name");
        if (dnsName != null && !dnsName.isBlank()) {
            String key = "domain:" + dnsName.toLowerCase();
            nodeMap.computeIfAbsent(key, k -> {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", buildNodeId("domain", dnsName));
                node.put("type", "domain");
                node.put("label", dnsName);
                node.put("role", "unknown");
                node.put("riskScore", 0);
                Map<String, Object> meta = new LinkedHashMap<>();
                String resolvedIp = extractNested(event, "dns.resolved_ip");
                if (resolvedIp != null) {
                    meta.put("resolvedIps", List.of(resolvedIp));
                }
                node.put("metadata", meta);
                return node;
            });
        }
    }

    /**
     * Adds an IP node to the node map.
     */
    private void addIpNode(String ip, Map<String, Object> event, Map<String, Map<String, Object>> nodeMap) {
        String key = "ip:" + ip;
        nodeMap.computeIfAbsent(key, k -> {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", buildNodeId("ip", ip));
            node.put("type", "ip");
            node.put("label", ip);
            node.put("role", "unknown");
            node.put("riskScore", 0);
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("internal", isInternalIp(ip));
            String geo = extractNested(event, "source.geo.country_iso_code");
            if (geo != null) meta.put("geo", geo);
            String asn = extractNested(event, "source.as.organization.name");
            if (asn != null) meta.put("asn", asn);
            String reputation = extractNested(event, "threat.indicator.ip_reputation.classification");
            if (reputation != null) meta.put("reputation", reputation);
            node.put("metadata", meta);
            return node;
        });
    }

    /**
     * Extracts edges (relationships) from a single event.
     */
    @SuppressWarnings("unchecked")
    private void extractEdges(Map<String, Object> event,
                              Map<String, Map<String, Object>> nodeMap,
                              List<Map<String, Object>> edges,
                              Set<String> edgeKeys,
                              AtomicInteger edgeCounter) {

        String timestamp = event.get("@timestamp") != null ? event.get("@timestamp").toString() : null;
        String eventCategory = extractNested(event, "event.category");
        String eventAction = extractNested(event, "event.action");

        // Edge: process.parent.pid → process.pid = "spawned"
        String parentPid = extractNested(event, "process.parent.pid");
        String parentName = extractNested(event, "process.parent.name");
        String processPid = extractNested(event, "process.pid");
        String processName = extractNested(event, "process.name");

        if (parentPid != null && parentName != null && processPid != null && processName != null) {
            String parentKey = "process:" + parentName.toLowerCase() + "-" + parentPid;
            String childKey = "process:" + processName.toLowerCase() + "-" + processPid;

            if (nodeMap.containsKey(parentKey) && nodeMap.containsKey(childKey)) {
                String sourceId = (String) nodeMap.get(parentKey).get("id");
                String targetId = (String) nodeMap.get(childKey).get("id");
                addEdge(edges, edgeKeys, edgeCounter, sourceId, targetId, "spawned",
                    "strong", "Process creation event", timestamp);
            }
        }

        // Edge: source.ip → destination.ip = "communicated_with" (for network events)
        String sourceIp = extractNested(event, "source.ip");
        String destIp = extractNested(event, "destination.ip");
        if (sourceIp != null && destIp != null && isNetworkEvent(eventCategory)) {
            String sourceKey = "ip:" + sourceIp;
            String destKey = "ip:" + destIp;

            // If source is internal host, use host node as source instead
            String hostName = extractNested(event, "host.name");
            String sourceNodeId;
            if (hostName != null && isInternalIp(sourceIp)) {
                String hostKey = "host:" + hostName.toLowerCase();
                if (nodeMap.containsKey(hostKey)) {
                    sourceNodeId = (String) nodeMap.get(hostKey).get("id");
                } else if (nodeMap.containsKey(sourceKey)) {
                    sourceNodeId = (String) nodeMap.get(sourceKey).get("id");
                } else {
                    sourceNodeId = null;
                }
            } else if (nodeMap.containsKey(sourceKey)) {
                sourceNodeId = (String) nodeMap.get(sourceKey).get("id");
            } else {
                sourceNodeId = null;
            }

            if (sourceNodeId != null && nodeMap.containsKey(destKey)) {
                String targetId = (String) nodeMap.get(destKey).get("id");
                String destPort = extractNested(event, "destination.port");
                String protocol = extractNested(event, "network.protocol");
                String evidence = buildNetworkEvidence(protocol, destPort, destIp);
                addEdge(edges, edgeKeys, edgeCounter, sourceNodeId, targetId,
                    "communicated_with", "strong", evidence, timestamp);
            }
        }

        // Edge: user on host = "authenticated_as" (for authentication events)
        String userName = extractNested(event, "user.name");
        String hostName = extractNested(event, "host.name");
        if (userName != null && hostName != null && isAuthEvent(eventCategory, eventAction)) {
            String userKey = "user:" + userName.toLowerCase();
            String hostKey = "host:" + hostName.toLowerCase();

            if (nodeMap.containsKey(userKey) && nodeMap.containsKey(hostKey)) {
                String sourceId = (String) nodeMap.get(userKey).get("id");
                String targetId = (String) nodeMap.get(hostKey).get("id");
                addEdge(edges, edgeKeys, edgeCounter, sourceId, targetId,
                    "authenticated_as", "strong", "Interactive logon session", timestamp);
            }
        }

        // Edge: dns.question.name → dns.resolved_ip = "resolved_to"
        String dnsName = extractNested(event, "dns.question.name");
        String resolvedIp = extractNested(event, "dns.resolved_ip");
        if (dnsName != null && resolvedIp != null) {
            String domainKey = "domain:" + dnsName.toLowerCase();
            String ipKey = "ip:" + resolvedIp;

            if (nodeMap.containsKey(domainKey) && nodeMap.containsKey(ipKey)) {
                String sourceId = (String) nodeMap.get(domainKey).get("id");
                String targetId = (String) nodeMap.get(ipKey).get("id");
                addEdge(edges, edgeKeys, edgeCounter, sourceId, targetId,
                    "resolved_to", "strong", "DNS A record resolution", timestamp);
            }
        }

        // Edge: process + file = "accessed"/"executed"/"modified" (for file events)
        if (processName != null && processPid != null) {
            String fileHash = extractNested(event, "file.hash.sha256");
            String fileName = extractNested(event, "file.name");

            if (fileHash != null && fileName != null && isFileEvent(eventCategory)) {
                String procKey = "process:" + processName.toLowerCase() + "-" + processPid;
                String fileKey = "file:" + fileHash.toLowerCase();

                if (nodeMap.containsKey(procKey) && nodeMap.containsKey(fileKey)) {
                    String sourceId = (String) nodeMap.get(procKey).get("id");
                    String targetId = (String) nodeMap.get(fileKey).get("id");
                    String edgeType = resolveFileEdgeType(eventAction);
                    addEdge(edges, edgeKeys, edgeCounter, sourceId, targetId,
                        edgeType, "moderate", buildFileEvidence(eventAction, fileName), timestamp);
                }
            }
        }
    }

    /**
     * Tracks IP relationships for later role assignment.
     */
    private void trackIpRelationships(Map<String, Object> event,
                                      Set<String> lateralDestinationIps,
                                      Set<String> externalIpsWithReputation,
                                      Map<String, Integer> ipReputationScores) {
        String sourceIp = extractNested(event, "source.ip");
        String destIp = extractNested(event, "destination.ip");

        // Track lateral movement destinations (internal-to-internal)
        if (sourceIp != null && destIp != null && isInternalIp(sourceIp) && isInternalIp(destIp)) {
            lateralDestinationIps.add(destIp);
        }

        // Track external IPs with reputation scores
        String repScore = extractNested(event, "threat.indicator.ip_reputation.score");
        if (repScore != null) {
            try {
                int score = Integer.parseInt(repScore);
                if (sourceIp != null && !isInternalIp(sourceIp)) {
                    externalIpsWithReputation.add(sourceIp);
                    ipReputationScores.merge(sourceIp, score, Math::max);
                }
                if (destIp != null && !isInternalIp(destIp)) {
                    externalIpsWithReputation.add(destIp);
                    ipReputationScores.merge(destIp, score, Math::max);
                }
            } catch (NumberFormatException ignored) {}
        }
    }

    /**
     * Assigns roles to nodes based on their position in the graph.
     */
    @SuppressWarnings("unchecked")
    private void assignRoles(Map<String, Map<String, Object>> nodeMap,
                             String primaryEntityId,
                             Set<String> lateralDestinationIps,
                             Set<String> externalIpsWithReputation,
                             Map<String, Integer> ipReputationScores) {

        for (Map.Entry<String, Map<String, Object>> entry : nodeMap.entrySet()) {
            String key = entry.getKey();
            Map<String, Object> node = entry.getValue();
            String type = (String) node.get("type");
            String label = (String) node.get("label");

            // External IPs with high reputation score → "attacker" or "c2"
            if ("ip".equals(type) && !isInternalIp(label)) {
                Integer repScore = ipReputationScores.get(label);
                if (repScore != null && repScore > 70) {
                    // Distinguish c2 from attacker based on score
                    node.put("role", repScore > 85 ? "c2" : "attacker");
                    continue;
                }
            }

            // Alert's primary entity → "victim"
            if (primaryEntityId != null && matchesPrimaryEntity(node, primaryEntityId)) {
                node.put("role", "victim");
                continue;
            }

            // Internal IPs only appearing as lateral destination → "lateral"
            if ("ip".equals(type) && isInternalIp(label) && lateralDestinationIps.contains(label)) {
                node.put("role", "lateral");
                continue;
            }

            // Default → "unknown"
            node.put("role", "unknown");
        }
    }

    /**
     * Computes risk scores based on assigned roles.
     */
    @SuppressWarnings("unchecked")
    private void computeRiskScores(Map<String, Map<String, Object>> nodeMap,
                                   Map<String, Integer> ipReputationScores) {

        for (Map<String, Object> node : nodeMap.values()) {
            String role = (String) node.get("role");
            String type = (String) node.get("type");
            String label = (String) node.get("label");

            int riskScore;
            switch (role) {
                case "attacker":
                case "c2":
                    // 80-100, use reputation score if available
                    Integer repScore = ipReputationScores.get(label);
                    riskScore = repScore != null ? Math.min(100, Math.max(80, repScore)) : 85;
                    break;
                case "victim":
                    riskScore = 50; // 40-60 range
                    break;
                case "lateral":
                    riskScore = 60; // 50-70 range
                    break;
                default:
                    // Check if process has suspicious name
                    if ("process".equals(type) && isSuspiciousProcess(label)) {
                        riskScore = 70; // 60-80 range for suspicious unknown processes
                    } else {
                        riskScore = 20; // 10-30 for benign entities
                    }
                    break;
            }

            node.put("riskScore", riskScore);
        }
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private void addEdge(List<Map<String, Object>> edges,
                         Set<String> edgeKeys,
                         AtomicInteger edgeCounter,
                         String sourceId, String targetId,
                         String type, String strength,
                         String evidence, String timestamp) {
        String edgeKey = sourceId + "|" + targetId + "|" + type;
        if (edgeKeys.contains(edgeKey)) return;
        edgeKeys.add(edgeKey);

        Map<String, Object> edge = new LinkedHashMap<>();
        edge.put("id", "edge-" + String.format("%03d", edgeCounter.getAndIncrement()));
        edge.put("sourceId", sourceId);
        edge.put("targetId", targetId);
        edge.put("type", type);
        edge.put("direction", "directed");
        edge.put("strength", strength);
        edge.put("evidence", evidence);
        edge.put("timestamp", timestamp);
        edges.add(edge);
    }

    private String buildNodeId(String type, String identifier) {
        // Deterministic: "node-{type}-{sanitized-identifier}"
        String sanitized = identifier.toLowerCase()
            .replaceAll("[^a-z0-9]", "-")
            .replaceAll("-+", "-")
            .replaceAll("^-|-$", "");
        return "node-" + type + "-" + sanitized;
    }

    private boolean isInternalIp(String ip) {
        if (ip == null) return false;
        for (String prefix : INTERNAL_PREFIXES) {
            if (ip.startsWith(prefix)) return true;
        }
        return false;
    }

    private boolean isNetworkEvent(String category) {
        return category != null && (category.contains("network") || category.contains("connection"));
    }

    private boolean isAuthEvent(String category, String action) {
        if (category != null && category.contains("authentication")) return true;
        if (action != null && (action.contains("logon") || action.contains("login")
            || action.contains("auth"))) return true;
        return false;
    }

    private boolean isFileEvent(String category) {
        return category != null && category.contains("file");
    }

    private String resolveFileEdgeType(String action) {
        if (action == null) return "accessed";
        String lower = action.toLowerCase();
        if (lower.contains("exec") || lower.contains("load") || lower.contains("run")) return "executed";
        if (lower.contains("modif") || lower.contains("write") || lower.contains("rename")) return "modified";
        return "accessed";
    }

    private String buildNetworkEvidence(String protocol, String port, String destIp) {
        StringBuilder sb = new StringBuilder();
        if (protocol != null) {
            sb.append(protocol.toUpperCase());
        } else {
            sb.append("TCP");
        }
        sb.append(" connection");
        if (port != null) {
            sb.append(" on port ").append(port);
        }
        return sb.toString();
    }

    private String buildFileEvidence(String action, String fileName) {
        if (action != null && action.toLowerCase().contains("exec")) {
            return "Execution of " + fileName;
        }
        if (action != null && action.toLowerCase().contains("modif")) {
            return "Modified " + fileName;
        }
        return "Accessed " + fileName;
    }

    private boolean isSuspiciousProcess(String label) {
        if (label == null) return false;
        String lower = label.toLowerCase();
        for (String suspicious : SUSPICIOUS_PROCESS_NAMES) {
            if (lower.contains(suspicious)) return true;
        }
        return false;
    }

    private String extractPrimaryEntityId(Map<String, Object> alertDoc) {
        if (alertDoc == null) return null;
        // Try multiple fields that may hold the primary entity
        String primary = extractNested(alertDoc, "primaryEntityId");
        if (primary != null) return primary;
        primary = extractNested(alertDoc, "host.name");
        if (primary != null) return primary;
        primary = extractNested(alertDoc, "hostName");
        return primary;
    }

    private boolean matchesPrimaryEntity(Map<String, Object> node, String primaryEntityId) {
        String label = (String) node.get("label");
        if (label == null) return false;
        return label.equalsIgnoreCase(primaryEntityId)
            || label.toLowerCase().contains(primaryEntityId.toLowerCase());
    }

    /**
     * Extracts a dot-notation nested field value as a String from a map.
     */
    @SuppressWarnings("unchecked")
    private String extractNested(Map<String, Object> src, String path) {
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

        return current != null ? current.toString() : null;
    }
}
