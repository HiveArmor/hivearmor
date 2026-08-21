package com.hivearmor.service.inputs;

import com.hivearmor.config.HiveArmorProperties;
import com.hivearmor.service.dto.inputs.HaDataSourceCreateDTO;
import com.hivearmor.service.dto.inputs.HaDataSourceRecordDTO;
import com.hivearmor.service.dto.inputs.HaDataSourceStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Aggregation service that combines agent-manager gRPC health with OpenSearch
 * ingest statistics for every configured data source.
 *
 * <h3>Source list</h3>
 * <p>Data sources are seeded from {@code hivearmor.datasources} in
 * {@code application.yml} via {@link HiveArmorProperties}. A future sprint will
 * replace this with a JPA-backed {@code ha_data_source} table. Sources created at
 * runtime via {@link #create(HaDataSourceCreateDTO)} are appended to a thread-safe
 * in-memory list and survive until the next application restart.
 *
 * <h3>Parallel aggregation</h3>
 * <p>{@link #listAll()} processes sources in parallel using
 * {@link java.util.stream.Stream#parallel() parallelStream()} so that the full
 * response stays well under the 3 000 ms SLA even with 50 sources (Req 9.4).
 *
 * <h3>Resilience</h3>
 * <ul>
 *   <li>Each gRPC call is wrapped in an independent {@code try/catch}; on any
 *       exception the record's {@code grpcStatus} is set to
 *       {@link HaDataSourceStatus#unreachable} and the exception is NOT propagated
 *       (Req 8.3).</li>
 *   <li>Each OpenSearch call is wrapped in an independent {@code try/catch}; on any
 *       exception the record's {@code opensearchStatus} is set to
 *       {@link HaDataSourceStatus#unreachable} and the exception is NOT propagated
 *       (Req 8.4).</li>
 * </ul>
 *
 * <p>Requirements: 8.1, 8.2, 8.3, 8.4, 8.6
 */
@Slf4j
@Service
public class HaDataSourceService {

    private static final String CLASSNAME = "HaDataSourceService";

    private final HaDataSourceGrpcAdapter grpc;
    private final HaDataSourceOpenSearchAdapter opensearch;

    /**
     * Thread-safe mutable list that starts with the YAML-seeded sources and
     * accumulates any sources created at runtime via {@link #create(HaDataSourceCreateDTO)}.
     *
     * <p>A {@link CopyOnWriteArrayList} is used because reads (via {@code listAll})
     * vastly outnumber writes (via {@code create}), and the list is iterated by
     * {@code parallelStream} without concurrent mutation during iteration.
     */
    private final CopyOnWriteArrayList<HaDataSource> sources;

    /**
     * Constructs the service and seeds the initial source list from
     * {@link HiveArmorProperties#getDatasources()}.
     *
     * @param grpc             Adapter wrapping the agent-manager gRPC client.
     * @param opensearch       Adapter wrapping the OpenSearch ingest-stats queries.
     * @param hiveArmorProperties Configuration properties supplying the YAML-seeded sources.
     */
    public HaDataSourceService(HaDataSourceGrpcAdapter grpc,
                                HaDataSourceOpenSearchAdapter opensearch,
                                HiveArmorProperties hiveArmorProperties) {
        this.grpc = grpc;
        this.opensearch = opensearch;

        // Seed from YAML config (future sprint replaces this with JPA repo lookup).
        List<HaDataSource> seeded = new ArrayList<>();
        List<HiveArmorProperties.DataSourceConfig> cfgList = hiveArmorProperties.getDatasources();
        if (cfgList != null) {
            for (HiveArmorProperties.DataSourceConfig cfg : cfgList) {
                seeded.add(new HaDataSource(cfg.getId(), cfg.getName(), cfg.getType(), cfg.isEnabled()));
            }
        }
        this.sources = new CopyOnWriteArrayList<>(seeded);
        log.info("{}: initialised with {} seeded data source(s)", CLASSNAME, seeded.size());
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Returns the aggregated health record for every configured data source.
     *
     * <p>Sources are processed in parallel so that the aggregation latency is
     * dominated by the slowest single-source round-trip rather than the sum of
     * all round-trips (Req 9.4).
     *
     * <p>A source whose gRPC call fails contributes a record with
     * {@code grpcStatus=unreachable}. A source whose OpenSearch call fails
     * contributes a record with {@code opensearchStatus=unreachable}. In both
     * cases the record is still included in the returned list and no exception
     * is propagated (Req 9.3).
     *
     * @return Unmodifiable list of {@link HaDataSourceRecordDTO}s, one per source.
     */
    public List<HaDataSourceRecordDTO> listAll() {
        return sources.parallelStream()
                .map(this::aggregateOne)
                .toList();
    }

    /**
     * Creates a new data source from the wizard payload and returns its initial
     * aggregated record.
     *
     * <p>The new source is appended to the in-memory list so that subsequent
     * {@link #listAll()} calls include it. Persistence to a database table is
     * deferred to a future sprint.
     *
     * <p>The returned record is produced by running {@link #aggregateOne(HaDataSource)}
     * immediately so the caller gets live {@code grpcStatus} and
     * {@code opensearchStatus} values on creation.
     *
     * @param dto Wizard payload containing name, type, config, and enabled flag.
     * @return Aggregated {@link HaDataSourceRecordDTO} for the newly created source.
     */
    public HaDataSourceRecordDTO create(HaDataSourceCreateDTO dto) {
        String newId = UUID.randomUUID().toString();
        HaDataSource newSource = new HaDataSource(newId, dto.name(), dto.type(), dto.enabled());
        sources.add(newSource);
        log.info("{}.create: registered new data source id={} name={} type={}",
                CLASSNAME, newId, dto.name(), dto.type());
        return aggregateOne(newSource);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Aggregates a single data source by querying both the gRPC adapter and the
     * OpenSearch adapter, isolating each call in its own try/catch block.
     *
     * <p>Failure of one adapter does not affect the other. Both statuses are
     * captured independently so the caller can distinguish "gRPC unreachable but
     * OpenSearch ok" from "both unreachable".
     *
     * @param src The data source to aggregate.
     * @return Fully populated {@link HaDataSourceRecordDTO}; {@code lastEventAt}
     *         may be {@code null}.
     */
    private HaDataSourceRecordDTO aggregateOne(HaDataSource src) {
        // --- gRPC health ---------------------------------------------------
        HaDataSourceStatus grpcStatus;
        AgentHealth agentHealth = null;
        try {
            agentHealth = grpc.health(src);
            grpcStatus = HaDataSourceStatus.ok;
        } catch (Exception e) {
            // Req 8.3: mark unreachable; do NOT propagate.
            grpcStatus = HaDataSourceStatus.unreachable;
            log.warn("{}.aggregateOne: gRPC call failed for source id={}: {}",
                    CLASSNAME, src.id(), e.getMessage());
        }

        // --- OpenSearch stats ----------------------------------------------
        HaDataSourceStatus opensearchStatus;
        IngestStats ingestStats = null;
        try {
            ingestStats = opensearch.statsFor(src);
            opensearchStatus = HaDataSourceStatus.ok;
        } catch (Exception e) {
            // Req 8.4: mark unreachable; do NOT propagate.
            opensearchStatus = HaDataSourceStatus.unreachable;
            log.warn("{}.aggregateOne: OpenSearch call failed for source id={}: {}",
                    CLASSNAME, src.id(), e.getMessage());
        }

        // --- Assemble DTO --------------------------------------------------
        // Req 8.6: every field must be populated; lastEventAt may be null.
        return new HaDataSourceRecordDTO(
                src.id(),
                src.name(),
                src.type(),
                grpcStatus,
                opensearchStatus,
                ingestStats != null ? ingestStats.eps()         : 0.0,
                ingestStats != null ? ingestStats.epsHistory()  : List.of(),
                ingestStats != null ? ingestStats.lastEventAt() : null,   // null is permitted
                src.enabled()
        );
    }
}
