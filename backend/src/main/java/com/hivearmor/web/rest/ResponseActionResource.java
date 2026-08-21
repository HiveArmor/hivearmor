package com.hivearmor.web.rest;

import com.hivearmor.service.ResponseActionService;
import com.hivearmor.service.dto.ResponseActionDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST controller for the HiveArmor SOAR response action library.
 *
 * <p>Mapped at {@code /api/ha-response-actions}. All endpoints are secured with
 * {@code @PreAuthorize}. Read endpoints accept {@code ROLE_ADMIN} and
 * {@code ROLE_USER}.
 *
 * <p>Constructor injection is used exclusively — no field or setter injection,
 * no Lombok annotations.
 */
@RestController
@RequestMapping("/api")
public class ResponseActionResource {

    private static final Logger log = LoggerFactory.getLogger(ResponseActionResource.class);
    private static final String CLASSNAME = "ResponseActionResource";

    private final ResponseActionService responseActionService;

    public ResponseActionResource(ResponseActionService responseActionService) {
        this.responseActionService = responseActionService;
    }

    // -------------------------------------------------------------------------
    // Endpoints
    // -------------------------------------------------------------------------

    /**
     * GET /api/ha-response-actions/library
     *
     * <p>Returns the full built-in response action catalogue, ordered as defined
     * by {@link ResponseActionService#getLibrary()}.
     *
     * @return HTTP 200 with a list of {@link ResponseActionDTO}
     */
    @GetMapping("/ha-response-actions/library")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")
    public ResponseEntity<List<ResponseActionDTO>> getLibrary() {
        final String ctx = CLASSNAME + ".getLibrary";
        try {
            List<ResponseActionDTO> library = responseActionService.getLibrary();
            return ResponseEntity.ok(library);
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
