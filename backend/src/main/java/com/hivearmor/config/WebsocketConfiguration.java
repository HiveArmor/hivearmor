package com.hivearmor.config;


import com.hivearmor.security.jwt.TokenProvider;
import org.jetbrains.annotations.NotNull;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.List;
import java.util.Map;

/**
 * STOMP-over-WebSocket configuration.
 *
 * <p><strong>WS-SEC-01 (B0-5b):</strong> authentication is performed on the STOMP
 * {@code CONNECT} frame via a native header, NOT on the SockJS handshake URL. Passing a JWT
 * in the handshake URL query string leaked a live bearer credential into web-server / proxy
 * access logs, browser history, and {@code Referer} headers. The token now travels in a STOMP
 * header ({@code Authorization: Bearer <jwt>} or the {@code access_token} native header) that
 * is never logged as part of a URL.
 *
 * <p>The HTTP handshake itself carries no credential and establishes no authenticated
 * principal; an unauthenticated connection is rejected at the {@code CONNECT} frame by
 * {@link #configureClientInboundChannel(ChannelRegistration)}. Message-level authorization is
 * unchanged (see {@code WebsocketSecurityConfiguration}).
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebsocketConfiguration implements WebSocketMessageBrokerConfigurer {
    private static final String CLASSNAME = "WebsocketConfiguration";
    private static final String IP_ADDRESS = "IP_ADDRESS";
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String ACCESS_TOKEN_HEADER = "access_token";
    private static final String BEARER_PREFIX = "Bearer ";

    private final TokenProvider tokenProvider;

    public WebsocketConfiguration(TokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // The handshake no longer carries or validates a credential — authentication happens on
        // the STOMP CONNECT frame (configureClientInboundChannel). No DefaultHandshakeHandler
        // reading the URL query string here.
        registry.addEndpoint("/ws")
            .addInterceptors(httpSessionHandshakeInterceptor())
            .setAllowedOriginPatterns("*")
            .withSockJS();
    }

    /**
     * Authenticates the STOMP {@code CONNECT} frame from a native header, replacing the former
     * URL-query-string token check. Sets the authenticated user on the accessor so downstream
     * message-level authorization ({@code WebsocketSecurityConfiguration}) applies as before.
     * A CONNECT with a missing or invalid token is rejected.
     */
    @Override
    public void configureClientInboundChannel(@NotNull ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(@NotNull Message<?> message, @NotNull MessageChannel channel) {
                StompHeaderAccessor accessor =
                    MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
                    String token = resolveToken(accessor);
                    if (!StringUtils.hasText(token) || !tokenProvider.validateToken(token)) {
                        throw new BadCredentialsException(CLASSNAME + ": missing or invalid access token on CONNECT");
                    }
                    Authentication authentication = tokenProvider.getAuthentication(token);
                    accessor.setUser(authentication);
                }
                return message;
            }
        });
    }

    /**
     * Reads the JWT from a STOMP native header. Accepts either
     * {@code Authorization: Bearer <jwt>} or a raw {@code access_token} header, so a client can
     * send whichever its STOMP library exposes. Never reads the handshake URL.
     */
    private String resolveToken(StompHeaderAccessor accessor) {
        List<String> authHeaders = accessor.getNativeHeader(AUTHORIZATION_HEADER);
        if (authHeaders != null && !authHeaders.isEmpty()) {
            String value = authHeaders.get(0);
            if (StringUtils.hasText(value)) {
                if (value.startsWith(BEARER_PREFIX)) {
                    return value.substring(BEARER_PREFIX.length()).trim();
                }
                return value.trim();
            }
        }
        List<String> tokenHeaders = accessor.getNativeHeader(ACCESS_TOKEN_HEADER);
        if (tokenHeaders != null && !tokenHeaders.isEmpty()) {
            String value = tokenHeaders.get(0);
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    public HandshakeInterceptor httpSessionHandshakeInterceptor() {
        return new HandshakeInterceptor() {
            @Override
            public boolean beforeHandshake(@NotNull ServerHttpRequest request, @NotNull ServerHttpResponse response,
                                           @NotNull WebSocketHandler wsHandler, @NotNull Map<String, Object> attributes) {
                if (request instanceof ServletServerHttpRequest)
                    attributes.put(IP_ADDRESS, request.getRemoteAddress());
                return true;
            }

            @Override
            public void afterHandshake(@NotNull ServerHttpRequest request, @NotNull ServerHttpResponse response,
                                       @NotNull WebSocketHandler wsHandler, Exception exception) {
            }
        };
    }

}
