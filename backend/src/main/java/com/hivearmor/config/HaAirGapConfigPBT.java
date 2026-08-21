package com.hivearmor.config;

import net.jqwik.api.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Property-based test for the Air-Gap Guard coverage.
 *
 * <p><strong>Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2</strong>
 *
 * <p>Property 1 (Air-Gap Guard Coverage): For any opName string, when
 * {@code HaAirGapConfig.isAirGap()} returns {@code true}, the guard's
 * {@code assertExternalAllowed(opName)} throws {@link HaAirGapConfig.AirGapException}
 * whose message contains the opName, and when {@code isAirGap()} returns {@code false},
 * the same call returns normally without throwing.
 */
@Label("Feature: sprint-31-airgap, Property 1: Air-Gap Guard Coverage")
class HaAirGapConfigPBT {

    /**
     * Property 1a: When air-gap mode is active, assertExternalAllowed throws
     * AirGapException for any arbitrary opName, and the exception message contains
     * the opName string.
     *
     * <p><strong>Validates: Property 1 (Air-Gap Guard Coverage) — Requirements 2.1, 2.2, 2.3, 3.1, 3.2</strong>
     */
    @Property(tries = 200)
    @Tag("sprint-31-airgap")
    @Label("assertExternalAllowed throws AirGapException when airGap=true for any opName")
    void assertExternalAllowedThrowsWhenAirGapActive(@ForAll("opNames") String opName) {
        // Arrange: config with airGap=true
        HaAirGapConfig config = new HaAirGapConfig();
        config.setAirGap(true);
        HaAirGapConfig.AirGapGuard guard = config.airGapGuard();

        // Assert: guard reports air-gap active
        assertThat(guard.isAirGap())
            .as("Guard must report air-gap active when config.airGap=true")
            .isTrue();

        // Assert: assertExternalAllowed throws AirGapException with opName in message
        assertThatThrownBy(() -> guard.assertExternalAllowed(opName))
            .as("assertExternalAllowed must throw AirGapException for opName='%s'", opName)
            .isInstanceOf(HaAirGapConfig.AirGapException.class)
            .hasMessageContaining(opName);
    }

    /**
     * Property 1b: When air-gap mode is NOT active, assertExternalAllowed returns
     * normally for any arbitrary opName without throwing any exception.
     *
     * <p><strong>Validates: Property 1 (Air-Gap Guard Coverage) — Requirements 2.1, 2.2, 2.3, 3.1, 3.2</strong>
     */
    @Property(tries = 200)
    @Tag("sprint-31-airgap")
    @Label("assertExternalAllowed returns normally when airGap=false for any opName")
    void assertExternalAllowedReturnsNormallyWhenAirGapInactive(@ForAll("opNames") String opName) {
        // Arrange: config with airGap=false
        HaAirGapConfig config = new HaAirGapConfig();
        config.setAirGap(false);
        HaAirGapConfig.AirGapGuard guard = config.airGapGuard();

        // Assert: guard reports air-gap inactive
        assertThat(guard.isAirGap())
            .as("Guard must report air-gap inactive when config.airGap=false")
            .isFalse();

        // Assert: assertExternalAllowed does NOT throw
        assertThatCode(() -> guard.assertExternalAllowed(opName))
            .as("assertExternalAllowed must not throw when airGap=false for opName='%s'", opName)
            .doesNotThrowAnyException();
    }

    /**
     * Property 1c: The guard's isAirGap() always reflects the current config state.
     * For any boolean value set on the config, the guard returns that same value.
     *
     * <p><strong>Validates: Property 1 (Air-Gap Guard Coverage) — Requirements 2.1, 2.2, 2.3</strong>
     */
    @Property(tries = 100)
    @Tag("sprint-31-airgap")
    @Label("guard.isAirGap() reflects config.isAirGap() for any boolean")
    void guardReflectsConfigState(@ForAll boolean airGapValue) {
        HaAirGapConfig config = new HaAirGapConfig();
        config.setAirGap(airGapValue);
        HaAirGapConfig.AirGapGuard guard = config.airGapGuard();

        assertThat(guard.isAirGap())
            .as("Guard.isAirGap() must equal config.isAirGap() for value=%s", airGapValue)
            .isEqualTo(config.isAirGap());
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates arbitrary opName strings that exercise a range of inputs:
     * - Service-like identifiers (taxii-sync, misp-pull, smtp-send, ollama-registry-pull)
     * - Arbitrary alphanumeric strings with special characters
     * - Empty strings
     * - Unicode strings
     * - Whitespace-heavy strings
     */
    @Provide
    Arbitrary<String> opNames() {
        return Arbitraries.oneOf(
            // Realistic service operation names
            Arbitraries.of(
                "taxii-sync",
                "misp-pull",
                "smtp-send",
                "ollama-registry-pull",
                "threat-intel-download",
                "email-notification",
                "model-registry-fetch"
            ),
            // Arbitrary alphanumeric with dashes/underscores (typical opName format)
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .withCharRange('A', 'Z')
                .withCharRange('0', '9')
                .withChars('-', '_', '.')
                .ofMinLength(1)
                .ofMaxLength(80),
            // Empty string edge case
            Arbitraries.just(""),
            // Unicode characters
            Arbitraries.strings()
                .withCharRange('\u0020', '\u007E')  // printable ASCII
                .withCharRange('\u00C0', '\u024F')  // Latin Extended
                .ofMinLength(1)
                .ofMaxLength(50),
            // Whitespace-heavy strings
            Arbitraries.strings()
                .withChars(' ', '\t', '\n', '\r')
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(30)
        );
    }
}
