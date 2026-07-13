package com.hivearmor.web.rest.tfa;

import com.hivearmor.domain.Authority;
import com.hivearmor.domain.User;
import com.hivearmor.loggin.LogContextBuilder;
import com.hivearmor.security.jwt.JWTFilter;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.UserService;
import com.hivearmor.service.UtmConfigurationParameterService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.tfa.verify.TfaVerifyResponse;
import com.hivearmor.service.login_attempts.LoginAttemptService;
import com.hivearmor.service.tfa.TfaService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.HashSet;
import java.util.Set;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class TfaResourceRateLimitTest {

    @Mock private TfaService tfaService;
    @Mock private UserService userService;
    @Mock private ApplicationEventService applicationEventService;
    @Mock private UtmConfigurationParameterService utmConfigurationParameterService;
    @Mock private TokenProvider tokenProvider;
    @Mock private LogContextBuilder logContextBuilder;
    @Mock private LoginAttemptService loginAttemptService;

    @InjectMocks
    private TfaResource tfaResource;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(tfaResource).build();
    }

    // T-TFA-RL-1: blocked IP receives 429 and TFA service is never called
    @Test
    void whenIpIsBlocked_returns429AndSkipsVerification() throws Exception {
        when(loginAttemptService.isBlocked()).thenReturn(true);

        mockMvc.perform(post("/api/tfa/verify-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("\"123456\""))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "600"));

        verify(tfaService, never()).verifyCode(any(), any());
    }

    // T-TFA-RL-2: invalid code increments the failure counter
    @Test
    void whenCodeIsInvalid_incrementsFailureCounter() throws Exception {
        when(loginAttemptService.isBlocked()).thenReturn(false);
        when(loginAttemptService.getClientIP()).thenReturn("10.0.0.1");

        User user = buildUser("testuser", "TOTP");
        when(userService.getCurrentUserLogin()).thenReturn(user);

        TfaVerifyResponse invalidResponse = TfaVerifyResponse.builder()
                .valid(false).expired(false).remainingSeconds(0).message("bad code").build();
        when(tfaService.verifyCode(eq(user), any())).thenReturn(invalidResponse);

        mockMvc.perform(post("/api/tfa/verify-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("\"000000\""))
                .andExpect(status().isUnauthorized());

        verify(loginAttemptService).registerFailedLogin("10.0.0.1");
        verify(loginAttemptService, never()).registerSuccessfulLogin(any());
    }

    // T-TFA-RL-3: valid code resets the failure counter and returns JWT
    @Test
    void whenCodeIsValid_resetsFailureCounter() throws Exception {
        when(loginAttemptService.isBlocked()).thenReturn(false);
        when(loginAttemptService.getClientIP()).thenReturn("10.0.0.1");

        User user = buildUser("testuser", "TOTP");
        when(userService.getCurrentUserLogin()).thenReturn(user);

        TfaVerifyResponse validResponse = TfaVerifyResponse.builder()
                .valid(true).expired(false).remainingSeconds(30).message("ok").build();
        when(tfaService.verifyCode(eq(user), any())).thenReturn(validResponse);
        when(tokenProvider.createToken(any(), anyBoolean(), anyBoolean())).thenReturn("valid.jwt.token");

        mockMvc.perform(post("/api/tfa/verify-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("\"123456\""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id_token").value("valid.jwt.token"))
                .andExpect(header().string(JWTFilter.AUTHORIZATION_HEADER, "Bearer valid.jwt.token"));

        verify(loginAttemptService).registerSuccessfulLogin("10.0.0.1");
        verify(loginAttemptService, never()).registerFailedLogin(any());
    }

    private User buildUser(String login, String tfaMethod) {
        User user = new User();
        user.setLogin(login);
        user.setEmail(login + "@test.com");
        user.setTfaMethod(tfaMethod);
        Set<Authority> authorities = new HashSet<>();
        Authority auth = new Authority();
        auth.setName("ROLE_USER");
        authorities.add(auth);
        user.setAuthorities(authorities);
        return user;
    }
}
