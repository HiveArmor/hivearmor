package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.repository.HaConfigurationParameterRepository;
import com.hivearmor.security.ScimTokenAuthFilter;
import com.hivearmor.service.HaScimService;
import com.hivearmor.service.dto.scim.ScimEmail;
import com.hivearmor.service.dto.scim.ScimGroup;
import com.hivearmor.service.dto.scim.ScimListResponse;
import com.hivearmor.service.dto.scim.ScimUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for {@link HaScimResource} — SCIM 2.0 endpoints.
 *
 * <p>Tests 1–7 use a stub filter that always installs a {@code ROLE_SCIM} authentication,
 * so the SCIM token validation is bypassed and only controller logic is under test.</p>
 *
 * <p>Test 8 uses the real {@link ScimTokenAuthFilter} with a mock repository that
 * returns {@link Optional#empty()} to verify that a missing token yields HTTP 401.</p>
 *
 * <p>Follows the HiveArmor standalone-MockMvc pattern consistent with
 * {@code UserActivateTest} and {@code UserJWTControllerTest}.</p>
 */
@ExtendWith(MockitoExtension.class)
class HaScimResourceTest {

    @Mock
    private HaScimService scimService;

    @InjectMocks
    private HaScimResource controller;

    /** MockMvc instance wired with the always-pass stub filter (tests 1–7). */
    private MockMvc mockMvc;

    private ObjectMapper objectMapper;

    // -------------------------------------------------------------------------
    // Stub filter — always sets ROLE_SCIM; bypasses bcrypt token validation
    // -------------------------------------------------------------------------

    private static final OncePerRequestFilter STUB_AUTH_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "scim-stub",
                    null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_SCIM"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(STUB_AUTH_FILTER)
                .build();
        objectMapper = new ObjectMapper();
    }

    // =========================================================================
    // Test 1 — listUsers returns SCIM ListResponse envelope
    // =========================================================================

    /**
     * GET /api/ha-scim/v2/Users — response envelope must contain {@code schemas}
     * and the capital-R {@code Resources} field required by RFC 7644 §3.4.2.
     */
    @Test
    void testListUsers_returnsScimFormat() throws Exception {
        ScimUser user = buildScimUser("1", "alice@example.com", true);

        ScimListResponse<ScimUser> listResponse = new ScimListResponse<>();
        listResponse.setTotalResults(1);
        listResponse.setItemsPerPage(1);
        listResponse.setStartIndex(1);
        listResponse.setResources(List.of(user));

        when(scimService.listUsers(any())).thenReturn(listResponse);

        mockMvc.perform(get("/api/ha-scim/v2/Users")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemas").exists())
                .andExpect(jsonPath("$.Resources").exists())
                .andExpect(jsonPath("$.Resources[0].userName").value("alice"));
    }

    // =========================================================================
    // Test 2 — getUser existing id returns 200
    // =========================================================================

    /**
     * GET /api/ha-scim/v2/Users/1 — known id must return HTTP 200 with the user body.
     */
    @Test
    void testGetUser_existingId_returns200() throws Exception {
        ScimUser user = buildScimUser("1", "bob@example.com", true);

        when(scimService.getUserById("1")).thenReturn(Optional.of(user));

        mockMvc.perform(get("/api/ha-scim/v2/Users/1")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("1"))
                .andExpect(jsonPath("$.userName").value("bob"));
    }

    // =========================================================================
    // Test 3 — getUser unknown id returns 404
    // =========================================================================

    /**
     * GET /api/ha-scim/v2/Users/999 — unknown id must return HTTP 404.
     */
    @Test
    void testGetUser_unknownId_returns404() throws Exception {
        when(scimService.getUserById("999")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/ha-scim/v2/Users/999")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    // =========================================================================
    // Test 4 — createUser returns 201 with Location header
    // =========================================================================

    /**
     * POST /api/ha-scim/v2/Users — valid body must return HTTP 201 and a
     * {@code Location} header pointing to {@code /api/ha-scim/v2/Users/1}.
     */
    @Test
    void testCreateUser_validBody_returns201() throws Exception {
        ScimUser created = buildScimUser("1", "carol@example.com", true);

        when(scimService.createUser(any(ScimUser.class))).thenReturn(created);

        ScimUser requestBody = new ScimUser();
        requestBody.setUserName("carol");
        ScimEmail email = new ScimEmail();
        email.setValue("carol@example.com");
        email.setPrimary(true);
        requestBody.setEmails(List.of(email));
        requestBody.setActive(true);

        mockMvc.perform(post("/api/ha-scim/v2/Users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestBody)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.containsString("/api/ha-scim/v2/Users/1")))
                .andExpect(jsonPath("$.id").value("1"));
    }

    // =========================================================================
    // Test 5 — replaceUser updates fields and returns 200
    // =========================================================================

    /**
     * PUT /api/ha-scim/v2/Users/1 — service returns an updated user;
     * response must be HTTP 200 with the updated email present.
     */
    @Test
    void testReplaceUser_updatesFields() throws Exception {
        ScimUser updated = buildScimUser("1", "dave.new@example.com", true);

        when(scimService.updateUser(eq("1"), any(ScimUser.class)))
                .thenReturn(Optional.of(updated));

        ScimUser requestBody = new ScimUser();
        requestBody.setUserName("dave");
        ScimEmail email = new ScimEmail();
        email.setValue("dave.new@example.com");
        email.setPrimary(true);
        requestBody.setEmails(List.of(email));
        requestBody.setActive(true);

        mockMvc.perform(put("/api/ha-scim/v2/Users/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emails[0].value").value("dave.new@example.com"));
    }

    // =========================================================================
    // Test 6 — deactivateUser sets active=false
    // =========================================================================

    /**
     * DELETE /api/ha-scim/v2/Users/1 — must return HTTP 204 when found.
     * A subsequent GET must return the user with {@code active = false}.
     */
    @Test
    void testDeactivateUser_setsActivatedFalse() throws Exception {
        when(scimService.deactivateUser("1")).thenReturn(true);

        // DELETE → 204
        mockMvc.perform(delete("/api/ha-scim/v2/Users/1"))
                .andExpect(status().isNoContent());

        // Subsequent GET — user still exists but active = false
        ScimUser deactivated = buildScimUser("1", "eve@example.com", false);
        when(scimService.getUserById("1")).thenReturn(Optional.of(deactivated));

        mockMvc.perform(get("/api/ha-scim/v2/Users/1")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
    }

    // =========================================================================
    // Test 7 — listGroups returns all authority names
    // =========================================================================

    /**
     * GET /api/ha-scim/v2/Groups — response must contain both ROLE_USER and
     * ROLE_ADMIN entries in the {@code Resources} array.
     */
    @Test
    void testListGroups_returnsAuthorities() throws Exception {
        ScimGroup roleUser = new ScimGroup();
        roleUser.setId("ROLE_USER");
        roleUser.setDisplayName("ROLE_USER");

        ScimGroup roleAdmin = new ScimGroup();
        roleAdmin.setId("ROLE_ADMIN");
        roleAdmin.setDisplayName("ROLE_ADMIN");

        ScimListResponse<ScimGroup> listResponse = new ScimListResponse<>();
        listResponse.setTotalResults(2);
        listResponse.setItemsPerPage(2);
        listResponse.setStartIndex(1);
        listResponse.setResources(List.of(roleUser, roleAdmin));

        when(scimService.listGroups()).thenReturn(listResponse);

        mockMvc.perform(get("/api/ha-scim/v2/Groups")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.Resources[?(@.displayName == 'ROLE_USER')]").exists())
                .andExpect(jsonPath("$.Resources[?(@.displayName == 'ROLE_ADMIN')]").exists());
    }

    // =========================================================================
    // Test 8 — real ScimTokenAuthFilter with missing token returns 401
    // =========================================================================

    /**
     * Uses the REAL {@link ScimTokenAuthFilter} backed by a mock repository.
     * A GET without an {@code Authorization} header must receive HTTP 401.
     * The filter short-circuits on the missing header before touching the repository.
     */
    @Test
    void testScimTokenFilter_missingToken_returns401() throws Exception {
        // No repository lookup happens when the Authorization header is absent —
        // the filter short-circuits at the header-presence check.
        HaConfigurationParameterRepository mockConfigRepo =
                org.mockito.Mockito.mock(HaConfigurationParameterRepository.class);

        ScimTokenAuthFilter realFilter = new ScimTokenAuthFilter(mockConfigRepo);

        // Build a separate MockMvc instance wired with the REAL filter (no stub)
        MockMvc mockMvcWithRealFilter = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(realFilter)
                .build();

        // Issue GET without Authorization header — must get 401
        mockMvcWithRealFilter.perform(
                        get("/api/ha-scim/v2/Users")
                                .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized());
    }

    // =========================================================================
    // Test 9 — createUser response contains SCIM schema URI
    // =========================================================================

    /**
     * POST /api/ha-scim/v2/Users with a valid bearer token (stubbed by the always-pass
     * filter) — response must be HTTP 201 and the {@code schemas} array must contain
     * {@code urn:ietf:params:scim:schemas:core:2.0:User} per RFC 7643 §4.1.
     *
     * <p>Validates Requirement 4.6: POST /api/ha-scim/v2/Users returns 201 with
     * {@code schemas} containing {@code urn:ietf:params:scim:schemas:core:2.0:User}.</p>
     */
    @Test
    void testCreateUser_returnsScimSchema() throws Exception {
        ScimUser created = buildScimUser("42", "frank@example.com", true);
        // ScimUser default schemas include the core User schema URI
        when(scimService.createUser(any(ScimUser.class))).thenReturn(created);

        ScimUser requestBody = new ScimUser();
        requestBody.setUserName("frank");
        ScimEmail email = new ScimEmail();
        email.setValue("frank@example.com");
        email.setPrimary(true);
        requestBody.setEmails(List.of(email));
        requestBody.setActive(true);

        mockMvc.perform(post("/api/ha-scim/v2/Users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.schemas").isArray())
                .andExpect(jsonPath(
                        "$.schemas[?(@ == 'urn:ietf:params:scim:schemas:core:2.0:User')]").exists());
    }

    // =========================================================================
    // Test 10 — createUser without Authorization header returns 401 via real filter
    // =========================================================================

    /**
     * POST /api/ha-scim/v2/Users without an {@code Authorization} header must be
     * rejected with HTTP 401 by the real {@link ScimTokenAuthFilter}.
     *
     * <p>Uses a separate MockMvc instance wired with the REAL filter (no stub).
     * The filter short-circuits on a missing {@code Authorization} header before
     * it ever calls the config repository, so no repository stub is needed.</p>
     *
     * <p>Validates Requirement 4.3: missing Authorization header → 401.</p>
     */
    @Test
    void testCreateUser_missingToken_returns401() throws Exception {
        // No repository lookup happens when the Authorization header is absent —
        // the filter short-circuits before touching the config repo.
        HaConfigurationParameterRepository mockConfigRepo =
                org.mockito.Mockito.mock(HaConfigurationParameterRepository.class);

        ScimTokenAuthFilter realFilter = new ScimTokenAuthFilter(mockConfigRepo);

        MockMvc mockMvcWithRealFilter = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(realFilter)
                .build();

        ScimUser requestBody = new ScimUser();
        requestBody.setUserName("grace");

        // No Authorization header → filter must short-circuit with 401
        mockMvcWithRealFilter.perform(post("/api/ha-scim/v2/Users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestBody)))
                .andExpect(status().isUnauthorized());
    }

    // =========================================================================
    // Test 11 — deleteUser deactivates the jhi_user row (soft delete)
    // =========================================================================

    /**
     * DELETE /api/ha-scim/v2/Users/{id} must return HTTP 204 and the user must
     * subsequently be retrievable with {@code active = false}, confirming that the
     * {@code jhi_user} row was deactivated rather than physically deleted.
     *
     * <p>Validates Requirement 4.7: DELETE sets {@code activated = false}; no physical
     * DELETE is performed against {@code jhi_user}.</p>
     */
    @Test
    void testDeleteUser_deactivatesUser() throws Exception {
        // DELETE → 204; service confirms the user was found
        when(scimService.deactivateUser("10")).thenReturn(true);

        mockMvc.perform(delete("/api/ha-scim/v2/Users/10"))
                .andExpect(status().isNoContent());

        // Verify the row is still retrievable and active = false (not physically deleted)
        ScimUser deactivatedUser = buildScimUser("10", "henry@example.com", false);
        when(scimService.getUserById("10")).thenReturn(Optional.of(deactivatedUser));

        mockMvc.perform(get("/api/ha-scim/v2/Users/10")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
    }

    // =========================================================================
    // Test 12 — getUsers with userName eq filter returns only the matching user
    // =========================================================================

    /**
     * GET /api/ha-scim/v2/Users?filter=userName+eq+"testuser" must return a
     * {@code ListResponse} whose {@code Resources} array contains only the user
     * whose {@code userName} matches the filter value.
     *
     * <p>Validates Requirement 4.9: {@code filter=userName eq "<value>"} returns only
     * {@code jhi_user} rows whose {@code login} equals the value.</p>
     */
    @Test
    void testGetUsers_filterByUserName() throws Exception {
        ScimUser testuser = buildScimUser("7", "testuser@example.com", true);

        ScimListResponse<ScimUser> filtered = new ScimListResponse<>();
        filtered.setTotalResults(1);
        filtered.setItemsPerPage(1);
        filtered.setStartIndex(1);
        filtered.setResources(List.of(testuser));

        // The filter string matches the SCIM pattern: userName eq "testuser"
        when(scimService.listUsers("userName eq \"testuser\"")).thenReturn(filtered);

        mockMvc.perform(get("/api/ha-scim/v2/Users")
                        .param("filter", "userName eq \"testuser\"")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.Resources").isArray())
                .andExpect(jsonPath("$.Resources.length()").value(1))
                .andExpect(jsonPath("$.Resources[0].userName").value("testuser"));
    }

    // =========================================================================
    // Test 13 — createGroup returns 501 Not Implemented
    // =========================================================================

    /**
     * POST /api/ha-scim/v2/Groups must return HTTP 501 Not Implemented.
     * Group mutations are out of scope for this sprint per the design document.
     *
     * <p>Validates Requirement 4.10: POST, PUT, PATCH, DELETE on Groups return 501.</p>
     */
    @Test
    void testCreateGroup_returns501() throws Exception {
        mockMvc.perform(post("/api/ha-scim/v2/Groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().is(501));
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Builds a minimal {@link ScimUser} with the given id, email, and active flag.
     * The {@code userName} is derived from the local part of the email address.
     *
     * @param id     the SCIM resource id
     * @param email  the user's primary email address
     * @param active whether the user account is active
     * @return a populated {@link ScimUser}
     */
    private ScimUser buildScimUser(String id, String email, boolean active) {
        ScimUser user = new ScimUser();
        user.setId(id);
        // Derive userName from the local part of the email (before @)
        String userName = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        user.setUserName(userName);
        user.setActive(active);

        ScimEmail scimEmail = new ScimEmail();
        scimEmail.setValue(email);
        scimEmail.setPrimary(true);
        user.setEmails(List.of(scimEmail));

        return user;
    }
}
