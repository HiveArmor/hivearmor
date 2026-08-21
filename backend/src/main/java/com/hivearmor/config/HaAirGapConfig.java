package com.hivearmor.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Resolves the {@code hivearmor.air-gap} boolean from the environment variable
 * {@code HIVEARMOR_AIR_GAP} (default {@code false}) and publishes an {@link AirGapGuard}
 * bean that all outbound-facing services constructor-inject.
 */
@Configuration
@ConfigurationProperties(prefix = "hivearmor")
public class HaAirGapConfig {

    private boolean airGap;

    public boolean isAirGap() {
        return airGap;
    }

    public void setAirGap(boolean airGap) {
        this.airGap = airGap;
    }

    @Bean
    public AirGapGuard airGapGuard() {
        return new AirGapGuard(this);
    }

    /**
     * Runtime guard consulted by every service that reaches a non-HiveArmor host.
     * Provides both a scheduler-friendly {@link #isAirGap()} predicate (for silent
     * early-return) and a stricter {@link #assertExternalAllowed(String)} method
     * that throws {@link AirGapException} for callers that prefer fail-fast semantics.
     */
    public static class AirGapGuard {

        private final HaAirGapConfig config;

        AirGapGuard(HaAirGapConfig config) {
            this.config = config;
        }

        public boolean isAirGap() {
            return config.isAirGap();
        }

        /**
         * Fail-fast variant for callers that prefer a stack trace over a silent skip.
         * Scheduled services should prefer {@link #isAirGap()} + early-return.
         *
         * @param opName identifies the blocked operation in the exception message
         * @throws AirGapException when air-gap mode is active
         */
        public void assertExternalAllowed(String opName) {
            if (config.isAirGap()) {
                throw new AirGapException(opName);
            }
        }
    }

    /**
     * Unchecked exception raised when an outbound operation is attempted while
     * air-gap mode is active.
     */
    public static class AirGapException extends RuntimeException {
        public AirGapException(String opName) {
            super("Air-gap mode active — external operation blocked: " + opName);
        }
    }
}
