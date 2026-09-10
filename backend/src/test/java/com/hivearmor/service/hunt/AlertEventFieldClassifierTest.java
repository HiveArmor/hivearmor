package com.hivearmor.service.hunt;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the R4 additions to the classified event fields: server-generated, escaped KQL
 * filter fragments (includeQuery / excludeQuery) and the coarse section group.
 */
class AlertEventFieldClassifierTest {

    private AlertEventFieldClassifier classifier;

    @BeforeEach
    void setUp() {
        classifier = new AlertEventFieldClassifier();
    }

    private Map<String, Object> fieldFor(List<Map<String, Object>> fields, String key) {
        return fields.stream().filter(f -> key.equals(f.get("key"))).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("generates escaped filter-for / filter-out KQL fragments per field")
    void generatesFilterFragments() {
        Map<String, Object> doc = new LinkedHashMap<>();
        Map<String, Object> source = new LinkedHashMap<>();
        source.put("ip", "10.1.5.44");
        doc.put("source", source);

        List<Map<String, Object>> fields = classifier.classify(doc);
        Map<String, Object> ip = fieldFor(fields, "source.ip");

        assertThat(ip.get("includeQuery")).isEqualTo("source.ip:\"10.1.5.44\"");
        assertThat(ip.get("excludeQuery")).isEqualTo("NOT source.ip:\"10.1.5.44\"");
    }

    @Test
    @DisplayName("escapes backslash and double-quote inside the quoted term")
    void escapesStructuralCharacters() {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("message", "a\"b\\c");

        List<Map<String, Object>> fields = classifier.classify(doc);
        Map<String, Object> msg = fieldFor(fields, "message");

        // backslash -> \\, quote -> \"
        assertThat((String) msg.get("includeQuery")).isEqualTo("message:\"a\\\"b\\\\c\"");
    }

    @Test
    @DisplayName("empty values yield empty fragments so the UI can hide the actions")
    void emptyValueYieldsEmptyFragments() {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("note", "");

        List<Map<String, Object>> fields = classifier.classify(doc);
        Map<String, Object> note = fieldFor(fields, "note");

        assertThat(note.get("includeQuery")).isEqualTo("");
        assertThat(note.get("excludeQuery")).isEqualTo("");
    }

    @Test
    @DisplayName("assigns section groups from the ECS key prefix")
    void assignsSectionGroups() {
        Map<String, Object> doc = new LinkedHashMap<>();
        Map<String, Object> source = new LinkedHashMap<>();
        source.put("ip", "10.1.5.44");
        doc.put("source", source);
        Map<String, Object> host = new LinkedHashMap<>();
        host.put("name", "FIN-WKS-044");
        doc.put("host", host);
        Map<String, Object> proc = new LinkedHashMap<>();
        proc.put("name", "powershell.exe");
        doc.put("process", proc);
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("action", "network_connection");
        doc.put("event", event);

        List<Map<String, Object>> fields = classifier.classify(doc);

        assertThat(fieldFor(fields, "source.ip").get("group")).isEqualTo("Network");
        assertThat(fieldFor(fields, "host.name").get("group")).isEqualTo("Assets");
        assertThat(fieldFor(fields, "process.name").get("group")).isEqualTo("Process");
        assertThat(fieldFor(fields, "event.action").get("group")).isEqualTo("Detection");
    }
}
