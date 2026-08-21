package com.hivearmor.web.rest.inputs;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.dto.inputs.HaDataSourceCreateDTO;
import com.hivearmor.service.dto.inputs.HaDataSourceRecordDTO;
import com.hivearmor.service.inputs.HaDataSourceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST controller for the HiveArmor Data Source Status page (S20-T03, Requirements 9–11).
 *
 * <h3>Endpoint summary</h3>
 * <pre>
 *   GET   /api/ha-inputs/sources  → aggregated list of all data sources; always HTTP 200
 *   POST  /api/ha-inputs/sources  → register a new data source; returns HTTP 201
 * </pre>
 *
 * <p>Both endpoints require {@code ROLE_ADMIN} or {@code ROLE_ANALYST} (the
 * operator-equivalent role in HiveArmor) per Requirements 9.1, 13.2, 13.3.
 * {@code ROLE_ANALYST} maps to the analyst/operator persona that has full
 * read/write on operational surfaces such as data sources, alerts, and incidents.
 *
 * <h3>Resilience contract (Requirements 9.2, 9.3)</h3>
 * <p>When one or more per-source aggregations report {@code grpcStatus} or
 * {@code opensearchStatus} as {@code unreachable}, those records are still included
 * in the response and the controller still returns HTTP 200. Errors are handled
 * inside {@link HaDataSourceService#listAll()} — no exception propagates to this
 * layer.
 *
 * <h3>Performance contract (Requirement 9.4)</h3>
 * <p>Aggregation runs in parallel via {@link java.util.stream.Stream#parallel()
 * parallelStream()} inside the service layer. The full response for up to 50 sources
 * on the local-dev stack completes well under the 3 000 ms SLA.
 */
@RestController
@RequestMapping("/api/ha-inputs/sources")
@RequiredArgsConstructor
public class HaDataSourceController {

    private static final Logger log = LoggerFactory.getLogger(HaDataSourceController.class);

    private final HaDataSourceService service;

    // =========================================================================
    // GET — list all data sources (Requirements 9.1, 9.2, 9.3, 9.4, 13.2, 13.3)
    // =========================================================================

    /**
     * Returns the aggregated health record for every configured data source.
     *
     * <p>The response is always HTTP 200 regardless of individual source health.
     * Sources whose gRPC or OpenSearch adapter calls failed are included in the
     * response with the corresponding status field set to {@code unreachable}
     * (Requirements 9.2, 9.3).
     *
     * <p>Aggregation runs in parallel inside the service layer so that latency
     * is bounded by the slowest single source rather than the total sum of all
     * source round-trips (Requirement 9.4).
     *
     * @return HTTP 200 with a JSON array of {@link HaDataSourceRecordDTO}s;
     *         the array may be empty but is never {@code null}
     */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('"
            + AuthoritiesConstants.ADMIN + "','"
            + AuthoritiesConstants.ANALYST + "')")
    public ResponseEntity<List<HaDataSourceRecordDTO>> list() {
        List<HaDataSourceRecordDTO> records = service.listAll();
        log.debug("HaDataSourceController.list: returning {} data source record(s)", records.size());
        // Requirement 9.3: always HTTP 200, even when some records are unreachable.
        return ResponseEntity.ok(records);
    }

    // =========================================================================
    // POST — create data source (Requirements 9.1, 9.2, 13.2, 13.3)
    // =========================================================================

    /**
     * Registers a new data source from the Add Data Source wizard payload.
     *
     * <p>The new source is appended to the service's in-memory list and an initial
     * aggregated record is returned immediately. Persistence to a database table is
     * deferred to a future sprint; the record survives until the next application
     * restart.
     *
     * <p>On success the response body includes a fully populated
     * {@link HaDataSourceRecordDTO} with live {@code grpcStatus} and
     * {@code opensearchStatus} values as of creation time (Requirement 9.2).
     *
     * @param dto the wizard payload: {@code name}, {@code type}, {@code config},
     *            {@code enabled}; validated before service delegation
     * @return HTTP 201 with the aggregated {@link HaDataSourceRecordDTO} for the
     *         newly registered source
     */
    @PostMapping
    @PreAuthorize("hasAnyAuthority('"
            + AuthoritiesConstants.ADMIN + "','"
            + AuthoritiesConstants.ANALYST + "')")
    public ResponseEntity<HaDataSourceRecordDTO> create(
            @Valid @RequestBody HaDataSourceCreateDTO dto) {
        HaDataSourceRecordDTO created = service.create(dto);
        log.debug("HaDataSourceController.create: registered data source id={} name={}",
                created.id(), created.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
