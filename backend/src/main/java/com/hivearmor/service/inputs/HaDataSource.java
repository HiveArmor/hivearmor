package com.hivearmor.service.inputs;

/**
 * Minimal representation of a configured data source.
 *
 * <p>Passed as the input parameter to both adapters:
 * <ul>
 *   <li>{@link HaDataSourceGrpcAdapter#health(HaDataSource)} — agent-manager gRPC health</li>
 *   <li>{@link HaDataSourceOpenSearchAdapter#statsFor(HaDataSource)} — OpenSearch ingest stats</li>
 * </ul>
 *
 * <p>In a future iteration this may be backed by a JPA entity; for now it is a
 * plain value type so the adapters can be compiled and tested without a database.
 *
 * @param id      Unique identifier for the data source.
 * @param name    Human-readable label (used in log context).
 * @param type    Data-type token that maps to an OpenSearch index type (e.g. "log", "event").
 * @param enabled Whether the source is administratively active.
 */
public record HaDataSource(
        String id,
        String name,
        String type,
        boolean enabled
) {}
