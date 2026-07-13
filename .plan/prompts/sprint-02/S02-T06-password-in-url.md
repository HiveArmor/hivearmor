# S02-T06 — Change check-credentials from GET to POST

**Sprint:** 2 (Core SOC Workflows)  
**Severity:** HIGH — Password in server/proxy logs  
**Issue ID:** SEC-01  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

`GET /api/check-credentials?password=X` exposes the plaintext password in server access logs, browser history, nginx logs, and any reverse proxy/CDN that logs URLs. This is used by the Angular frontend's password re-verification flow. Must be changed to a POST endpoint.

**Affected backend file:**
`backend/src/main/java/com/nilachakra/web/rest/UserJWTController.java` (~line 132)

---

## What to Read First

1. `backend/src/main/java/com/nilachakra/web/rest/UserJWTController.java` — find the check-credentials method
2. Search Angular frontend for callers: `grep -r "check-credentials" frontend/src/ --include="*.ts" -l`
3. Search Next.js frontend: `grep -r "check-credentials" frontend-v2/src/ --include="*.ts" -l`

---

## Implementation Steps

### Step 1: Change backend endpoint from GET to POST

In `UserJWTController.java`:

```java
// BEFORE (vulnerable):
@GetMapping("/check-credentials")
public ResponseEntity<Boolean> checkCredentials(@RequestParam String username,
                                                @RequestParam String password) {
    // ...
}

// AFTER (safe):
@PostMapping("/check-credentials")
public ResponseEntity<Boolean> checkCredentials(@RequestBody CheckCredentialsRequest request) {
    // Use request.getUsername() and request.getPassword()
}
```

Create the request DTO:

```java
// New file or add to existing DTOs package:
package com.nilachakra.service.dto;

public class CheckCredentialsRequest {
    private String username;
    private String password;
    
    // getters and setters
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
```

### Step 2: Verify `SecurityConfiguration.java` allows POST

The `permitAll()` rule for check-credentials (if it exists) must include POST. Check `SecurityConfiguration.java` for any rule matching `/api/check-credentials`. If it's under the catch-all `/api/**` requiring auth, no change needed.

### Step 3: Fix Angular frontend callers

In `frontend/src/`:

```bash
grep -rn "check-credentials" frontend/src/ --include="*.ts"
```

For each caller, change from:
```typescript
// BEFORE:
this.http.get('/api/check-credentials', { params: { username, password } })

// AFTER:
this.http.post('/api/check-credentials', { username, password })
```

### Step 4: Fix Next.js frontend callers (if any)

```bash
grep -rn "check-credentials" frontend-v2/src/ --include="*.ts"
```

Apply the same fix if found.

### Step 5: Backend unit test

Create: `backend/src/test/java/com/nilachakra/web/rest/UserJWTControllerTest.java` (or add to existing)

```java
@WebMvcTest(UserJWTController.class)
@AutoConfigureMockMvc(addFilters = false)
class CheckCredentialsTest {

    @Autowired MockMvc mvc;
    @MockBean UserService userService;
    @MockBean PasswordEncoder passwordEncoder;

    @Test
    void checkCredentials_isPostNotGet() throws Exception {
        // GET should return 405 Method Not Allowed
        mvc.perform(get("/api/check-credentials")
                .param("username", "admin")
                .param("password", "secret"))
            .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void checkCredentials_post_doesNotExposePasswordInUrl() throws Exception {
        when(passwordEncoder.matches(any(), any())).thenReturn(true);
        
        MvcResult result = mvc.perform(post("/api/check-credentials")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"localdev123!\"}"))
            .andExpect(status().isOk())
            .andReturn();
        
        // Verify request URL does NOT contain the password
        assertThat(result.getRequest().getRequestURI()).doesNotContain("localdev123!");
        assertThat(result.getRequest().getQueryString()).isNullOrEmpty();
    }

    @Test
    void checkCredentials_post_withWrongPassword_returnsFalse() throws Exception {
        when(passwordEncoder.matches(any(), any())).thenReturn(false);
        
        mvc.perform(post("/api/check-credentials")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").value(false));
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q

./mvnw test -Dtest=CheckCredentialsTest -DfailIfNoTests=false

# Manual test — GET must fail:
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8088/api/check-credentials?username=admin&password=test"
# Expected: 405

# POST must succeed:
curl -s -X POST http://localhost:8088/api/check-credentials \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!"}' | jq '.'
# Expected: true
```

---

## Acceptance Criteria

- [ ] `GET /api/check-credentials?password=...` returns HTTP 405
- [ ] `POST /api/check-credentials` with JSON body works correctly
- [ ] No Angular or Next.js frontend file calls the GET form
- [ ] Backend unit tests pass
- [ ] Password does NOT appear in any request URL in the access logs when testing
