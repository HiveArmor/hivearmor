package com.hivearmor.web.rest.notification_channel;

import com.hivearmor.security.AuthoritiesConstants;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * B0-6 F-3 side-finding: NotificationChannelResource previously had NO @PreAuthorize, so any
 * authenticated user could create/edit/delete notification channels and routes and trigger test
 * dispatch. This asserts the class-level ADMIN gate (enforced by @EnableMethodSecurity), matching
 * the canonical HaNotificationRulesResource. Method-security is verified by reflection because
 * @PreAuthorize is not enforced without a full Spring Security context.
 */
class NotificationChannelResourceAuthTest {

    @Test
    @DisplayName("NotificationChannelResource is gated to ROLE_ADMIN at the class level")
    void classLevelAdminGate() {
        PreAuthorize preAuth = NotificationChannelResource.class.getAnnotation(PreAuthorize.class);

        assertNotNull(preAuth, "NotificationChannelResource must have a class-level @PreAuthorize");
        assertTrue(preAuth.value().contains(AuthoritiesConstants.ADMIN),
            "@PreAuthorize must reference ROLE_ADMIN — non-admin users receive 403");
        assertFalse(preAuth.value().contains(AuthoritiesConstants.USER),
            "@PreAuthorize must NOT grant plain ROLE_USER access to notification-channel management");
    }
}
