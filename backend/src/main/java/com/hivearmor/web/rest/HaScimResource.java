package com.hivearmor.web.rest;

import com.hivearmor.service.HaScimService;
import com.hivearmor.service.dto.scim.ScimGroup;
import com.hivearmor.service.dto.scim.ScimListResponse;
import com.hivearmor.service.dto.scim.ScimUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * HiveArmor SCIM 2.0 REST controller — RFC 7644.
 *
 * <p>Exposes six User endpoints and six Group endpoints under
 * {@code /api/ha-scim/v2/}. Authentication is handled exclusively by
 * {@code ScimTokenAuthFilter} — no {@code @PreAuthorize} annotation is placed
 * on any endpoint in this controller.
 *
 * <p>Design constraints upheld:
 * <ul>
 *   <li>Constructor injection only — no {@code @Autowired} on fields or setters.</li>
 *   <li>No Lombok annotations.</li>
 *   <li>No {@code java.util.List#getFirst()} calls — {@code .get(0)} used throughout.</li>
 *   <li>No SCIM tokens, JWTs, passwords, or full user payloads are logged.</li>
 *   <li>No {@code @PreAuthorize} on any endpoint — SCIM auth is handled by the filter.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ha-scim/v2")
public class HaScimResource {

    private static final Logger log = LoggerFactory.getLogger(HaScimResource.class);
    private static final String CLASSNAME = "HaScimResource";

    private final HaScimService scimService;

    public HaScimResource(HaScimService scimService) {
        this.scimService = scimService;
    }

    // =========================================================================
    // USER ENDPOINTS
    // =========================================================================

    /**
     * {@code GET /api/ha-scim/v2/Users} — list users, optionally filtered.
     *
     * <p>Supports the SCIM filter {@code userName eq "<value>"} (RFC 7644 §3.4.2).
     * When no filter is supplied, all users are returned.
     *
     * @param filter optional SCIM filter string (e.g. {@code userName eq "alice"})
     * @return HTTP 200 with a {@link ScimListResponse} of {@link ScimUser} objects
     */
    @GetMapping("/Users")
    public ResponseEntity<ScimListResponse<ScimUser>> listUsers(
            @RequestParam(required = false) String filter) {

        log.debug("{}.listUsers: filter present={}", CLASSNAME, filter != null && !filter.isBlank());
        ScimListResponse<ScimUser> response = scimService.listUsers(filter);
        return ResponseEntity.ok(response);
    }

    /**
     * {@code GET /api/ha-scim/v2/Users/{id}} — retrieve a single user by id.
     *
     * @param id the numeric user id as a path segment
     * @return HTTP 200 with the {@link ScimUser}, or HTTP 404 if not found
     */
    @GetMapping("/Users/{id}")
    public ResponseEntity<ScimUser> getUserById(@PathVariable String id) {
        log.debug("{}.getUserById: id={}", CLASSNAME, id);
        Optional<ScimUser> user = scimService.getUserById(id);
        return user
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * {@code POST /api/ha-scim/v2/Users} — provision a new user.
     *
     * <p>Returns HTTP 201 with a {@code Location} header pointing to the new resource.
     *
     * @param scimUser the inbound SCIM User representation
     * @return HTTP 201 with the created {@link ScimUser} body and a {@code Location} header
     */
    @PostMapping("/Users")
    public ResponseEntity<ScimUser> createUser(@RequestBody ScimUser scimUser) {
        log.debug("{}.createUser: userName={}", CLASSNAME, scimUser.getUserName());
        ScimUser created = scimService.createUser(scimUser);
        URI location = URI.create("/api/ha-scim/v2/Users/" + created.getId());
        return ResponseEntity.created(location).body(created);
    }

    /**
     * {@code PUT /api/ha-scim/v2/Users/{id}} — replace a user's attributes (full update).
     *
     * @param id       the numeric user id as a path segment
     * @param scimUser the inbound SCIM User representation with updated fields
     * @return HTTP 200 with the updated {@link ScimUser}, or HTTP 404 if not found
     */
    @PutMapping("/Users/{id}")
    public ResponseEntity<ScimUser> updateUser(
            @PathVariable String id,
            @RequestBody ScimUser scimUser) {

        log.debug("{}.updateUser: id={}", CLASSNAME, id);
        Optional<ScimUser> updated = scimService.updateUser(id, scimUser);
        return updated
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * {@code PATCH /api/ha-scim/v2/Users/{id}} — apply a SCIM PatchOp.
     *
     * <p>Only the {@code replace} operation with {@code active = false} is acted upon;
     * all other operations are accepted but ignored (per the out-of-scope note in the
     * design document). The {@code Operations} key is matched case-insensitively.
     *
     * @param id   the numeric user id as a path segment
     * @param body the raw PatchOp document as a generic map
     * @return HTTP 200 with the (potentially deactivated) {@link ScimUser}, or HTTP 404
     */
    @PatchMapping("/Users/{id}")
    public ResponseEntity<ScimUser> patchUser(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {

        log.debug("{}.patchUser: id={}", CLASSNAME, id);

        // Locate the Operations array case-insensitively (RFC 7644 §3.5.2).
        List<?> operations = null;
        for (Map.Entry<String, Object> entry : body.entrySet()) {
            if ("operations".equalsIgnoreCase(entry.getKey()) && entry.getValue() instanceof List) {
                operations = (List<?>) entry.getValue();
                break;
            }
        }

        if (operations != null) {
            for (Object item : operations) {
                if (!(item instanceof Map)) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> op = (Map<String, Object>) item;

                String opType = op.get("op") instanceof String ? (String) op.get("op") : null;
                if (!"replace".equalsIgnoreCase(opType)) {
                    continue;
                }

                Object value = op.get("value");
                if (value instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> valueMap = (Map<String, Object>) value;
                    Object activeVal = valueMap.get("active");
                    if (Boolean.FALSE.equals(activeVal)) {
                        scimService.deactivateUser(id);
                    }
                } else if (Boolean.FALSE.equals(value)) {
                    // Support both {"op":"replace","path":"active","value":false}
                    // and {"op":"replace","value":{"active":false}} forms.
                    Object path = op.get("path");
                    if ("active".equalsIgnoreCase(String.valueOf(path))) {
                        scimService.deactivateUser(id);
                    }
                }
            }
        }

        Optional<ScimUser> user = scimService.getUserById(id);
        return user
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * {@code DELETE /api/ha-scim/v2/Users/{id}} — soft-delete a user.
     *
     * <p>Sets {@code activated = false} on the {@code jhi_user} row; no physical
     * deletion is performed (per HiveArmor SCIM design constraint).
     *
     * @param id the numeric user id as a path segment
     * @return HTTP 204 No Content on success, or HTTP 404 if not found
     */
    @DeleteMapping("/Users/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable String id) {
        log.debug("{}.deleteUser: id={}", CLASSNAME, id);
        boolean found = scimService.deactivateUser(id);
        if (found) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    // =========================================================================
    // GROUP ENDPOINTS
    // =========================================================================

    /**
     * {@code GET /api/ha-scim/v2/Groups} — list all HiveArmor authorities as SCIM groups.
     *
     * @return HTTP 200 with a {@link ScimListResponse} of {@link ScimGroup} objects
     */
    @GetMapping("/Groups")
    public ResponseEntity<ScimListResponse<ScimGroup>> listGroups() {
        log.debug("{}.listGroups", CLASSNAME);
        ScimListResponse<ScimGroup> response = scimService.listGroups();
        return ResponseEntity.ok(response);
    }

    /**
     * {@code GET /api/ha-scim/v2/Groups/{id}} — retrieve a single group.
     *
     * <p>The authority name is used as the group id; the list is searched for a
     * matching entry.
     *
     * @param id the group id (authority name)
     * @return HTTP 200 with the matching {@link ScimGroup}, or HTTP 404 if not found
     */
    @GetMapping("/Groups/{id}")
    public ResponseEntity<ScimGroup> getGroupById(@PathVariable String id) {
        log.debug("{}.getGroupById: id={}", CLASSNAME, id);
        ScimListResponse<ScimGroup> all = scimService.listGroups();
        if (all.getResources() != null) {
            for (ScimGroup group : all.getResources()) {
                if (id.equals(group.getId())) {
                    return ResponseEntity.ok(group);
                }
            }
        }
        return ResponseEntity.notFound().build();
    }

    /**
     * {@code POST /api/ha-scim/v2/Groups} — not implemented.
     *
     * <p>Group mutations are out of scope for this sprint (returns HTTP 501).
     *
     * @return HTTP 501 Not Implemented
     */
    @PostMapping("/Groups")
    public ResponseEntity<Void> createGroup() {
        return ResponseEntity.status(501).build();
    }

    /**
     * {@code PUT /api/ha-scim/v2/Groups/{id}} — not implemented.
     *
     * @return HTTP 501 Not Implemented
     */
    @PutMapping("/Groups/{id}")
    public ResponseEntity<Void> updateGroup(@PathVariable String id) {
        return ResponseEntity.status(501).build();
    }

    /**
     * {@code PATCH /api/ha-scim/v2/Groups/{id}} — not implemented.
     *
     * @return HTTP 501 Not Implemented
     */
    @PatchMapping("/Groups/{id}")
    public ResponseEntity<Void> patchGroup(@PathVariable String id) {
        return ResponseEntity.status(501).build();
    }

    /**
     * {@code DELETE /api/ha-scim/v2/Groups/{id}} — not implemented.
     *
     * @return HTTP 501 Not Implemented
     */
    @DeleteMapping("/Groups/{id}")
    public ResponseEntity<Void> deleteGroup(@PathVariable String id) {
        return ResponseEntity.status(501).build();
    }
}
