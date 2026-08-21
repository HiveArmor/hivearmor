package com.hivearmor.service.mssp.dto;

/**
 * Detailed view of a single MSSP-managed tenant, returned by
 * {@code GET /api/ha-mssp/tenants/{id}} and {@code PUT /api/ha-mssp/tenants/{id}}.
 *
 * <p>The {@code epsSparkline} array contains exactly 60 elements representing
 * events-per-second measurements over the most recent 60 one-minute buckets in
 * chronologically ascending order (oldest → newest). Buckets where OpenSearch is
 * unavailable are filled with {@code 0}.
 *
 * <p>The {@code alertsTrend7d} array contains exactly 7 elements representing alert
 * counts per UTC calendar day for the 7 days ending yesterday, in chronologically
 * ascending order (day-6 ago → yesterday). Days where OpenSearch is unavailable are
 * filled with {@code 0}.
 *
 * <p>Sprint 23 — S23-T04.
 */
public record TenantDetailDTO(
    Long id,
    String name,
    String clientPrefix,
    int maxUsers,
    String licenceType,
    String contactEmail,
    int userCount,
    long eps,
    long[] epsSparkline,   // MUST be exactly 60 elements
    long[] alertsTrend7d   // MUST be exactly 7 elements
) {}
