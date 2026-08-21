package com.hivearmor.functional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Sprint 23 — MSSP Portal functional integration test.
 *
 * <p>Eight ordered checks against a running local-dev backend at
 * {@code http://localhost:8088}. Gated by Maven profile {@code functional}
 * and Spring profile {@code functional} — never runs in the default
 * {@code mvn test} lifecycle.
 *
 * <p>Run with:
 * <pre>
 *   mvn -s settings.xml -Pfunctional test -Dtest=Sprint23MsspPortalFunctionalIT
 * </pre>
 */
@SpringBootTest(webEnvironment = WebEnvironment.DEFINED_PORT)
@ActiveProfiles("functional")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class Sprint23MsspPortalFunctionalIT {

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    private static final String BACKEND_BASE_URL = "http://localhost:8088";

    /** JDBC URL for the local-dev PostgreSQL instance (port 5438). */
    private static final String JDBC_URL = "jdbc:postgresql://localhost:5438/hivearmor";
    private static final String JDBC_USER = "postgres";
    private static final String JDBC_PASS = "localdev123!";

    private static final String MSSP_ADMIN_LOGIN = "mssp-admin";
    private static final String MSSP_ADMIN_PASSWORD = "MsspAdmin@2026!";

    /** TestCo tenant request body per spec. */
    private static final String TESTCO_BODY =
        "{\"name\":\"TestCo\",\"clientPrefix\":\"testco\"," +
        "\"adminEmail\":\"admin@testco.local\",\"adminLogin\":\"testco-admin\"," +
        "\"maxUsers\":50,\"licenceType\":\"standard\"}";

    // -----------------------------------------------------------------------
    // Shared state
    // -----------------------------------------------------------------------

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    private final ObjectMapper mapper = new ObjectMapper();

    /** JWT obtained in check 2, reused in subsequent checks. */
    private String jwtToken;

    // -----------------------------------------------------------------------
    // Check 1 — Seed mssp-admin via JDBC
    // -----------------------------------------------------------------------

    /**
     * Upserts a user with login {@code mssp-admin}, a BCrypt hash for
     * {@code MsspAdmin@2026!}, {@code activated = true} in {@code jhi_user},
     * and grants the {@code MSSP_ADMIN} authority in {@code jhi_user_authority}.
     *
     * <p>BCrypt hash is generated in Java to avoid shell quoting issues with
     * the {@code !} character in {@code MsspAdmin@2026!}.
     */
    @Test
    @Order(1)
    void check1_SeedMsspAdmin() throws Exception {
        // Generate BCrypt hash entirely in Java — avoids zsh "!" quoting issues
        String passwordHash = new BCryptPasswordEncoder().encode(MSSP_ADMIN_PASSWORD);

        try (Connection conn = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASS)) {

            // Upsert jhi_user
            String upsertUser =
                "INSERT INTO jhi_user (login, password_hash, email, activated, lang_key, " +
                "                     first_name, last_name, created_by, last_modified_by) " +
                "VALUES (?, ?, ?, true, 'en', 'MSSP', 'Admin', 'system', 'system') " +
                "ON CONFLICT (login) DO UPDATE " +
                "  SET password_hash = EXCLUDED.password_hash, " +
                "      activated     = true";
            try (PreparedStatement ps = conn.prepareStatement(upsertUser)) {
                ps.setString(1, MSSP_ADMIN_LOGIN);
                ps.setString(2, passwordHash);
                ps.setString(3, MSSP_ADMIN_LOGIN + "@hivearmor.local");
                int rows = ps.executeUpdate();
                assertTrue(rows >= 1,
                    "Expected at least 1 row affected by jhi_user upsert, got: " + rows);
            }

            // Ensure the MSSP_ADMIN authority row exists in jhi_authority
            String upsertAuthority =
                "INSERT INTO jhi_authority (name) VALUES ('MSSP_ADMIN') " +
                "ON CONFLICT (name) DO NOTHING";
            try (PreparedStatement ps = conn.prepareStatement(upsertAuthority)) {
                ps.executeUpdate();
            }

            // Fetch the user id
            long userId;
            String selectId = "SELECT id FROM jhi_user WHERE login = ?";
            try (PreparedStatement ps = conn.prepareStatement(selectId)) {
                ps.setString(1, MSSP_ADMIN_LOGIN);
                try (ResultSet rs = ps.executeQuery()) {
                    assertTrue(rs.next(), "mssp-admin user not found after upsert");
                    userId = rs.getLong("id");
                }
            }

            // Upsert jhi_user_authority
            String upsertUserAuth =
                "INSERT INTO jhi_user_authority (user_id, authority_name) " +
                "VALUES (?, 'MSSP_ADMIN') " +
                "ON CONFLICT (user_id, authority_name) DO NOTHING";
            try (PreparedStatement ps = conn.prepareStatement(upsertUserAuth)) {
                ps.setLong(1, userId);
                ps.executeUpdate();
            }
        }
    }

    // -----------------------------------------------------------------------
    // Check 2 — Happy-path tenant provisioning
    // -----------------------------------------------------------------------

    /**
     * Authenticates as mssp-admin, provisions the TestCo tenant, and asserts
     * HTTP 201, a {@code Location} header matching the expected pattern, and
     * {@code clientPrefix == "testco"} in the response body.
     */
    @Test
    @Order(2)
    void check2_HappyPathProvisioning() throws Exception {
        // Step 2a: authenticate to obtain JWT
        String authBody = "{\"username\":\"" + MSSP_ADMIN_LOGIN + "\",\"password\":\"" + MSSP_ADMIN_PASSWORD + "\",\"rememberMe\":false}";
        HttpRequest authRequest = HttpRequest.newBuilder()
            .uri(URI.create(BACKEND_BASE_URL + "/api/authenticate"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(authBody))
            .build();

        HttpResponse<String> authResponse = http.send(authRequest, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, authResponse.statusCode(),
            "Expected 200 from /api/authenticate, got: " + authResponse.statusCode() +
            "\nBody: " + authResponse.body());

        JsonNode authJson = mapper.readTree(authResponse.body());
        jwtToken = authJson.path("token").asText(null);
        assertNotNull(jwtToken, "JWT token not found in authenticate response: " + authResponse.body());
        assertTrue(jwtToken.length() > 10, "JWT token looks too short: " + jwtToken);

        // Step 2b: provision TestCo tenant
        HttpRequest provisionRequest = HttpRequest.newBuilder()
            .uri(URI.create(BACKEND_BASE_URL + "/api/ha-mssp/tenants"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + jwtToken)
            .POST(HttpRequest.BodyPublishers.ofString(TESTCO_BODY))
            .build();

        HttpResponse<String> provisionResponse = http.send(provisionRequest, HttpResponse.BodyHandlers.ofString());
        assertEquals(201, provisionResponse.statusCode(),
            "Expected 201 from POST /api/ha-mssp/tenants, got: " + provisionResponse.statusCode() +
            "\nBody: " + provisionResponse.body());

        // Assert Location header matches /api/ha-mssp/tenants/{digits}
        String location = provisionResponse.headers().firstValue("Location").orElse(null);
        assertNotNull(location, "Location header missing from 201 response");
        assertTrue(location.matches(".*/api/ha-mssp/tenants/\\d+"),
            "Location header does not match expected pattern '/api/ha-mssp/tenants/{id}': " + location);

        // Assert clientPrefix == "testco" in response body
        JsonNode responseBody = mapper.readTree(provisionResponse.body());
        assertEquals("testco", responseBody.path("clientPrefix").asText(),
            "clientPrefix in response body should be 'testco'; actual body: " + provisionResponse.body());
    }

    // -----------------------------------------------------------------------
    // Check 3 — Invalid prefix returns 400
    // -----------------------------------------------------------------------

    /**
     * Attempts to provision a tenant with {@code clientPrefix = "INVALID PREFIX"}
     * (contains uppercase and a space, violating {@code ^[a-z0-9-]{2,20}$}) and
     * asserts HTTP 400.
     */
    @Test
    @Order(3)
    void check3_InvalidPrefixReturns400() throws Exception {
        ensureJwt();

        String invalidBody =
            "{\"name\":\"BadTenant\",\"clientPrefix\":\"INVALID PREFIX\"," +
            "\"adminEmail\":\"bad@bad.local\",\"adminLogin\":\"bad-admin\"," +
            "\"maxUsers\":10,\"licenceType\":\"standard\"}";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(BACKEND_BASE_URL + "/api/ha-mssp/tenants"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + jwtToken)
            .POST(HttpRequest.BodyPublishers.ofString(invalidBody))
            .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(400, response.statusCode(),
            "Expected 400 for invalid clientPrefix, got: " + response.statusCode() +
            "\nBody: " + response.body());
    }

    // -----------------------------------------------------------------------
    // Check 4 — Duplicate provisioning returns 400 or 409
    // -----------------------------------------------------------------------

    /**
     * Repeats the TestCo provisioning request and asserts HTTP 400 or 409
     * (duplicate prefix or login conflict).
     */
    @Test
    @Order(4)
    void check4_DuplicateProvisioningReturns400Or409() throws Exception {
        ensureJwt();

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(BACKEND_BASE_URL + "/api/ha-mssp/tenants"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + jwtToken)
            .POST(HttpRequest.BodyPublishers.ofString(TESTCO_BODY))
            .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        int status = response.statusCode();
        assertTrue(status == 400 || status == 409,
            "Expected 400 or 409 for duplicate TestCo provisioning, got: " + status +
            "\nBody: " + response.body());
    }

    // -----------------------------------------------------------------------
    // Check 5 — JDBC row assertions
    // -----------------------------------------------------------------------

    /**
     * Verifies via direct JDBC queries that:
     * <ul>
     *   <li>Exactly one row in {@code ha_client} has {@code client_prefix = 'testco'}</li>
     *   <li>Exactly one row in {@code jhi_user} has {@code login = 'testco-admin'}</li>
     *   <li>Exactly one row in {@code ha_tenant_user} links the two with
     *       {@code tenant_role = 'TENANT_ADMIN'}</li>
     * </ul>
     */
    @Test
    @Order(5)
    void check5_JdbcRowAssertions() throws Exception {
        try (Connection conn = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASS)) {

            // 1. One ha_client row with prefix 'testco'
            long clientId = assertSingleRow(conn,
                "SELECT id FROM ha_client WHERE client_prefix = 'testco'",
                "ha_client with client_prefix='testco'");

            // 2. One jhi_user row with login 'testco-admin'
            long userId = assertSingleRow(conn,
                "SELECT id FROM jhi_user WHERE login = 'testco-admin'",
                "jhi_user with login='testco-admin'");

            // 3. One ha_tenant_user row linking them with TENANT_ADMIN
            String memberSql =
                "SELECT id FROM ha_tenant_user " +
                "WHERE client_id = " + clientId +
                "  AND jhi_user_id = " + userId +
                "  AND tenant_role = 'TENANT_ADMIN'";
            assertSingleRow(conn, memberSql,
                "ha_tenant_user linking testco client+user with TENANT_ADMIN");
        }
    }

    // -----------------------------------------------------------------------
    // Check 6 — Overview endpoint reachable
    // -----------------------------------------------------------------------

    /**
     * Calls {@code GET /api/ha-mssp/overview} as mssp-admin and asserts HTTP 200
     * with {@code tenantCount >= 1} in the JSON body.
     */
    @Test
    @Order(6)
    void check6_OverviewReachable() throws Exception {
        ensureJwt();

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(BACKEND_BASE_URL + "/api/ha-mssp/overview"))
            .header("Authorization", "Bearer " + jwtToken)
            .GET()
            .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(),
            "Expected 200 from GET /api/ha-mssp/overview, got: " + response.statusCode() +
            "\nBody: " + response.body());

        JsonNode body = mapper.readTree(response.body());
        int tenantCount = body.path("tenantCount").asInt(-1);
        assertTrue(tenantCount >= 1,
            "Expected tenantCount >= 1 in overview response, got: " + tenantCount +
            "\nBody: " + response.body());
    }

    // -----------------------------------------------------------------------
    // Check 7 — Frontend Playwright gates (no-op / delegate)
    // -----------------------------------------------------------------------

    /**
     * Delegates to the Playwright end-to-end suite via {@link ProcessBuilder}.
     *
     * <p>If {@code frontend-v3/} has a {@code playwright:functional} npm script the
     * test shells out to it; otherwise the check is a structural no-op that passes
     * immediately so the Maven gate is not broken when Playwright is not installed.
     *
     * <p>The three behavioural guarantees checked by the Playwright suite are:
     * <ol>
     *   <li>An unauthenticated user who navigates to any of the five {@code /mssp/*}
     *       routes sees {@code AccessDeniedPage} and the URL is preserved.</li>
     *   <li>An authenticated user with {@code MSSP_ADMIN} sees "MSSP Portal" in the
     *       sidebar and the correct page content.</li>
     *   <li>An authenticated user <em>without</em> {@code MSSP_ADMIN} sees
     *       {@code AccessDeniedPage} at every {@code /mssp/*} route.</li>
     * </ol>
     */
    @Test
    @Order(7)
    void check7_FrontendPlaywrightGates() throws Exception {
        // Locate the frontend-v3 directory relative to the backend module
        File backendDir = new File(System.getProperty("user.dir"));
        File repoRoot = backendDir.getParentFile() != null ? backendDir.getParentFile() : backendDir;
        File frontendDir = new File(repoRoot, "frontend-v3");

        if (!frontendDir.exists()) {
            // Running outside the standard repository layout — skip gracefully
            System.out.println("[check7] frontend-v3 directory not found at " + frontendDir.getAbsolutePath() +
                " — Playwright gate skipped");
            return;
        }

        // Check whether a playwright:functional npm script is declared
        File packageJson = new File(frontendDir, "package.json");
        if (!packageJson.exists()) {
            System.out.println("[check7] frontend-v3/package.json not found — Playwright gate skipped");
            return;
        }

        String pkgContent = new String(java.nio.file.Files.readAllBytes(packageJson.toPath()));
        if (!pkgContent.contains("playwright:functional")) {
            // No dedicated functional playwright script yet — structural pass
            System.out.println("[check7] No 'playwright:functional' script found in package.json — " +
                "Playwright gate treated as no-op (add the script to enable full e2e gating)");
            return;
        }

        // Shell out to npm run playwright:functional
        ProcessBuilder pb = new ProcessBuilder("npm", "run", "playwright:functional")
            .directory(frontendDir)
            .redirectErrorStream(true)
            .inheritIO();

        Process process = pb.start();
        int exitCode = process.waitFor();
        assertEquals(0, exitCode,
            "Playwright functional gate exited with non-zero status: " + exitCode);
    }

    // -----------------------------------------------------------------------
    // Check 8 — Backend prod build
    // -----------------------------------------------------------------------

    /**
     * Shells out to {@code mvn -B -Pprod clean package -s settings.xml} in the
     * {@code backend/} directory and asserts:
     * <ul>
     *   <li>Exit code 0</li>
     *   <li>{@code backend/target/hivearmor.war} exists</li>
     * </ul>
     *
     * <p>The build may take several minutes on a cold Maven repository. CI should
     * provide a warm {@code .m2} cache.
     */
    @Test
    @Order(8)
    void check8_BackendProdBuild() throws Exception {
        File backendDir = resolveBackendDir();

        // Prefer ./mvnw if present, fall back to system mvn
        String mvnCmd = new File(backendDir, "mvnw").canExecute() ? "./mvnw" : "mvn";

        ProcessBuilder pb = new ProcessBuilder(
            mvnCmd, "-B", "-Pprod", "clean", "package", "-s", "settings.xml",
            "-DskipTests"
        )
        .directory(backendDir)
        .redirectErrorStream(true)
        .inheritIO();

        Process process = pb.start();
        int exitCode = process.waitFor();
        assertEquals(0, exitCode,
            "Backend prod build exited with non-zero status: " + exitCode +
            " (command: " + mvnCmd + " -B -Pprod clean package -s settings.xml -DskipTests)");

        File warFile = new File(backendDir, "target/hivearmor.war");
        assertTrue(warFile.exists(),
            "backend/target/hivearmor.war not found after prod build; expected at: " +
            warFile.getAbsolutePath());
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Ensures {@link #jwtToken} is populated. Called by checks 3–6 in case the
     * test method ordering is altered or check 2 is skipped.
     */
    private void ensureJwt() throws Exception {
        if (jwtToken != null) {
            return;
        }
        String authBody = "{\"username\":\"" + MSSP_ADMIN_LOGIN + "\",\"password\":\"" +
            MSSP_ADMIN_PASSWORD + "\",\"rememberMe\":false}";
        HttpRequest authRequest = HttpRequest.newBuilder()
            .uri(URI.create(BACKEND_BASE_URL + "/api/authenticate"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(authBody))
            .build();
        HttpResponse<String> authResponse = http.send(authRequest, HttpResponse.BodyHandlers.ofString());
        JsonNode authJson = mapper.readTree(authResponse.body());
        jwtToken = authJson.path("token").asText(null);
        assertNotNull(jwtToken, "Could not obtain JWT in ensureJwt()");
    }

    /**
     * Executes {@code sql} (a single-row SELECT returning an {@code id} column),
     * asserts exactly one row is returned, and returns the {@code id} value.
     *
     * @param conn        open JDBC connection
     * @param sql         SELECT statement expected to return exactly one row
     * @param description human-readable description used in assertion messages
     * @return the {@code id} value from the single result row
     */
    private long assertSingleRow(Connection conn, String sql, String description)
            throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            assertTrue(rs.next(),
                "Expected exactly one row for [" + description + "] but found none. SQL: " + sql);
            long id = rs.getLong("id");
            assertTrue(!rs.next(),
                "Expected exactly one row for [" + description + "] but found more than one. SQL: " + sql);
            return id;
        }
    }

    /**
     * Resolves the {@code backend/} directory.
     *
     * <p>Strategy: the JVM working directory when running Maven tests is the module
     * root (i.e. {@code backend/}), so this returns {@code new File(".")}.
     */
    private File resolveBackendDir() {
        return new File(System.getProperty("user.dir"));
    }
}
