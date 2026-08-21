package com.hivearmor.service.graph;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Connectivity-based cluster detection for graph nodes (CON-001).
 *
 * <p>Groups nodes where more than 3 mutual connections exist into clusters.
 * Uses simple adjacency counting — not ML-based. Each cluster is assigned
 * a unique ID and a label derived from the dominant entity type.
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@Service
public class GraphClusterDetector {

    private static final Logger log = LoggerFactory.getLogger(GraphClusterDetector.class);
    private static final int MIN_MUTUAL_CONNECTIONS = 3;

    /** Predefined cluster colors for up to 10 clusters. */
    private static final String[] CLUSTER_COLORS = {
        "#FF6677", "#8B90FF", "#63C79A", "#F2AD5B", "#BE7DE8",
        "#E3C64C", "#61C4BE", "#FF9F7F", "#7FDBDA", "#C490D1"
    };

    /**
     * Detects clusters in the graph based on edge connectivity.
     *
     * @param nodeIds set of all node IDs in the graph
     * @param edges   list of edges as maps with "source" and "target" keys
     * @return list of cluster maps with id, label, nodeCount, color, and nodeIds
     */
    public List<Map<String, Object>> detectClusters(Set<String> nodeIds,
                                                    List<Map<String, Object>> edges) {
        if (nodeIds == null || nodeIds.isEmpty() || edges == null || edges.isEmpty()) {
            return List.of();
        }

        // Build adjacency map: nodeId -> set of connected nodeIds
        Map<String, Set<String>> adjacency = new HashMap<>();
        for (String nodeId : nodeIds) {
            adjacency.put(nodeId, new HashSet<>());
        }

        for (Map<String, Object> edge : edges) {
            String source = (String) edge.get("source");
            String target = (String) edge.get("target");
            if (source != null && target != null) {
                adjacency.computeIfAbsent(source, k -> new HashSet<>()).add(target);
                adjacency.computeIfAbsent(target, k -> new HashSet<>()).add(source);
            }
        }

        // Find clusters: groups of nodes where each node has >3 connections to other nodes in the group
        List<Set<String>> clusters = new ArrayList<>();
        Set<String> assigned = new HashSet<>();

        // Sort nodes by connection count (descending) to start from hubs
        List<String> sortedNodes = new ArrayList<>(nodeIds);
        sortedNodes.sort((a, b) -> Integer.compare(
            adjacency.getOrDefault(b, Set.of()).size(),
            adjacency.getOrDefault(a, Set.of()).size()
        ));

        for (String node : sortedNodes) {
            if (assigned.contains(node)) continue;

            Set<String> neighbors = adjacency.getOrDefault(node, Set.of());
            if (neighbors.size() < MIN_MUTUAL_CONNECTIONS) continue;

            // Try to form a cluster starting from this node
            Set<String> candidateCluster = new HashSet<>();
            candidateCluster.add(node);

            // Add neighbors that have strong mutual connections within the group
            for (String neighbor : neighbors) {
                if (assigned.contains(neighbor)) continue;

                // Count how many nodes already in the candidate cluster this neighbor connects to
                Set<String> neighborConns = adjacency.getOrDefault(neighbor, Set.of());
                long mutualCount = candidateCluster.stream()
                    .filter(neighborConns::contains)
                    .count();

                if (mutualCount >= 1) {
                    candidateCluster.add(neighbor);
                }
            }

            // Validate cluster: each member must have >= MIN_MUTUAL_CONNECTIONS to other members
            Set<String> validCluster = new HashSet<>();
            for (String member : candidateCluster) {
                Set<String> memberConns = adjacency.getOrDefault(member, Set.of());
                long intraClusterConns = candidateCluster.stream()
                    .filter(other -> !other.equals(member))
                    .filter(memberConns::contains)
                    .count();
                if (intraClusterConns >= MIN_MUTUAL_CONNECTIONS) {
                    validCluster.add(member);
                }
            }

            // Also add nodes that still have enough connections to the valid cluster
            if (validCluster.size() >= 3) {
                // Second pass: add border nodes that connect to enough cluster members
                for (String candidate : candidateCluster) {
                    if (validCluster.contains(candidate)) continue;
                    Set<String> candConns = adjacency.getOrDefault(candidate, Set.of());
                    long connsToCluster = validCluster.stream()
                        .filter(candConns::contains)
                        .count();
                    if (connsToCluster >= MIN_MUTUAL_CONNECTIONS) {
                        validCluster.add(candidate);
                    }
                }

                clusters.add(validCluster);
                assigned.addAll(validCluster);
            }
        }

        // Build result
        List<Map<String, Object>> result = new ArrayList<>();
        for (int i = 0; i < clusters.size(); i++) {
            Set<String> cluster = clusters.get(i);
            String clusterId = "cluster-" + (i + 1);
            String color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];

            Map<String, Object> clusterMap = new LinkedHashMap<>();
            clusterMap.put("id", clusterId);
            clusterMap.put("label", generateClusterLabel(clusterId, cluster));
            clusterMap.put("nodeCount", cluster.size());
            clusterMap.put("color", color);
            clusterMap.put("nodeIds", new ArrayList<>(cluster));
            result.add(clusterMap);
        }

        log.debug("Detected {} clusters from {} nodes and {} edges",
            result.size(), nodeIds.size(), edges.size());

        return result;
    }

    /**
     * Assigns cluster group labels to nodes based on detected clusters.
     *
     * @param nodeId   the node ID to look up
     * @param clusters the detected clusters list
     * @return the cluster ID the node belongs to, or null if not in any cluster
     */
    public String getNodeCluster(String nodeId, List<Map<String, Object>> clusters) {
        if (clusters == null) return null;
        for (Map<String, Object> cluster : clusters) {
            @SuppressWarnings("unchecked")
            List<String> clusterNodeIds = (List<String>) cluster.get("nodeIds");
            if (clusterNodeIds != null && clusterNodeIds.contains(nodeId)) {
                return (String) cluster.get("id");
            }
        }
        return null;
    }

    private String generateClusterLabel(String clusterId, Set<String> nodeIds) {
        // Generate a label based on the cluster's node composition
        Map<String, Integer> typeCounts = new HashMap<>();
        for (String nodeId : nodeIds) {
            // Entity IDs follow pattern: ent-<type>-...
            String type = extractTypeFromEntityId(nodeId);
            typeCounts.merge(type, 1, Integer::sum);
        }

        // Find dominant type
        String dominantType = typeCounts.entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .map(Map.Entry::getKey)
            .orElse("mixed");

        int clusterNumber = Integer.parseInt(clusterId.replace("cluster-", ""));
        return switch (dominantType) {
            case "host" -> "Host Group " + clusterNumber;
            case "ip" -> "Network Cluster " + clusterNumber;
            case "user" -> "User Group " + clusterNumber;
            case "process" -> "Process Chain " + clusterNumber;
            case "domain" -> "Domain Infrastructure " + clusterNumber;
            default -> "Attack Group " + clusterNumber;
        };
    }

    private String extractTypeFromEntityId(String entityId) {
        if (entityId == null) return "unknown";
        // Format: ent-<type>-... e.g. ent-host-fin-wks-044
        if (entityId.startsWith("ent-")) {
            String rest = entityId.substring(4); // Remove "ent-"
            int dashIdx = rest.indexOf('-');
            if (dashIdx > 0) {
                return rest.substring(0, dashIdx);
            }
            return rest;
        }
        return "unknown";
    }
}
