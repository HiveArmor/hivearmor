package com.hivearmor.service.elasticsearch;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SqlQueryValidator {

    // Matches every FROM target — captures the index/alias name after FROM
    private static final Pattern INDEX_PATTERN =
        Pattern.compile("(?i)FROM\\s+[`\"']?([a-zA-Z0-9_*.-]+)[`\"']?");

    // DDL/DML and information-schema keywords that must never appear
    private static final List<String> BLOCKED_KEYWORDS = List.of(
        "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
        "TRUNCATE", "EXEC", "EXECUTE", "SHOW TABLES", "SHOW INDICES",
        "DESCRIBE", "CATALOG", "CURSOR", "/*", "--"
    );

    /**
     * Full validation: SELECT-only, no blocked keywords, all FROM targets must be v3-hive-*.
     * Used for the interactive SQL endpoint where users supply their own queries.
     */
    public void validate(String sql) {
        checkBasicRules(sql);
        validateIndexAccess(sql);
    }

    /**
     * Index-whitelist check only. Used for admin-authored visualization SQL
     * (which already passes @SqlSelectOnly bean validation on create/update).
     */
    public void validateIndexAccess(String sql) {
        if (sql == null || sql.isBlank()) {
            return;
        }

        Matcher m = INDEX_PATTERN.matcher(sql);
        boolean foundAtLeastOne = false;

        while (m.find()) {
            String idx = m.group(1);
            // Skip subquery aliases — they don't start with _ or a letter from a real index
            if (idx.startsWith("(")) {
                continue;
            }
            foundAtLeastOne = true;
            if (!idx.startsWith("v3-hive-")) {
                throw new SecurityException("Access to index '" + idx + "' is not permitted. "
                    + "Only v3-hive-* indices are accessible.");
            }
        }

        if (!foundAtLeastOne) {
            throw new SecurityException("Query must reference at least one v3-hive-* index.");
        }
    }

    private void checkBasicRules(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new SecurityException("Query is empty.");
        }

        String trimmed = sql.trim().replaceAll(";+$", "").trim();
        String upper = trimmed.toUpperCase();

        if (!upper.startsWith("SELECT")) {
            throw new SecurityException("Only SELECT queries are permitted.");
        }

        for (String blocked : BLOCKED_KEYWORDS) {
            if (upper.contains(blocked.toUpperCase())) {
                throw new SecurityException("Query contains disallowed keyword: " + blocked);
            }
        }
    }
}
