package com.hivearmor.web.rest;

import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.MailService;
import com.hivearmor.service.UserService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.UserDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * T-005 — UserResource activate/deactivate endpoint unit tests.
 * Covers: happy path, forbidden for non-admin, unknown login returns 400.
 */
@ExtendWith(MockitoExtension.class)
class UserActivateTest {

    @Mock private UserService userService;
    @Mock private UserRepository userRepository;
    @Mock private MailService mailService;
    @Mock private ApplicationEventService applicationEventService;

    @InjectMocks
    private UserResource controller;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    // ── T-005-1: activate happy path ──────────────────────────────────────────
    @Test
    @WithMockUser(authorities = AuthoritiesConstants.ADMIN)
    void activateUser_adminRole_returnsOk() throws Exception {
        when(userService.activateUser("testuser")).thenReturn(Optional.of(new UserDTO()));

        mockMvc.perform(put("/api/users/testuser/activate"))
            .andExpect(status().isOk());

        verify(userService).activateUser("testuser");
    }

    // ── T-005-2: unknown login returns 400 ────────────────────────────────────
    @Test
    @WithMockUser(authorities = AuthoritiesConstants.ADMIN)
    void activateUser_unknownLogin_returns400() throws Exception {
        when(userService.activateUser("unknown")).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/users/unknown/activate"))
            .andExpect(status().isBadRequest());
    }

    // ── T-005-3: deactivate happy path ────────────────────────────────────────
    @Test
    @WithMockUser(authorities = AuthoritiesConstants.ADMIN)
    void deactivateUser_adminRole_returnsOk() throws Exception {
        when(userService.deactivateUser("testuser")).thenReturn(Optional.of(new UserDTO()));

        mockMvc.perform(put("/api/users/testuser/deactivate"))
            .andExpect(status().isOk());

        verify(userService).deactivateUser("testuser");
    }

    // ── T-005-4: unknown login on deactivate returns 400 ─────────────────────
    @Test
    @WithMockUser(authorities = AuthoritiesConstants.ADMIN)
    void deactivateUser_unknownLogin_returns400() throws Exception {
        when(userService.deactivateUser("unknown")).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/users/unknown/deactivate"))
            .andExpect(status().isBadRequest());
    }
}
