package com.hivearmor.config;

import liquibase.exception.LiquibaseException;
import liquibase.integration.spring.SpringLiquibase;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

/**
 * Changelog {@code 20231017003} ships quoted logstash SQL with
 * {@code splitStatements=true} / {@code stripComments=true}. PostgreSQL rejects
 * that on a greenfield database. The XML is immutable once merged, so a failed
 * apply of that id is recorded as {@code MARK_RAN} and migration continues.
 */
public class HiveArmorSpringLiquibase extends SpringLiquibase {

    private static final Logger log = LoggerFactory.getLogger(HiveArmorSpringLiquibase.class);

    static final String LOGSTASH_FILTER_CHANGESET_ID = "20231017003";
    static final String LOGSTASH_FILTER_CHANGESET_AUTHOR = "Freddy";
    static final String LOGSTASH_FILTER_CHANGESET_FILE =
        "config/liquibase/changelog/20231017003_updating_logstash_filters.xml";

    @Override
    public void afterPropertiesSet() throws LiquibaseException {
        try {
            super.afterPropertiesSet();
        } catch (Exception first) {
            if (!isUnterminatedLogstashSql(first)) {
                throw asLiquibaseException(first);
            }
            log.warn(
                "Skipping Liquibase changeset {} (unterminated quoted string on PostgreSQL). " +
                    "Logstash filter SQL in that file cannot run with splitStatements. " +
                    "Later changesets still apply; restore filters from a known-good dump if needed.",
                LOGSTASH_FILTER_CHANGESET_ID
            );
            try {
                markLogstashFilterChangeSetRan();
            } catch (SQLException sql) {
                LiquibaseException wrapped = asLiquibaseException(first);
                wrapped.addSuppressed(sql);
                throw wrapped;
            }
            super.afterPropertiesSet();
        }
    }

    static boolean isUnterminatedLogstashSql(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message != null && message.contains("unterminated quoted string")) {
                return true;
            }
        }
        return false;
    }

    private void markLogstashFilterChangeSetRan() throws SQLException {
        DataSource dataSource = getDataSource();
        if (dataSource == null) {
            throw new SQLException("Liquibase DataSource is not configured");
        }
        String table = getDatabaseChangeLogTable();
        if (table == null || table.isBlank()) {
            table = "databasechangelog";
        }
        String sql =
            "INSERT INTO " + table +
                " (id, author, filename, dateexecuted, orderexecuted, exectype, description, comments, liquibase) " +
                "SELECT ?, ?, ?, NOW(), COALESCE((SELECT MAX(orderexecuted) FROM " + table + "), 0) + 1, " +
                "'MARK_RAN', 'sql', " +
                "'Skipped: PostgreSQL cannot parse quoted logstash SQL with splitStatements', 'hivearmor' " +
                "WHERE NOT EXISTS (SELECT 1 FROM " + table + " WHERE id = ? AND author = ?)";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, LOGSTASH_FILTER_CHANGESET_ID);
            statement.setString(2, LOGSTASH_FILTER_CHANGESET_AUTHOR);
            statement.setString(3, LOGSTASH_FILTER_CHANGESET_FILE);
            statement.setString(4, LOGSTASH_FILTER_CHANGESET_ID);
            statement.setString(5, LOGSTASH_FILTER_CHANGESET_AUTHOR);
            statement.executeUpdate();
        }
    }

    private static LiquibaseException asLiquibaseException(Exception error) {
        if (error instanceof LiquibaseException liquibaseException) {
            return liquibaseException;
        }
        return new LiquibaseException(error);
    }
}
