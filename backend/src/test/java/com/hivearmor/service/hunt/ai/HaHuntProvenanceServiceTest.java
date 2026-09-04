package com.hivearmor.service.hunt.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.hivearmor.service.hunt.HaHuntService;
import com.hivearmor.web.rest.hunt.dto.HuntFieldDefinitionDTO;
import com.hivearmor.web.rest.hunt.ai.dto.HuntFieldProvenanceDTO;

/**
 * Unit tests for {@link HaHuntProvenanceService} — deterministic "show AI's hand" field map.
 *
 * <p>Validates that fields are classified honestly: geo/threat-intel = enrichment, risk/ml = model,
 * everything else = raw. The map is derived from the LIVE schema, and only fields the enrichment/
 * model stages actually produce are marked non-raw (no field is falsely flagged AI-derived).
 */
@DisplayName("HaHuntProvenanceService — field provenance lens")
class HaHuntProvenanceServiceTest {

    private HaHuntService huntService;
    private HaHuntProvenanceService service;

    @BeforeEach
    void setUp() {
        huntService = mock(HaHuntService.class);
        service = new HaHuntProvenanceService(huntService);
    }

    private static HuntFieldDefinitionDTO field(String name) {
        return new HuntFieldDefinitionDTO(name, name, "keyword", "cat", "desc", List.of());
    }

    @Test
    @DisplayName("classifies geo as enrichment, risk as model, and raw fields as raw")
    void classifies() {
        when(huntService.getSchemaFields()).thenReturn(List.of(
            field("@timestamp"),
            field("source.ip"),
            field("user.name"),
            field("source.geo.country_name"),
            field("threat.indicator.type"),
            field("risk.score")));

        List<HuntFieldProvenanceDTO> map = service.fieldProvenance();

        assertThat(byField(map, "@timestamp").origin()).isEqualTo("raw");
        assertThat(byField(map, "source.ip").origin()).isEqualTo("raw");
        assertThat(byField(map, "user.name").origin()).isEqualTo("raw");
        assertThat(byField(map, "source.geo.country_name").origin()).isEqualTo("enrichment");
        assertThat(byField(map, "source.geo.country_name").agent()).isEqualTo("geo-enrichment");
        assertThat(byField(map, "threat.indicator.type").origin()).isEqualTo("enrichment");
        assertThat(byField(map, "risk.score").origin()).isEqualTo("model");
    }

    @Test
    @DisplayName("returns one entry per schema field (derived from the live schema)")
    void oneEntryPerField() {
        when(huntService.getSchemaFields()).thenReturn(List.of(field("@timestamp"), field("source.ip")));
        assertThat(service.fieldProvenance()).hasSize(2);
    }

    @Test
    @DisplayName("raw fields carry no agent (nothing falsely marked AI-derived)")
    void rawHasNoAgent() {
        when(huntService.getSchemaFields()).thenReturn(List.of(field("host.name")));
        assertThat(service.fieldProvenance().get(0).agent()).isNull();
    }

    private static HuntFieldProvenanceDTO byField(List<HuntFieldProvenanceDTO> map, String f) {
        return map.stream().filter(p -> f.equals(p.field())).findFirst().orElseThrow();
    }
}
