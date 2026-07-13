# S04-T05 — Fix User Activate Endpoint (404 Missing)

**Sprint:** 4 (Active Directory + Compliance)  
**Severity:** MEDIUM — Admin can't activate users from UI  
**Issue ID:** API (from page status table, admin/users)  
**Dependencies:** S03-T01 (RBAC active — admin users page is admin-only)  
**Estimated time:** 2 hours

---

## Context

The admin users page (`/admin/users`) tries to activate users via a backend endpoint that doesn't exist, returning 404. The "Activate" action for pending users fails silently.

**Affected files:**
- `frontend-v2/src/services/user.service.ts` — activate call
- Backend: `UserResource.java` — needs an activate endpoint

---

## What to Read First

1. `frontend-v2/src/app/(app)/admin/users/page.tsx` — find the activate button handler
2. `frontend-v2/src/services/user.service.ts` — find the `activateUser()` method and what path it calls
3. `backend/src/main/java/com/nilachakra/web/rest/UserResource.java` — look for activate endpoint; if missing, check `AccountResource.java`
4. `backend/src/main/java/com/nilachakra/service/UserService.java` — find if `activateRegistration()` or similar exists

---

## Implementation Steps

### Step 1: Find the existing activate logic in backend service

The backend `UserService` likely has an activation method already. Look for:
- `activateRegistration(String key)` — for email-based activation
- `activateUser(String login)` — for admin-triggered activation

If admin activation exists as a service method but no REST endpoint exposes it, add the endpoint.

### Step 2: Add or fix the backend endpoint

If the endpoint is missing, add it to `UserResource.java`:

```java
@PutMapping("/users/{login}/activate")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public ResponseEntity<Void> activateUser(@PathVariable String login) {
    log.debug("REST request to activate user: {}", login);
    
    userService.activateUser(login)
        .orElseThrow(() -> new BadRequestAlertException(
            "User not found", "userManagement", "notfound"));
    
    return ResponseEntity.ok().build();
}
```

In `UserService.java`, add if missing:

```java
public Optional<AdminUserDTO> activateUser(String login) {
    return userRepository.findOneByLogin(login.toLowerCase())
        .map(user -> {
            user.setActivated(true);
            userRepository.save(user);
            log.debug("Activated user: {}", login);
            return adminUserMapper.userToAdminUserDTO(user);
        });
}
```

### Step 3: Fix the frontend service method

In `user.service.ts`, update the activate call to use the correct path:

```typescript
async activateUser(login: string): Promise<void> {
    await apiClient.put(`/api/users/${login}/activate`);
}
```

### Step 4: Add deactivate endpoint (while you're here)

If admin needs to deactivate users too, add the symmetric endpoint:

```java
@PutMapping("/users/{login}/deactivate")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public ResponseEntity<Void> deactivateUser(@PathVariable String login) {
    // ... similar logic, set activated = false
}
```

### Step 5: Write tests

Backend test:
```java
@WebMvcTest(UserResource.class)
class UserActivateTest {

    @Autowired MockMvc mvc;
    @MockBean UserService userService;

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void activateUser_returnsOk() throws Exception {
        when(userService.activateUser("testuser"))
            .thenReturn(Optional.of(new AdminUserDTO()));
        
        mvc.perform(put("/api/users/testuser/activate"))
            .andExpect(status().isOk());
        
        verify(userService).activateUser("testuser");
    }

    @Test
    @WithMockUser(authorities = "ROLE_USER")
    void activateUser_forbiddenForNonAdmin() throws Exception {
        mvc.perform(put("/api/users/testuser/activate"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void activateUser_notFound_returns400() throws Exception {
        when(userService.activateUser("unknown")).thenReturn(Optional.empty());
        
        mvc.perform(put("/api/users/unknown/activate"))
            .andExpect(status().isBadRequest());
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q
./mvnw test -Dtest=UserActivateTest -DfailIfNoTests=false

# Manual test:
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Get a deactivated user login (or create one):
# Activate via API:
curl -s -X PUT \
  -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/users/testuser/activate" 
# Expected: 200 OK

# UI test: Admin > Users page — Activate button should work
```

---

## Acceptance Criteria

- [ ] `PUT /api/users/{login}/activate` endpoint exists and works
- [ ] Only ADMIN role can call it (USER gets 403)
- [ ] Non-existent login returns 400 (not 404 or 500)
- [ ] Frontend `activateUser()` calls the correct path
- [ ] All 3 backend tests pass
- [ ] Activate button in admin UI successfully activates the user
