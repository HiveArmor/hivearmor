package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PT-0 acceptance: the resolver PSEUDOCODE (see .plan/policy-templates/PT-0-RESOLVER-AND-DECISIONS.md
 * s2) checked against the 3 worked examples (Critical / UEBA / Other) using the checked-in
 * {@code association-example.json} fixture.
 *
 * <p>This is a DESIGN reference implementation living in the TEST tree only — it proves the
 * algorithm is correct and total. No resolver ships in PT-0 (that is PT-3). Keeping it as a test
 * means PT-3's real resolver has an executable spec to conform to.
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
class PolicyTemplateResolverSpecTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Minimal host model for the resolver examples. */
    private record Host(String id, Set<String> groups, Set<String> tags) {
        static Host inGroup(String g) {
            return new Host("h", Set.of(g), Set.of());
        }

        static Host bare() {
            return new Host("h", Set.of(), Set.of());
        }
    }

    private JsonNode table() throws Exception {
        try (var in = getClass().getResourceAsStream(
            "/policy-templates/fixtures/association-example.json")) {
            assertThat(in).isNotNull();
            return MAPPER.readTree(in);
        }
    }

    // --- reference resolver mirroring the pseudocode ---

    private boolean matches(JsonNode match, Host host) {
        if (match.has("any")) {
            return match.get("any").asBoolean();
        }
        if (match.has("group")) {
            return host.groups().contains(match.get("group").asText());
        }
        if (match.has("host")) {
            return host.id().equals(match.get("host").asText());
        }
        if (match.has("tag")) {
            return host.tags().contains(match.get("tag").asText());
        }
        return false;
    }

    private List<String> effective(JsonNode table, Host host) {
        List<JsonNode> rows = new ArrayList<>();
        table.get("rows").forEach(rows::add);
        // stable sort by rank ascending; ties keep array order
        rows.sort(Comparator.comparingInt(r -> r.get("rank").asInt()));
        for (JsonNode row : rows) {
            if (matches(row.get("match"), host)) {
                // union + de-dupe across templates[], stable order
                Set<String> out = new LinkedHashSet<>();
                row.get("templates").forEach(t -> out.add(t.asText()));
                return new ArrayList<>(out);
            }
        }
        throw new AssertionError("no matching row — any catch-all invariant violated");
    }

    // --- worked examples ---

    @Test
    void criticalHostResolvesToRank1Union() throws Exception {
        List<String> eff = effective(table(), Host.inGroup("Critical_Servers"));
        assertThat(eff).containsExactly("sec-log-full", "compliance-scan");
    }

    @Test
    void uebaHostResolvesToRank2Union() throws Exception {
        List<String> eff = effective(table(), Host.inGroup("UEBA_Workstations"));
        assertThat(eff).containsExactly("ueba-on", "sec-log-basic");
    }

    @Test
    void otherHostResolvesToAnyCatchAll() throws Exception {
        List<String> eff = effective(table(), Host.bare());
        assertThat(eff).containsExactly("sec-log-basic");
    }

    @Test
    void firstMatchWinsWhenHostMatchesMultipleRows() throws Exception {
        // A host in BOTH Critical and UEBA groups resolves to rank 1 only.
        Host both = new Host("h", Set.of("Critical_Servers", "UEBA_Workstations"), Set.of());
        assertThat(effective(table(), both)).containsExactly("sec-log-full", "compliance-scan");
    }

    @Test
    void tableSatisfiesMandatoryAnyCatchAllInvariant() throws Exception {
        boolean hasAny = false;
        for (JsonNode row : table().get("rows")) {
            JsonNode m = row.get("match");
            if (m.has("any") && m.get("any").asBoolean()) {
                hasAny = true;
            }
        }
        assertThat(hasAny).as("association table must contain an any catch-all").isTrue();
    }
}
