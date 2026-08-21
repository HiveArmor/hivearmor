package com.hivearmor.web.rest.hunt;

import com.hivearmor.domain.HaAlertView;
import com.hivearmor.domain.User;
import com.hivearmor.repository.HaAlertViewRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.web.rest.errors.ExceptionTranslator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for {@link HaAlertViewResource}.
 *
 * <p>Tests focus on:
 * <ul>
 *   <li>Built-in view deletion returns 400 BUILTIN_VIEW_IMMUTABLE (sub-task 10)
 *   <li>View owned by another user returns 403 on PATCH (sub-task 11)
 * </ul>
 *
 * <p>Uses standalone MockMvc with Mockito — no Spring context or database required.
 *
 * Run with: cd backend &amp;&amp; mvn -s settings.xml test -Dtest=HaAlertViewResourceTest
 */
@ExtendWith(MockitoExtension.class)
class HaAlertViewResourceTest {

    private static final String VIEWS_ENDPOINT = "/api/ha-alert-views";

    private MockMvc mockMvc;

    @Mock
    private HaAlertViewRepository alertViewRepository;

    @Mock
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        HaAlertViewResource resource = new HaAlertViewResource(alertViewRepository, userRepository);
        this.mockMvc = MockMvcBuilders.standaloneSetup(resource)
                .setControllerAdvice(new ExceptionTranslator())
                .build();

        // Set up security context for all tests — simulate "analyst" user
        setSecurityContext("analyst");

        // Mock user resolution
        User analystUser = new User();
        analystUser.setId(100L);
        analystUser.setLogin("analyst");
        lenient().when(userRepository.findOneByLogin("analyst")).thenReturn(Optional.of(analystUser));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sub-task 10: Built-in view deletion returns 400
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Deleting a built-in view (ID 1–10) MUST return 400 BAD_REQUEST with
     * error code BUILTIN_VIEW_IMMUTABLE. The repository deleteById MUST NOT be called.
     *
     * Validates: Requirement 3.5 (IDs 1–10 are reserved, cannot be deleted)
     */
    @Test
    void deleteAlertView_builtInView_returns400() throws Exception {
        // Act — attempt to delete built-in view ID 1
        mockMvc.perform(delete(VIEWS_ENDPOINT + "/1")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest());

        // Assert — repository delete was NEVER called
        verify(alertViewRepository, never()).deleteById(anyLong());
    }

    /**
     * Deleting built-in view ID 10 (upper boundary) MUST also return 400.
     *
     * Validates: Requirement 3.5
     */
    @Test
    void deleteAlertView_builtInViewId10_returns400() throws Exception {
        mockMvc.perform(delete(VIEWS_ENDPOINT + "/10")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest());

        verify(alertViewRepository, never()).deleteById(anyLong());
    }

    /**
     * Deleting view ID 11 (first non-built-in) proceeds normally if the caller
     * is the owner. This proves that the boundary check is ≤ 10, not < 10.
     *
     * Validates: Requirement 3.5
     */
    @Test
    void deleteAlertView_id11_succeeds_whenOwner() throws Exception {
        HaAlertView view = buildView(11L, "Custom view", 100L, false);
        when(alertViewRepository.findById(11L)).thenReturn(Optional.of(view));

        mockMvc.perform(delete(VIEWS_ENDPOINT + "/11")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        verify(alertViewRepository, times(1)).deleteById(11L);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sub-task 11: View owned by another user returns 403 on PATCH
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * PATCH on a view NOT owned by the caller AND NOT shared MUST return 403 Forbidden.
     * The view MUST NOT be modified.
     *
     * Validates: Requirement 3.4 (only owner or shared views can be updated)
     */
    @Test
    void patchAlertView_notOwnerNotShared_returns403() throws Exception {
        // View owned by otherUser (ID 200), NOT shared
        HaAlertView view = buildView(15L, "Other's view", 200L, false);
        when(alertViewRepository.findById(15L)).thenReturn(Optional.of(view));

        String patchBody = "{\"name\": \"Hijacked name\"}";

        mockMvc.perform(patch(VIEWS_ENDPOINT + "/15")
                .contentType(MediaType.APPLICATION_JSON)
                .content(patchBody)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isForbidden());

        // Assert — save was NEVER called; no modification happened
        verify(alertViewRepository, never()).save(any(HaAlertView.class));
    }

    /**
     * PATCH on a view owned by another user BUT shared MUST succeed (200 OK).
     * This confirms the shared-view update path.
     *
     * Validates: Requirement 3.4
     */
    @Test
    void patchAlertView_notOwnerButShared_returns200() throws Exception {
        // View owned by otherUser (ID 200), IS shared
        HaAlertView view = buildView(16L, "Shared team view", 200L, true);
        when(alertViewRepository.findById(16L)).thenReturn(Optional.of(view));
        when(alertViewRepository.save(any(HaAlertView.class))).thenAnswer(inv -> inv.getArgument(0));

        String patchBody = "{\"name\": \"Updated shared view\"}";

        mockMvc.perform(patch(VIEWS_ENDPOINT + "/16")
                .contentType(MediaType.APPLICATION_JSON)
                .content(patchBody)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Updated shared view"))
            .andExpect(jsonPath("$.version").value(2));

        verify(alertViewRepository, times(1)).save(any(HaAlertView.class));
    }

    /**
     * PATCH on a view owned by the caller MUST succeed (200 OK) and increment version.
     *
     * Validates: Requirement 3.4
     */
    @Test
    void patchAlertView_owner_returns200_andIncrementsVersion() throws Exception {
        // View owned by analyst (ID 100)
        HaAlertView view = buildView(17L, "My custom view", 100L, false);
        when(alertViewRepository.findById(17L)).thenReturn(Optional.of(view));
        when(alertViewRepository.save(any(HaAlertView.class))).thenAnswer(inv -> inv.getArgument(0));

        String patchBody = "{\"density\": \"compact\"}";

        mockMvc.perform(patch(VIEWS_ENDPOINT + "/17")
                .contentType(MediaType.APPLICATION_JSON)
                .content(patchBody)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.density").value("compact"))
            .andExpect(jsonPath("$.version").value(2));

        verify(alertViewRepository, times(1)).save(any(HaAlertView.class));
    }

    /**
     * DELETE on a non-built-in view NOT owned by the caller returns 403.
     *
     * Validates: Requirement 3.5
     */
    @Test
    void deleteAlertView_notOwner_returns403() throws Exception {
        HaAlertView view = buildView(20L, "Someone else's view", 200L, false);
        when(alertViewRepository.findById(20L)).thenReturn(Optional.of(view));

        mockMvc.perform(delete(VIEWS_ENDPOINT + "/20")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isForbidden());

        verify(alertViewRepository, never()).deleteById(anyLong());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Sets the SecurityContextHolder with a mock authentication for the given login.
     */
    private void setSecurityContext(String login) {
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                login,
                "password",
                List.of(new SimpleGrantedAuthority("ROLE_ANALYST"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    /**
     * Builds an {@link HaAlertView} with the supplied values and sensible defaults.
     */
    private static HaAlertView buildView(Long id, String name, Long ownerId, boolean isShared) {
        HaAlertView view = new HaAlertView();
        view.setId(id);
        view.setName(name);
        view.setOwnerId(ownerId);
        view.setFilterAst("{\"type\":\"bool\",\"must\":[{\"type\":\"term\",\"field\":\"status\",\"value\":\"active\"}]}");
        view.setSort("-severity,id");
        view.setDensity("default");
        view.setIsShared(isShared);
        view.setIsDefault(false);
        view.setVersion(1);
        view.setCreatedAt(Instant.parse("2026-08-01T10:00:00Z"));
        view.setUpdatedAt(Instant.parse("2026-08-01T10:00:00Z"));
        return view;
    }
}
