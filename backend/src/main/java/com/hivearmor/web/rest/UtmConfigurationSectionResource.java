package com.hivearmor.web.rest;

import com.hivearmor.domain.UtmConfigurationSection;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.UtmConfigurationSectionQueryService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.UtmConfigurationSectionCriteria;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST controller for managing UtmConfigurationSection.
 */
@RestController
@RequestMapping("/api")
public class UtmConfigurationSectionResource {
    private static final String CLASSNAME = "UtmConfigurationSectionResource";
    private final Logger log = LoggerFactory.getLogger(UtmConfigurationSectionResource.class);
    private final UtmConfigurationSectionQueryService configurationSectionQueryService;
    private final ApplicationEventService applicationEventService;

    public UtmConfigurationSectionResource(UtmConfigurationSectionQueryService configurationSectionQueryService,
                                           ApplicationEventService applicationEventService) {
        this.configurationSectionQueryService = configurationSectionQueryService;
        this.applicationEventService = applicationEventService;
    }

    /**
     * GET  /utm-configuration-sections : get all the utmConfigurationSections.
     *
     * @param pageable the pagination information
     * @param criteria the criterias which the requested entities should match
     * @return the ResponseEntity with status 200 (OK) and the list of utmConfigurationSections in body
     */
    @GetMapping("/ha-configuration-sections")
    public ResponseEntity<List<UtmConfigurationSection>> getConfigurationSections(@ParameterObject UtmConfigurationSectionCriteria criteria,
                                                                                  @ParameterObject Pageable pageable) {
        final String ctx = CLASSNAME + ".getConfigurationSections";
        try {
            Page<UtmConfigurationSection> page = configurationSectionQueryService.findByCriteria(criteria, pageable);
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-configuration-sections");
            return ResponseEntity.ok().headers(headers).body(page.getContent());
        } catch (Exception e) {
            final String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildInternalServerErrorResponse(msg);
        }
    }
}
