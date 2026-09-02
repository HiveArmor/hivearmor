package com.hivearmor.config;

import com.hivearmor.security.jwt.TokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * WS-SEC-01 (B0-5b): verifies that the STOMP {@code CONNECT} frame is authenticated from a
 * native header — {@code Authorization: Bearer <jwt>} or {@code access_token} — and NOT from
 * the handshake URL. A missing/invalid token is rejected; a valid token sets the user.
 */
@DisplayName("WebSocket CONNECT-frame authentication (WS-SEC-01)")
class WebsocketConnectAuthTest {

    private static final String VALID = "valid.jwt.token";
    private static final String INVALID = "bad.jwt.token";

    private TokenProvider tokenProvider;
    private ChannelInterceptor interceptor;
    private final MessageChannel channel = mock(MessageChannel.class);

    @BeforeEach
    void setUp() {
        tokenProvider = mock(TokenProvider.class);
        when(tokenProvider.validateToken(VALID)).thenReturn(true);
        when(tokenProvider.validateToken(INVALID)).thenReturn(false);
        when(tokenProvider.getAuthentication(VALID)).thenReturn(
            new UsernamePasswordAuthenticationToken(
                "admin", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        // Capture the interceptor the configuration registers on the inbound channel.
        WebsocketConfiguration config = new WebsocketConfiguration(tokenProvider);
        List<ChannelInterceptor> captured = new ArrayList<>();
        ChannelRegistration registration = new ChannelRegistration() {
            @Override
            public ChannelRegistration interceptors(ChannelInterceptor... interceptors) {
                captured.addAll(List.of(interceptors));
                return this;
            }
        };
        config.configureClientInboundChannel(registration);
        assertThat(captured).as("an inbound-channel interceptor must be registered").hasSize(1);
        interceptor = captured.get(0);
    }

    private Message<byte[]> connect(String headerName, String headerValue) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        if (headerName != null) {
            accessor.setNativeHeader(headerName, headerValue);
        }
        // Spring's inbound channel delivers CONNECT frames with a MUTABLE accessor so
        // interceptors can set the authenticated user; replicate that here.
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    @DisplayName("CONNECT with a valid Authorization: Bearer header authenticates")
    void connect_validBearer_authenticates() {
        Message<byte[]> msg = connect("Authorization", "Bearer " + VALID);
        Message<?> result = interceptor.preSend(msg, channel);
        StompHeaderAccessor out = StompHeaderAccessor.wrap(result);
        assertThat(out.getUser()).isNotNull();
        assertThat(out.getUser().getName()).isEqualTo("admin");
    }

    @Test
    @DisplayName("CONNECT with a valid raw access_token header authenticates")
    void connect_validAccessToken_authenticates() {
        Message<byte[]> msg = connect("access_token", VALID);
        Message<?> result = interceptor.preSend(msg, channel);
        StompHeaderAccessor out = StompHeaderAccessor.wrap(result);
        assertThat(out.getUser()).isNotNull();
        assertThat(out.getUser().getName()).isEqualTo("admin");
    }

    @Test
    @DisplayName("CONNECT with no token is rejected")
    void connect_noToken_rejected() {
        Message<byte[]> msg = connect(null, null);
        assertThatThrownBy(() -> interceptor.preSend(msg, channel))
            .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    @DisplayName("CONNECT with an invalid token is rejected")
    void connect_invalidToken_rejected() {
        Message<byte[]> msg = connect("Authorization", "Bearer " + INVALID);
        assertThatThrownBy(() -> interceptor.preSend(msg, channel))
            .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    @DisplayName("A non-CONNECT frame is passed through untouched (no auth required per-message)")
    void nonConnectFrame_passesThrough() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setDestination("/app/command/x");
        Message<byte[]> msg = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
        assertThatCode(() -> interceptor.preSend(msg, channel)).doesNotThrowAnyException();
    }
}
