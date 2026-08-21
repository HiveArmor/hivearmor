package com.hivearmor.service;

import java.util.Map;

/**
 * Port interface that provides a raw key-value view of an alert document.
 *
 * <p>The returned map contains every field the underlying storage layer exposes for
 * the requested alert.  Consumers (notably {@link HaAlertContextService}) are
 * responsible for applying whitelist filtering before forwarding any data to
 * external systems such as an LLM.
 *
 * <p>Returns {@code null} when the alert identified by {@code alertId} is not found.
 */
public interface AlertQueryPort {

    /**
     * Fetches all available fields for the given alert.
     *
     * @param alertId the alert identifier; never {@code null}
     * @return a mutable {@code Map<String, Object>} containing the alert fields,
     *         or {@code null} if no alert with the given id exists
     */
    Map<String, Object> findById(String alertId);
}
