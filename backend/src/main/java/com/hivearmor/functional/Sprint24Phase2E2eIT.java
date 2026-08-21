package com.hivearmor.functional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;
import org.springframework.test.context.ActiveProfiles;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Sprint 24 Phase 2 — ten-scenario functional E2E test.
 *
 * <p>Gated by Spring profile {@code functional} and Maven profile {@code functional}.
 * Excluded from the default {@code mvn test} selection — run with
 * {@code mvn test -Pfunctional}.
 *
 * <p>Scenarios covered by sub-tasks 5.2–5.7:
 * <ol>
 *   <li>Provision the {@code acme} tenant</li>
 *   <li>Inject 10 tagged agent events</li>
 *   <li>Verify {@code AcmeAlertIndex} isolation (≥ 1 doc with tenantPrefix=acme)</li>
 *   <li>Verify {@code GlobalAlertIndex} zero contamination (0 docs with tenantPrefix=acme)</li>
 *   <li>Compliance scoping under tenant scope</li>
 *   <li>Download and inspect aggregate XLSX</li>
 *   <li>Parse workbook — sheet 0 is Summary, acme sheet exists</li>
 *   <li>Invite tenant user and list members</li>
 *   <li>MSSP overview count</li>
 *   <li>Production builds</li>
 * </ol>
 *
 * <p>Requirements: 13.1, 18.4, 19.7
 * <p>Sprint 24 — S24-T04.
 */
@ActiveProfiles("functional")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class Sprint24Phase2E2eIT {

    // -------------------------------------------------------------------------
    // Configuration — loaded from system properties or environment variables
    // -------------------------------------------------------------------------

    private static final String BACKEND_URL =
            System.getProperty("e2e.backend.url",
            System.getenv().getOrDefault("E2E_BACKEND_URL", "http://localhost:8088"));

    private static final String OPENSEARCH_URL =
            System.getProperty("e2e.opensearch.url",
            System.getenv().getOrDefault("E2E_OPENSEARCH_URL", "http://localhost:9200"));

    private static final int BULK_REFRESH_TIMEOUT_SECONDS = 30;

    // -------------------------------------------------------------------------
    // Shared state — populated by scenario 1 and consumed by subsequent scenarios
    // -------------------------------------------------------------------------

    /** JWT for the MSSP_ADMIN user, obtained via /api/authenticate in @BeforeAll. */
    protected static String msspAdminToken;

    /** {@code ha_client.id} for the acme tenant, set in scenario 1. */
    protected static Long acmeClientId;

    // -------------------------------------------------------------------------
    // HTTP helpers
    // -------------------------------------------------------------------------

    protected static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    protected static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * Performs an HTTP POST with a JSON body and an Authorization header.
     *
     * <p>The JWT is transmitted in the {@code Authorization: Bearer <token>}
     * header only — never in the URL or as a query parameter (NoJwtInUrlInvariant,
     * Requirement 19.7).
     *
     * @param path  relative path under {@link #BACKEND_URL}, e.g. {@code "/api/ha-mssp/tenants"}
     * @param token bearer token; placed in header, never in URL
     * @param body  JSON request body
     * @return the HTTP response
     */
    protected static HttpResponse<String> httpPost(String path, String token, String body)
            throws IOException, InterruptedException {
        assertNoJwtInUrl(path, token);
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(BACKEND_URL + path))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null && !token.isBlank()) {
            builder.header("Authorization", "Bearer " + token);
        }
        return HTTP_CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    /**
     * Performs an HTTP GET with an Authorization header.
     *
     * <p>The JWT is transmitted in the {@code Authorization: Bearer <token>}
     * header only — never in the URL (Requirement 19.7).
     *
     * @param path  relative path under {@link #BACKEND_URL}
     * @param token bearer token; placed in header, never in URL
     * @return the HTTP response
     */
    protected static HttpResponse<String> httpGet(String path, String token)
            throws IOException, InterruptedException {
        assertNoJwtInUrl(path, token);
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(BACKEND_URL + path))
                .timeout(Duration.ofSeconds(30))
                .GET();
        if (token != null && !token.isBlank()) {
            builder.header("Authorization", "Bearer " + token);
        }
        return HTTP_CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    /**
     * Performs an HTTP GET that returns the response body as raw bytes
     * (used for XLSX download).
     */
    protected static HttpResponse<byte[]> httpGetBytes(String path, String token)
            throws IOException, InterruptedException {
        assertNoJwtInUrl(path, token);
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(BACKEND_URL + path))
                .timeout(Duration.ofSeconds(30))
                .GET();
        if (token != null && !token.isBlank()) {
            builder.header("Authorization", "Bearer " + token);
        }
        return HTTP_CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    /**
     * Asserts that the request URL does not contain the JWT value.
     * Satisfies the NoJwtInUrlAcrossSprint invariant (Requirement 19.7).
     */
    private static void assertNoJwtInUrl(String path, String token) {
        if (token != null && !token.isBlank() && path.contains(token)) {
            throw new AssertionError(
                    "NoJwtInUrlInvariant violated: JWT token appears in URL path: " + path);
        }
    }

    /**
     * Parses a JSON response body into a {@link JsonNode}.
     *
     * @param response the HTTP response whose body is a JSON string
     * @return the parsed {@link JsonNode}
     */
    protected static JsonNode parseJson(HttpResponse<String> response) throws IOException {
        return OBJECT_MAPPER.readTree(response.body());
    }

    /**
     * Waits up to {@link #BULK_REFRESH_TIMEOUT_SECONDS} seconds for an OpenSearch
     * index to receive at least one document.  Polls every 2 seconds.
     *
     * @param indexName the exact OpenSearch index name to poll
     * @param minDocs   the minimum document count before this method returns
     * @throws InterruptedException if the thread is interrupted while waiting
     */
    protected static void waitForOpenSearchRefresh(String indexName, long minDocs)
            throws IOException, InterruptedException {
        long deadline = System.currentTimeMillis() + BULK_REFRESH_TIMEOUT_SECONDS * 1_000L;
        while (System.currentTimeMillis() < deadline) {
            long count = countOpenSearchDocs(indexName);
            if (count >= minDocs) {
                return;
            }
            Thread.sleep(2_000);
        }
        throw new AssertionError(
                "Timed out waiting for OpenSearch index '" + indexName +
                "' to have at least " + minDocs + " document(s).");
    }

    /**
     * Counts the total number of documents in the given OpenSearch index.
     *
     * @param indexName the exact index name to count
     * @return document count, or {@code 0} if the index does not exist
     */
    protected static long countOpenSearchDocs(String indexName)
            throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(OPENSEARCH_URL + "/" + indexName + "/_count"))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 404) {
            return 0L;
        }
        JsonNode body = OBJECT_MAPPER.readTree(response.body());
        return body.path("count").asLong(0L);
    }
}
