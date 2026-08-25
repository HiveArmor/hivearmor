package com.hivearmor.web.rest;

import com.hivearmor.opensearch.OpenSearch;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

/**
 * F14 — GET /api/ha-audit-log/export is ADMIN-scoped (class PreAuthorize),
 * reuses list filters, and never emits payload/secret fields.
 */
@ExtendWith(MockitoExtension.class)
class HaAuditLogResourceExportTest {

    @Mock
    private OpensearchClientBuilder osClient;

    @Mock
    private OpenSearch openSearch;

    private HaAuditLogResource resource;
    private final UserDetails caller = User.withUsername("admin")
        .password("unused")
        .authorities("ROLE_ADMIN")
        .build();

    @BeforeEach
    void setUp() {
        resource = new HaAuditLogResource(osClient);
    }

    @Test
    void classRequiresAdminAuthority() {
        PreAuthorize pre = HaAuditLogResource.class.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).contains("ROLE_ADMIN");
    }

    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void exportReturnsNdjsonWithoutPayloadOrSecretKeys() throws Exception {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("id", "evt-1");
        raw.put("@timestamp", "2026-08-23T06:00:00Z");
        raw.put("user", "admin");
        raw.put("type", "SETTINGS_CHANGE");
        raw.put("resourceType", "settings");
        raw.put("resourceId", "security");
        raw.put("message", "MFA required toggled");
        raw.put("ipAddress", "10.0.0.8");
        Map<String, Object> secretPayload = new LinkedHashMap<>();
        secretPayload.put("password", "super-secret");
        secretPayload.put("apiKey", "ak_live_xxx");
        secretPayload.put("token", "jwt-secret");
        raw.put("payload", secretPayload);

        // opensearch-java Hit/SearchResponse methods are final — use builders, not mocks.
        SearchResponse<Map> searchResponse = SearchResponse.searchResponseOf(r -> r
            .took(1)
            .timedOut(false)
            .shards(s -> s.total(1).successful(1).failed(0))
            .hits(h -> h
                .total(t -> t.value(1L).relation(TotalHitsRelation.Eq))
                .hits(List.of(Hit.of(hit -> hit
                    .index("v3-hive-backend-logs")
                    .id("evt-1")
                    .source((Map) raw))))));

        when(osClient.getClient()).thenReturn(openSearch);
        doReturn(searchResponse).when(openSearch).search(any(SearchRequest.class), any(Class.class));

        ResponseEntity<byte[]> response = resource.exportAuditLog(null, null, null, null, caller);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getContentType())
            .hasToString("application/x-ndjson");
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("1");
        assertThat(response.getHeaders().getFirst("X-Export-Row-Count")).isEqualTo("1");
        assertThat(response.getHeaders().getFirst("X-Export-Truncated")).isEqualTo("false");
        assertThat(response.getHeaders().getFirst("X-Export-Actor")).isEqualTo("admin");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
            .contains("ha-audit-log-")
            .contains(".ndjson");

        String body = new String(response.getBody(), StandardCharsets.UTF_8);
        assertThat(body).contains("SETTINGS_CHANGE");
        assertThat(body).contains("MFA required toggled");
        assertThat(body).contains("\"actor\":\"admin\"");
        assertThat(body).doesNotContain("payload");
        assertThat(body).doesNotContain("super-secret");
        assertThat(body).doesNotContain("ak_live_xxx");
        assertThat(body).doesNotContain("jwt-secret");
        assertThat(body).doesNotContain("password");
        assertThat(body).doesNotContain("apiKey");
    }

    @Test
    void toAuditEntryUsesSourceAsActorWhenUserMissing() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("@timestamp", "2026-08-25T12:00:00Z");
        raw.put("source", "PANEL");
        raw.put("type", "INFO");
        raw.put("message", "boot");

        Map<String, Object> entry = resource.toAuditEntry(raw);

        assertThat(entry.get("actor")).isEqualTo("PANEL");
        assertThat(entry.get("actionType")).isEqualTo("INFO");
    }

    @Test
    void auditIndexMatchesApplicationEventWriter() {
        assertThat(HaAuditLogResource.AUDIT_INDEX).isEqualTo("v3-hive-backend-logs");
    }
}
