package com.hivearmor.web.rest.chart_builder;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.chart_builder.UtmDashboardVisualization;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.chart_builder.UtmDashboardVisualizationQueryService;
import com.hivearmor.service.chart_builder.UtmDashboardVisualizationService;
import com.hivearmor.service.dto.chart_builder.UtmDashboardVisualizationCriteria;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.ResponseUtil;

import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Optional;

/**
 * REST controller for managing UtmDashboardVisualization.
 */
@RestController
@RequestMapping("/api")
public class UtmDashboardVisualizationResource {

    private static final String CLASSNAME = "UtmDashboardVisualizationResource";
    private final Logger log = LoggerFactory.getLogger(UtmDashboardVisualizationResource.class);

    private static final String ENTITY_NAME = "utmDashboardVisualization";

    private final UtmDashboardVisualizationService utmDashboardVisualizationService;
    private final UtmDashboardVisualizationQueryService dashboardVisualizationQueryService;
    private final ApplicationEventService applicationEventService;

    public UtmDashboardVisualizationResource(UtmDashboardVisualizationService utmDashboardVisualizationService,
                                             UtmDashboardVisualizationQueryService dashboardVisualizationQueryService, ApplicationEventService applicationEventService) {
        this.utmDashboardVisualizationService = utmDashboardVisualizationService;
        this.dashboardVisualizationQueryService = dashboardVisualizationQueryService;
        this.applicationEventService = applicationEventService;
    }

    /**
     * POST  /utm-dashboard-visualizations : Create a new utmDashboardVisualization.
     *
     * @param utmDashboardVisualization the utmDashboardVisualization to create
     * @return the ResponseEntity with status 201 (Created) and with body the new utmDashboardVisualization, or with status 400 (Bad Request) if the utmDashboardVisualization has already an ID
     */
    @PostMapping("/ha-dashboard-visualizations")
    public ResponseEntity<UtmDashboardVisualization> createUtmDashboardVisualization(
        @Valid @RequestBody UtmDashboardVisualization utmDashboardVisualization) {
        final String ctx = CLASSNAME + ".createUtmDashboardVisualization";
        try {
            if (utmDashboardVisualization.getId() != null)
                throw new BadRequestAlertException("A new utmDashboardVisualization cannot already have an ID", ENTITY_NAME, "idexists");

            UtmDashboardVisualization result = utmDashboardVisualizationService.save(utmDashboardVisualization);
            return ResponseEntity.created(new URI("/api/ha-dashboard-visualizations/" + result.getId())).headers(
                HeaderUtil.createEntityCreationAlert(ENTITY_NAME, result.getId().toString())).body(result);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }

    /**
     * PUT  /utm-dashboard-visualizations : Updates an existing utmDashboardVisualization.
     *
     * @return the ResponseEntity with status 200 (OK) and with body the updated utmDashboardVisualization,
     * or with status 400 (Bad Request) if the utmDashboardVisualization is not valid,
     * or with status 500 (Internal Server Error) if the utmDashboardVisualization couldn't be updated
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PutMapping("/ha-dashboard-visualizations")
    public ResponseEntity<UtmDashboardVisualization> updateUtmDashboardVisualization(@Valid @RequestBody UtmDashboardVisualization utmDashboardVisualization) {
        final String ctx = CLASSNAME + ".updateUtmDashboardVisualization";
        try {
            if (utmDashboardVisualization.getId() == null)
                throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");

            UtmDashboardVisualization result = utmDashboardVisualizationService.save(utmDashboardVisualization);
            return ResponseEntity.ok().headers(
                HeaderUtil.createEntityUpdateAlert(ENTITY_NAME, utmDashboardVisualization.getId().toString())).body(result);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }

    /**
     * GET  /utm-dashboard-visualizations : get all the utmDashboardVisualizations.
     *
     * @param pageable the pagination information
     * @return the ResponseEntity with status 200 (OK) and the list of utmDashboardVisualizations in body
     */
    @GetMapping("/ha-dashboard-visualizations")
    public ResponseEntity<List<UtmDashboardVisualization>> getAllUtmDashboardVisualizations(
        UtmDashboardVisualizationCriteria criteria, Pageable pageable) {
        final String ctx = CLASSNAME + ".getAllUtmDashboardVisualizations";
        try {
            Page<UtmDashboardVisualization> page = dashboardVisualizationQueryService.findByCriteria(criteria, Pageable.unpaged());
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-dashboard-visualizations");
            return ResponseEntity.ok().headers(headers).body(page.getContent());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }

    /**
     * GET  /utm-dashboard-visualizations/:id : get the "id" utmDashboardVisualization.
     *
     * @param id the id of the utmDashboardVisualization to retrieve
     * @return the ResponseEntity with status 200 (OK) and with body the utmDashboardVisualization, or with status 404 (Not Found)
     */
    @GetMapping("/ha-dashboard-visualizations/{id}")
    public ResponseEntity<UtmDashboardVisualization> getUtmDashboardVisualization(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getUtmDashboardVisualization";
        try {
            Optional<UtmDashboardVisualization> utmDashboardVisualization = utmDashboardVisualizationService.findOne(id);
            return ResponseUtil.wrapOrNotFound(utmDashboardVisualization);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }

    /**
     * DELETE  /utm-dashboard-visualizations/:id : delete the "id" utmDashboardVisualization.
     *
     * @param id the id of the utmDashboardVisualization to delete
     * @return the ResponseEntity with status 200 (OK)
     */
    @DeleteMapping("/ha-dashboard-visualizations/{id}")
    public ResponseEntity<Void> deleteUtmDashboardVisualization(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deleteUtmDashboardVisualization";
        try {
            utmDashboardVisualizationService.delete(id);
            return ResponseEntity.ok().headers(HeaderUtil.createEntityDeletionAlert(ENTITY_NAME, id.toString())).build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }
}
