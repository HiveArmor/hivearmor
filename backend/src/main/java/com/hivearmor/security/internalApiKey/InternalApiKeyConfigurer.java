package com.hivearmor.security.internalApiKey;

import com.hivearmor.security.jwt.JWTFilter;
import com.hivearmor.security.telemetry.TelemetryAgentIdentityFilter;
import org.springframework.security.config.annotation.SecurityConfigurerAdapter;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.DefaultSecurityFilterChain;

public class InternalApiKeyConfigurer extends SecurityConfigurerAdapter<DefaultSecurityFilterChain, HttpSecurity> {

    private final InternalApiKeyProvider internalApiKeyProvider;
    private final TelemetryAgentIdentityFilter telemetryAgentIdentityFilter;

    public InternalApiKeyConfigurer(InternalApiKeyProvider apiKeyProvider,
                                    TelemetryAgentIdentityFilter telemetryAgentIdentityFilter) {
        this.internalApiKeyProvider = apiKeyProvider;
        this.telemetryAgentIdentityFilter = telemetryAgentIdentityFilter;
    }

    @Override
    public void configure(HttpSecurity builder) {
        InternalApiKeyFilter internalApiKeyFilter = new InternalApiKeyFilter(internalApiKeyProvider);
        builder.addFilterBefore(internalApiKeyFilter, JWTFilter.class);
        builder.addFilterBefore(telemetryAgentIdentityFilter, InternalApiKeyFilter.class);
    }
}
