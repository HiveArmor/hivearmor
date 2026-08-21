package com.hivearmor.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HiveArmorSpringLiquibaseTest {

    @Test
    void detectsPostgresUnterminatedQuotedString() {
        RuntimeException nested = new RuntimeException("ERROR: unterminated quoted string at or near \"'\"");
        Exception wrapped = new Exception("Migration failed for change set 20231017003", nested);
        assertThat(HiveArmorSpringLiquibase.isUnterminatedLogstashSql(wrapped)).isTrue();
    }

    @Test
    void ignoresUnrelatedMigrationFailures() {
        assertThat(HiveArmorSpringLiquibase.isUnterminatedLogstashSql(new RuntimeException("relation already exists")))
            .isFalse();
    }
}
