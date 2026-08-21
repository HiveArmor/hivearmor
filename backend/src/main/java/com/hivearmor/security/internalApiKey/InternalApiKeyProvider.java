package com.hivearmor.security.internalApiKey;

import com.hivearmor.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class InternalApiKeyProvider {
    private static final String CLASSNAME = "InternalApiKeyProvider";
    private final Logger log = LoggerFactory.getLogger(InternalApiKeyProvider.class);

    private final UserRepository userRepository;

    public InternalApiKeyProvider(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public UsernamePasswordAuthenticationToken getAuthentication(String apiKey) {
        final String ctx = CLASSNAME + ".getAuthentication";
        try {
            com.hivearmor.domain.User user = this.findFirstActiveAdmin();
            List<SimpleGrantedAuthority> authorities = user.getAuthorities().stream().map(d -> new SimpleGrantedAuthority(d.getName()))
                .collect(Collectors.toList());
            User principal = new User(user.getLogin(), "", authorities);
            return new UsernamePasswordAuthenticationToken(principal, apiKey, authorities);
        } catch (Exception e) {
            // Fallback: when no admin user exists (e.g. first install / test DB), grant
            // the internal service principal minimal ROLE_USER authority so agent telemetry
            // ingest endpoints (which only require .authenticated()) can proceed.
            // This prevents a chicken-and-egg failure where no users exist yet.
            log.warn("{}: no active admin found, using synthetic agent principal: {}", ctx, e.getMessage());
            List<SimpleGrantedAuthority> fallbackAuthorities = List.of(
                    new SimpleGrantedAuthority("ROLE_USER"));
            User agentPrincipal = new User("__agent_internal__", "", fallbackAuthorities);
            return new UsernamePasswordAuthenticationToken(agentPrincipal, apiKey, fallbackAuthorities);
        }
    }

    private com.hivearmor.domain.User findFirstActiveAdmin() throws Exception {
        List<com.hivearmor.domain.User> users = userRepository.findAdminUsers();

        if (!users.isEmpty()) {
            return users.get(0);
        } else {
            throw new Exception("No active admin user found");
        }
    }
}

