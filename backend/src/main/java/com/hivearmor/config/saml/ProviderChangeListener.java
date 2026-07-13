package com.hivearmor.config.saml;

import com.hivearmor.repository.idp_provider.IdentityProviderConfigRepository;
import com.hivearmor.util.events.ProviderChangedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ProviderChangeListener {

    private final RelyingPartyRegistrationRepository repository;
    private final IdentityProviderConfigRepository identityProviderConfigRepository;

    @EventListener
    public void handleProviderChanged(ProviderChangedEvent event) {
        if (repository instanceof SamlRelyingPartyRegistrationRepository customRepo) {
            customRepo.reloadProviders(identityProviderConfigRepository);
        }
    }
}
