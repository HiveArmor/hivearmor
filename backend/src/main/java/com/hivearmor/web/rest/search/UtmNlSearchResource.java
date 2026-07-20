package com.hivearmor.web.rest.search;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.search.NlQueryRequest;
import com.hivearmor.service.dto.search.NlQueryResultDTO;
import com.hivearmor.service.search.NlSearchService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ha-search")
@RequiredArgsConstructor
public class UtmNlSearchResource {

    private static final String CLASSNAME = "UtmNlSearchResource";
    private final Logger log = LoggerFactory.getLogger(UtmNlSearchResource.class);

    private final NlSearchService nlSearchService;
    private final ApplicationEventService applicationEventService;

    /**
     * POST /api/ha-search/nl-query
     * Converts a natural language question into an OpenSearch DSL query via the soc-ai plugin.
     */
    @PostMapping("/nl-query")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")
    public ResponseEntity<Object> nlQuery(@RequestBody @Valid NlQueryRequest request) {
        final String ctx = CLASSNAME + ".nlQuery";
        try {
            NlQueryResultDTO result = nlSearchService.translateQuery(request);
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            if (e.getMessage() != null && (e.getMessage().contains("not configured") || e.getMessage().contains("503"))) {
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "AI service unavailable. Check SOC-AI plugin configuration."));
            }
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", msg));
        }
    }
}
