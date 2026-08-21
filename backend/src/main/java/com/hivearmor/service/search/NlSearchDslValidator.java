package com.hivearmor.service.search;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import org.springframework.stereotype.Service;

/**
 * Structural validator for LLM-generated OpenSearch DSL used by the
 * HiveArmor NL-Search endpoint ({@code /api/ha-nl-search}).
 *
 * <p>This service enforces the four validation checks defined in
 * design model DM-5 (see
 * {@code .kiro/specs/sprint-11-audit-fixes/design.md}). The checks are
 * applied in the following strict order, and the first failure short-
 * circuits with a {@link NlSearchSecurityException}:
 *
 * <ol>
 *   <li><b>Length</b> — the DSL must be non-null, non-blank, and no
 *       longer than {@value #MAX_DSL_LENGTH} characters.</li>
 *   <li><b>JSON well-formedness</b> — the DSL must parse as JSON and
 *       the root element must be a JSON object.</li>
 *   <li><b>Required top-level key</b> — the root object must contain
 *       {@code "query"} or {@code "aggs"}.</li>
 *   <li><b>Blocklisted constructs</b> — the raw DSL string must not
 *       contain any of the ten case-sensitive substrings in the DM-5
 *       Blocklist (cluster/cat/nodes/snapshot/shrink/split admin APIs,
 *       {@code delete_by_query}, {@code update_by_query},
 *       {@code reindex}, and {@code script} — the last of which
 *       intentionally also blocks {@code painless_script} and
 *       {@code script_fields}).</li>
 * </ol>
 *
 * <p>Exception messages carry only a short category label and never
 * embed the DSL body, the caller's user input, or any other content
 * that could leak the failing payload to logs, error responses, or the
 * LLM prompt path. Callers are responsible for logging the failure
 * reason separately (typically the authenticated username plus the
 * exception message) at WARN level. This class emits no logging of
 * its own.
 */
@Service
public class NlSearchDslValidator {

    /** Maximum accepted DSL length (in characters). */
    private static final int MAX_DSL_LENGTH = 10000;

    /**
     * Case-sensitive substrings whose presence anywhere in the raw DSL
     * string causes validation to fail. See DM-5 Blocklist.
     */
    private static final String[] BLOCKLIST = {
        "_cluster",
        "_cat",
        "_nodes",
        "_snapshot",
        "_shrink",
        "_split",
        "delete_by_query",
        "update_by_query",
        "reindex",
        "script"
    };

    /**
     * Validates the given LLM-generated OpenSearch DSL string.
     *
     * @param generatedDsl the DSL body produced by the LLM (raw JSON
     *     text). May be {@code null} — nullness is treated as a length
     *     failure per Check&nbsp;1.
     * @throws NlSearchSecurityException if any of the four DM-5 checks
     *     fail. The exception message is a short category label and
     *     never contains {@code generatedDsl}.
     */
    public void validate(String generatedDsl) throws NlSearchSecurityException {
        // Check 1 — Length: null / blank / oversize.
        if (generatedDsl == null || generatedDsl.isBlank() || generatedDsl.length() > MAX_DSL_LENGTH) {
            throw new NlSearchSecurityException("DSL validation failed: length");
        }

        // Check 2 — Valid JSON object.
        JsonElement root;
        try {
            root = JsonParser.parseString(generatedDsl);
        } catch (JsonSyntaxException e) {
            throw new NlSearchSecurityException("DSL validation failed: not valid JSON");
        }
        if (!root.isJsonObject()) {
            throw new NlSearchSecurityException("DSL validation failed: root must be a JSON object");
        }
        JsonObject rootObject = root.getAsJsonObject();

        // Check 3 — Required top-level key ("query" or "aggs").
        if (!rootObject.has("query") && !rootObject.has("aggs")) {
            throw new NlSearchSecurityException("DSL validation failed: missing query or aggs key");
        }

        // Check 4 — Case-sensitive blocklist substring match on the raw DSL.
        for (String term : BLOCKLIST) {
            if (generatedDsl.contains(term)) {
                throw new NlSearchSecurityException("DSL validation failed: blocklisted construct");
            }
        }
    }
}
