package com.hivearmor.service.inputs;

import com.hivearmor.config.HiveArmorProperties;
import com.hivearmor.service.dto.inputs.HaDataSourceRecordDTO;
import com.hivearmor.service.dto.inputs.HaDataSourceStatus;
import net.jqwik.api.*;
import net.jqwik.api.constraints.NotEmpty;
import net.jqwik.api.lifecycle.BeforeTry;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for {@link HaDataSourceService}.
 *
 * <p><strong>Properties covered:</strong>
 * <ul>
 *   <li><strong>Property 14: Data source partial-failure resilience</strong>
 *       — For any combination of gRPC / OpenSearch adapter throwing exceptions,
 *       {@code listAll()} must still return a record per source with the appropriate
 *       status field set to {@link HaDataSourceStatus#unreachable}; it must never
 *       propagate the exception.
 *       Validates: Requirements 8.3, 8.4, 9.3</li>
 *   <li><strong>Property 15: Data source response schema completeness</strong>
 *       — For any {@link HaDataSourceRecordDTO}, all 9 required fields must be
 *       present and non-null (except {@code lastEventAt} which may be null).
 *       Validates: Requirements 8.6, 9.2</li>
 * </ul>
 *
 * <p>jqwik runs {@code @Property} methods in its own lifecycle. Mocks are created
 * fresh via {@code Mockito.mock()} and re-initialised via {@link BeforeTry} so every
 * trial starts from a clean state.
 */
class HaDataSourceServicePropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure – re-created before every jqwik trial
    // -------------------------------------------------------------------------

    private HaDataSourceGrpcAdapter grpcAdapter;
    private HaDataSourceOpenSearchAdapter opensearchAdapter;

    @BeforeTry
    void setUp() {
        grpcAdapter       = mock(HaDataSourceGrpcAdapter.class);
        opensearchAdapter = mock(HaDataSourceOpenSearchAdapter.class);
    }

    // =========================================================================
    // Property 14: Data source partial-failure resilience
    // Validates: Requirements 8.3, 8.4, 9.3
    // =========================================================================

    /**
     * **Validates: Requirements 8.3, 8.4, 9.3**
     *
     * <p>Scenario 1 — gRPC throws, OpenSearch succeeds.
     *
     * <p>For any set of sources where the gRPC adapter always throws:
     * <ul>
     *   <li>{@code listAll()} must NOT propagate the exception.</li>
     *   <li>Every returned record must have {@code grpcStatus = unreachable}.</li>
     *   <li>Every returned record must have {@code opensearchStatus = ok}.</li>
     *   <li>The list size must equal the number of configured sources.</li>
     * </ul>
     */
    @Property(tries = 150)
    void property14_grpcThrows_opensearchOk_returnsUnreachableGrpc(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        // Arrange: gRPC always throws
        doThrow(new RuntimeException("gRPC connection refused"))
                .when(grpcAdapter).health(any(HaDataSource.class));

        // Arrange: OpenSearch always succeeds with a nominal IngestStats
        IngestStats nominalStats = new IngestStats(1.5, List.of(1.0, 1.5, 2.0), Instant.now());
        when(opensearchAdapter.statsFor(any(HaDataSource.class))).thenReturn(nominalStats);

        HaDataSourceService service = serviceWithConfigs(configs);

        // Act – must NOT throw
        List<HaDataSourceRecordDTO> results = service.listAll();

        // Assert: one record per source, statuses correct
        assertThat(results)
                .as("listAll() must return one record per configured source even when gRPC fails (Req 9.3)")
                .hasSize(configs.size());

        for (HaDataSourceRecordDTO record : results) {
            assertThat(record.grpcStatus())
                    .as("grpcStatus must be unreachable when gRPC adapter throws (Req 8.3)")
                    .isEqualTo(HaDataSourceStatus.unreachable);
            assertThat(record.opensearchStatus())
                    .as("opensearchStatus must be ok when OpenSearch adapter succeeds (Req 8.4)")
                    .isEqualTo(HaDataSourceStatus.ok);
        }
    }

    /**
     * **Validates: Requirements 8.3, 8.4, 9.3**
     *
     * <p>Scenario 2 — gRPC succeeds, OpenSearch throws.
     *
     * <p>For any set of sources where the OpenSearch adapter always throws:
     * <ul>
     *   <li>{@code listAll()} must NOT propagate the exception.</li>
     *   <li>Every returned record must have {@code grpcStatus = ok}.</li>
     *   <li>Every returned record must have {@code opensearchStatus = unreachable}.</li>
     *   <li>The list size must equal the number of configured sources.</li>
     * </ul>
     */
    @Property(tries = 150)
    void property14_grpcOk_opensearchThrows_returnsUnreachableOpensearch(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        // Arrange: gRPC always succeeds
        AgentHealth nominalHealth = new AgentHealth("ONLINE", 1, Instant.now().toString());
        when(grpcAdapter.health(any(HaDataSource.class))).thenReturn(nominalHealth);

        // Arrange: OpenSearch always throws
        doThrow(new RuntimeException("OpenSearch cluster unavailable"))
                .when(opensearchAdapter).statsFor(any(HaDataSource.class));

        HaDataSourceService service = serviceWithConfigs(configs);

        // Act – must NOT throw
        List<HaDataSourceRecordDTO> results = service.listAll();

        // Assert
        assertThat(results)
                .as("listAll() must return one record per configured source even when OpenSearch fails (Req 9.3)")
                .hasSize(configs.size());

        for (HaDataSourceRecordDTO record : results) {
            assertThat(record.grpcStatus())
                    .as("grpcStatus must be ok when gRPC adapter succeeds (Req 8.3)")
                    .isEqualTo(HaDataSourceStatus.ok);
            assertThat(record.opensearchStatus())
                    .as("opensearchStatus must be unreachable when OpenSearch adapter throws (Req 8.4)")
                    .isEqualTo(HaDataSourceStatus.unreachable);
        }
    }

    /**
     * **Validates: Requirements 8.3, 8.4, 9.3**
     *
     * <p>Scenario 3 — both gRPC and OpenSearch throw.
     *
     * <p>For any set of sources where both adapters always throw:
     * <ul>
     *   <li>{@code listAll()} must NOT propagate any exception.</li>
     *   <li>Every returned record must have {@code grpcStatus = unreachable}.</li>
     *   <li>Every returned record must have {@code opensearchStatus = unreachable}.</li>
     * </ul>
     */
    @Property(tries = 150)
    void property14_bothAdaptersThrow_allRecordsUnreachable(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        // Arrange: both adapters always throw
        doThrow(new RuntimeException("gRPC total failure"))
                .when(grpcAdapter).health(any(HaDataSource.class));
        doThrow(new RuntimeException("OpenSearch total failure"))
                .when(opensearchAdapter).statsFor(any(HaDataSource.class));

        HaDataSourceService service = serviceWithConfigs(configs);

        // Act – must NOT throw regardless of how many sources fail
        List<HaDataSourceRecordDTO> results = service.listAll();

        // Assert
        assertThat(results)
                .as("listAll() must return one record per source even when both adapters fail (Req 9.3)")
                .hasSize(configs.size());

        for (HaDataSourceRecordDTO record : results) {
            assertThat(record.grpcStatus())
                    .as("grpcStatus must be unreachable when gRPC throws (Req 8.3)")
                    .isEqualTo(HaDataSourceStatus.unreachable);
            assertThat(record.opensearchStatus())
                    .as("opensearchStatus must be unreachable when OpenSearch throws (Req 8.4)")
                    .isEqualTo(HaDataSourceStatus.unreachable);
        }
    }

    /**
     * **Validates: Requirements 8.3, 8.4, 9.3**
     *
     * <p>Scenario 4 (sanity control) — both adapters succeed.
     *
     * <p>When neither adapter throws, every record must have both statuses set to
     * {@link HaDataSourceStatus#ok}.
     */
    @Property(tries = 150)
    void property14_bothAdaptersOk_allRecordsOk(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        // Arrange: both adapters succeed
        AgentHealth nominalHealth = new AgentHealth("ONLINE", 2, Instant.now().toString());
        when(grpcAdapter.health(any(HaDataSource.class))).thenReturn(nominalHealth);

        IngestStats nominalStats = new IngestStats(3.0, List.of(2.0, 3.0, 3.5), Instant.now());
        when(opensearchAdapter.statsFor(any(HaDataSource.class))).thenReturn(nominalStats);

        HaDataSourceService service = serviceWithConfigs(configs);

        // Act
        List<HaDataSourceRecordDTO> results = service.listAll();

        // Assert: sanity control — both ok
        assertThat(results)
                .as("listAll() must return one record per source when both adapters succeed")
                .hasSize(configs.size());

        for (HaDataSourceRecordDTO record : results) {
            assertThat(record.grpcStatus())
                    .as("grpcStatus must be ok when gRPC adapter succeeds (Req 8.3)")
                    .isEqualTo(HaDataSourceStatus.ok);
            assertThat(record.opensearchStatus())
                    .as("opensearchStatus must be ok when OpenSearch adapter succeeds (Req 8.4)")
                    .isEqualTo(HaDataSourceStatus.ok);
        }
    }

    /**
     * **Validates: Requirements 8.3, 8.4, 9.3**
     *
     * <p>Scenario 5 — different exception types must all be caught (not just {@link RuntimeException}).
     *
     * <p>The gRPC adapter is declared to throw {@code Exception} (checked), so the
     * try/catch in the service uses {@code catch (Exception e)}. This property
     * verifies that checked exceptions propagated from the gRPC stub are also
     * absorbed correctly.
     */
    @Property(tries = 100)
    void property14_grpcThrowsCheckedException_serviceStillReturnsRecord(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        // Arrange: gRPC throws a checked Exception (simulated as generic Exception)
        doThrow(new Exception("gRPC checked exception"))
                .when(grpcAdapter).health(any(HaDataSource.class));

        // Arrange: OpenSearch succeeds
        IngestStats stats = new IngestStats(0.5, List.of(), Instant.now());
        when(opensearchAdapter.statsFor(any(HaDataSource.class))).thenReturn(stats);

        HaDataSourceService service = serviceWithConfigs(configs);

        // Act – checked exception must NOT propagate
        List<HaDataSourceRecordDTO> results = service.listAll();

        assertThat(results).hasSize(configs.size());
        for (HaDataSourceRecordDTO record : results) {
            assertThat(record.grpcStatus())
                    .as("grpcStatus must be unreachable on checked Exception from gRPC (Req 8.3)")
                    .isEqualTo(HaDataSourceStatus.unreachable);
        }
    }

    // =========================================================================
    // Property 15: Data source response schema completeness
    // Validates: Requirements 8.6, 9.2
    // =========================================================================

    /**
     * **Validates: Requirements 8.6, 9.2**
     *
     * <p>For any {@link HaDataSourceRecordDTO} produced by {@link HaDataSourceService#listAll()},
     * all 9 required fields must be present and non-null, except {@code lastEventAt}
     * which is explicitly permitted to be null.
     *
     * <p>The required non-null fields are:
     * <ol>
     *   <li>{@code id}</li>
     *   <li>{@code name}</li>
     *   <li>{@code type}</li>
     *   <li>{@code grpcStatus}</li>
     *   <li>{@code opensearchStatus}</li>
     *   <li>{@code eps} (primitive double — always present)</li>
     *   <li>{@code epsHistory} (never null; empty list on failure)</li>
     *   <li>{@code enabled} (primitive boolean — always present)</li>
     * </ol>
     * And the nullable field:
     * <ul>
     *   <li>{@code lastEventAt} — may be null (OpenSearch failure or no events yet)</li>
     * </ul>
     *
     * <p>Tests three adapter states: (a) both ok, (b) gRPC fails, (c) OpenSearch fails.
     */
    @Property(tries = 200)
    void property15_recordSchemaCompleteness_bothAdaptersOk(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        AgentHealth health = new AgentHealth("ONLINE", 1, Instant.now().toString());
        when(grpcAdapter.health(any(HaDataSource.class))).thenReturn(health);

        IngestStats stats = new IngestStats(2.5, List.of(1.0, 2.0, 3.0), Instant.now());
        when(opensearchAdapter.statsFor(any(HaDataSource.class))).thenReturn(stats);

        HaDataSourceService service = serviceWithConfigs(configs);

        List<HaDataSourceRecordDTO> results = service.listAll();

        assertSchemaCompleteness(results, configs.size());
        // When OpenSearch succeeds, eps history and lastEventAt come from the adapter
        for (HaDataSourceRecordDTO record : results) {
            assertThat(record.epsHistory())
                    .as("epsHistory must be populated from IngestStats when OpenSearch succeeds (Req 8.6)")
                    .isNotNull();
            assertThat(record.eps())
                    .as("eps must be non-negative (Req 8.6)")
                    .isGreaterThanOrEqualTo(0.0);
        }
    }

    /**
     * **Validates: Requirements 8.6, 9.2**
     *
     * <p>Schema completeness when gRPC fails — {@code grpcStatus} must be non-null
     * (set to {@code unreachable}), and all other fields must still be populated.
     */
    @Property(tries = 200)
    void property15_recordSchemaCompleteness_grpcFails(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        doThrow(new RuntimeException("gRPC down")).when(grpcAdapter).health(any(HaDataSource.class));

        IngestStats stats = new IngestStats(0.0, List.of(), null);
        when(opensearchAdapter.statsFor(any(HaDataSource.class))).thenReturn(stats);

        HaDataSourceService service = serviceWithConfigs(configs);

        List<HaDataSourceRecordDTO> results = service.listAll();

        assertSchemaCompleteness(results, configs.size());
    }

    /**
     * **Validates: Requirements 8.6, 9.2**
     *
     * <p>Schema completeness when OpenSearch fails — {@code opensearchStatus} must be
     * non-null (set to {@code unreachable}), {@code epsHistory} must be an empty list
     * (not null), and {@code eps} must be {@code 0.0}.
     */
    @Property(tries = 200)
    void property15_recordSchemaCompleteness_opensearchFails(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        AgentHealth health = new AgentHealth("ONLINE", 1, Instant.now().toString());
        when(grpcAdapter.health(any(HaDataSource.class))).thenReturn(health);

        doThrow(new RuntimeException("OpenSearch down")).when(opensearchAdapter).statsFor(any(HaDataSource.class));

        HaDataSourceService service = serviceWithConfigs(configs);

        List<HaDataSourceRecordDTO> results = service.listAll();

        assertSchemaCompleteness(results, configs.size());

        // When OpenSearch fails, fallback values must be used (Req 8.6)
        for (HaDataSourceRecordDTO record : results) {
            assertThat(record.eps())
                    .as("eps must be 0.0 when OpenSearch fails (Req 8.6 fallback)")
                    .isEqualTo(0.0);
            assertThat(record.epsHistory())
                    .as("epsHistory must be an empty list (not null) when OpenSearch fails (Req 8.6 fallback)")
                    .isNotNull()
                    .isEmpty();
            // lastEventAt is allowed to be null on failure
        }
    }

    /**
     * **Validates: Requirements 8.6, 9.2**
     *
     * <p>Schema completeness when both adapters fail — tests that fallback values for
     * all derived fields are correctly applied and no field is null (except
     * {@code lastEventAt}).
     */
    @Property(tries = 200)
    void property15_recordSchemaCompleteness_bothFail(
            @ForAll("sourceConfigs") List<HiveArmorProperties.DataSourceConfig> configs) throws Exception {

        doThrow(new RuntimeException("gRPC down")).when(grpcAdapter).health(any(HaDataSource.class));
        doThrow(new RuntimeException("OpenSearch down")).when(opensearchAdapter).statsFor(any(HaDataSource.class));

        HaDataSourceService service = serviceWithConfigs(configs);

        List<HaDataSourceRecordDTO> results = service.listAll();

        assertSchemaCompleteness(results, configs.size());

        for (HaDataSourceRecordDTO record : results) {
            // Both status fields must be unreachable (not null)
            assertThat(record.grpcStatus()).isEqualTo(HaDataSourceStatus.unreachable);
            assertThat(record.opensearchStatus()).isEqualTo(HaDataSourceStatus.unreachable);
            // Fallback numeric fields
            assertThat(record.eps()).isEqualTo(0.0);
            assertThat(record.epsHistory()).isNotNull().isEmpty();
            // lastEventAt may be null — this is the only permitted null field
        }
    }

    // =========================================================================
    // Arbitraries (jqwik generators)
    // =========================================================================

    /**
     * Generates a list of 1–10 {@link HiveArmorProperties.DataSourceConfig} instances
     * with non-blank id, name, type values, and a random {@code enabled} flag.
     *
     * <p>Uses a small upper bound (10) so that parallel {@code listAll()} calls
     * complete quickly within jqwik's default timeout.
     */
    @Provide
    Arbitrary<List<HiveArmorProperties.DataSourceConfig>> sourceConfigs() {
        Arbitrary<String> ids     = Arbitraries.strings().withCharRange('a', 'z').ofMinLength(4).ofMaxLength(12)
                .map(s -> UUID.randomUUID().toString().substring(0, 8) + "-" + s);
        Arbitrary<String> names   = Arbitraries.strings().withCharRange('a', 'z').ofMinLength(3).ofMaxLength(20);
        Arbitrary<String> types   = Arbitraries.of("syslog", "wineventlog", "agent", "kafka", "aws", "azure", "gcp");
        Arbitrary<Boolean> enabled = Arbitraries.of(true, false);

        Arbitrary<HiveArmorProperties.DataSourceConfig> singleConfig =
                Combinators.combine(ids, names, types, enabled)
                        .as((id, name, type, en) -> {
                            HiveArmorProperties.DataSourceConfig cfg = new HiveArmorProperties.DataSourceConfig();
                            cfg.setId(id);
                            cfg.setName(name);
                            cfg.setType(type);
                            cfg.setEnabled(en);
                            return cfg;
                        });

        return singleConfig.list().ofMinSize(1).ofMaxSize(10);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Constructs a {@link HaDataSourceService} wired with the mocked adapters and
     * a {@link HiveArmorProperties} pre-loaded with the given list of configs.
     *
     * <p>The {@code HiveArmorProperties} instance is plain (no Spring context) — its
     * setter is called directly to inject the prepared list.
     *
     * @param configs Data source configurations to seed into the service.
     * @return A fully initialised {@link HaDataSourceService} ready for testing.
     */
    private HaDataSourceService serviceWithConfigs(
            List<HiveArmorProperties.DataSourceConfig> configs) {

        HiveArmorProperties props = new HiveArmorProperties();
        props.setDatasources(new ArrayList<>(configs));
        return new HaDataSourceService(grpcAdapter, opensearchAdapter, props);
    }

    /**
     * Core schema completeness assertion applied to every record in {@code results}.
     *
     * <p>Verifies that:
     * <ul>
     *   <li>The list size equals the expected source count.</li>
     *   <li>Fields {@code id}, {@code name}, {@code type}, {@code grpcStatus},
     *       {@code opensearchStatus}, and {@code epsHistory} are all non-null.</li>
     *   <li>{@code lastEventAt} is not asserted on nullity — it is the only
     *       field permitted to be null (Req 8.6).</li>
     * </ul>
     *
     * @param results      The list returned by {@code listAll()}.
     * @param expectedSize The number of sources that were configured.
     */
    private static void assertSchemaCompleteness(
            List<HaDataSourceRecordDTO> results, int expectedSize) {

        assertThat(results)
                .as("listAll() must return exactly one record per configured source (Req 8.6, 9.2)")
                .hasSize(expectedSize);

        for (int i = 0; i < results.size(); i++) {
            HaDataSourceRecordDTO record = results.get(i);

            assertThat(record.id())
                    .as("Record[%d].id must be non-null (Req 8.6 field: id)", i)
                    .isNotNull()
                    .isNotEmpty();

            assertThat(record.name())
                    .as("Record[%d].name must be non-null (Req 8.6 field: name)", i)
                    .isNotNull();

            assertThat(record.type())
                    .as("Record[%d].type must be non-null (Req 8.6 field: type)", i)
                    .isNotNull();

            assertThat(record.grpcStatus())
                    .as("Record[%d].grpcStatus must be non-null (Req 8.6 field: grpcStatus)", i)
                    .isNotNull();

            assertThat(record.opensearchStatus())
                    .as("Record[%d].opensearchStatus must be non-null (Req 8.6 field: opensearchStatus)", i)
                    .isNotNull();

            // eps is a primitive double — it is always present; assert non-negative.
            assertThat(record.eps())
                    .as("Record[%d].eps must be >= 0 (Req 8.6 field: eps)", i)
                    .isGreaterThanOrEqualTo(0.0);

            assertThat(record.epsHistory())
                    .as("Record[%d].epsHistory must be non-null (Req 8.6 field: epsHistory)", i)
                    .isNotNull();

            // enabled is a primitive boolean — always present; no null assertion needed.

            // lastEventAt: PERMITTED to be null (Req 8.6 note: "may be null").
            // We only assert it is a valid Instant when not null.
            if (record.lastEventAt() != null) {
                assertThat(record.lastEventAt())
                        .as("Record[%d].lastEventAt, when non-null, must be a valid Instant (Req 8.6)", i)
                        .isBeforeOrEqualTo(Instant.now().plusSeconds(60));
            }
        }
    }
}
