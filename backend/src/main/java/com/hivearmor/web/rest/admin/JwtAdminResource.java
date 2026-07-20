package com.hivearmor.web.rest.admin;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.application_events.ApplicationEventService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class JwtAdminResource {

    private final TokenProvider tokenProvider;
    private final ApplicationEventService applicationEventService;

    /**
     * POST /api/ha-admin/jwt/rotate
     *
     * Generates a new JWT signing key, replaces the persisted DB record, and invalidates
     * all active sessions immediately. Intended for incident response only.
     */
    @PostMapping("/ha-admin/jwt/rotate")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Void> rotateJwtKey() {
        tokenProvider.rotateKey();
        applicationEventService.createEvent(
            "JWT signing key rotated by admin — all active sessions invalidated",
            ApplicationEventType.JWT_KEY_ROTATED
        );
        return ResponseEntity.ok().build();
    }
}
