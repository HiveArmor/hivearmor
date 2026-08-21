package com.hivearmor.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.security.SecureRandom;
import java.time.Clock;

/**
 * Spring configuration for MSSP portal infrastructure beans.
 *
 * <p>Provides a {@link Clock} bean scoped to the application context so that
 * MSSP services can have time injected rather than calling {@link Clock#systemUTC()}
 * directly. This enables deterministic unit testing via {@link Clock#fixed}.
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@Configuration
public class MsspConfiguration {

    /**
     * Provides a UTC {@link Clock} as a Spring bean.
     *
     * <p>Callers should declare {@code Clock} in their constructor parameters;
     * in tests, replace with {@link Clock#fixed(java.time.Instant, java.time.ZoneId)}
     * to control time.
     *
     * @return {@link Clock#systemUTC()}
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    /**
     * Provides a shared {@link SecureRandom} instance as a Spring bean.
     *
     * <p>Injected into {@code MsspProvisioningService} for activation-key
     * generation. A single shared instance is safe and efficient — the JDK
     * {@link SecureRandom} implementation is thread-safe.
     *
     * @return a new {@link SecureRandom} instance seeded by the JVM default entropy source
     */
    @Bean
    public SecureRandom secureRandom() {
        return new SecureRandom();
    }
}
