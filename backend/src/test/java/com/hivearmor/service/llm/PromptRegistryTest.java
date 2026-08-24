package com.hivearmor.service.llm;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link PromptRegistry} — stable ids and SHA-256 hashes (P1 LLMOps).
 */
class PromptRegistryTest {

    private static final Set<String> EXPECTED_IDS = Set.of(
        PromptRegistry.ID_CHAT_BASE,
        PromptRegistry.ID_CHAT_TRIAGE,
        PromptRegistry.ID_CHAT_INCIDENT_SUMMARY,
        PromptRegistry.ID_SEARCH_NL_TO_DSL
    );

    @Test
    void allExpectedPromptIdsAreRegistered() {
        PromptRegistry registry = new PromptRegistry();
        assertThat(registry.all().keySet()).containsExactlyInAnyOrderElementsOf(EXPECTED_IDS);
    }

    @Test
    void hashesAreStableAcrossRegistryInstances() {
        PromptRegistry a = new PromptRegistry();
        PromptRegistry b = new PromptRegistry();

        for (String id : EXPECTED_IDS) {
            PromptTemplate ta = a.require(id);
            PromptTemplate tb = b.require(id);
            assertThat(ta.sha256())
                .as("hash for %s must be stable", id)
                .isEqualTo(tb.sha256())
                .isEqualTo(PromptRegistry.sha256Hex(ta.body()))
                .matches("[0-9a-f]{64}");
            assertThat(ta.body()).isEqualTo(tb.body());
            assertThat(ta.id()).isEqualTo(id);
        }
    }

    @Test
    void knownPromptBodiesMatchPinnedSha256() {
        PromptRegistry registry = new PromptRegistry();

        // Pinned SHA-256 hex digests — update only when intentionally changing prompt bodies.
        assertThat(registry.require(PromptRegistry.ID_CHAT_BASE).sha256())
            .isEqualTo("88c6a1286ca7d7210ed45213aecbdcd677c1941bff493a3b0075a11d7b10019b");
        assertThat(registry.require(PromptRegistry.ID_CHAT_TRIAGE).sha256())
            .isEqualTo("cc0502b4e9128aa1eac47032d82a00504e185aa12f522a2c55088420a27d967a");
        assertThat(registry.require(PromptRegistry.ID_CHAT_INCIDENT_SUMMARY).sha256())
            .isEqualTo("d112bfc202d8f5c45c0aa621a3be438088b6d1b1719e47619ba317a67183c70a");
        assertThat(registry.require(PromptRegistry.ID_SEARCH_NL_TO_DSL).sha256())
            .isEqualTo("03367872f2c5f49620bc5c5d5470cc7582cc7080dd390cd0c051d07fb6289bcf");
    }

    @Test
    void requireUnknownIdThrows() {
        PromptRegistry registry = new PromptRegistry();
        assertThatThrownBy(() -> registry.require("ha.ai.unknown"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Unknown prompt id");
    }

    @Test
    void findReturnsEmptyForUnknownId() {
        assertThat(new PromptRegistry().find("missing")).isEmpty();
    }
}
