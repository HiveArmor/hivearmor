package com.hivearmor.service.hunt;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch._types.query_dsl.Query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HuntQueryParserTest {

    private HuntQueryParser parser;

    @BeforeEach
    void setUp() {
        parser = new HuntQueryParser(new HuntFieldRegistry());
    }

    @Test
    @DisplayName("explicit match-all compiles but an omitted query is rejected")
    void explicitMatchAllOnly() {
        assertThat(parser.parse("*:*").isMatchAll()).isTrue();
        assertThatThrownBy(() -> parser.parse("  "))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code")
            .isEqualTo("HUNT_QUERY_REQUIRED");
    }

    @Test
    @DisplayName("AND binds more tightly than OR")
    void booleanPrecedence() {
        Query query = parser.parse("event.action:a OR host.name:b AND user.name:c");
        assertThat(query.isBool()).isTrue();
        assertThat(query.bool().should()).hasSize(2);
        assertThat(query.bool().should().get(1).bool().must()).hasSize(2);
    }

    @Test
    @DisplayName("numeric comparisons compile to a typed range")
    void numericComparison() {
        Query query = parser.parse("event.severity>=3");
        assertThat(query.isRange()).isTrue();
        assertThat(query.range().field()).isEqualTo("event.severity");
        assertThat(query.range().gte()).isNotNull();
    }

    @Test
    @DisplayName("IP trailing-octet wildcards become CIDR terms")
    void ipWildcardBecomesCidr() {
        Query query = parser.parse("source.ip:10.*.*.*");
        assertThat(query.isTerm()).isTrue();
        assertThat(query.term().value().stringValue()).isEqualTo("10.0.0.0/8");
    }

    @Test
    @DisplayName("unknown fields and abusive leading wildcards are rejected")
    void rejectsUnsupportedOrBroadQueries() {
        assertThatThrownBy(() -> parser.parse("secret.internal:value"))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code")
            .isEqualTo("HUNT_FIELD_UNSUPPORTED");
        assertThatThrownBy(() -> parser.parse("host.name:*a*"))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code")
            .isEqualTo("HUNT_WILDCARD_TOO_BROAD");
    }
}
