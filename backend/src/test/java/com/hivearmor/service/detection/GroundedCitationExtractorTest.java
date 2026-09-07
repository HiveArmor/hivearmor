package com.hivearmor.service.detection;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class GroundedCitationExtractorTest {

    @Test
    void extract_usesExplicitAlertIdAndMitreFromText() {
        List<String> citations = GroundedCitationExtractor.extract(
            "abc-123",
            "Triage T1059.001 on this host",
            "alert id: evt-99",
            "Likely T1059.001 and T1021"
        );
        assertThat(citations).contains("alert:abc-123", "alert:evt-99", "mitre:T1059.001", "mitre:T1021");
    }

    @Test
    void extract_doesNotInventWhenEmpty() {
        assertThat(GroundedCitationExtractor.extract(null, "no techniques here", null, "advisory only"))
            .isEmpty();
    }

    @Test
    void fromAlertIds_groundedOnly() {
        List<String> citations = GroundedCitationExtractor.fromAlertIds(
            List.of("a1", "a2"),
            "Uses T1047");
        assertThat(citations).containsExactly("alert:a1", "alert:a2", "mitre:T1047");
    }
}
