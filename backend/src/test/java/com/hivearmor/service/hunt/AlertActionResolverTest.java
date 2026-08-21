package com.hivearmor.service.hunt;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link AlertActionResolver}.
 *
 * <p><strong>Validates: Requirements 8.1, 8.2, 8.3</strong>
 *
 * <p>Covers:
 * <ul>
 *   <li>User without SOC_ANALYST role gets allowed=false for all actions</li>
 *   <li>Alert in locked state gets allowed=false for status change</li>
 *   <li>Fully authorised user gets allowed=true for all actions</li>
 *   <li>Tenant mismatch returns TENANT_MISMATCH reason</li>
 *   <li>Expired retention returns RETENTION_EXPIRED reason</li>
 *   <li>requiresReason and requiresPreview are set correctly</li>
 * </ul>
 */
@DisplayName("AlertActionResolver — permission-aware available actions")
class AlertActionResolverTest {

    private AlertActionResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new AlertActionResolver();
    }

    // =========================================================================
    // Task 9 sub-task 7: user without SOC_ANALYST role gets allowed=false
    // =========================================================================

    @Test
    @DisplayName("User without SOC_ANALYST role gets allowed=false for all actions")
    void userWithoutSocAnalystRole_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_USER", "ROLE_VIEWER");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("ROLE_REQUIRED");
            assertThat(action.get("reason")).isNotNull();
        }
    }

    @Test
    @DisplayName("User with no roles at all gets allowed=false for all actions")
    void userWithNoRoles_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = Collections.emptyList();

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("ROLE_REQUIRED");
        }
    }

    @Test
    @DisplayName("User with null roles gets allowed=false for all actions")
    void userWithNullRoles_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", null, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("ROLE_REQUIRED");
        }
    }

    // =========================================================================
    // Task 9 sub-task 8: alert in locked state gets allowed=false for status change
    // =========================================================================

    @Test
    @DisplayName("Alert with locked=true gets allowed=false for all actions with ALERT_LOCKED")
    void alertLocked_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();
        alert.put("locked", true);
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("ALERT_LOCKED");
        }
    }

    @Test
    @DisplayName("Alert with status=5 (closed) gets allowed=false for all actions with ALERT_LOCKED")
    void alertClosedStatus_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();
        alert.put("status", 5); // closed
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("ALERT_LOCKED");
        }
    }

    @Test
    @DisplayName("Alert with locked='true' (string) gets allowed=false")
    void alertLockedStringTrue_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();
        alert.put("locked", "true");
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("ALERT_LOCKED");
        }
    }

    // =========================================================================
    // Tenant mismatch
    // =========================================================================

    @Test
    @DisplayName("Alert belonging to different tenant gets TENANT_MISMATCH")
    void tenantMismatch_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();
        alert.put("tenantId", "other-tenant");
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("TENANT_MISMATCH");
        }
    }

    // =========================================================================
    // Retention expired
    // =========================================================================

    @Test
    @DisplayName("Alert with expired retention gets RETENTION_EXPIRED")
    void retentionExpired_allActionsDenied() {
        Map<String, Object> alert = buildBasicAlert();
        alert.put("retentionExpiresAt", Instant.now().minusSeconds(3600).toString());
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(false);
            assertThat(action.get("reasonCode")).isEqualTo("RETENTION_EXPIRED");
        }
    }

    @Test
    @DisplayName("Alert with future retention is not expired")
    void retentionNotExpired_actionsAllowed() {
        Map<String, Object> alert = buildBasicAlert();
        alert.put("retentionExpiresAt", Instant.now().plusSeconds(86400).toString());
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "testuser", roles, "cwm");

        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(true);
        }
    }

    // =========================================================================
    // Fully authorised user — happy path
    // =========================================================================

    @Test
    @DisplayName("SOC_ANALYST with matching tenant and unlocked alert — all actions allowed")
    void fullyAuthorised_allActionsAllowed() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "analyst1", roles, "cwm");

        assertThat(actions).hasSize(4);
        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(true);
            assertThat(action.get("reason")).isNull();
            assertThat(action.get("reasonCode")).isNull();
        }
    }

    @Test
    @DisplayName("SOC_MANAGER role also grants access")
    void socManager_allActionsAllowed() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_SOC_MANAGER");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "manager1", roles, "cwm");

        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(true);
        }
    }

    @Test
    @DisplayName("ADMIN role also grants access")
    void adminRole_allActionsAllowed() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_ADMIN");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "admin1", roles, "cwm");

        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(true);
        }
    }

    // =========================================================================
    // requiresReason and requiresPreview
    // =========================================================================

    @Test
    @DisplayName("change_status action has requiresReason=true")
    void changeStatus_requiresReason() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "analyst1", roles, "cwm");

        Map<String, Object> changeStatus = actions.stream()
            .filter(a -> "change_status".equals(a.get("id")))
            .findFirst().orElseThrow();
        assertThat(changeStatus.get("requiresReason")).isEqualTo(true);
        assertThat(changeStatus.get("requiresPreview")).isEqualTo(false);
    }

    @Test
    @DisplayName("link_incident action has requiresPreview=true")
    void linkIncident_requiresPreview() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "analyst1", roles, "cwm");

        Map<String, Object> linkIncident = actions.stream()
            .filter(a -> "link_incident".equals(a.get("id")))
            .findFirst().orElseThrow();
        assertThat(linkIncident.get("requiresPreview")).isEqualTo(true);
        assertThat(linkIncident.get("requiresReason")).isEqualTo(false);
    }

    @Test
    @DisplayName("add_note and apply_tags have requiresReason=false, requiresPreview=false")
    void addNoteApplyTags_noSpecialRequirements() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "analyst1", roles, "cwm");

        Map<String, Object> addNote = actions.stream()
            .filter(a -> "add_note".equals(a.get("id")))
            .findFirst().orElseThrow();
        assertThat(addNote.get("requiresReason")).isEqualTo(false);
        assertThat(addNote.get("requiresPreview")).isEqualTo(false);

        Map<String, Object> applyTags = actions.stream()
            .filter(a -> "apply_tags".equals(a.get("id")))
            .findFirst().orElseThrow();
        assertThat(applyTags.get("requiresReason")).isEqualTo(false);
        assertThat(applyTags.get("requiresPreview")).isEqualTo(false);
    }

    // =========================================================================
    // Single-tenant mode (no tenantId on alert)
    // =========================================================================

    @Test
    @DisplayName("Alert without tenantId field is accessible in any tenant context")
    void noTenantOnAlert_accessibleInAnyContext() {
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("name", "Test Alert");
        alert.put("status", 1);
        // No tenantId field
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "analyst1", roles, "some-tenant");

        for (Map<String, Object> action : actions) {
            assertThat(action.get("allowed")).isEqualTo(true);
        }
    }

    // =========================================================================
    // Action IDs
    // =========================================================================

    @Test
    @DisplayName("Available actions contain all four expected action IDs")
    void actionsContainAllExpectedIds() {
        Map<String, Object> alert = buildBasicAlert();
        Collection<String> roles = List.of("ROLE_SOC_ANALYST");

        List<Map<String, Object>> actions = resolver.resolveAvailableActions(
            alert, "analyst1", roles, "cwm");

        List<String> actionIds = new ArrayList<>();
        for (Map<String, Object> action : actions) {
            actionIds.add((String) action.get("id"));
        }
        assertThat(actionIds).containsExactly(
            "change_status", "add_note", "apply_tags", "link_incident");
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Map<String, Object> buildBasicAlert() {
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("name", "Suspicious login attempt");
        alert.put("status", 1); // open
        alert.put("tenantId", "cwm");
        alert.put("severity", 7);
        alert.put("locked", false);
        return alert;
    }
}
