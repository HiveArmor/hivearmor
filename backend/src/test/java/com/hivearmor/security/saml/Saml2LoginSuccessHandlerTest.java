package com.hivearmor.security.saml;

import com.hivearmor.config.AppProperties;
import com.hivearmor.domain.Authority;
import com.hivearmor.domain.User;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.jwt.TokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class Saml2LoginSuccessHandlerTest {

    @Mock TokenProvider tokenProvider;
    @Mock UserRepository userRepository;
    @Mock AppProperties appProperties;
    @Mock HttpServletRequest request;
    @Mock HttpServletResponse response;
    @Mock Authentication authentication;
    @Mock Saml2AuthenticatedPrincipal samlPrincipal;

    private Saml2LoginSuccessHandler handler;

    @BeforeEach
    void setUp() {
        handler = new Saml2LoginSuccessHandler(tokenProvider, userRepository, appProperties);

        Authority authority = new Authority();
        authority.setName("ROLE_USER");

        User user = new User();
        user.setAuthorities(Set.of(authority));

        when(authentication.getPrincipal()).thenReturn(samlPrincipal);
        when(samlPrincipal.getName()).thenReturn("testuser");
        when(userRepository.findOneByLogin("testuser")).thenReturn(Optional.of(user));
        when(tokenProvider.createToken(any(), anyBoolean(), anyBoolean())).thenReturn("mock.jwt.token");
    }

    @Test
    void onSuccess_usesConfiguredFrontendUrl_notXForwardedHost() throws Exception {
        when(appProperties.getFrontendUrl()).thenReturn("https://legitimate.hivearmor.io");
        // X-Forwarded-Host is intentionally NOT stubbed — the handler must not read it at all.
        // Mockito strict mode would flag an unused stub, confirming the header is never read.

        ArgumentCaptor<String> redirectCaptor = ArgumentCaptor.forClass(String.class);

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(response).sendRedirect(redirectCaptor.capture());
        assertThat(redirectCaptor.getValue()).startsWith("https://legitimate.hivearmor.io");
        // No attacker domain could appear because the request object is never consulted for host
        verify(request, never()).getHeader("X-Forwarded-Host");
        verify(request, never()).getHeader("X-Forwarded-Proto");
    }

    @Test
    void onSuccess_redirectContainsToken() throws Exception {
        when(appProperties.getFrontendUrl()).thenReturn("https://legitimate.hivearmor.io");

        ArgumentCaptor<String> redirectCaptor = ArgumentCaptor.forClass(String.class);

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(response).sendRedirect(redirectCaptor.capture());
        assertThat(redirectCaptor.getValue()).contains("token=mock.jwt.token");
    }

    @Test
    void onSuccess_xForwardedProtoIsIgnored() throws Exception {
        when(appProperties.getFrontendUrl()).thenReturn("https://legitimate.hivearmor.io");
        // X-Forwarded-Proto not stubbed — handler must never read it.

        ArgumentCaptor<String> redirectCaptor = ArgumentCaptor.forClass(String.class);

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(response).sendRedirect(redirectCaptor.capture());
        assertThat(redirectCaptor.getValue()).startsWith("https://legitimate.hivearmor.io");
        verify(request, never()).getHeader("X-Forwarded-Proto");
    }
}
