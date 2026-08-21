package com.hivearmor.service.hunt;

import com.hivearmor.domain.hunt.HuntPromotionApproval;
import com.hivearmor.repository.hunt.HuntPromotionApprovalRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.SecurityUtils;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Creates and decides SOC Manager approvals for gated hunt promotions (HNT-007).
 */
@Service
public class HuntPromotionApprovalService {

    private static final long APPROVAL_TTL_HOURS = 4L;

    private final HuntPromotionApprovalRepository repository;

    public HuntPromotionApprovalService(HuntPromotionApprovalRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public Map<String, Object> requestApproval(
        String action,
        List<String> eventIds,
        String searchId,
        String requester,
        String tenantKey,
        String rationale
    ) {
        if (action == null || action.isBlank()) {
            throw new IllegalArgumentException("action is required");
        }
        if (searchId == null || searchId.isBlank()) {
            throw new IllegalArgumentException("searchId is required");
        }
        if (eventIds == null || eventIds.isEmpty()) {
            throw new IllegalArgumentException("eventIds must not be empty");
        }
        if (rationale == null || rationale.isBlank()) {
            throw new IllegalArgumentException("request rationale is required");
        }

        HuntPromotionApproval row = new HuntPromotionApproval();
        row.setId(UUID.randomUUID().toString());
        row.setSearchId(searchId);
        row.setAction(action);
        row.setEventIdsHash(hashEventIds(eventIds));
        row.setRequester(requester);
        row.setTenantKey(tenantKey == null || tenantKey.isBlank() ? "authorized" : tenantKey);
        row.setStatus(HuntPromotionApproval.STATUS_PENDING);
        row.setRequestRationale(rationale.trim());
        row.setExpiresAt(Instant.now().plus(APPROVAL_TTL_HOURS, ChronoUnit.HOURS));
        row.setCreatedAt(Instant.now());
        repository.save(row);
        return toMap(row);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String tenantKey, String state) {
        String key = tenantKey == null || tenantKey.isBlank() ? "authorized" : tenantKey;
        List<HuntPromotionApproval> rows;
        if (state == null || state.isBlank() || "all".equalsIgnoreCase(state)) {
            rows = repository.findByTenantKeyOrderByCreatedAtDesc(key);
        } else {
            rows = repository.findByTenantKeyAndStatusOrderByCreatedAtDesc(key, state.toUpperCase());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (HuntPromotionApproval row : rows) {
            out.add(toMap(expireIfNeeded(row)));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(String approvalId, String tenantKey) {
        HuntPromotionApproval row = requireOwned(approvalId, tenantKey);
        return toMap(expireIfNeeded(row));
    }

    @Transactional
    public Map<String, Object> decide(String approvalId, String decision, String rationale, String actor, String tenantKey) {
        if (!hasManagerAuthority()) {
            throw new AccessDeniedException("Required permission: SOC Manager");
        }
        if (decision == null || rationale == null || rationale.isBlank()) {
            throw new IllegalArgumentException("decision and rationale are required");
        }
        String normalized = decision.trim().toUpperCase();
        if (!"APPROVE".equals(normalized) && !"REJECT".equals(normalized)) {
            throw new IllegalArgumentException("decision must be APPROVE or REJECT");
        }

        HuntPromotionApproval row = requireOwned(approvalId, tenantKey);
        row = expireIfNeeded(row);
        if (!HuntPromotionApproval.STATUS_PENDING.equals(row.getStatus())) {
            throw new IllegalArgumentException("APPROVAL_NOT_PENDING: status is " + row.getStatus());
        }
        if (actor != null && actor.equalsIgnoreCase(row.getRequester())) {
            throw new IllegalArgumentException("SEPARATION_OF_DUTIES: requester cannot decide their own approval");
        }

        row.setDecidedBy(actor);
        row.setDecidedAt(Instant.now());
        row.setDecisionRationale(rationale.trim());
        row.setStatus("APPROVE".equals(normalized)
            ? HuntPromotionApproval.STATUS_APPROVED
            : HuntPromotionApproval.STATUS_REJECTED);
        repository.save(row);
        return toMap(row);
    }

    /**
     * Validates an APPROVED approval for execute and marks it CONSUMED.
     */
    @Transactional
    public void consumeApproved(
        String approvalId,
        String action,
        List<String> eventIds,
        String searchId,
        String requester,
        String tenantKey
    ) {
        if (approvalId == null || approvalId.isBlank()) {
            throw new IllegalArgumentException(
                "APPROVAL_REQUIRED: this action requires parameters.approvalId from a SOC Manager approval");
        }
        HuntPromotionApproval row = repository.findById(approvalId.trim())
            .orElseThrow(() -> new IllegalArgumentException("APPROVAL_NOT_FOUND: unknown approvalId"));

        String key = tenantKey == null || tenantKey.isBlank() ? "authorized" : tenantKey;
        if (!key.equals(row.getTenantKey())) {
            throw new IllegalArgumentException("APPROVAL_TENANT_MISMATCH");
        }

        row = expireIfNeeded(row);
        if (HuntPromotionApproval.STATUS_CONSUMED.equals(row.getStatus())) {
            throw new IllegalArgumentException("APPROVAL_ALREADY_CONSUMED");
        }
        if (!HuntPromotionApproval.STATUS_APPROVED.equals(row.getStatus())) {
            throw new IllegalArgumentException("APPROVAL_NOT_APPROVED: status is " + row.getStatus());
        }
        if (!action.equals(row.getAction())) {
            throw new IllegalArgumentException("APPROVAL_ACTION_MISMATCH");
        }
        if (!searchId.equals(row.getSearchId())) {
            throw new IllegalArgumentException("APPROVAL_SEARCH_MISMATCH");
        }
        String hash = hashEventIds(eventIds);
        if (!hash.equals(row.getEventIdsHash())) {
            throw new IllegalArgumentException("APPROVAL_EVENT_MISMATCH");
        }
        if (requester != null && !requester.isBlank() && !requester.equals(row.getRequester())) {
            throw new IllegalArgumentException("APPROVAL_REQUESTER_MISMATCH");
        }

        row.setStatus(HuntPromotionApproval.STATUS_CONSUMED);
        row.setConsumedAt(Instant.now());
        repository.save(row);
    }

    private HuntPromotionApproval requireOwned(String approvalId, String tenantKey) {
        HuntPromotionApproval row = repository.findById(approvalId)
            .orElseThrow(() -> new IllegalArgumentException("APPROVAL_NOT_FOUND: unknown approvalId"));
        String key = tenantKey == null || tenantKey.isBlank() ? "authorized" : tenantKey;
        if (!key.equals(row.getTenantKey())) {
            throw new IllegalArgumentException("APPROVAL_TENANT_MISMATCH");
        }
        return row;
    }

    private HuntPromotionApproval expireIfNeeded(HuntPromotionApproval row) {
        if (HuntPromotionApproval.STATUS_PENDING.equals(row.getStatus())
            && row.getExpiresAt() != null
            && Instant.now().isAfter(row.getExpiresAt())) {
            row.setStatus(HuntPromotionApproval.STATUS_EXPIRED);
            repository.save(row);
        }
        return row;
    }

    private static boolean hasManagerAuthority() {
        return SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
            || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.SOC_MANAGER);
    }

    static String hashEventIds(List<String> eventIds) {
        try {
            List<String> sorted = new ArrayList<>(eventIds);
            Collections.sort(sorted);
            String joined = String.join(",", sorted);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(joined.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private static Map<String, Object> toMap(HuntPromotionApproval row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("approvalId", row.getId());
        map.put("searchId", row.getSearchId());
        map.put("action", row.getAction());
        map.put("status", row.getStatus());
        map.put("requester", row.getRequester());
        map.put("tenantKey", row.getTenantKey());
        map.put("requestRationale", row.getRequestRationale());
        map.put("decisionRationale", row.getDecisionRationale());
        map.put("decidedBy", row.getDecidedBy());
        map.put("decidedAt", row.getDecidedAt() == null ? null : row.getDecidedAt().toString());
        map.put("consumedAt", row.getConsumedAt() == null ? null : row.getConsumedAt().toString());
        map.put("expiresAt", row.getExpiresAt() == null ? null : row.getExpiresAt().toString());
        map.put("createdAt", row.getCreatedAt() == null ? null : row.getCreatedAt().toString());
        return map;
    }
}
