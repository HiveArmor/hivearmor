package com.hivearmor.service;

import java.util.Map;

/**
 * Port interface that provides a raw key-value view of an incident record.
 *
 * <p>The returned map contains every field the underlying storage layer exposes for
 * the requested incident.  Consumers (notably {@link HaIncidentContextService}) are
 * responsible for applying whitelist filtering before forwarding any data to
 * external systems such as an LLM.
 *
 * <p>Returns {@code null} when the incident identified by {@code incidentId} is not
 * found.
 */
public interface IncidentQueryPort {

    /**
     * Fetches all available fields for the given incident.
     *
     * @param incidentId the incident identifier (numeric string form of the Long PK);
     *                   never {@code null}
     * @return a mutable {@code Map<String, Object>} containing the incident fields,
     *         or {@code null} if no incident with the given id exists
     */
    Map<String, Object> findById(String incidentId);
}
