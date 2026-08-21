package com.hivearmor.web.rest.asset.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Safe DTOs for the canonical Asset Intelligence boundary. */
public final class AssetInventoryDTO {

    private AssetInventoryDTO() {}

    public record Item(
        Long id,
        String clientName,
        String clientDomain,
        String clientPrefix,
        String connectionStatus,
        Instant firstSeen,
        Instant lastSeen,
        String platform,
        String osVersion,
        String ipAddress,
        String macAddress,
        String canonicalEntityId,
        String category,
        String deviceRole,
        String criticality,
        String riskLevel,
        Integer riskScore,
        String exposureLevel,
        Integer exposureScore,
        String sensorHealth,
        String onboardingStatus,
        long activeAlertCount,
        long vulnerabilityCount,
        long criticalVulnerabilityCount,
        long attackPathCount,
        String owner,
        String ownerTeam,
        List<String> discoverySources,
        List<String> tags,
        String cloudProvider,
        String cloudAccount,
        String snapshotVersion,
        Map<String, Boolean> capabilities
    ) {}

    public record Summary(
        long total,
        Long criticalAssets,
        long highRisk,
        Long highExposure,
        long notOnboarded,
        long sensorAttention,
        long newlyDiscovered,
        Map<String, String> metricStates
    ) {}

    public record Page(
        List<Item> items,
        List<Item> content,
        String nextCursor,
        boolean hasMore,
        Instant snapshotAt,
        long totalApproximate,
        boolean totalIsExact,
        long totalElements,
        int totalPages,
        int number,
        Summary summary,
        boolean stale,
        List<Map<String, String>> partialFailures,
        String contractState
    ) {}

    public record Coverage(
        String id,
        String name,
        String state,
        Instant lastObserved,
        Long expectedCadenceSeconds,
        String degradationReason,
        String confidenceImpact
    ) {}

    public record Detail(
        Item asset,
        List<String> aliases,
        List<Map<String, Object>> riskDrivers,
        List<Map<String, Object>> recommendations,
        List<Coverage> coverage,
        Map<String, String> redactionStates,
        Map<String, String> provenance
    ) {}
}
