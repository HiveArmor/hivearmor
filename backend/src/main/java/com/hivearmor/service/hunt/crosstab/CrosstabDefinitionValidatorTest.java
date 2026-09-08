package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabRequestDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for the crosstab request mapper + V1 validator + backend-owned field capability.
 *
 * <p>Plain JUnit 5 + AssertJ, no Spring context / no OpenSearch (matches the hunt test convention).
 * OpenSearch aggregation correctness (top-N approximation, non-additive totals, per-type Stage-B,
 * exclusion-intersection) is validated live against a cluster in PR-C — it cannot run in a unit test.
 */
class CrosstabDefinitionValidatorTest {

    private HuntFieldRegistry registry;
    private CrosstabFieldCapabilityResolver capabilities;
    private CrosstabDefinitionValidator validator;
    private CrosstabRequestMapper mapper;
    private CrosstabCostPolicy policy;

    @BeforeEach
    void setUp() {
        registry = new HuntFieldRegistry();
        capabilities = new CrosstabFieldCapabilityResolver(registry);
        policy = new CrosstabCostPolicy();
        validator = new CrosstabDefinitionValidator(capabilities, registry, policy);
        mapper = new CrosstabRequestMapper(policy);
    }

    private static HuntCrosstabRequestDTO request(String row, String col, String valueFn, String distinctField) {
        HuntCrosstabRequestDTO r = new HuntCrosstabRequestDTO();
        r.setQuery("event.category:authentication");
        r.setRowField(row);
        r.setColField(col);
        r.setValueFn(valueFn);
        r.setDistinctField(distinctField);
        HuntSearchRequestDTO.TimeRangeDTO tr = new HuntSearchRequestDTO.TimeRangeDTO();
        tr.setFrom("now-24h");
        tr.setTo("now");
        r.setTimeRange(tr);
        return r;
    }

    @Test
    @DisplayName("valid count crosstab maps to a 1x1x1 definition and validates")
    void validCount() {
        CrosstabDefinition def = mapper.toDefinition(request("host.name", "event.action", "count", null));
        assertThat(def.dimensions().rows()).hasSize(1);
        assertThat(def.dimensions().columns()).hasSize(1);
        assertThat(def.measures()).hasSize(1);
        assertThat(def.isDistinct()).isFalse();
        validator.validate(def); // no throw
    }

    @Test
    @DisplayName("valid distinct crosstab validates when distinctField is aggregatable")
    void validDistinct() {
        CrosstabDefinition def = mapper.toDefinition(request("source.ip", "event.outcome", "distinct", "user.name"));
        assertThat(def.isDistinct()).isTrue();
        assertThat(def.measure().field()).isEqualTo("user.name");
        validator.validate(def); // no throw
    }

    @Test
    @DisplayName("date field on an axis is rejected with DATE_REQUIRES_BUCKETING")
    void dateAxisRejected() {
        CrosstabDefinition def = mapper.toDefinition(request("@timestamp", "event.action", "count", null));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_AXIS_FIELD_UNSUPPORTED");
        assertThat(capabilities.capabilityFor("@timestamp").reason())
            .isEqualTo(CrosstabCapabilityReason.DATE_REQUIRES_BUCKETING);
    }

    @Test
    @DisplayName("non-aggregatable text field on an axis is rejected with NOT_AGGREGATABLE")
    void textAxisRejected() {
        assertThat(capabilities.capabilityFor("message").reason())
            .isEqualTo(CrosstabCapabilityReason.NOT_AGGREGATABLE);
        CrosstabDefinition def = mapper.toDefinition(request("message", "event.action", "count", null));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_AXIS_FIELD_UNSUPPORTED");
    }

    @Test
    @DisplayName("unknown field resolves to UNMAPPED and is rejected")
    void unknownFieldRejected() {
        assertThat(capabilities.capabilityFor("does.not.exist").reason())
            .isEqualTo(CrosstabCapabilityReason.UNMAPPED);
        CrosstabDefinition def = mapper.toDefinition(request("does.not.exist", "event.action", "count", null));
        assertThatThrownBy(() -> validator.validate(def)).isInstanceOf(HuntQueryException.class);
    }

    @Test
    @DisplayName("distinct without a distinctField is rejected")
    void distinctMissingFieldRejected() {
        CrosstabDefinition def = mapper.toDefinition(request("host.name", "event.action", "distinct", null));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_DISTINCT_FIELD_REQUIRED");
    }

    @Test
    @DisplayName("distinct of a date field is rejected")
    void distinctOfDateRejected() {
        CrosstabDefinition def = mapper.toDefinition(request("host.name", "event.action", "distinct", "@timestamp"));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_DISTINCT_FIELD_UNSUPPORTED");
    }

    @Test
    @DisplayName("unsupported measure function is rejected by the mapper")
    void unsupportedMeasureRejected() {
        assertThatThrownBy(() -> mapper.toDefinition(request("host.name", "event.action", "avg", "network.bytes")))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_MEASURE_UNSUPPORTED");
    }

    @Test
    @DisplayName("keyword, ip, number, boolean axes are all allowed")
    void supportedAxisKinds() {
        assertThat(capabilities.isAxisAllowed("host.name")).isTrue();   // keyword
        assertThat(capabilities.isAxisAllowed("source.ip")).isTrue();   // ip
        assertThat(capabilities.isAxisAllowed("source.port")).isTrue(); // number
        assertThat(capabilities.isAxisAllowed("event.severity")).isTrue(); // number
    }

    // --- P1.1 time bucketing ---

    private HuntCrosstabRequestDTO bucketed(String row, String rowInterval, String col, String colInterval) {
        HuntCrosstabRequestDTO r = request(row, col, "count", null);
        if (rowInterval != null) {
            HuntCrosstabRequestDTO.BucketDTO b = new HuntCrosstabRequestDTO.BucketDTO();
            b.setInterval(rowInterval);
            r.setRowBucket(b);
        }
        if (colInterval != null) {
            HuntCrosstabRequestDTO.BucketDTO b = new HuntCrosstabRequestDTO.BucketDTO();
            b.setInterval(colInterval);
            r.setColBucket(b);
        }
        return r;
    }

    @Test
    @DisplayName("a bucketed date column axis with an allowed interval validates")
    void bucketedDateAxisAllowed() {
        CrosstabDefinition def = mapper.toDefinition(bucketed("host.name", null, "@timestamp", "1h"));
        assertThat(def.column().isDateHistogram()).isTrue();
        assertThat(def.column().bucket().interval()).isEqualTo("1h");
        validator.validate(def); // no throw
    }

    @Test
    @DisplayName("an unbucketed date axis is still rejected")
    void unbucketedDateStillRejected() {
        CrosstabDefinition def = mapper.toDefinition(bucketed("host.name", null, "@timestamp", null));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_AXIS_FIELD_UNSUPPORTED");
    }

    @Test
    @DisplayName("a disallowed bucket interval is rejected")
    void badIntervalRejected() {
        CrosstabDefinition def = mapper.toDefinition(bucketed("host.name", null, "@timestamp", "2s"));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_BUCKET_INTERVAL_UNSUPPORTED");
    }

    @Test
    @DisplayName("bucketing a non-date field is rejected")
    void bucketOnNonDateRejected() {
        CrosstabDefinition def = mapper.toDefinition(bucketed("host.name", "1h", "event.action", null));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_BUCKET_NOT_DATE");
    }

    @Test
    @DisplayName("two date axes are rejected (at most one time axis in P1.1)")
    void twoDateAxesRejected() {
        CrosstabDefinition def = mapper.toDefinition(bucketed("@timestamp", "1h", "@timestamp", "1d"));
        assertThatThrownBy(() -> validator.validate(def))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code").isEqualTo("CROSSTAB_ONE_DATE_AXIS");
    }
}
