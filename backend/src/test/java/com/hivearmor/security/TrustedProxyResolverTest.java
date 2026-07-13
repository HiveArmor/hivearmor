package com.hivearmor.security;

import com.hivearmor.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TrustedProxyResolverTest {

    @Mock AppProperties appProperties;
    @Mock AppProperties.SecurityProperties securityProps;
    @Mock HttpServletRequest request;

    TrustedProxyResolver resolver;

    @BeforeEach
    void setup() {
        when(appProperties.getSecurity()).thenReturn(securityProps);
        resolver = new TrustedProxyResolver(appProperties);
    }

    @Test
    void noTrustedProxies_alwaysUsesRemoteAddr() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of());
        when(request.getRemoteAddr()).thenReturn("1.2.3.4");
        when(request.getHeader("X-Forwarded-For")).thenReturn("9.9.9.9");

        assertThat(resolver.resolveClientIp(request)).isEqualTo("1.2.3.4");
    }

    @Test
    void requestFromTrustedProxy_trustsXForwardedFor() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of("10.0.0.0/8"));
        when(request.getRemoteAddr()).thenReturn("10.0.1.50");
        when(request.getHeader("X-Forwarded-For")).thenReturn("203.0.113.5");

        assertThat(resolver.resolveClientIp(request)).isEqualTo("203.0.113.5");
    }

    @Test
    void requestNotFromTrustedProxy_ignoresXForwardedFor() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of("10.0.0.0/8"));
        when(request.getRemoteAddr()).thenReturn("1.2.3.4");
        when(request.getHeader("X-Forwarded-For")).thenReturn("9.9.9.9");

        assertThat(resolver.resolveClientIp(request)).isEqualTo("1.2.3.4");
    }

    @Test
    void attackerSetsXForwardedFor_withNoTrustedProxies_isIgnored() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of());
        when(request.getRemoteAddr()).thenReturn("6.6.6.6");
        when(request.getHeader("X-Forwarded-For")).thenReturn("127.0.0.1");

        assertThat(resolver.resolveClientIp(request)).isEqualTo("6.6.6.6");
    }
}
