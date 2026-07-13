# S06-T07 — Dead Code Removal

**Sprint:** 6 (Tech Debt)
**Severity:** LOW
**Issue ID:** DEBT-01 through DEBT-05
**Dependencies:** All Sprint 3+ tasks complete (confirm replacements work before deleting)
**Estimated time:** 3 hours

---

## Context

The codebase has confirmed dead code in three areas:

1. **Backend dead services** (DEBT-01 to DEBT-03): Three Spring services that are unused — no other class imports them, no REST controller calls them. Keeping them causes confusion for future devs and increases JAR size.
2. **Frontend-v2 dead components** (DEBT-04 to DEBT-05): Two components that were replaced during the Sprint 3+ build and are no longer imported anywhere.
3. **Demo route** (included in DEBT-04 scope): A demo incidents page that exposes fake data and reveals internal data structures to anyone who discovers the URL.
4. **Debug print statements** (DEBT-05): `fmt.Printf("[CEL DEBUG]…")` and `fmt.Printf("[CORR DEBUG]…")` in the event processor rules engine. These log massive JSON payloads to stdout in production, causing log noise and potential data exposure.

**DO NOT delete anything until you verify the replacement still works.** The checklist in Implementation Steps 1 and 2 below gates the deletion.

---

## What to Read First

Before deleting anything, read these files to understand what they did and confirm they are not needed:

1. `backend/src/main/java/com/nilachakra/service/DefinitionSyncService.java` — what did it sync? Is there a replacement?
2. `backend/src/main/java/com/nilachakra/service/UtmAlertLastService.java` — did it track last-seen alerts? Is that now handled elsewhere?
3. `backend/src/main/java/com/nilachakra/service/UtmAlertSocaiProcessingRequestService.java` — SOC-AI request queue? Is SOC-AI disabled?
4. `frontend-v2/src/components/ui/stat-card.tsx` — what did it render? Is it replaced by a different component?
5. `frontend-v2/src/components/alerts/alert-filters-panel.tsx` — what filters did it show? Is there a working replacement?
6. `frontend-v2/src/app/(app)/incidents/demo/page.tsx` — what demo data does it expose?
7. `event-processor/rules/engine.go` lines around 65 and 193 — see the `[CEL DEBUG]` and `[CORR DEBUG]` print statements

---

## Implementation Steps

### Step 1: Pre-deletion verification gate (backend)

Run these commands before deleting anything. Each must pass:

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

# Verify DefinitionSyncService is not imported anywhere
grep -r "DefinitionSyncService" src/main/java/ --include="*.java" | grep -v "DefinitionSyncService.java"
# Expected: zero results

# Verify UtmAlertLastService is not imported anywhere
grep -r "UtmAlertLastService" src/main/java/ --include="*.java" | grep -v "UtmAlertLastService.java"
# Expected: zero results

# Verify UtmAlertSocaiProcessingRequestService is not imported anywhere
grep -r "UtmAlertSocaiProcessingRequestService" src/main/java/ --include="*.java" \
  | grep -v "UtmAlertSocaiProcessingRequestService.java"
# Expected: zero results
```

If any grep returns hits (other than the file itself), stop and investigate before deleting.

### Step 2: Pre-deletion verification gate (frontend)

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Verify stat-card is not imported anywhere
grep -r "stat-card\|StatCard" src/ --include="*.tsx" --include="*.ts" \
  | grep -v "stat-card.tsx"
# Expected: zero results

# Verify alert-filters-panel is not imported anywhere
grep -r "alert-filters-panel\|AlertFiltersPanel" src/ --include="*.tsx" --include="*.ts" \
  | grep -v "alert-filters-panel.tsx"
# Expected: zero results
```

### Step 3: Delete backend dead services

Only proceed if Step 1 returned zero hits.

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/service

# Delete the three dead service files
rm DefinitionSyncService.java
rm UtmAlertLastService.java
rm UtmAlertSocaiProcessingRequestService.java

# Verify the backend still compiles
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile -q
```

If `./mvnw compile` fails, a reference was missed. Read the compiler error, find the remaining import, and either fix it or restore the deleted file.

### Step 4: Delete frontend dead components

Only proceed if Step 2 returned zero hits.

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

rm src/components/ui/stat-card.tsx
rm src/components/alerts/alert-filters-panel.tsx
rm -rf src/app/\(app\)/incidents/demo/

# Verify the frontend still type-checks
npx tsc --noEmit
```

If `tsc` fails, an import was missed. Fix the remaining import or restore the file.

### Step 5: Remove debug print statements from event-processor

In `event-processor/rules/engine.go`, remove the two debug lines:

**Line ~65 (CEL DEBUG):**

Find and delete the entire `fmt.Printf("[CEL DEBUG] rule=%d ok=%v err=%v eventJSON=%s\n", ...)` line. Do NOT delete the surrounding logic — only the `fmt.Printf` call itself.

**Line ~193 (CORR DEBUG):**

Find and delete the entire `fmt.Printf("[CORR DEBUG] index=%s count=%d needed=%d\n", ...)` line. Do NOT delete the surrounding logic.

After removing both lines:

```bash
cd /Users/encryptshell/GIT/UTMStack-11/event-processor

# Verify no [CEL DEBUG] or [CORR DEBUG] remain
grep -n "CEL DEBUG\|CORR DEBUG" rules/engine.go
# Expected: zero results

# Verify the Go code still compiles
go build ./...
```

Also remove the `fmt` import from `engine.go` if it is now unused after removing the Printf calls:

```bash
# Check if fmt is still needed elsewhere in the file
grep "fmt\." rules/engine.go
# If zero results, remove the "fmt" line from the import block
```

### Step 6: Check for any remaining stale test references

```bash
# Backend test references
cd /Users/encryptshell/GIT/UTMStack-11/backend
grep -r "DefinitionSyncService\|UtmAlertLastService\|UtmAlertSocaiProcessingRequestService" \
  src/test/java/ --include="*.java"
# If any hits, delete those test files too

# Frontend test references
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2
grep -r "stat-card\|StatCard\|alert-filters-panel\|AlertFiltersPanel\|incidents/demo" \
  src/ --include="*.test.tsx" --include="*.test.ts" --include="*.spec.tsx"
# If any hits, delete those test files
```

---

## Test Commands

```bash
# Backend full compile
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile -q && echo "BACKEND OK"

# Backend test suite (should not regress)
./mvnw test -DfailIfNoTests=false -q 2>&1 | tail -5

# Frontend type check
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2
npx tsc --noEmit && echo "FRONTEND TS OK"

# Frontend build
npx next build 2>&1 | tail -10

# Event processor
cd /Users/encryptshell/GIT/UTMStack-11/event-processor
go build ./... && echo "GO BUILD OK"
go vet ./... && echo "GO VET OK"

# Confirm debug lines are gone
grep -rn "CEL DEBUG\|CORR DEBUG" . && echo "FAIL: debug lines still present" || echo "PASS: debug lines removed"

# Confirm demo route is gone
ls frontend-v2/src/app/\(app\)/incidents/demo/ 2>/dev/null && echo "FAIL: demo still exists" || echo "PASS: demo removed"
```

---

## Acceptance Criteria

- [ ] Pre-deletion grep for each backend service returns zero results (excluding the file itself) before deletion
- [ ] `DefinitionSyncService.java` deleted
- [ ] `UtmAlertLastService.java` deleted
- [ ] `UtmAlertSocaiProcessingRequestService.java` deleted
- [ ] `./mvnw compile -q` succeeds after backend deletions
- [ ] Pre-deletion grep for each frontend component returns zero results before deletion
- [ ] `frontend-v2/src/components/ui/stat-card.tsx` deleted
- [ ] `frontend-v2/src/components/alerts/alert-filters-panel.tsx` deleted
- [ ] `frontend-v2/src/app/(app)/incidents/demo/` directory deleted
- [ ] `npx tsc --noEmit` succeeds after frontend deletions
- [ ] `[CEL DEBUG]` print statement removed from `event-processor/rules/engine.go`
- [ ] `[CORR DEBUG]` print statement removed from `event-processor/rules/engine.go`
- [ ] `go build ./...` succeeds after debug line removal
- [ ] `grep -rn "CEL DEBUG\|CORR DEBUG" event-processor/` returns zero results
- [ ] No existing passing tests are broken by any of the above deletions
