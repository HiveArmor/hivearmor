package com.hivearmor.service.hunt;

import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short-lived server-side binding for PIT pagination and context-dependent operations.
 */
@Component
public class HuntSearchSessionStore {

    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();

    public void put(Session session) {
        sessions.put(session.searchId(), session);
    }

    public Session require(String searchId, String owner, String tenantKey) {
        Session session = sessions.get(searchId);
        if (session == null) {
            throw new HuntQueryException("HUNT_SEARCH_NOT_FOUND", "Search session was not found or has expired", 0);
        }
        if (Instant.now().isAfter(session.expiresAt())) {
            sessions.remove(searchId, session);
            throw new HuntQueryException("HUNT_SEARCH_EXPIRED", "Search session has expired; rerun the hunt", 0);
        }
        if (!session.owner().equals(owner) || !session.tenantKey().equals(tenantKey)) {
            throw new HuntQueryException("HUNT_SEARCH_FORBIDDEN", "Search session does not belong to the current security scope", 0);
        }
        return session;
    }

    public Optional<Session> remove(String searchId) {
        return Optional.ofNullable(sessions.remove(searchId));
    }

    @Scheduled(fixedDelay = 300000)
    public void cleanup() {
        Instant now = Instant.now();
        sessions.entrySet().removeIf(entry -> now.isAfter(entry.getValue().expiresAt()));
    }

    public record Session(
        String searchId,
        String owner,
        String tenantKey,
        String requestFingerprint,
        String queryText,
        Query query,
        List<String> indices,
        List<String> projection,
        List<SortOptions> sort,
        String pitId,
        Instant snapshotAt,
        Instant expiresAt,
        String histogramInterval
    ) {
        public Session withPitId(String updatedPitId) {
            return new Session(searchId, owner, tenantKey, requestFingerprint, queryText, query,
                indices, projection, sort, updatedPitId, snapshotAt, expiresAt, histogramInterval);
        }
    }
}
