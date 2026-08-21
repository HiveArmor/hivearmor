package com.hivearmor.web.rest;

import com.hivearmor.HiveArmorApp;
import com.hivearmor.domain.HaSavedHunt;
import com.hivearmor.repository.HaSavedHuntRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for {@link HaSavedHuntResource} — GET /api/ha-saved-hunts endpoint.
 *
 * <p><strong>Property 11: Saved-hunts GET returns owner ∪ shared.</strong>
 * <ul>
 *   <li>The response array contains all hunts owned by the caller PLUS every hunt
 *       whose {@code isShared} flag is {@code true}, regardless of ownership.
 *   <li>An empty repository returns an empty JSON array (not null, not omitted).
 * </ul>
 *
 * <p>{@link HaSavedHuntRepository} is mocked via {@code @MockBean} so no live
 * PostgreSQL instance is required.
 *
 * <p>Validates: Requirements 5.5
 *
 * Run with: cd backend &amp;&amp; mvn -s settings.xml test -Dtest=HaSavedHuntResourceIntegrationTest
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
class HaSavedHuntResourceIntegrationTest {

    /** Endpoint under test. */
    private static final String ENDPOINT = "/api/ha-saved-hunts";

    @Autowired
    private MockMvc mockMvc;

    /** Mocked so no real PostgreSQL connection is attempted. */
    @MockBean
    private HaSavedHuntRepository savedHuntRepository;

    // ──────────────────────────────────────────────────────────────────────────
    // Property 11a — GET returns own hunts plus shared hunts
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 11 — GET /api/ha-saved-hunts returns the caller's own hunts together
     * with every hunt whose {@code isShared} flag is {@code true}.
     *
     * Setup: 3 hunts total — 2 owned by the authenticated user ("analyst"), 1 owned
     * by another user ("otherUser") with {@code isShared=true}.
     * Expected: all 3 hunts are returned.
     *
     * Validates: Requirements 5.5
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getSavedHunts_returnsOwnAndSharedHunts() throws Exception {
        // Arrange — 2 hunts owned by "analyst", 1 shared hunt from another user.
        HaSavedHunt ownHunt1 = buildHunt(1L, "Hunt Alpha", "analyst", false);
        HaSavedHunt ownHunt2 = buildHunt(2L, "Hunt Beta",  "analyst", false);
        HaSavedHunt sharedHunt = buildHunt(3L, "Shared Hunt", "otherUser", true);

        // The repository query returns owner-or-shared results; mock it to return all 3.
        when(savedHuntRepository.findAccessibleByLogin("analyst"))
            .thenReturn(List.of(ownHunt1, ownHunt2, sharedHunt));

        // Act & Assert
        mockMvc.perform(get(ENDPOINT)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            // All 3 hunts must be present
            .andExpect(jsonPath("$", hasSize(3)))
            // IDs must all be present in any order (set union check)
            .andExpect(jsonPath("$[*].id", containsInAnyOrder(1, 2, 3)))
            // Hunt names present
            .andExpect(jsonPath("$[*].huntName",
                containsInAnyOrder("Hunt Alpha", "Hunt Beta", "Shared Hunt")))
            // Index-based field checks (repository returns in the mocked insertion order)
            // hunt[0] = ownHunt1 — analyst, not shared
            .andExpect(jsonPath("$[0].id", is(1)))
            .andExpect(jsonPath("$[0].createdBy", is("analyst")))
            .andExpect(jsonPath("$[0].isShared", is(false)))
            // hunt[1] = ownHunt2 — analyst, not shared
            .andExpect(jsonPath("$[1].id", is(2)))
            .andExpect(jsonPath("$[1].createdBy", is("analyst")))
            .andExpect(jsonPath("$[1].isShared", is(false)))
            // hunt[2] = sharedHunt — another user, shared
            .andExpect(jsonPath("$[2].id", is(3)))
            .andExpect(jsonPath("$[2].createdBy", is("otherUser")))
            .andExpect(jsonPath("$[2].isShared", is(true)));

        // Confirm the repository was called with the authenticated user's login
        verify(savedHuntRepository, times(1)).findAccessibleByLogin("analyst");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Property 11b — empty repository yields empty array
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 11 (empty case) — when the repository returns no results, the response
     * body MUST be an empty JSON array ({@code []}), not {@code null} and not absent.
     *
     * Validates: Requirements 5.5
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getSavedHunts_noHunts_returnsEmptyArray() throws Exception {
        // Arrange — empty result set for this user
        when(savedHuntRepository.findAccessibleByLogin("analyst"))
            .thenReturn(Collections.emptyList());

        // Act & Assert
        mockMvc.perform(get(ENDPOINT)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$", hasSize(0)));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Property 11c — unauthenticated request returns 401
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 11 (authorization) — an unauthenticated request (no {@code Authorization}
     * header) MUST return HTTP 401 and the repository MUST NOT be queried.
     *
     * Validates: Requirements 5.4
     */
    @Test
    void getSavedHunts_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get(ENDPOINT)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());

        // Repository must never be touched for unauthenticated requests
        verify(savedHuntRepository, never()).findAccessibleByLogin(anyString());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Property 11d — ROLE_USER is rejected with 403
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 11 (authorization) — a user with only {@code ROLE_USER} authority
     * MUST be rejected with HTTP 403 and the repository MUST NOT be queried.
     *
     * Validates: Requirements 5.4
     */
    @Test
    @WithMockUser(username = "user1", authorities = {"ROLE_USER"})
    void getSavedHunts_roleUser_returns403() throws Exception {
        mockMvc.perform(get(ENDPOINT)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isForbidden());

        // Repository must never be touched for unauthorized callers
        verify(savedHuntRepository, never()).findAccessibleByLogin(anyString());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helper — construct a HaSavedHunt with the minimum fields populated
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Builds a {@link HaSavedHunt} with the supplied values and sensible defaults
     * for all other fields.
     *
     * @param id        hunt primary key
     * @param huntName  display name of the hunt
     * @param createdBy login of the owning user
     * @param isShared  whether the hunt is visible to all users
     * @return a populated, unsaved entity ready for use in mock stubs
     */
    private static HaSavedHunt buildHunt(Long id, String huntName,
                                          String createdBy, boolean isShared) {
        HaSavedHunt hunt = new HaSavedHunt();
        hunt.setId(id);
        hunt.setHuntName(huntName);
        hunt.setCreatedBy(createdBy);
        hunt.setCreatedAt(Instant.parse("2026-07-01T10:00:00Z"));
        hunt.setIsShared(isShared);
        hunt.setQueryDsl("{ \"match_all\": {} }");
        hunt.setNlQuery(null);
        hunt.setFilterJson(null);
        hunt.setLastUsedAt(null);
        return hunt;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Property 12 — DELETE access control: non-owner non-ADMIN gets 404 (no side-effects)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Property 12 — Non-owner non-ADMIN DELETE returns 404 without side-effects.
     *
     * <p>A caller with {@code ROLE_ANALYST} attempting to delete a hunt they do not own
     * MUST receive HTTP 404 (Requirement 5.6 information-leakage prevention).
     * The repository {@code deleteById} MUST NOT be called — the data must remain
     * intact after the rejected request.
     *
     * <p>Validates: Requirements 5.6
     */
    @Test
    @WithMockUser(username = "attacker", authorities = {"ROLE_ANALYST"})
    void deleteSavedHunt_nonOwnerNonAdmin_returns404_andNoDeletion() throws Exception {
        // Arrange: a hunt owned by "victim", not shared
        HaSavedHunt victimHunt = buildHunt(42L, "Victim Hunt", "victim", false);
        when(savedHuntRepository.findById(42L)).thenReturn(java.util.Optional.of(victimHunt));

        // Act
        mockMvc.perform(delete("/api/ha-saved-hunts/42")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNotFound());

        // Assert: deleteById was NEVER called — no side effects
        verify(savedHuntRepository, never()).deleteById(42L);
        verify(savedHuntRepository, times(1)).findById(42L);
    }

    /**
     * Property 12 (ADMIN variant) — an ADMIN caller CAN delete a hunt they do not own.
     *
     * <p>An ADMIN is authorised to delete any hunt regardless of ownership.
     * The repository {@code deleteById} MUST be called exactly once and the response
     * MUST be 204 No Content.
     *
     * <p>Validates: Requirements 5.6
     */
    @Test
    @WithMockUser(username = "admin", authorities = {"ROLE_ADMIN"})
    void deleteSavedHunt_admin_canDeleteOtherOwnerHunt_returns204() throws Exception {
        // Arrange: a hunt owned by "victim"; the caller is ADMIN, not the owner
        HaSavedHunt victimHunt = buildHunt(43L, "Other Owner Hunt", "victim", false);
        when(savedHuntRepository.findById(43L)).thenReturn(java.util.Optional.of(victimHunt));

        // Act & Assert
        mockMvc.perform(delete("/api/ha-saved-hunts/43")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Assert: deleteById was called exactly once
        verify(savedHuntRepository, times(1)).deleteById(43L);
    }

    /**
     * Property 12 (owner variant) — the owner of a hunt CAN delete their own hunt.
     *
     * <p>The hunt owner MUST be able to delete their own hunt and receive 204 No Content.
     * The repository {@code deleteById} MUST be called exactly once.
     *
     * <p>Validates: Requirements 5.6
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void deleteSavedHunt_owner_canDeleteOwnHunt_returns204() throws Exception {
        // Arrange: a hunt owned by "analyst" — same user as the authenticated caller
        HaSavedHunt ownHunt = buildHunt(44L, "My Hunt", "analyst", false);
        when(savedHuntRepository.findById(44L)).thenReturn(java.util.Optional.of(ownHunt));

        // Act & Assert
        mockMvc.perform(delete("/api/ha-saved-hunts/44")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Assert: deleteById was called exactly once
        verify(savedHuntRepository, times(1)).deleteById(44L);
    }

    /**
     * Property 12 (not-found variant) — deleting a non-existent hunt returns 404.
     *
     * <p>When the repository has no hunt with the requested ID, the endpoint MUST return
     * HTTP 404 and {@code deleteById} MUST NOT be called.
     *
     * <p>Validates: Requirements 5.6
     */
    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void deleteSavedHunt_nonExistent_returns404() throws Exception {
        // Arrange: no hunt with id 99 in the repository
        when(savedHuntRepository.findById(99L)).thenReturn(java.util.Optional.empty());

        // Act & Assert
        mockMvc.perform(delete("/api/ha-saved-hunts/99")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNotFound());

        // Assert: deleteById was never called
        verify(savedHuntRepository, never()).deleteById(99L);
        verify(savedHuntRepository, times(1)).findById(99L);
    }
}
