package com.hivearmor.service.intelligence;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class IntelligenceFindingParserTest {

    @Test
    void parse_structuredAnswer_splitsFactsAndInferences() {
        String answer = """
            Facts:
            - IP 1.2.3.4 seen in feed X
            - Domain evil.example.com tagged malicious

            Inference:
            - Likely C2 beaconing based on frequency
            - Recommend blocking at perimeter

            Missing evidence:
            - Endpoint telemetry for host contact
            """;

        IntelligenceFindingParser.ParsedFinding parsed = IntelligenceFindingParser.parse(answer);

        assertThat(parsed.facts()).hasSize(2);
        assertThat(parsed.facts().get(0).text()).contains("1.2.3.4");
        assertThat(parsed.inferences()).hasSize(2);
        assertThat(parsed.missingEvidence()).hasSize(1);
    }

    @Test
    void parse_plainAnswer_fallsBackToSingleInference() {
        IntelligenceFindingParser.ParsedFinding parsed =
            IntelligenceFindingParser.parse("Suspicious activity observed.");

        assertThat(parsed.facts()).isEmpty();
        assertThat(parsed.inferences()).hasSize(1);
        assertThat(parsed.inferences().get(0).text()).isEqualTo("Suspicious activity observed.");
    }

    @Test
    void parse_emptyAnswer_returnsEmptySections() {
        IntelligenceFindingParser.ParsedFinding parsed = IntelligenceFindingParser.parse("   ");
        assertThat(parsed.facts()).isEmpty();
        assertThat(parsed.inferences()).isEmpty();
    }
}
