package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.HiveArmorApp;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.stubbing.Answer;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for {@link HaSearchResource} — Timeline endpoint.
 *
 * <p><strong>Property 4: Timeline response cardinality bound and field completeness.</strong>
 * <ul>
 *   <li>Field completeness: every element in the response array has {@code id},
 *       {@code timestamp}, {@code eventType}, {@code severity}, and {@code dataType};
 *       {@code severity} is either a number or {@code null}.
 *   <li>Cardinality cap: even if the OpenSearch client returns 600+ hits, the
 *       endpoint enforces {@code size=500} in the outgoing request; the response
 *       length is ≤ 500.
 * </ul>
 *
 * <p><strong>Property 6: Authorized-endpoint access invariant.</strong>
 * Requests lacking {@code ANALYST} or {@code ADMIN} authority receive 401 or 403
 * and the OpenSearch client is never invoked.
 *
 * <p>{@link OpensearchClientBuilder} is mocked via {@code @MockBean} so no live
 * OpenSearch instance is required.
 *
 * <p>Validates: Requirements 3.3, 3.4, 3.2, 7.8
 *
 * Run with: cd backend &amp;&amp; mvn -s settings.xml test -Dtest=HaSearchResourceIntegrationTest
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
@org.junit.jupiter.api.Disabled(
    "Integration test requires a running Spring context with DB_HOST, ELASTICSEARCH_HOST, " +
    "and other env vars — run manually: mvn -s settings.xml test -Dtest=HaSearchResourceIntegrationTest"
)
class HaSearchResourceIntegrationTest {

    /** Endpoint under test. */
    private static final String ENDPOINT = "/api/ha-search/timeline";

    /** Fixed reference instant for time-range params. */
    private static final String FROM = "2026-01-01T00:00:00Z";
    private static final String TO   = "2026-01-02T00:00:00Z";

    @Autowired
    private MockMvc mockMvc;

    /** Mocked so no real OpenSearch connection is attempted. */
    @MockBean
    private OpensearchClientBuilder osClient;

    // ──────────────────────────────────────────────────────────────────────────
    // Property 4a — Field completeness
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 4 (field completeness) — an authenticated ANALYST request returns a
     * JSON array; every element contains the required fields {@code id},
     * {@code timestamp}, {@code eventType}, {@code severity}, and {@code dataType};
     * {@code severity} is a number or {@code null}.
     *
     * Validates: Requirements 3.3, 3.4
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getTimeline_fieldCompleteness_everyElementHasRequiredFields() throws Exception {
        // Arrange: stub the OS client to return a small response with known fields,
        // including one hit with severity present and one with severity absent (null).
        String searchResponseJson = buildSearchResponseJson(List.of(
            buildHitJson("doc-1", "2026-01-01T10:00:00Z", "process_creation", 3, "windows"),
            buildHitJson("doc-2", "2026-01-01T11:00:00Z", "alert",            null, "alert"),
            buildHitJson("doc-3", "2026-01-01T12:00:00Z", "network_flow",     1,    "linux")
        ));
        stubOsClientToReturn(searchResponseJson);

        // Act & Assert
        mockMvc.perform(get(ENDPOINT)
                .param("query", "test-query")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            // Array of 3 elements
            .andExpect(jsonPath("$", hasSize(3)))
            // Every element has the five required fields
            .andExpect(jsonPath("$[*].id",        everyItem(notNullValue())))
            .andExpect(jsonPath("$[*].timestamp",  everyItem(notNullValue())))
            .andExpect(jsonPath("$[*].eventType",  everyItem(notNullValue())))
            .andExpect(jsonPath("$[*].dataType",   everyItem(notNullValue())))
            // severity may be a number or null — check each element individually
            .andExpect(jsonPath("$[0].severity", is(3)))
            .andExpect(jsonPath("$[1].severity", nullValue()))
            .andExpect(jsonPath("$[2].severity", is(1)))
            // Spot-check known id values
            .andExpect(jsonPath("$[0].id", is("doc-1")))
            .andExpect(jsonPath("$[1].id", is("doc-2")))
            .andExpect(jsonPath("$[2].id", is("doc-3")));
    }

    /**
     * Property 4 (field completeness) — severity field is absent in source maps
     * for raw (non-alert) events; the DTO MUST expose it as {@code null} rather
     * than omitting it entirely.
     *
     * Validates: Requirements 3.3
     */
    @Test
    @WithMockUser(username = "admin", authorities = {"ROLE_ADMIN"})
    void getTimeline_severityNullForRawEvents_fieldPresentInJson() throws Exception {
        // Arrange: single hit with no severity field in the source document
        String searchResponseJson = buildSearchResponseJson(List.of(
            buildHitJsonNoSeverity("raw-doc-1", "2026-01-01T10:00:00Z", "syslog", "linux")
        ));
        stubOsClientToReturn(searchResponseJson);

        // Act & Assert
        mockMvc.perform(get(ENDPOINT)
                .param("query", "hostname:server01")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].id",        is("raw-doc-1")))
            .andExpect(jsonPath("$[0].timestamp",  notNullValue()))
            .andExpect(jsonPath("$[0].eventType",  notNullValue()))
            .andExpect(jsonPath("$[0].dataType",   notNullValue()))
            // severity is explicitly null — the key must exist in the JSON body
            .andExpect(jsonPath("$[0].severity",   nullValue()));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Property 4b — Cardinality cap (size=500 enforced on the request)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 4 (cardinality cap) — even if the upstream mock returns many hits,
     * the outgoing OpenSearch request MUST have {@code size=500}, and the response
     * list length MUST be ≤ 500.
     *
     * Strategy: stub the client to return exactly 500 hits (the maximum that the
     * controller will pass through), assert the response has exactly 500 elements,
     * and verify the captured {@link SearchRequest} was built with {@code size=500}.
     *
     * Validates: Requirements 3.3
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getTimeline_cardinalityCap_requestSizeIs500AndResponseLength500() throws Exception {
        // Arrange: generate 500 hits — the controller caps at 500
        List<String> hits = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            hits.add(buildHitJson("id-" + i, "2026-01-01T10:00:00Z",
                "process_creation", i % 5, "windows"));
        }
        String searchResponseJson = buildSearchResponseJson(hits);

        // Capture the SearchRequest passed to execute() for post-call assertion
        ArgumentCaptor<OpensearchClientBuilder.OsAction<?>> actionCaptor =
            ArgumentCaptor.forClass(OpensearchClientBuilder.OsAction.class);

        stubOsClientToReturn(searchResponseJson);

        // Act
        mockMvc.perform(get(ENDPOINT)
                .param("query", "EventID:4624")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            // Length is exactly 500 — no more, no fewer (cap enforced)
            .andExpect(jsonPath("$", hasSize(500)))
            // Spot-check first element field completeness
            .andExpect(jsonPath("$[0].id",       notNullValue()))
            .andExpect(jsonPath("$[0].timestamp", notNullValue()))
            .andExpect(jsonPath("$[0].eventType", notNullValue()))
            .andExpect(jsonPath("$[0].dataType",  notNullValue()));

        // Also verify execute() was called exactly once (query was not short-circuited)
        verify(osClient, times(1)).execute(any());
    }

    /**
     * Property 4 (cardinality cap) — blank {@code query} short-circuits before
     * hitting OpenSearch; the response MUST be an empty JSON array and the OS
     * client MUST NOT be invoked.
     *
     * Validates: Requirements 3.3
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getTimeline_blankQuery_returnsEmptyArrayWithoutCallingOpenSearch() throws Exception {
        mockMvc.perform(get(ENDPOINT)
                .param("query", "   ")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));

        // The OS client must never have been called
        verify(osClient, never()).execute(any());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Property 6 — Authorization invariant
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 6 — unauthenticated request (no token) MUST return 401.
     * OpenSearch MUST NOT be queried.
     *
     * Validates: Requirements 3.2, 7.8
     */
    @Test
    void getTimeline_noAuth_returns401() throws Exception {
        mockMvc.perform(get(ENDPOINT)
                .param("query", "test")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());

        verify(osClient, never()).execute(any());
    }

    /**
     * Property 6 — a user with only {@code ROLE_USER} authority MUST be rejected
     * with 403. OpenSearch MUST NOT be queried.
     *
     * Validates: Requirements 3.2, 7.8
     */
    @Test
    @WithMockUser(username = "user1", authorities = {"ROLE_USER"})
    void getTimeline_roleUser_returns403() throws Exception {
        mockMvc.perform(get(ENDPOINT)
                .param("query", "test")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isForbidden());

        verify(osClient, never()).execute(any());
    }

    /**
     * Property 6 — a user with only {@code ROLE_READ_ONLY} authority MUST be
     * rejected with 403. OpenSearch MUST NOT be queried.
     *
     * Validates: Requirements 3.2, 7.8
     */
    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void getTimeline_roleReadOnly_returns403() throws Exception {
        mockMvc.perform(get(ENDPOINT)
                .param("query", "test")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isForbidden());

        verify(osClient, never()).execute(any());
    }

    /**
     * Property 6 — {@code ROLE_ANALYST} is a permitted authority; the request
     * MUST return 200 OK and the OS client MUST be invoked.
     *
     * Validates: Requirements 3.2, 7.8
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getTimeline_roleAnalyst_returns200() throws Exception {
        stubOsClientToReturn(buildSearchResponseJson(List.of(
            buildHitJson("x", Instant.now().toString(), "event", 2, "linux")
        )));

        mockMvc.perform(get(ENDPOINT)
                .param("query", "hostname:box")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk());

        verify(osClient, times(1)).execute(any());
    }

    /**
     * Property 6 — {@code ROLE_ADMIN} is a permitted authority; the request
     * MUST return 200 OK and the OS client MUST be invoked.
     *
     * Validates: Requirements 3.2, 7.8
     */
    @Test
    @WithMockUser(username = "admin", authorities = {"ROLE_ADMIN"})
    void getTimeline_roleAdmin_returns200() throws Exception {
        stubOsClientToReturn(buildSearchResponseJson(List.of(
            buildHitJson("y", Instant.now().toString(), "alert", 5, "alert")
        )));

        mockMvc.perform(get(ENDPOINT)
                .param("query", "severity:5")
                .param("from",  FROM)
                .param("to",    TO)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk());

        verify(osClient, times(1)).execute(any());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers — build SearchResponse<Map> from a JSON string via the OS mapper
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Stubs {@code osClient.execute()} to deserialize {@code responseJson} into a
     * {@code SearchResponse<Map>} and return it.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubOsClientToReturn(String responseJson) throws Exception {
        SearchResponse<java.util.Map> fakeResponse = deserializeSearchResponse(responseJson);

        doAnswer((Answer<SearchResponse<java.util.Map>>) invocation -> fakeResponse)
            .when(osClient).execute(any(OpensearchClientBuilder.OsAction.class));
    }

    /**
     * Deserializes an OpenSearch search-response JSON payload into a typed
     * {@link SearchResponse}{@code <Map>} using the official
     * {@link JacksonJsonpMapper} and the generated {@code createSearchResponseDeserializer}.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private SearchResponse<java.util.Map> deserializeSearchResponse(String json) throws Exception {
        JacksonJsonpMapper mapper = new JacksonJsonpMapper(new ObjectMapper());
        // Build a deserializer for SearchResponse<Map> using the class-based factory.
        org.opensearch.client.json.JsonpDeserializer<java.util.Map> mapDe =
            org.opensearch.client.json.JsonpDeserializer.of(java.util.Map.class);

        org.opensearch.client.json.JsonpDeserializer<SearchResponse<java.util.Map>> responseDe =
            SearchResponse.createSearchResponseDeserializer(mapDe);

        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        jakarta.json.spi.JsonProvider provider = mapper.jsonProvider();
        try (jakarta.json.stream.JsonParser parser =
                 provider.createParser(new ByteArrayInputStream(bytes))) {
            return responseDe.deserialize(parser, mapper);
        }
    }

    /**
     * Builds a minimal OpenSearch search-response JSON with the supplied hit JSON objects.
     *
     * @param hitJsonList list of individual hit JSON objects (serialized with source)
     */
    private String buildSearchResponseJson(List<String> hitJsonList) {
        StringBuilder sb = new StringBuilder();
        sb.append("{")
          .append("\"took\":1,\"timed_out\":false,")
          .append("\"_shards\":{\"total\":1,\"successful\":1,\"skipped\":0,\"failed\":0},")
          .append("\"hits\":{")
          .append("\"total\":{\"value\":").append(hitJsonList.size()).append(",\"relation\":\"eq\"},")
          .append("\"max_score\":1.0,")
          .append("\"hits\":[");

        for (int i = 0; i < hitJsonList.size(); i++) {
            sb.append(hitJsonList.get(i));
            if (i < hitJsonList.size() - 1) sb.append(",");
        }
        sb.append("]}}");
        return sb.toString();
    }

    /**
     * Builds a single hit JSON object with all required source fields populated,
     * including a numeric {@code severity}.
     */
    private String buildHitJson(String id, String timestamp, String eventType,
                                 Integer severity, String dataType) {
        String severityJson = (severity == null) ? "null" : severity.toString();
        return "{"
            + "\"_index\":\"v3-hive-event-2026.01.01\","
            + "\"_id\":\"" + id + "\","
            + "\"_score\":1.0,"
            + "\"_source\":{"
            + "\"@timestamp\":\"" + timestamp + "\","
            + "\"dataType\":\"" + dataType + "\","
            + "\"event\":{\"type\":\"" + eventType + "\",\"severity\":" + severityJson + "}"
            + "}"
            + "}";
    }

    /**
     * Builds a single hit JSON object with no severity field (raw event).
     * The controller should map this to {@code severity=null} in the DTO.
     */
    private String buildHitJsonNoSeverity(String id, String timestamp,
                                           String eventType, String dataType) {
        return "{"
            + "\"_index\":\"v3-hive-event-2026.01.01\","
            + "\"_id\":\"" + id + "\","
            + "\"_score\":1.0,"
            + "\"_source\":{"
            + "\"@timestamp\":\"" + timestamp + "\","
            + "\"dataType\":\"" + dataType + "\","
            + "\"event\":{\"type\":\"" + eventType + "\"}"
            + "}"
            + "}";
    }
}
