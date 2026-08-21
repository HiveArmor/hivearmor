package com.hivearmor.service.hunt;

import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Builds a process lineage tree from flat process events retrieved from OpenSearch.
 *
 * <p>Workflow:
 * <ol>
 *   <li>Parse each event into a ProcessNode (keyed by pid as string)</li>
 *   <li>Link parent-child relationships via parentPid</li>
 *   <li>Identify root nodes (orphans with no parent in data set)</li>
 *   <li>Compute depth and truncate at MAX_DEPTH</li>
 *   <li>Assign verdicts based on signature and suspicious process list</li>
 * </ol>
 */
@Service
public class ProcessTreeBuilder {

    private static final int MAX_DEPTH = 8;

    private static final Set<String> SUSPICIOUS_PROCESSES = Set.of(
        "mimikatz.exe", "beacon.exe", ".hidden", "exploit", "nc",
        "mshta.exe", "wscript.exe", "certutil.exe", "rundll32.exe"
    );

    /**
     * Result container for the process tree build operation.
     */
    public static class ProcessTreeResult {
        private final List<Map<String, Object>> tree;
        private final List<String> alertProcessIds;
        private final int totalProcesses;

        public ProcessTreeResult(List<Map<String, Object>> tree, List<String> alertProcessIds, int totalProcesses) {
            this.tree = tree;
            this.alertProcessIds = alertProcessIds;
            this.totalProcesses = totalProcesses;
        }

        public List<Map<String, Object>> getTree() { return tree; }
        public List<String> getAlertProcessIds() { return alertProcessIds; }
        public int getTotalProcesses() { return totalProcesses; }
    }

    /**
     * Builds a process tree from flat process events.
     *
     * @param processEvents list of event source maps from OpenSearch
     * @param alertTriggerPid the PID that triggered the alert (marked as "malicious")
     * @return ProcessTreeResult containing the tree, alertProcessIds, and totalProcesses
     */
    @SuppressWarnings("unchecked")
    public ProcessTreeResult buildTree(List<Map<String, Object>> processEvents, String alertTriggerPid) {
        if (processEvents == null || processEvents.isEmpty()) {
            return new ProcessTreeResult(Collections.emptyList(), Collections.emptyList(), 0);
        }

        // Step 1: Build Map<pid, node> from events
        Map<String, Map<String, Object>> nodeMap = new LinkedHashMap<>();
        List<String> alertProcessIds = new ArrayList<>();

        for (Map<String, Object> event : processEvents) {
            String pid = extractNested(event, "process.pid");
            if (pid == null) continue;

            String pidStr = pid.toString();

            // If we already have this pid, skip (keep first occurrence — earliest timestamp)
            if (nodeMap.containsKey(pidStr)) continue;

            Map<String, Object> node = buildNode(event, pidStr, alertTriggerPid);
            nodeMap.put(pidStr, node);

            // Track alert process IDs
            if (pidStr.equals(alertTriggerPid)) {
                String nodeId = (String) node.get("id");
                alertProcessIds.add(nodeId);
            }
        }

        int totalProcesses = nodeMap.size();

        // Step 2: Link parent-child relationships
        List<Map<String, Object>> roots = new ArrayList<>();

        for (Map<String, Object> node : nodeMap.values()) {
            String parentId = (String) node.get("parentId");
            String nodePid = (String) node.get("pid");

            if (parentId == null || parentId.isBlank()) {
                roots.add(node);
                continue;
            }

            // Defensive: skip self-referencing parents (cycle prevention)
            if (parentId.equals(nodePid)) {
                roots.add(node);
                continue;
            }

            Map<String, Object> parentNode = nodeMap.get(parentId);
            if (parentNode != null) {
                List<Map<String, Object>> children = (List<Map<String, Object>>) parentNode.get("children");
                children.add(node);
                // Update node's parentId to use the parent's "id" field for response
                node.put("parentId", parentNode.get("id"));
            } else {
                // Orphan — no parent in data set
                roots.add(node);
                node.put("parentId", null);
            }
        }

        // Step 3: Compute depth and truncate at MAX_DEPTH
        for (Map<String, Object> root : roots) {
            computeDepth(root, 0);
        }

        return new ProcessTreeResult(roots, alertProcessIds, totalProcesses);
    }

    /**
     * Builds a single ProcessNode map from an event document.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildNode(Map<String, Object> event, String pidStr, String alertTriggerPid) {
        Map<String, Object> node = new LinkedHashMap<>();

        String name = extractNested(event, "process.name");
        String id = "proc-" + (name != null ? name.replace(".exe", "").replace(".", "-") : "unknown") + "-" + pidStr;

        node.put("id", id);
        node.put("pid", pidStr);
        node.put("name", name);
        node.put("commandLine", extractNested(event, "process.command_line"));
        node.put("user", extractNested(event, "user.name"));
        node.put("startTime", event.get("@timestamp"));
        node.put("endTime", null);

        // Build signature object
        Map<String, Object> signature = buildSignature(event);
        node.put("signature", signature);

        // Determine verdict
        String verdict = determineVerdict(name, signature, pidStr, alertTriggerPid);
        node.put("verdict", verdict);

        node.put("depth", 0);
        node.put("parentId", extractNested(event, "process.parent.pid"));
        node.put("children", new ArrayList<Map<String, Object>>());

        return node;
    }

    /**
     * Builds signature object from process.code_signature.* fields.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildSignature(Map<String, Object> event) {
        Map<String, Object> signature = new LinkedHashMap<>();

        String sigExists = extractNested(event, "process.code_signature.exists");
        String subjectName = extractNested(event, "process.code_signature.subject_name");
        String trusted = extractNested(event, "process.code_signature.trusted");

        boolean signed = "true".equalsIgnoreCase(sigExists);
        boolean verified = "true".equalsIgnoreCase(trusted);

        signature.put("signed", signed);
        signature.put("signer", subjectName);
        signature.put("verified", verified);

        return signature;
    }

    /**
     * Determines the verdict for a process node.
     *
     * Rules (in priority order):
     * 1. If process triggered the alert → "malicious"
     * 2. If process name in suspicious set AND signature.verified=false → "suspicious"
     * 3. If signed by Microsoft Windows or Red Hat → "benign"
     * 4. Default → "unknown"
     */
    @SuppressWarnings("unchecked")
    private String determineVerdict(String processName, Map<String, Object> signature, String pid, String alertTriggerPid) {
        // Rule 1: alert trigger process
        if (pid != null && pid.equals(alertTriggerPid)) {
            return "malicious";
        }

        boolean verified = Boolean.TRUE.equals(signature.get("verified"));
        String signer = (String) signature.get("signer");

        // Rule 2: suspicious + unsigned
        if (processName != null) {
            String lowerName = processName.toLowerCase();
            boolean isSuspicious = SUSPICIOUS_PROCESSES.stream()
                .anyMatch(s -> lowerName.contains(s.toLowerCase()));
            if (isSuspicious && !verified) {
                return "suspicious";
            }
        }

        // Rule 3: signed by Microsoft or Red Hat
        if (verified && signer != null) {
            String lowerSigner = signer.toLowerCase();
            if (lowerSigner.contains("microsoft") || lowerSigner.contains("red hat")) {
                return "benign";
            }
        }

        // Rule 4: default
        return "unknown";
    }

    /**
     * Recursively computes depth and truncates at MAX_DEPTH.
     */
    @SuppressWarnings("unchecked")
    private void computeDepth(Map<String, Object> node, int depth) {
        node.put("depth", depth);

        List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("children");

        if (depth >= MAX_DEPTH) {
            // Truncate: remove children and mark as truncated
            if (children != null && !children.isEmpty()) {
                children.clear();
                node.put("truncated", true);
            }
            return;
        }

        if (children != null) {
            for (Map<String, Object> child : children) {
                computeDepth(child, depth + 1);
            }
        }
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
