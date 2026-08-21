package com.hivearmor.multitenancy;

import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AddLifecycleHook;
import net.jqwik.api.lifecycle.AfterProperty;
import net.jqwik.api.lifecycle.BeforeProperty;
import net.jqwik.api.lifecycle.BeforeTry;

import java.sql.*;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

/**
 * Property-based test for the {@code uc_ha_client_prefix} unique constraint on
 * {@code ha_client.client_prefix}.
 *
 * <p><strong>Property 2: ClientPrefix uniqueness constraint</strong><br>
 * <strong>Validates: Requirements 2.6, 2.8</strong>
 *
 * <p>For any non-null prefix {@code p} matching {@code ^[a-z0-9][a-z0-9-]{1,19}$},
 * inserting {@code p} into a fresh {@code ha_client} row succeeds and any second
 * attempt to store {@code p} in a different row is rejected with a
 * unique-constraint violation on {@code uc_ha_client_prefix}
 * (PostgreSQL SQLSTATE {@code 23505}).
 *
 * <p><strong>Tag: {@code Feature: sprint-21-mssp-schema, Property 2}</strong>
 *
 * <h2>Test strategy</h2>
 * <ul>
 *   <li>A single JDBC connection with auto-commit disabled is opened once before
 *       the entire property run ({@link #openConnection()}) and closed after
 *       ({@link #closeConnection()}).</li>
 *   <li>Each trial re-initializes the connection state via {@link #resetConnection()}
 *       to clear any error state left by a previous constraint-violation attempt.</li>
 *   <li>Each trial inserts two rows inside a single savepoint, then rolls back to the
 *       savepoint so the database is clean for the next trial.</li>
 *   <li>The generated prefix is made globally unique per trial by prepending an
 *       atomically incrementing trial counter (base-36), so the first INSERT always
 *       succeeds regardless of what previous trials inserted.</li>
 * </ul>
 *
 * <p>Minimum 100 iterations (configured via {@code tries = 100}).
 *
 * <p>Uses jqwik 1.8 with direct JDBC; no Spring context is required.
 * Connects to the PostgreSQL instance configured in
 * {@code src/test/resources/config/application.yml}:
 * {@code jdbc:postgresql://localhost:5438/hivearmor}.
 */
class HaClientPrefixUniquenessPropertyTest {

    // -------------------------------------------------------------------------
    // JDBC configuration — reads from env vars, falls back to test defaults
    // -------------------------------------------------------------------------

    private static final String JDBC_URL  =
            "jdbc:postgresql://"
            + System.getenv().getOrDefault("DB_HOST", "localhost")
            + ":" + System.getenv().getOrDefault("DB_PORT", "5438")
            + "/" + System.getenv().getOrDefault("DB_NAME", "hivearmor");

    private static final String JDBC_USER =
            System.getenv().getOrDefault("DB_USER", "postgres");

    private static final String JDBC_PASS =
            System.getenv().getOrDefault("DB_PASS", "localdev123!");

    /**
     * PostgreSQL SQLSTATE for unique-constraint violation.
     * See https://www.postgresql.org/docs/current/errcodes-appendix.html
     */
    private static final String SQLSTATE_UNIQUE_VIOLATION = "23505";

    /**
     * Name of the unique constraint declared in changeset {@code 20260724050-1}.
     */
    private static final String EXPECTED_CONSTRAINT = "uc_ha_client_prefix";

    /**
     * Monotonically increasing counter — ensures the generated prefix is globally
     * unique across all trials so the first INSERT always succeeds.
     */
    private static final AtomicLong TRIAL_COUNTER = new AtomicLong(0L);

    // -------------------------------------------------------------------------
    // Per-property JDBC connection — opened before all trials, closed after
    // -------------------------------------------------------------------------

    private Connection connection;

    @BeforeProperty
    void openConnection() throws SQLException {
        connection = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASS);
        connection.setAutoCommit(false);
    }

    @AfterProperty
    void closeConnection() {
        if (connection != null) {
            try {
                connection.rollback();
            } catch (SQLException ignored) { /* best-effort */ }
            try {
                connection.close();
            } catch (SQLException ignored) { /* best-effort */ }
        }
    }

    /**
     * Called before each trial to ensure the connection is in a clean, usable state.
     * After a constraint violation PostgreSQL requires either a full transaction
     * rollback or a savepoint rollback before the connection can execute new
     * statements — this handles any edge-case leftover error state.
     */
    @BeforeTry
    void resetConnection() {
        if (connection != null) {
            try {
                connection.rollback();
            } catch (SQLException ignored) { /* best-effort */ }
        }
    }

    // =========================================================================
    // Prefix generator
    // =========================================================================

    /**
     * Generates a non-null body string of 1–15 lowercase alphanumeric / hyphen
     * characters for use as the <em>suffix</em> of the trial-unique prefix.
     * The first character is always alphanumeric (satisfying the regex requirement
     * for position 0 of the full prefix).
     */
    @Provide
    Arbitrary<String> validPrefixSuffixes() {
        // Use Arbitraries.of() with explicit character sets to avoid filter misses.
        Arbitrary<Character> alphaNum = Arbitraries.of(
                'a','b','c','d','e','f','g','h','i','j','k','l','m',
                'n','o','p','q','r','s','t','u','v','w','x','y','z',
                '0','1','2','3','4','5','6','7','8','9');
        Arbitrary<Character> bodyChar = Arbitraries.of(
                'a','b','c','d','e','f','g','h','i','j','k','l','m',
                'n','o','p','q','r','s','t','u','v','w','x','y','z',
                '0','1','2','3','4','5','6','7','8','9','-');

        return Combinators.combine(alphaNum, bodyChar.list().ofMinSize(0).ofMaxSize(14))
                .as((first, rest) -> {
                    StringBuilder sb = new StringBuilder();
                    sb.append(first);
                    for (char c : rest) sb.append(c);
                    return sb.toString();
                });
    }

    // =========================================================================
    // Property 2: ClientPrefix uniqueness constraint
    // =========================================================================

    /**
     * <strong>Validates: Requirements 2.6, 2.8</strong>
     *
     * <p>For any valid non-null prefix {@code p}:
     * <ol>
     *   <li>The FIRST INSERT into a fresh {@code ha_client} row with {@code p} as
     *       {@code client_prefix} MUST succeed and return a positive id.</li>
     *   <li>The SECOND INSERT of the exact same {@code p} into a DIFFERENT row MUST
     *       be rejected with SQLSTATE {@code 23505} and the violation message MUST
     *       reference constraint {@code uc_ha_client_prefix}.</li>
     * </ol>
     *
     * <p>Both INSERTs are executed inside a database savepoint that is rolled back
     * after the trial, keeping the schema clean for subsequent trials.
     */
    @Property(tries = 100)
    @Tag("Feature: sprint-21-mssp-schema, Property 2")
    void property2_uniqueConstraint_rejectsDuplicateClientPrefix(
            @ForAll("validPrefixSuffixes") String suffixPart) throws SQLException {

        // Build a globally unique prefix by prepending a base-36 trial counter.
        // This guarantees no collision with rows from previous trials.
        long trialId = TRIAL_COUNTER.incrementAndGet();
        String counterStr = Long.toString(trialId, 36); // e.g. "1", "z", "10", "zz"

        // Combine counter + suffix, clamped to 20 chars total (max column length).
        String combined = counterStr + suffixPart;
        if (combined.length() > 20) {
            combined = combined.substring(0, 20);
        }
        // Strip trailing hyphens introduced by truncation (regex requires [a-z0-9] or '-'
        // in the body, but the constraint CHECK allows hyphens anywhere after position 0).
        // The counterStr always starts with an alphanumeric digit so position 0 is valid.
        final String prefix = combined;

        // ---- Execute inside a savepoint so we can always roll back ----
        Savepoint savepoint = connection.setSavepoint("trial_" + trialId);
        try {
            // Step 1 — first INSERT must succeed.
            long firstId;
            try {
                firstId = insertHaClientWithPrefix(prefix);
            } catch (SQLException ex) {
                // The first INSERT should never fail for a valid regex prefix.
                // If it does, the test has a bug in the prefix generation.
                connection.rollback(savepoint);
                fail("First INSERT of prefix '%s' (trial %d) should have succeeded but raised %s: %s",
                        prefix, trialId, ex.getSQLState(), ex.getMessage());
                return; // unreachable — satisfies the compiler
            }

            assertThat(firstId)
                    .as("First INSERT of prefix '%s' must return a positive generated id", prefix)
                    .isPositive();

            // Step 2 — second INSERT of the same prefix must be rejected.
            //
            // The connection is now in a valid state (first INSERT succeeded).
            // We need a nested savepoint so that after the expected violation we can
            // roll back to just before the second INSERT and still commit step 1's
            // row (we then roll back everything to the outer savepoint anyway, but
            // the nested savepoint allows the connection to remain usable for the
            // assertion after the catch).
            Savepoint nestedSp = connection.setSavepoint("nested_" + trialId);
            boolean uniqueViolationRaised = false;
            String violationSqlState = null;
            String violationMessage  = null;

            try {
                insertHaClientWithPrefix(prefix);
                // If we reach here, the duplicate INSERT succeeded — that is a bug.
            } catch (SQLException ex) {
                uniqueViolationRaised = true;
                violationSqlState     = ex.getSQLState();
                violationMessage      = ex.getMessage();
                // Roll back the failed statement so the connection is usable again.
                connection.rollback(nestedSp);
            }

            if (!uniqueViolationRaised) {
                // Roll back outer savepoint before failing so the connection stays clean.
                connection.rollback(savepoint);
                fail("Expected a unique-constraint violation (SQLSTATE 23505) for "
                        + "duplicate prefix '%s', but the second INSERT succeeded.", prefix);
                return;
            }

            assertThat(violationSqlState)
                    .as("Duplicate prefix '%s' must raise SQLSTATE 23505 "
                            + "(unique_violation), got: %s", prefix, violationSqlState)
                    .isEqualTo(SQLSTATE_UNIQUE_VIOLATION);

            assertThat(violationMessage)
                    .as("The violation message for prefix '%s' should reference "
                            + "constraint '%s'", prefix, EXPECTED_CONSTRAINT)
                    .containsIgnoringCase(EXPECTED_CONSTRAINT);

        } finally {
            // Always roll back to the outer savepoint — this removes the row
            // inserted in Step 1 so subsequent trials start from a clean state.
            try {
                connection.rollback(savepoint);
            } catch (SQLException rollbackEx) {
                // If savepoint rollback fails, do a full transaction rollback.
                try {
                    connection.rollback();
                } catch (SQLException ignored) { /* best-effort */ }
            }
        }
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Inserts a minimal {@code ha_client} row with the given {@code client_prefix}
     * and returns the generated primary-key id.
     *
     * <p>Only {@code client_prefix} is supplied. All other columns have
     * database-level defaults ({@code mssp_managed = false}, {@code max_users = 50},
     * {@code licence_type = 'standard'}) or are nullable ({@code name}).
     *
     * @param clientPrefix the value to insert (must be non-null and match the regex
     *                     for Step 1 to succeed)
     * @return the generated {@code id} value
     * @throws SQLException if the INSERT is rejected by any database constraint
     */
    private long insertHaClientWithPrefix(String clientPrefix) throws SQLException {
        String sql = "INSERT INTO ha_client (client_prefix) VALUES (?) RETURNING id";
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setString(1, clientPrefix);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getLong(1);
                }
                throw new SQLException(
                        "INSERT returned no generated id for prefix: " + clientPrefix);
            }
        }
    }
}
