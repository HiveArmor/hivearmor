package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PT-3 — PolicyTemplateMerger applies the PT-0 §3 section-merge rules: lists append + de-dupe
 * (stable), scalars last-wins, scans whole-object last-wins.
 */
class PolicyTemplateMergerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final PolicyTemplateMerger merger = new PolicyTemplateMerger(mapper);

    private JsonNode merge(String... cfgs) throws Exception {
        return mapper.readTree(merger.merge(List.of(cfgs)));
    }

    @Test
    void monitorItemsDedupeByMetricLaterIntervalWins() throws Exception {
        String a = "{\"monitor\":{\"items\":[{\"metric\":\"cpu\",\"intervalSec\":300},{\"metric\":\"mem\",\"intervalSec\":300}]}}";
        String b = "{\"monitor\":{\"items\":[{\"metric\":\"cpu\",\"intervalSec\":60}]}}";
        JsonNode m = merge(a, b);
        JsonNode items = m.get("monitor").get("items");
        assertThat(items).hasSize(2);
        // cpu keeps first position, interval updated to later template's 60
        assertThat(items.get(0).get("metric").asText()).isEqualTo("cpu");
        assertThat(items.get(0).get("intervalSec").asInt()).isEqualTo(60);
        assertThat(items.get(1).get("metric").asText()).isEqualTo("mem");
    }

    @Test
    void eventLogsDedupeByTypeAndChannel() throws Exception {
        String a = "{\"event\":{\"eventLogs\":[{\"type\":\"Security\",\"include\":\"ALL\"}]}}";
        String b = "{\"event\":{\"eventLogs\":[{\"type\":\"Security\",\"include\":\"4624,4625\"},{\"type\":\"System\",\"include\":\"ALL\"}]}}";
        JsonNode logs = merge(a, b).get("event").get("eventLogs");
        assertThat(logs).hasSize(2);
        assertThat(logs.get(0).get("type").asText()).isEqualTo("Security");
        assertThat(logs.get(0).get("include").asText()).isEqualTo("4624,4625"); // later wins
        assertThat(logs.get(1).get("type").asText()).isEqualTo("System");
    }

    @Test
    void eventFileLogScalarsLastWins() throws Exception {
        String a = "{\"event\":{\"fileLog\":{\"iis\":true,\"dhcp\":false}}}";
        String b = "{\"event\":{\"fileLog\":{\"iis\":false}}}";
        JsonNode fl = merge(a, b).get("event").get("fileLog");
        assertThat(fl.get("iis").asBoolean()).isFalse(); // later wins, not OR
        assertThat(fl.get("dhcp").asBoolean()).isFalse();
    }

    @Test
    void fimRulesDedupeByPathModeLastWins() throws Exception {
        String a = "{\"fim\":{\"mode\":\"merge\",\"rules\":[{\"path\":\"/etc\",\"recursive\":true}]}}";
        String b = "{\"fim\":{\"mode\":\"replace\",\"rules\":[{\"path\":\"/etc\",\"recursive\":false},{\"path\":\"/var\",\"recursive\":true}]}}";
        JsonNode fim = merge(a, b).get("fim");
        assertThat(fim.get("mode").asText()).isEqualTo("replace"); // last wins
        JsonNode rules = fim.get("rules");
        assertThat(rules).hasSize(2);
        assertThat(rules.get(0).get("path").asText()).isEqualTo("/etc");
        assertThat(rules.get(0).get("recursive").asBoolean()).isFalse(); // later wins
        assertThat(rules.get(1).get("path").asText()).isEqualTo("/var");
    }

    @Test
    void scriptAndOsqueryDedupeScalars() throws Exception {
        String a = "{\"script\":{\"powershell\":[\"Get-Process\"]},\"osquery\":{\"queries\":[\"q1\"]}}";
        String b = "{\"script\":{\"powershell\":[\"Get-Process\",\"Get-Service\"]},\"osquery\":{\"queries\":[\"q1\",\"q2\"]}}";
        JsonNode m = merge(a, b);
        assertThat(m.get("script").get("powershell")).hasSize(2);
        assertThat(m.get("osquery").get("queries")).hasSize(2);
    }

    @Test
    void certificateDedupeByStore() throws Exception {
        String a = "{\"certificate\":[{\"store\":\"My\",\"expiring\":false}]}";
        String b = "{\"certificate\":[{\"store\":\"My\",\"expiring\":true},{\"store\":\"Root\",\"add\":true}]}";
        JsonNode certs = merge(a, b).get("certificate");
        assertThat(certs).hasSize(2);
        assertThat(certs.get(0).get("store").asText()).isEqualTo("My");
        assertThat(certs.get(0).get("expiring").asBoolean()).isTrue(); // later flags win
    }

    @Test
    void scansAreWholeObjectLastWins() throws Exception {
        String a = "{\"scans\":{\"cis\":{\"enabled\":true,\"profile\":\"lvl1\",\"cronOrInterval\":\"0 3 * * *\"}}}";
        String b = "{\"scans\":{\"cis\":{\"enabled\":true,\"profile\":\"lvl2\"}}}";
        JsonNode cis = merge(a, b).get("scans").get("cis");
        assertThat(cis.get("profile").asText()).isEqualTo("lvl2");
        // whole-object replace: the prior cronOrInterval is NOT partially merged in
        assertThat(cis.has("cronOrInterval")).isFalse();
    }

    @Test
    void changeRegistryDedupeByRootKeyInstalledSoftwareLastWins() throws Exception {
        String a = "{\"change\":{\"registry\":[{\"rootKey\":\"HKLM\\\\A\"}],\"installedSoftware\":true}}";
        String b = "{\"change\":{\"registry\":[{\"rootKey\":\"HKLM\\\\A\"},{\"rootKey\":\"HKLM\\\\B\"}],\"installedSoftware\":false}}";
        JsonNode change = merge(a, b).get("change");
        assertThat(change.get("registry")).hasSize(2);
        assertThat(change.get("installedSoftware").asBoolean()).isFalse();
    }

    @Test
    void singleConfigRoundTrips() throws Exception {
        String only = "{\"fim\":{\"mode\":\"merge\",\"rules\":[{\"path\":\"/etc\"}]}}";
        JsonNode m = merge(only);
        assertThat(m.get("fim").get("rules")).hasSize(1);
        assertThat(m.get("fim").get("mode").asText()).isEqualTo("merge");
    }

    @Test
    void emptyMergeIsEmptyObject() throws Exception {
        assertThat(merge().isObject()).isTrue();
        assertThat(merge().isEmpty()).isTrue();
    }
}
