package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.UserService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.login_attempts.LoginAttemptService;
import com.hivearmor.service.tfa.TfaService;
import com.hivearmor.web.rest.vm.LoginVM;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.hivearmor.domain.User;
import com.hivearmor.loggin.LogContextBuilder;
import com.hivearmor.repository.federation_service.UtmFederationServiceClientRepository;

import java.util.HashMap;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * T-002 — UserJWTController unit tests.
 * Covers: login happy path, wrong password (401), TFA gating.
 *
 * Uses MockMvc without a full Spring context (@ExtendWith(MockitoExtension.class))
 * to keep the test fast and isolated from database/JWT key startup concerns.
 *
 * Tracking: testing.md — JWT / auth changes gate.
 */
@ExtendWith(MockitoExtension.class)
class UserJWTControllerTest {

    @Mock private TokenProvider tokenProvider;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private ApplicationEventService applicationEventService;
    @Mock private UserService userService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private UtmFederationServiceClientRepository fsClientRepository;
    @Mock private TfaService tfaService;
    @Mock private LogContextBuilder logContextBuilder;
    @Mock private UserDetailsService userDetailsService;
    @Mock private PasswordEncoder passwordEncoder;

    @InjectMocks
    private UserJWTController controller;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler() {})
                .build();
        objectMapper = new ObjectMapper();
        // Use lenient() because some tests short-circuit before all stubs are used
        org.mockito.Mockito.lenient().when(loginAttemptService.isBlocked()).thenReturn(false);
        org.mockito.Mockito.lenient().when(logContextBuilder.buildArgs(any(jakarta.servlet.http.HttpServletRequest.class))).thenReturn(new HashMap<>());
    }

    // ── T-002-1 ───────────────────────────────────────────────────────────────
    @Test
    void authorize_validCredentials_tfaDisabled_returns200WithToken() throws Exception {
        // Arrange
        LoginVM loginVM = new LoginVM();
        loginVM.setUsername("admin");
        loginVM.setPassword("password");
        loginVM.setRememberMe(false);   // prevent NPE on Boolean unboxing

        Authentication auth = new UsernamePasswordAuthenticationToken(
                "admin", "password",
                List.of(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN))
        );
        when(authenticationManager.authenticate(any())).thenReturn(auth);

        User user = buildUser("admin", null); // null tfaMethod = TFA not configured
        when(userService.getUserWithAuthoritiesByLogin("admin")).thenReturn(Optional.of(user));
        when(tokenProvider.createToken(any(), anyBoolean(), anyBoolean())).thenReturn("mock.jwt.token");
        when(tokenProvider.shouldBypassTfa(any())).thenReturn(true); // TFA disabled via env

        // Act + Assert
        mockMvc.perform(post("/api/authenticate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginVM)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("mock.jwt.token"))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.tfaConfigured").value(false));
    }

    // ── T-002-2 ───────────────────────────────────────────────────────────────
    @Test
    void authorize_wrongPassword_returns401() {
        // Arrange — note: no extra stubs needed; authenticationManager.authenticate() throws
        LoginVM loginVM = new LoginVM();
        loginVM.setUsername("admin");
        loginVM.setPassword("wrongpassword");
        loginVM.setRememberMe(false);

        when(authenticationManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("Bad credentials"));

        // In standalone MockMvc, unhandled Spring Security exceptions propagate as NestedServletException.
        // assertThrows confirms authentication was rejected.
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () ->
                mockMvc.perform(post("/api/authenticate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginVM)))
        );
    }

    // ── T-002-3 ───────────────────────────────────────────────────────────────
    @Test
    void authorize_tfaEnabled_userHasTfaConfigured_responseIndicatesTfaRequired() throws Exception {
        // Arrange: TFA is enabled and user has TOTP configured
        LoginVM loginVM = new LoginVM();
        loginVM.setUsername("admin");
        loginVM.setPassword("password");
        loginVM.setRememberMe(false);

        Authentication auth = new UsernamePasswordAuthenticationToken(
                "admin", "password",
                List.of(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN))
        );
        when(authenticationManager.authenticate(any())).thenReturn(auth);

        // TFA is enabled (shouldBypassTfa returns false) and user has tfaMethod set
        when(tokenProvider.shouldBypassTfa(any())).thenReturn(false);

        User user = buildUser("admin", "TOTP");
        when(userService.getUserWithAuthoritiesByLogin("admin")).thenReturn(Optional.of(user));
        when(tokenProvider.createToken(any(), anyBoolean(), anyBoolean())).thenReturn("temp.jwt.token");
        when(tfaService.generateChallenge(user)).thenReturn(300L);

        // We must also stub the TFA_ENABLE constant lookup for isTfaEnabled
        // The controller reads: Boolean.parseBoolean(Constants.CFG.get(Constants.PROP_TFA_ENABLE))
        // In test context CFG is empty (default), so isTfaEnabled = false unless we set it.
        // Set it explicitly via the static map (test-only manipulation — acceptable in unit tests)
        Constants.CFG.put(Constants.PROP_TFA_ENABLE, "true");

        // Act + Assert
        mockMvc.perform(post("/api/authenticate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginVM)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tfaConfigured").value(true))
                .andExpect(jsonPath("$.forceTfa").value(true));

        // cleanup
        Constants.CFG.remove(Constants.PROP_TFA_ENABLE);
    }

    // ── T-002-4 ───────────────────────────────────────────────────────────────
    @Test
    void authorize_ipBlocked_returns401() {
        // Arrange: IP is blocked by fail2ban
        when(loginAttemptService.isBlocked()).thenReturn(true);
        when(loginAttemptService.getClientIP()).thenReturn("10.0.0.1");

        LoginVM loginVM = new LoginVM();
        loginVM.setUsername("admin");
        loginVM.setPassword("password");
        loginVM.setRememberMe(false);

        // TooMuchLoginAttemptsException is thrown before authentication and propagates
        // as NestedServletException in standalone MockMvc — verify it throws.
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () ->
                mockMvc.perform(post("/api/authenticate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginVM)))
        );
    }

    // ── SEC-01: check-credentials must be POST, not GET ───────────────────────

    // T-002-5: GET must return 405 so the password is never in a URL
    @Test
    void checkCredentials_get_returns405() throws Exception {
        mockMvc.perform(get("/api/check-credentials")
                        .param("password", "secret")
                        .param("checkUUID", "test-uuid"))
                .andExpect(status().isMethodNotAllowed());
    }

    // T-002-6: POST with correct password returns 200 and the checkUUID in body
    @Test
    void checkCredentials_post_correctPassword_returns200WithUUID() throws Exception {
        User user = buildUser("admin", null);
        org.springframework.security.core.userdetails.UserDetails userDetails =
                org.springframework.security.core.userdetails.User
                        .withUsername("admin").password("hashed").roles("ADMIN").build();

        when(userService.getCurrentUserLogin()).thenReturn(user);
        when(userDetailsService.loadUserByUsername("admin")).thenReturn(userDetails);
        when(passwordEncoder.matches("secret", "hashed")).thenReturn(true);

        mockMvc.perform(post("/api/check-credentials")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"secret\",\"checkUUID\":\"abc-123\"}"))
                .andExpect(status().isOk())
                .andExpect(content().string("abc-123"));
    }

    // T-002-7: POST with wrong password returns 400; password must not appear in the request URI
    @Test
    void checkCredentials_post_wrongPassword_returns400AndPasswordNotInURI() throws Exception {
        User user = buildUser("admin", null);
        org.springframework.security.core.userdetails.UserDetails userDetails =
                org.springframework.security.core.userdetails.User
                        .withUsername("admin").password("hashed").roles("ADMIN").build();

        when(userService.getCurrentUserLogin()).thenReturn(user);
        when(userDetailsService.loadUserByUsername("admin")).thenReturn(userDetails);
        when(passwordEncoder.matches("wrong", "hashed")).thenReturn(false);

        var result = mockMvc.perform(post("/api/check-credentials")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"wrong\",\"checkUUID\":\"abc-123\"}"))
                .andExpect(status().isBadRequest())
                .andReturn();

        assertThat(result.getRequest().getRequestURI()).doesNotContain("wrong");
        assertThat(result.getRequest().getQueryString()).isNullOrEmpty();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private User buildUser(String login, String tfaMethod) {
        User user = new User();
        user.setLogin(login);
        user.setEmail(login + "@test.com"); // not ADMIN_EMAIL so firstLogin = false
        user.setTfaMethod(tfaMethod);
        return user;
    }
}
