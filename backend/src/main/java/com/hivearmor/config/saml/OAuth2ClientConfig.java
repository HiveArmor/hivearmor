package com.hivearmor.config.saml;

import com.hivearmor.repository.idp_provider.IdentityProviderConfigRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OAuth2ClientConfig {

    @Bean
    public SamlRelyingPartyRegistrationRepository clientRegistrationRepository(IdentityProviderConfigRepository repo) {
        return new SamlRelyingPartyRegistrationRepository(repo);
    }
}
