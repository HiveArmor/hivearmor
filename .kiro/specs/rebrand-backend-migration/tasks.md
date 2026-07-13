# Tasks — Backend Migration

## ⚠️ PREREQUISITE DECISIONS (must be made before any task starts)

- [ ] Decide new Java package name: `com.nilachakra` (recommended) or other
- [ ] Decide new GitHub organization name for Go module paths
- [ ] Provision new container registry (ghcr.io/nilachakra or similar)
- [ ] Confirm Prometheus/monitoring dashboard update plan for spring.application.name change

## Tasks

### Phase A — Java Package Rename

- [ ] A1. Create a git branch: `rebrand/java-package-rename`
- [ ] A2. Batch-rename all Java source files
  - [ ] A2.1 `find + sed` or IntelliJ Refactor → Rename Package
  - [ ] A2.2 Rename directory `com/park/utmstack/` → `com/nilachakra/`
  - [ ] A2.3 Verify: `grep -r 'com\.park\.utmstack' backend/src/main/java` → zero
- [ ] A3. Update `pom.xml` if it references the package name
- [ ] A4. Run `mvn -s settings.xml -B` → must compile
- [ ] A5. Run `mvn -B -Pprod clean package -s settings.xml` → must produce WAR
- [ ] A6. Deploy to staging and smoke-test login + basic API calls
- [ ] A7. Merge to release branch

### Phase B — Go Module Path Rename (DEFER until GitHub org ready)

- [ ] B1. Create new GitHub organization `nilachakra`
- [ ] B2. Create new repo `nilachakra/nilachakra` (mirror of current UTMStack-11)
- [ ] B3. Batch-rename all Go import paths
  - [ ] B3.1 Update all `go.mod` module lines
  - [ ] B3.2 Update all Go import statements
  - [ ] B3.3 Update all proto `go_package` options
  - [ ] B3.4 Regenerate all `.pb.go` files from updated proto files
- [ ] B4. `go build ./...` in all 8 modules → must succeed
- [ ] B5. `go test ./...` in agent-manager → must pass
- [ ] B6. Rebuild and sign all agent binaries (Windows + macOS + Linux)
- [ ] B7. Plan agent binary distribution to deployed endpoints

### Phase C — Container Registry Change (DEFER until registry provisioned)

- [ ] C1. Provision `ghcr.io/nilachakra` container registry
- [ ] C2. Set up GitHub Actions secrets for new registry
- [ ] C3. Update all workflow `.yml` files: `ghcr.io/utmstack/utmstack` → `ghcr.io/nilachakra/nilachakra`
- [ ] C4. Update `local-dev/docker-compose.yml` image references
- [ ] C5. Update installer Go code: registry URL strings
- [ ] C6. Test build + push to new registry
- [ ] C7. Update deployment infrastructure to pull from new registry

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": ["A1", "A2", "A3"],
      "description": "Phase A setup — Java rename"
    },
    {
      "wave": 1,
      "tasks": ["A4", "A5"],
      "description": "Phase A compile verification",
      "dependsOn": [0]
    },
    {
      "wave": 2,
      "tasks": ["A6", "A7"],
      "description": "Phase A deploy and merge",
      "dependsOn": [1]
    },
    {
      "wave": 3,
      "tasks": ["B1", "B2"],
      "description": "Phase B — Create new GitHub org (parallel with Phase A)",
      "dependsOn": []
    },
    {
      "wave": 4,
      "tasks": ["B3", "B4", "B5", "B6", "B7"],
      "description": "Phase B — Go rename and agent rebuild",
      "dependsOn": [3]
    },
    {
      "wave": 5,
      "tasks": ["C1", "C2", "C3", "C4", "C5", "C6", "C7"],
      "description": "Phase C — Registry change",
      "dependsOn": [4]
    }
  ]
}
```
