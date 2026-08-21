# 23 — Recommended First Batch
## HiveArmor frontend-v3

**Audit date:** 2026-07-26  
**Author:** Phase 2 audit

---

## Recommendation: H0-SEC-01 — Add `@PreAuthorize` to Critical Backend Endpoints

### 1. Why This Is the Safest and Highest-Leverage First Batch

The Phase 1 audit identified 6 P0 security gaps where backend REST endpoints accept mutations from any authenticated user, regardless of role. The most immediately dangerous are the alert mutation endpoints (`UtmAlertResource.java`), the authority/role management endpoints (`AuthorityResource.java`), and the incident CRUD endpoints (`UtmIncidentResource.java`).

**No other implementation work is safe to ship while these gaps exist.** Specifically:
- Alert mutation endpoints allow ROLE_USER (the lowest privilege level) to change alert status, add tags, add notes, and convert alerts to incidents — bypassing the entire analyst workflow RBAC model
- Authority endpoints allow any authenticated user to create a `ROLE_ADMIN` role assignment for themselves — a complete privilege escalation path
- Incident CRUD is unprotected, allowing any authenticated user to create, modify, and close security incidents

These are not hypothetical risks. The endpoints are confirmed open through backend source code analysis (doc 06, doc 07). Any user with valid credentials — including a compromised read-only service account — has full write access to the SIEM's core data.

Adding `@PreAuthorize` is a small, additive, independently rollbackable change. It requires no schema changes, no data migrations, no frontend changes, and no dependency updates. It is the highest-leverage security action available: 3 Java annotations prevent 3 classes of escalation.

**The H0-SEC-01 batch groups the 3 highest-priority annotation fixes into a single reviewable PR.** The remaining SEC-02 through SEC-08 fixes are best delivered as follow-on PRs in the same sprint — each is a similarly small annotation change.

---

### 2. Preconditions (What Must Be True Before Starting)

1. Local development environment is running (`cd local-dev && docker compose up -d`)
2. Backend development server can be started (`cd backend && mvn -s settings.xml -B`)
3. `$MAVEN_TK` environment variable is set (GitHub PAT with `read:packages`)
4. Developer has read `backend/src/main/java/com/hivearmor/web/rest/UtmAlertResource.java` to understand the current method signatures
5. `mvn -s settings.xml test` passes in its current state (no pre-existing test failures)
6. Security lead has reviewed and approved the role assignments for each endpoint (see acceptance criteria)
7. Spring Security role hierarchy is understood: `ADMIN > SOC_MANAGER > ANALYST > THREAT_HUNTER > READ_ONLY > USER`

---

### 3. Exact Scope — Every Java File to Modify with the Specific Annotation

#### File 1: `backend/src/main/java/com/hivearmor/web/rest/UtmAlertResource.java`

Add `@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN','THREAT_HUNTER')")` to each of:

```java
// POST /api/ha-alerts/status
@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN','THREAT_HUNTER')")
public ResponseEntity<Void> updateAlertStatus(...) { ... }

// POST /api/ha-alerts/notes
@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN','THREAT_HUNTER')")
public ResponseEntity<Void> addNote(...) { ... }

// POST /api/ha-alerts/tags
@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN','THREAT_HUNTER')")
public ResponseEntity<Void> addTag(...) { ... }

// POST /api/ha-alerts/convert-to-incident
@PreAuthorize("hasAnyRole('SOC_MANAGER','ADMIN')")
public ResponseEntity<Void> convertToIncident(...) { ... }
```

Note: `convert-to-incident` is restricted to `SOC_MANAGER` and above — creating incidents is a higher-privilege operation than annotating alerts.

#### File 2: `backend/src/main/java/com/hivearmor/web/rest/AuthorityResource.java`

Add `@PreAuthorize("hasRole('ADMIN')")` to each of:

```java
// GET /api/authority
@PreAuthorize("hasRole('ADMIN')")
public ResponseEntity<List<String>> getAuthorities(...) { ... }

// POST /api/authority
@PreAuthorize("hasRole('ADMIN')")
public ResponseEntity<Void> createAuthority(...) { ... }

// PUT /api/authority
@PreAuthorize("hasRole('ADMIN')")
public ResponseEntity<Void> updateAuthority(...) { ... }

// DELETE /api/authority/{name}
@PreAuthorize("hasRole('ADMIN')")
public ResponseEntity<Void> deleteAuthority(...) { ... }
```

#### File 3: `backend/src/main/java/com/hivearmor/web/rest/UtmIncidentResource.java`

Add `@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN')")` to each mutation method:

```java
// POST /api/ha-incidents
@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN')")
public ResponseEntity<UtmIncidentDTO> createIncident(...) { ... }

// PUT /api/ha-incidents/change-status
@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN')")
public ResponseEntity<Void> changeStatus(...) { ... }

// PUT /api/ha-incidents/{id}/priority
@PreAuthorize("hasAnyRole('SOC_MANAGER','ADMIN')")
public ResponseEntity<Void> updatePriority(...) { ... }
```

Read operations (`GET /api/ha-incidents`, `GET /api/ha-incidents/{id}`) may retain the existing `hasAnyRole(ADMIN,USER)` catch-all for now — the critical fix is on mutations.

---

### 4. Protected Areas — What Must NOT Be Touched

- Do NOT modify `SecurityConfiguration.java` (Spring Security filter chain) — additive `@PreAuthorize` annotations do not require filter chain changes
- Do NOT change any Liquibase changelogs — this is a pure Java annotation change, no database schema change
- Do NOT touch any frontend files in this batch
- Do NOT touch `UtmAlertResource.java` GET endpoints — read operations are intentionally broader-access
- Do NOT modify `@PreAuthorize` on any other resource files outside the 3 listed above — scope creep in a security-critical PR introduces risk
- Do NOT add new endpoints in this batch — only add annotations to existing methods

---

### 5. Files Expected to Change (Exact Paths)

**Modified:**
- `backend/src/main/java/com/hivearmor/web/rest/UtmAlertResource.java`
- `backend/src/main/java/com/hivearmor/web/rest/AuthorityResource.java`
- `backend/src/main/java/com/hivearmor/web/rest/UtmIncidentResource.java`

**Created:**
- `backend/src/test/java/com/hivearmor/web/rest/UtmAlertResourceSecurityTest.java`
- `backend/src/test/java/com/hivearmor/web/rest/AuthorityResourceSecurityTest.java`
- `backend/src/test/java/com/hivearmor/web/rest/UtmIncidentResourceSecurityTest.java`

**Total files changed:** 6 (3 modified + 3 new test files)

---

### 6. Backend Tests to Add

Each security test class should follow this pattern:

```java
// Example: UtmAlertResourceSecurityTest.java
@SpringBootTest
@AutoConfigureMockMvc
class UtmAlertResourceSecurityTest {

    @Autowired MockMvc mockMvc;

    @Test
    @WithMockUser(roles = "USER")
    void updateAlertStatus_asRoleUser_returns403() throws Exception {
        mockMvc.perform(post("/api/ha-alerts/status")
            .contentType(APPLICATION_JSON)
            .content("{\"id\":1,\"status\":\"CLOSED\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ANALYST")
    void updateAlertStatus_asAnalyst_returns200OrAccepted() throws Exception {
        // test with valid body
        mockMvc.perform(post("/api/ha-alerts/status")
            .contentType(APPLICATION_JSON)
            .content("{\"id\":1,\"status\":\"CLOSED\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    void updateAlertStatus_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/api/ha-alerts/status")
            .contentType(APPLICATION_JSON)
            .content("{\"id\":1,\"status\":\"CLOSED\"}"))
            .andExpect(status().isUnauthorized());
    }
}
```

Minimum tests per resource:
- `ROLE_USER` → 403 for each mutation endpoint
- `ROLE_ANALYST` → 200/202/204 for permitted endpoints
- Unauthenticated → 401

---

### 7. Verification Steps

After implementing and deploying to local dev:

```bash
# Step 1: Get a USER-level token
USER_TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"readonly_user","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")

# Step 2: Attempt alert status update as USER — MUST return 403
curl -s -w "\nHTTP_STATUS: %{http_code}" \
  -X POST http://localhost:8088/api/ha-alerts/status \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":1,"status":"CLOSED"}'
# Expected: HTTP_STATUS: 403

# Step 3: Get an ANALYST token  
ANALYST_TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"analyst_user","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")

# Step 4: Attempt alert status update as ANALYST — MUST return 2xx
curl -s -w "\nHTTP_STATUS: %{http_code}" \
  -X POST http://localhost:8088/api/ha-alerts/status \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":1,"status":"CLOSED"}'
# Expected: HTTP_STATUS: 200

# Step 5: Attempt authority creation as USER — MUST return 403
curl -s -w "\nHTTP_STATUS: %{http_code}" \
  -X POST http://localhost:8088/api/authority \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '"ROLE_ADMIN"'
# Expected: HTTP_STATUS: 403
```

---

### 8. Acceptance Criteria (Specific, Testable)

1. `POST /api/ha-alerts/status` returns **403** for `ROLE_USER`, **200** for `ROLE_ANALYST`
2. `POST /api/ha-alerts/notes` returns **403** for `ROLE_USER`, **200** for `ROLE_ANALYST`
3. `POST /api/ha-alerts/tags` returns **403** for `ROLE_USER`, **200** for `ROLE_ANALYST`
4. `POST /api/ha-alerts/convert-to-incident` returns **403** for `ROLE_ANALYST`, **200** for `ROLE_SOC_MANAGER`
5. `POST /api/authority` returns **403** for `ROLE_ANALYST`, **200** for `ROLE_ADMIN`
6. `DELETE /api/authority/{name}` returns **403** for `ROLE_ANALYST`, **200** for `ROLE_ADMIN`
7. `POST /api/ha-incidents` returns **403** for `ROLE_USER`, **200** for `ROLE_ANALYST`
8. `PUT /api/ha-incidents/change-status` returns **403** for `ROLE_USER`, **200** for `ROLE_ANALYST`
9. `mvn -s settings.xml test` passes with 0 failures
10. All 3 new security test files pass
11. Existing integration tests continue to pass (no regressions)
12. `GET /api/ha-alerts` (read) continues to return **200** for `ROLE_USER` (read access unchanged)

---

### 9. Rollback Procedure

This batch is entirely additive — it adds annotations to existing methods. Rollback is:

1. `git revert <commit-hash>` — removes the `@PreAuthorize` annotations
2. Redeploy backend
3. The previous (open) behaviour is restored immediately

No database migrations, no data changes, no frontend changes. This is the safest possible type of backend change.

---

### 10. Risks of This Batch

| Risk | Mitigation |
|---|---|
| A legitimate use case exists where ROLE_USER genuinely needs to mutate alerts | Review all calling contexts before starting; if such a use case exists, create a dedicated permission or role |
| Role constants differ between implementation and documentation | Confirm exact role string values from `AuthoritiesConstants.java` before writing annotations |
| Spring Security `hasRole()` vs `hasAnyRole()` auto-prefixes `ROLE_` — annotation must match exactly | Use `hasAnyRole('ANALYST')` not `hasRole('ROLE_ANALYST')` |
| Test user accounts in local dev don't have the right roles | Verify `local-dev/seed-dev-data.sh` creates accounts for each role before running verification steps |

---

### 11. What Must NOT Be Included in This Batch

- No Groovy injection fix (`OffenseResource.java`) — this is a separate H0-SEC-04 batch requiring architecture review
- No JWT key fix (`JwtKeyService.java`) — separate H0-SEC-05 batch requiring env var setup
- No `clientPass` removal — separate H0-SEC-03 batch
- No frontend changes whatsoever
- No new endpoints or feature work
- No performance optimizations

Keep this PR minimal and reviewable. The reviewer should be able to confirm in < 30 minutes that each annotation is correct and each test covers the right cases.

---

### 12. Approval Required Before Implementation

1. **Security lead** — review role assignments for each endpoint; confirm `convert-to-incident` should be `SOC_MANAGER+` not `ANALYST+`
2. **Backend lead** — review annotation syntax is correct for the Spring Security version in use
3. **Product owner** — confirm there are no legitimate ROLE_USER use cases for alert mutations (e.g., self-service portal)
4. **QA lead** — confirm test accounts exist in local dev seed data for each role being tested

This batch may proceed as soon as all 4 approvals are received. No architecture decisions are required. This is the recommended starting point for all HiveArmor implementation work.
