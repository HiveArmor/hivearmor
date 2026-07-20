package com.hivearmor.web.rest.incident;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.service.dto.incident.*;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import com.hivearmor.repository.incident.UtmIncidentAlertRepository;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.service.incident.IncidentInvestigationService;
import com.hivearmor.service.incident.UtmIncidentQueryService;
import com.hivearmor.service.incident.UtmIncidentService;
import com.hivearmor.util.exceptions.NoAlertsProvidedException;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import com.hivearmor.aop.logging.AuditEvent;

import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for managing UtmIncident.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
@RequestMapping("/api")
public class UtmIncidentResource {

    private static final String ENTITY_NAME = "utmIncident";

    private final UtmIncidentService utmIncidentService;

    private final UtmIncidentQueryService utmIncidentQueryService;

    private final IncidentInvestigationService incidentInvestigationService;

    private final UtmIncidentAlertRepository incidentAlertRepository;

    private final UtmAlertService alertService;

    public record IncidentGraphNodeDTO(String id, String type, String label, Map<String, Object> properties) {}
    public record IncidentGraphEdgeDTO(String source, String target, String relation) {}
    public record IncidentEntityGraphDTO(List<IncidentGraphNodeDTO> nodes, List<IncidentGraphEdgeDTO> edges) {}


    /**
     * Creates a new incident based on the provided details.
     *
     * This endpoint accepts a {@link NewIncidentDTO} object, validates the data,
     * and attempts to create a new incident. The process includes:
     * - Verifying that the alert list is not empty.
     * - Checking if any of the provided alerts are already associated with another incident.
     * - Creating the incident if all validations pass.
     *
     * @param newIncidentDTO the DTO containing the details of the incident to create, including associated alerts.
     * @return a {@link ResponseEntity} containing:
     *         - HTTP 201 (Created) if the incident is successfully created.
     *         - HTTP 400 (Bad Request) if the alert list is empty.
     *         - HTTP 409 (Conflict) if one or more alerts are already associated with another incident.
     *         - HTTP 500 (Internal Server Error) if an unexpected error occurs during processing.
     * @throws IllegalArgumentException if the input data is invalid.
     */
    @PostMapping("/ha-incidents")
    @AuditEvent(
        attemptType = ApplicationEventType.INCIDENT_CREATION_ATTEMPT,
        attemptMessage = "Attempt to create a new incident initiated",
        successType = ApplicationEventType.INCIDENT_CREATION_SUCCESS,
        successMessage = "Incident created successfully"
    )
    public ResponseEntity<UtmIncident> createUtmIncident(@Valid @RequestBody NewIncidentDTO newIncidentDTO) {
        return ResponseEntity.ok(utmIncidentService.createIncident(newIncidentDTO));
    }

    /**
     * POST /ha-incidents/add-alerts : Add alerts to an existing utmIncident.
     *
     * This endpoint allows users to associate a list of alerts with an existing utmIncident.
     * If any of the provided alerts are already linked to another incident, a conflict response is returned.
     *
     * @param addToIncidentDTO the DTO containing the details of the utmIncident and the list of alerts to add
     * @return the ResponseEntity with:
     *         - status 201 (Created) and the updated utmIncident if successful,
     *         - status 400 (Bad Request) if the alert list is empty,
     *         - status 409 (Conflict) if some alerts are already associated with another incident,
     *         - status 500 (Internal Server Error) if an unexpected error occurs.
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PostMapping("/ha-incidents/add-alerts")
    @AuditEvent(
        attemptType = ApplicationEventType.INCIDENT_ALERT_ADD_ATTEMPT,
        attemptMessage = "Attempt to add alerts to incident initiated",
        successType = ApplicationEventType.INCIDENT_ALERT_ADD_SUCCESS,
        successMessage = "Alerts added to incident successfully"
    )
    public ResponseEntity<UtmIncident> addAlertsToUtmIncident(@Valid @RequestBody AddToIncidentDTO addToIncidentDTO) throws URISyntaxException {

        if (CollectionUtils.isEmpty(addToIncidentDTO.getAlertList())) {
            throw new NoAlertsProvidedException("Add utmIncident cannot already have an empty related alerts");
        }

        UtmIncident result = utmIncidentService.addAlertsIncident(addToIncidentDTO);
           return ResponseEntity.created(new URI("/api/ha-incidents/add-alerts/" + result.getId()))
                .headers(HeaderUtil.createEntityCreationAlert(ENTITY_NAME, result.getId().toString()))
                .body(result);
    }

    /**
     * PUT  /ha-incidents : Updates an existing utmIncident.
     *
     * @param utmIncident the utmIncident to update
     * @return the ResponseEntity with status 200 (OK) and with body the updated utmIncident,
     * or with status 400 (Bad Request) if the utmIncident is not valid,
     * or with status 500 (Internal Server Error) if the utmIncident couldn't be updated
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PutMapping("/ha-incidents/change-status")
    @AuditEvent(
        attemptType = ApplicationEventType.INCIDENT_UPDATE_ATTEMPT,
        attemptMessage = "Attempt to update incident status initiated",
        successType = ApplicationEventType.INCIDENT_UPDATE_SUCCESS,
        successMessage = "Incident status updated successfully"
    )
    public ResponseEntity<UtmIncident> updateUtmIncident(@Valid @RequestBody UtmIncident utmIncident) {

        if (utmIncident.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        UtmIncident result = utmIncidentService.changeStatus(utmIncident);

        return ResponseEntity.ok()
                .headers(HeaderUtil.createEntityUpdateAlert(ENTITY_NAME, utmIncident.getId().toString()))
                .body(result);
    }

    /**
     * GET  /ha-incidents : get all the utmIncidents.
     *
     * @param pageable the pagination information
     * @param criteria the criterias which the requested entities should match
     * @return the ResponseEntity with status 200 (OK) and the list of utmIncidents in body
     */
    @GetMapping("/ha-incidents")
    public ResponseEntity<List<UtmIncident>> getAllUtmIncidents(UtmIncidentCriteria criteria, Pageable pageable) {

        Page<UtmIncident> page = utmIncidentQueryService.findByCriteria(criteria, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-incidents");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * GET  /ha-incidents/users-assigned : get all users assigned to incidents.
     *
     * @return the ResponseEntity with status 200 (OK) and the list of IncidentUserAssignedDTO in body
     */
    @GetMapping("/ha-incidents/users-assigned")
    public ResponseEntity<List<IncidentUserAssignedDTO>> getAllUserAssigned() {
        return ResponseEntity.ok().body(utmIncidentQueryService.getAllUsersAssigned());
    }

    /**
     * GET  /ha-incidents/:id : get the "id" utmIncident.
     *
     * @param id the id of the utmIncident to retrieve
     * @return the ResponseEntity with status 200 (OK) and with body the utmIncident, or with status 404 (Not Found)
     */
    @GetMapping("/ha-incidents/{id}")
    public ResponseEntity<UtmIncident> getUtmIncident(@PathVariable Long id) {

        Optional<UtmIncident> utmIncident = utmIncidentService.findOne(id);
        return tech.jhipster.web.util.ResponseUtil.wrapOrNotFound(utmIncident);

    }

    /**
     * GET /ha-incidents/{id}/entity-graph
     *
     * Builds an entity graph for the given incident by collecting all entities
     * (IPs, hosts, users, processes) from linked alert data. Nodes represent unique
     * entities; edges connect adversary entities to target entities within each alert.
     */
    @GetMapping("/ha-incidents/{id}/entity-graph")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
    public ResponseEntity<IncidentEntityGraphDTO> getIncidentEntityGraph(@PathVariable Long id) {
        log.debug("GET /api/ha-incidents/{}/entity-graph", id);

        List<String> alertIds = incidentAlertRepository.findAllByIncidentId(id)
                .stream().map(a -> a.getAlertId()).collect(Collectors.toList());
        if (alertIds.isEmpty()) {
            return ResponseEntity.ok(new IncidentEntityGraphDTO(List.of(), List.of()));
        }

        List<UtmAlert> alerts;
        try {
            alerts = alertService.getAlertsByIds(alertIds);
        } catch (Exception e) {
            log.warn("Failed to fetch alerts for incident entity graph {}: {}", id, e.getMessage());
            return ResponseEntity.ok(new IncidentEntityGraphDTO(List.of(), List.of()));
        }

        // Build unique node sets — keyed by nodeId to deduplicate
        Map<String, IncidentGraphNodeDTO> nodeMap = new LinkedHashMap<>();
        List<IncidentGraphEdgeDTO> edges = new ArrayList<>();
        Set<String> edgeKeys = new HashSet<>();

        for (UtmAlert alert : alerts) {
            List<String> alertNodeIds = new ArrayList<>();

            // Adversary side
            if (alert.getAdversary() != null) {
                var adv = alert.getAdversary();
                if (StringUtils.hasText(adv.getIp())) {
                    String nid = "ip:" + adv.getIp();
                    nodeMap.computeIfAbsent(nid, k -> {
                        Map<String, Object> props = new LinkedHashMap<>();
                        props.put("malicious", false);
                        if (adv.getGeolocation() != null && StringUtils.hasText(adv.getGeolocation().getCountry()))
                            props.put("country", adv.getGeolocation().getCountry());
                        return new IncidentGraphNodeDTO(nid, "ip", adv.getIp(), props);
                    });
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(adv.getUser())) {
                    String nid = "user:" + adv.getUser();
                    nodeMap.computeIfAbsent(nid, k -> {
                        Map<String, Object> props = new LinkedHashMap<>();
                        if (StringUtils.hasText(adv.getDomain())) props.put("domain", adv.getDomain());
                        return new IncidentGraphNodeDTO(nid, "user", adv.getUser(), props);
                    });
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(adv.getHost())) {
                    String nid = "host:" + adv.getHost();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "host", adv.getHost(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(adv.getProcess())) {
                    String nid = "process:" + adv.getProcess();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "process", adv.getProcess(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
            }

            // Target side
            if (alert.getTarget() != null) {
                var tgt = alert.getTarget();
                if (StringUtils.hasText(tgt.getIp())) {
                    String nid = "ip:" + tgt.getIp();
                    nodeMap.computeIfAbsent(nid, k -> {
                        Map<String, Object> props = new LinkedHashMap<>();
                        props.put("malicious", false);
                        if (tgt.getGeolocation() != null && StringUtils.hasText(tgt.getGeolocation().getCountry()))
                            props.put("country", tgt.getGeolocation().getCountry());
                        return new IncidentGraphNodeDTO(nid, "ip", tgt.getIp(), props);
                    });
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(tgt.getUser())) {
                    String nid = "user:" + tgt.getUser();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "user", tgt.getUser(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(tgt.getHost())) {
                    String nid = "host:" + tgt.getHost();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "host", tgt.getHost(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
            }

            // Connect first adversary entity to first target entity within the same alert
            if (alert.getAdversary() != null && alert.getTarget() != null) {
                String advIp   = StringUtils.hasText(alert.getAdversary().getIp())   ? "ip:"   + alert.getAdversary().getIp()   : null;
                String tgtIp   = StringUtils.hasText(alert.getTarget().getIp())       ? "ip:"   + alert.getTarget().getIp()       : null;
                String advUser = StringUtils.hasText(alert.getAdversary().getUser())  ? "user:" + alert.getAdversary().getUser()  : null;
                String tgtHost = StringUtils.hasText(alert.getTarget().getHost())     ? "host:" + alert.getTarget().getHost()     : null;

                addEdge(edges, edgeKeys, advIp, tgtIp, "targeted");
                addEdge(edges, edgeKeys, advIp, advUser, "used_by");
                addEdge(edges, edgeKeys, advIp, tgtHost, "attacked");
                addEdge(edges, edgeKeys, advUser, tgtIp, "accessed");
            }
        }

        return ResponseEntity.ok(new IncidentEntityGraphDTO(new ArrayList<>(nodeMap.values()), edges));
    }

    private void addEdge(List<IncidentGraphEdgeDTO> edges, Set<String> seen, String src, String tgt, String relation) {
        if (src == null || tgt == null || src.equals(tgt)) return;
        if (seen.add(src + "->" + tgt)) {
            edges.add(new IncidentGraphEdgeDTO(src, tgt, relation));
        }
    }
}
