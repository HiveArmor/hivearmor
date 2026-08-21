package com.hivearmor.service.graph;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * In-memory snapshot storage for graph exploration state (CON-001, CON-002).
 *
 * <p>Stores constellation snapshots in a ConcurrentHashMap with:
 * <ul>
 *   <li>30-minute TTL from creation or last access</li>
 *   <li>Max 10 snapshots per tenant (evicts oldest on overflow)</li>
 *   <li>Scheduled cleanup every 5 minutes removes expired entries</li>
 * </ul>
 *
 * <p>Snapshots are lost on server restart — acceptable for an exploration tool.
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@Service
public class GraphSnapshotStore {

    private static final Logger log = LoggerFactory.getLogger(GraphSnapshotStore.class);
    private static final String CLASSNAME = "GraphSnapshotStore";

    /** TTL: 30 minutes from creation or last access. */
    private static final long TTL_MINUTES = 30;

    /** Maximum snapshots per tenant. */
    private static final int MAX_PER_TENANT = 10;

    /** Snapshot storage keyed by snapshot ID. */
    private final ConcurrentHashMap<String, SnapshotEntry> snapshots = new ConcurrentHashMap<>();

    // =========================================================================
    // SnapshotEntry — internal record
    // =========================================================================

    /**
     * Internal entry wrapping graph state and metadata.
     */
    public static class SnapshotEntry {
        private final String snapshotId;
        private final String tenantId;
        private Map<String, Object> graph;       // { nodes, edges, clusters }
        private Map<String, Object> metadata;    // { snapshotId, createdAt, expiresAt, seed, ... }
        private final Instant createdAt;
        private volatile Instant lastAccessed;
        private volatile Instant expiresAt;

        public SnapshotEntry(String snapshotId, String tenantId,
                             Map<String, Object> graph, Map<String, Object> metadata) {
            this.snapshotId = snapshotId;
            this.tenantId = tenantId;
            this.graph = graph;
            this.metadata = metadata;
            this.createdAt = Instant.now();
            this.lastAccessed = this.createdAt;
            this.expiresAt = this.createdAt.plus(TTL_MINUTES, ChronoUnit.MINUTES);
        }

        public String getSnapshotId() { return snapshotId; }
        public String getTenantId() { return tenantId; }
        public Map<String, Object> getGraph() { return graph; }
        public Map<String, Object> getMetadata() { return metadata; }
        public Instant getCreatedAt() { return createdAt; }
        public Instant getLastAccessed() { return lastAccessed; }
        public Instant getExpiresAt() { return expiresAt; }

        public void setGraph(Map<String, Object> graph) { this.graph = graph; }
        public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }

        /** Refreshes the TTL — called on access. */
        public void touch() {
            this.lastAccessed = Instant.now();
            this.expiresAt = this.lastAccessed.plus(TTL_MINUTES, ChronoUnit.MINUTES);
        }

        public boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }

    // =========================================================================
    // Snapshot CRUD
    // =========================================================================

    /**
     * Creates a new snapshot and stores it.
     *
     * @param tenantId the tenant prefix (or null for single-tenant)
     * @param graph    the graph state (nodes, edges, clusters)
     * @param metadata the snapshot metadata
     * @return the generated snapshot ID
     */
    public String createSnapshot(String tenantId, Map<String, Object> graph,
                                 Map<String, Object> metadata) {
        String snapshotId = UUID.randomUUID().toString();
        String effectiveTenant = tenantId != null ? tenantId : "__default__";

        // Enforce max per tenant — evict oldest if over limit
        enforceMaxPerTenant(effectiveTenant);

        SnapshotEntry entry = new SnapshotEntry(snapshotId, effectiveTenant, graph, metadata);
        snapshots.put(snapshotId, entry);

        log.debug("{}.createSnapshot: id={}, tenant={}", CLASSNAME, snapshotId, effectiveTenant);
        return snapshotId;
    }

    /**
     * Retrieves a snapshot by ID. Returns null if not found or expired.
     * Touching the entry resets its TTL.
     *
     * @param snapshotId the snapshot UUID
     * @return the entry, or null
     */
    public SnapshotEntry getSnapshot(String snapshotId) {
        SnapshotEntry entry = snapshots.get(snapshotId);
        if (entry == null) return null;
        if (entry.isExpired()) {
            snapshots.remove(snapshotId);
            return null;
        }
        entry.touch();
        return entry;
    }

    /**
     * Retrieves a snapshot without touching (no TTL reset).
     *
     * @param snapshotId the snapshot UUID
     * @return the entry, or null
     */
    public SnapshotEntry peekSnapshot(String snapshotId) {
        SnapshotEntry entry = snapshots.get(snapshotId);
        if (entry == null) return null;
        if (entry.isExpired()) {
            snapshots.remove(snapshotId);
            return null;
        }
        return entry;
    }

    /**
     * Updates an existing snapshot's graph and metadata.
     *
     * @param snapshotId the snapshot UUID
     * @param graph      new graph state
     * @param metadata   new metadata
     * @return true if updated, false if not found/expired
     */
    public boolean updateSnapshot(String snapshotId, Map<String, Object> graph,
                                  Map<String, Object> metadata) {
        SnapshotEntry entry = snapshots.get(snapshotId);
        if (entry == null || entry.isExpired()) {
            if (entry != null) snapshots.remove(snapshotId);
            return false;
        }
        entry.setGraph(graph);
        entry.setMetadata(metadata);
        entry.touch();
        return true;
    }

    /**
     * Resets the TTL on a snapshot (e.g., when SSE connection is active).
     *
     * @param snapshotId the snapshot UUID
     */
    public void resetTtl(String snapshotId) {
        SnapshotEntry entry = snapshots.get(snapshotId);
        if (entry != null && !entry.isExpired()) {
            entry.touch();
        }
    }

    /**
     * Removes a snapshot.
     *
     * @param snapshotId the snapshot UUID
     */
    public void removeSnapshot(String snapshotId) {
        snapshots.remove(snapshotId);
    }

    /**
     * Returns all non-expired snapshot IDs for a given tenant.
     */
    public List<String> getSnapshotIdsForTenant(String tenantId) {
        String effectiveTenant = tenantId != null ? tenantId : "__default__";
        return snapshots.values().stream()
            .filter(e -> effectiveTenant.equals(e.getTenantId()) && !e.isExpired())
            .map(SnapshotEntry::getSnapshotId)
            .collect(Collectors.toList());
    }

    // =========================================================================
    // Scheduled cleanup
    // =========================================================================

    /**
     * Runs every 5 minutes to remove expired snapshots.
     */
    @Scheduled(fixedRate = 300000) // 5 minutes
    public void cleanupExpired() {
        int removed = 0;
        Iterator<Map.Entry<String, SnapshotEntry>> it = snapshots.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, SnapshotEntry> entry = it.next();
            if (entry.getValue().isExpired()) {
                it.remove();
                removed++;
            }
        }
        if (removed > 0) {
            log.debug("{}.cleanupExpired: removed {} expired snapshots, {} remaining",
                CLASSNAME, removed, snapshots.size());
        }
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private void enforceMaxPerTenant(String tenantId) {
        List<SnapshotEntry> tenantSnapshots = snapshots.values().stream()
            .filter(e -> tenantId.equals(e.getTenantId()) && !e.isExpired())
            .sorted(Comparator.comparing(SnapshotEntry::getCreatedAt))
            .collect(Collectors.toList());

        // Remove oldest entries if at capacity
        while (tenantSnapshots.size() >= MAX_PER_TENANT) {
            SnapshotEntry oldest = tenantSnapshots.remove(0);
            snapshots.remove(oldest.getSnapshotId());
            log.debug("{}.enforceMaxPerTenant: evicted oldest snapshot {} for tenant {}",
                CLASSNAME, oldest.getSnapshotId(), tenantId);
        }
    }
}
