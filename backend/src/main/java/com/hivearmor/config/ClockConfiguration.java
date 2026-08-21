package com.hivearmor.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * Provides a {@link Clock} bean for the application context.
 *
 * <p>In production this returns {@link Clock#systemUTC()}. In tests, the bean
 * can be overridden with a fixed clock for deterministic timestamp assertions.
 */
@Configuration
public class ClockConfiguration {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
