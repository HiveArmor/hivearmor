package com.hivearmor.service.connector;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MicrosoftOAuthClientTest {

    private final MicrosoftOAuthClient client = new MicrosoftOAuthClient();

    @Test
    void rejectsInvalidTenant() {
        assertThatThrownBy(() ->
            client.fetchAccessToken("../evil", "cid", "sec", MicrosoftOAuthClient.graphScope())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void looksLikePlaceholderDetectsTestConfig() {
        assertThat(MicrosoftOAuthClient.looksLikePlaceholder(
            java.util.Map.of("client_secret", "placeholder")
        )).isTrue();
        assertThat(MicrosoftOAuthClient.looksLikePlaceholder(
            java.util.Map.of("client_secret", "real-secret-value")
        )).isFalse();
    }
}
