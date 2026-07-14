# GitHub Actions Workflows — HiveArmor

CI/CD for HiveArmor v11. This folder contains two workflow families:

- **PR checks** (`pr-checks.yml` + `_pr-reusable-*.yml`) — validate every
  Pull Request before merge. The gate into code on `main` and `release/**`.
- **Deployment pipeline** (`v11-deployment-pipeline.yml`,
  `installer-release.yml`) — build, publish, and deploy artifacts once code
  is merged or a release is created.

## Table of contents

- [Release policy](#release-policy)
- [PR Checks](#pr-checks)
- [V11 Deployment Pipeline](#v11-deployment-pipeline)
- [Installer Release](#installer-release)
- [Generate Changelog](#generate-changelog)
- [Secrets and variables](#secrets-and-variables)
- [Approver GitHub App setup](#approver-github-app-setup)
- [Reusable workflows](#reusable-workflows)
- [How to deploy](#how-to-deploy)
- [Troubleshooting](#troubleshooting)

---

## Release policy

Hard rules:

- **Direct push is forbidden** on `release/**`. PR only.
- **Branch protection** is enabled: PR required, status checks green
  (`All checks passed`), no force push.
- **Roll-forward only.** No rollbacks. If a release breaks something, ship
  a hotfix that bumps the version (e.g. `v11.2.9` breaks → `v11.2.10`
  fixes it). Feature flags / kill switches are fine for turning features
  off without a redeploy.

### Tiered approval model

The **final tier** of a PR is decided by the approver, taking the maximum
across all AI prompts (see [PR Checks](#pr-checks)).

| Tier | Meaning | Approver action |
|------|---------|-----------------|
| **1** | Simple change, AI detects no issues, deps OK. | Sticky "Approved" comment + (when the approver App is configured) formal `APPROVE` review. Status check green. |
| **2** | Minor issues the author should fix before merging (typos, small bugs, out-of-context code). | Sticky comment with the findings list + formal `REQUEST_CHANGES` review. Status check red. |
| **3** | Touches critical paths (crypto, auth, migrations, installer, gRPC contracts, CI/CD) or the model cannot judge with confidence. | Sticky comment @mentioning the handles configured in `tier3_reviewers` + formal `REQUEST_CHANGES` review. Status check red. |

When the author pushes new commits, the sticky comments are **updated
in-place** (same comment, no stacking) and the workflow re-runs
automatically. A blocked PR is **never auto-closed** — it stays open
waiting for the fixes.

Sensitive paths for Tier 3 are identified by each prompt's own rules (see
`.github/ai-prompts/*.md`). This can be reinforced with `CODEOWNERS` for
additional per-path gates.

### Auto-merge

The approver enables GitHub's native auto-merge **only** when **all** of
the following hold:

- Target branch matches `release/**` (PRs to `main` stay manual so
  production deploys are always intentional).
- `deps_failed == false`.
- `max_tier == 1` across every AI prompt.
- PR author is in `@hivearmor/administrators` or `@hivearmor/core-developers`.
- The approver GitHub App is configured (`APPROVER_APP_ID` +
  `APPROVER_PRIVATE_KEY` secrets present).

Auto-merge does NOT merge immediately — it queues the merge until every
branch-protection requirement is satisfied. If another check fails later
or a human leaves `REQUEST_CHANGES`, the merge stays pending.

### Dependabot

Disabled. `.github/dependabot.yml` keeps `updates: []` so Dependabot
reads the file but creates no PRs. Dependency freshness is enforced via
the `go_deps` check on every PR. To re-enable Dependabot, restore the
previous `updates:` list (see git history of that file).

### Hotfixes

- `hotfix/x` branch from `main` → PR to `main` → same checks.
- `urgent` label allows fast-track: if checks pass and the AI approves,
  it merges without waiting for human review even when touching sensitive
  paths.
- **Recommended (not strictly required):** after the hotfix merges to
  `main`, pull `main` into the active `release/v11.x.x+1` branch (merge or
  cherry-pick — either works). The fix is **not** lost if you skip this
  step: git already has the hotfix in `main`'s history, so when
  `release/v11.x.x+1` later merges back, git combines both lines and
  the fix lands automatically. Syncing early is good hygiene because it
  surfaces conflicts in your release branch rather than at the final
  merge, and it lets dev builds include the patched code immediately.

**Version derivation is automatic.** When a hotfix merges, the
deployment pipeline compares the candidate BASE (from CM DEV) against
the latest version in CM PROD:

- If BASE > PROD → use BASE as the tag (normal flow).
- If BASE ≤ PROD → the BASE was already shipped; bump the patch of PROD
  to get the next tag (hotfix flow).

Concrete example: PROD is on `v11.2.9`, dev is still on
`v11.2.9-dev.5` from the cycle that produced it. A hotfix lands on
`main`. The pipeline sees BASE=`v11.2.9` collides with PROD=`v11.2.9`,
auto-bumps to `v11.2.10`, and the rest of the run (build, installer,
changelog, CM register) proceeds with that tag. No manual rename, no
config change.

---

## PR Checks

`pr-checks.yml` triggers on any Pull Request whose target is:

- `main`
- `release/**` (any release branch)

### Architecture

```
PR opened / updated
        │
        ├─────────────────┬─────────────────┐
        ▼                 ▼                 │
   ┌─────────┐      ┌─────────────┐         │
   │ go_deps │      │  ai_review  │         │
   │ (repo)  │      │  (matrix    │         │
   │         │      │   per       │         │
   │         │      │   prompt)   │         │
   └────┬────┘      └──────┬──────┘         │
        │                  │                 │
        │ artifact         │ artifacts       │
        │ go-deps-result   │ ai-review-*     │
        ▼                  ▼                 │
   ┌──────────────────────────────┐         │
   │           approver           │         │
   │  - reads artifacts           │         │
   │  - decides final tier        │         │
   │  - posts sticky comments     │         │
   │  - (optional) formal review  │         │
   └──────────────┬───────────────┘         │
                  │                          │
                  ▼                          ▼
          all_checks_passed   ← single status check branch protection requires
```

**Key decision:** the producers (`go_deps`, `ai_review`) **always exit
green**. They only upload artifacts. The `approver` is the single source
of truth — it consolidates results, decides the tier (maximum across all
AI prompts), posts comments, and passes or fails the final check.

### `go_deps`

Single job, no matrix, no change detection. Runs:

```bash
bash .github/scripts/go-deps.sh --check --discover
```

It discovers **every** `go.mod` in the repo (excluding `vendor/`,
dot-directories and `node_modules/`) and fails if any explicit **direct
dependency** has a newer version available. The script also detects
out-of-sync `go.sum` files (typically caused by local `replace` directives
in `packages/`) and reports them all at once.

The job uploads its stdout and exit code as the `go-deps-result` artifact.
The approver reads it and, if exit code != 0, posts the sticky comment
"Go dependencies check failed" with the script output embedded.

**Expected dev fix:** run
`bash .github/scripts/go-deps.sh --update --discover` locally, commit the
updated `go.mod` / `go.sum`, push.

### `ai_review`

Matrix with one job per `.md` under `.github/ai-prompts/` (except
`README.md`). Each job:

1. Fetches the diff via `gh pr diff` (same unified diff the GitHub UI
   shows — no need for `fetch-depth: 0`).
2. Calls the **ThreatWinds AI** `/chat/completions` endpoint with the
   prompt and the diff.
3. Validates the response against the `{tier, summary, findings}` schema.
4. Uploads the JSON as the `ai-review-<name>` artifact.

If the model's response is not valid JSON or the tier is not 1/2/3, the
script writes a fallback with `tier: 2` and a "Manual review recommended"
finding (fail-safe).

**Initial prompts:**

- `security.md` — vulnerabilities introduced in the diff (injection, XSS,
  SSRF, hardcoded secrets, weak crypto, insecure deserialization).
- `bugs.md` — concrete bugs: nil derefs, races, off-by-one, unhandled
  errors, unclosed resources, inverted logic, out-of-context code.
- `architecture.md` — architectural deviations: new couplings, logic in
  the wrong layer, broken contracts, unsafe migrations.

Each prompt declares its own tier policy (Tier 3 covers paths critical
to that dimension). See `.github/ai-prompts/README.md` for the full
schema and tier semantics.

**To scale:** drop a new `.md` into `.github/ai-prompts/`. Discovered at
runtime — no YAML changes needed.

**Default model:** `gemini-3-flash-lite`. Each prompt can pin its own
model in frontmatter (`model: gemini-3-pro`, etc.).

### `approver`

Single job that **depends on `go_deps` and `ai_review`**. Steps:

1. Downloads every PR-check artifact.
2. Reads `go-deps-result/exit_code.txt` → determines `deps_failed`.
3. Reads each `ai-review-*/result.json` → takes the **max tier** as the
   AI verdict.
4. **Sticky comments** with invisible HTML markers
   (`<!-- approver:deps -->`, `<!-- approver:ai -->`,
   `<!-- approver:permission -->`):
   - If deps failed → upsert "Go dependencies check failed" comment with
     the script output. Otherwise delete it if a previous run posted one.
   - Always upsert the "AI review" comment with the final tier + findings.
   - These two are posted **regardless of who opened the PR** — even
     unauthorized contributors get useful feedback.
5. **Permission check (LAST gate).** Looks up `github.actor` against the
   GitHub teams `administrators` and `core-developers` of the
   `hivearmor` org via `API_SECRET`. Does NOT include
   `integration-developers`. If the author is in neither team:
   - Upsert "Permission denied" comment @mentioning
     `@hivearmor/administrators`.
   - Skip the formal `APPROVE` review (always `REQUEST_CHANGES`).
   - Skip auto-merge.
   - Exit 1.
6. **(Optional) Formal PR review** when the approver App is installed
   (see [Approver GitHub App setup](#approver-github-app-setup)):
   - Tier 1 + deps OK + authorized → `APPROVE`.
   - Anything else → `REQUEST_CHANGES`.
7. **Auto-merge** — only when **all** of: deps OK, Tier 1, authorized,
   AND `BASE_REF` starts with `release/`. Calls
   `gh pr merge --auto --<method>` (default `squash`). This uses
   GitHub's native auto-merge, so the actual merge waits until **every**
   branch-protection requirement is satisfied. PRs targeting `main` never
   auto-merge — those branches stay manually merged so deploys are
   intentional.
8. **Exit code:** 0 only if everything is OK; 1 if deps failed,
   tier >= 2, or author unauthorized.

When the author pushes new commits the workflow re-runs and the comments
are **updated in place** (no stacking). The PR is never auto-closed —
it stays open waiting for the author's fixes.

### Adding a new check

The architecture is designed to scale. To add, for example, a test check:

1. Create `.github/workflows/_pr-reusable-<name>.yml` that runs the check
   and uploads an artifact with the result (ideally JSON).
2. Call the reusable from `pr-checks.yml` as another job.
3. Add that job to the `approver`'s `needs:` (and to `all_checks_passed`).
4. Extend `approver.sh` to read the new artifact and factor it into the
   final verdict.

To add a new AI prompt **no YAML changes are needed** — just drop a `.md`
into `.github/ai-prompts/`.

---

## V11 Deployment Pipeline

`v11-deployment-pipeline.yml`

Triggers:

- Push to `release/v11**` → build and deploy to **dev** (auto-incremented
  version `v11.x.x-dev.N`).
- Release event published → build and deploy to **production** (version
  taken from the release tag `v11.x.x`).

### Flow

```
Push to release/v11.x.x
        │
        ▼
setup_deployment: auto-increment version (v11.x.x-dev.N via CM)
        │
        ├── build_agent (Linux amd64/arm64, Windows amd64/arm64, macOS arm64)
        │       │
        │       ├── sign_agent_windows (jsign + GCP KMS)
        │       └── sign_agent_macos (codesign + notarytool)
        │
        ├── build_hivearmor_collector
        │
        ├── build_event_processor (plugins + geolocation data)
        │
        ├── build_backend (Java 17, Maven prod profile)
        ├── build_user_auditor (Java 17)
        └── build_web_pdf (Java 17)
                │
                ▼ (after sign_agent_* + build_hivearmor_collector)
        build_agent_manager (embeds all agent + collector binaries)
                │
                ▼
        all_builds_complete
                │
                ▼
        deploy_installer_dev → publish_new_version → schedule


GitHub Release published (tag v11.x.x)
        │
        ▼
setup_deployment: tag from release event
        │
        [same build jobs as dev]
                │
                ▼
        all_builds_complete
                │
                ▼
        generate_changelog (AI, ThreatWinds API)
                │
                ▼
        build_installer_release (upload to GitHub release)
                │
                ▼
        publish_new_version → schedule (production CM + instances)
```

### Jobs

| Job | Description |
|-----|-------------|
| `setup_deployment` | Determines environment (dev/production), CM URL, and version tag. For dev, auto-increments by querying CM DEV. For production, uses the release tag directly. |
| `build_agent` | Compiles `hivearmor_agent_service` and `hivearmor_updater_service` for Linux (amd64/arm64), Windows (amd64/arm64), and macOS (arm64) with `AGENT_SECRET_PREFIX` injected via ldflags. |
| `sign_agent_windows` | Signs Windows binaries via `reusable-sign-agent.yml` using jsign and GCP Cloud KMS. |
| `sign_agent_macos` | Signs and notarizes macOS binaries via `reusable-sign-agent.yml` using Apple codesign and notarytool. |
| `build_hivearmor_collector` | Compiles `hivearmor_collector` (Linux amd64) and the AS/400 collector with `AGENT_SECRET_PREFIX` via ldflags. |
| `build_agent_manager` | Bundles all signed agent binaries, the collector, and legacy-named copies into the `agent-manager` Docker image. Image: `ghcr.io/hivearmor/agent-manager:<tag>`. |
| `build_event_processor` | Builds all 16 plugins (`com.hivearmor.<name>.plugin`), downloads geolocation CSV data, and pushes the event processor image: `ghcr.io/hivearmor/eventprocessor:<tag>`. Uses a ThreatWinds base image. |
| `build_backend` | Java 17, Maven `prod` profile, copies YAML filters and rules into the image. Image: `ghcr.io/hivearmor/hivearmor/backend:<tag>`. |
| `build_user_auditor` | Java 17 microservice. Image: `ghcr.io/hivearmor/hivearmor/user-auditor:<tag>`. |
| `build_web_pdf` | Java 17 microservice for PDF generation. Image: `ghcr.io/hivearmor/hivearmor/web-pdf:<tag>`. |
| `all_builds_complete` | Checkpoint — requires all build jobs to succeed before proceeding. |
| `generate_changelog` | Production only. AI-generated release notes via ThreatWinds API comparing the current tag against the previous. See [Generate Changelog](#generate-changelog). |
| `build_installer_release` | Production only. Builds the Go installer binary with version, branch (`prod`), `CM_ENCRYPT_SALT`, and `CM_SIGN_PUBLIC_KEY` injected via ldflags; uploads to the GitHub release. |
| `deploy_installer_dev` | Dev only. Builds and runs the installer on the `hivearmor-v11-dev` self-hosted runner. |
| `publish_new_version` | Registers the new version with CM (dev or production) via `POST /api/v1/versions/register`. Uses the AI changelog for production builds. |
| `schedule` | Calls CM `POST /api/v1/updates` for each instance UUID in `SCHEDULE_INSTANCES_DEV` or `SCHEDULE_INSTANCES_PROD` to queue the update rollout. |

### Environment detection

| Trigger | Environment | CM URL | Service Account | Schedule Var |
|---------|-------------|--------|-----------------|--------------|
| Push to `release/v11**` | dev | `https://cmdev.onlyhacker.org` | `CM_SERVICE_ACCOUNT_DEV` | `SCHEDULE_INSTANCES_DEV` |
| Release published | production | `https://cm.onlyhacker.org` | `CM_SERVICE_ACCOUNT_PROD` | `SCHEDULE_INSTANCES_PROD` |

### Version auto-increment (dev)

1. Extracts the base version from the branch name (`release/v11.2.1` →
   `v11.2.1`).
2. Queries CM DEV `GET /api/v1/versions/latest`.
3. If the base matches the latest version's base, bumps the dev suffix
   (`-dev.9` → `-dev.10`).
4. If the base differs (new branch), starts at `-dev.1`.

### Plugin binary names

Plugin binaries must be named exactly `com.hivearmor.<name>.plugin`. The
event processor loads plugins by this exact name — do not change the
convention.

Current plugins: `alerts`, `aws`, `azure`, `bitdefender`, `config`,
`crowdstrike`, `events`, `feeds`, `gcp`, `geolocation`, `inputs`, `o365`,
`sophos`, `stats`, `soc-ai`, `modules-config`.

---

## Installer Release

`installer-release.yml` — reusable workflow called by the deployment
pipeline.

Inputs: `version`, `version_major` (v11), `environment` (dev/production),
`changelog` (optional, injected into the release body).

| Condition | Job | Runner | What it does |
|-----------|-----|--------|--------------|
| v11 + dev | `deploy_v11_dev` | `hivearmor-v11-dev` | Builds installer with `DEFAULT_BRANCH=dev` ldflags and runs it on the dev runner. |
| v11 + production | `build_v11_release` | `ubuntu-24.04` | Builds installer with `DEFAULT_BRANCH=prod` ldflags and uploads the binary to the GitHub release via `softprops/action-gh-release`. |

The installer binary is a Go program (in `./installer/`) that handles
Docker installation, TLS certificate generation, and first-run setup.

ldflags injected at build time:

| ldflag | Source |
|--------|--------|
| `config.DEFAULT_BRANCH` | `dev` or `prod` |
| `config.INSTALLER_VERSION` | version tag (e.g. `v11.2.1`) |
| `config.REPLACE` | `CM_ENCRYPT_SALT` secret |
| `config.PUBLIC_KEY` | `CM_SIGN_PUBLIC_KEY` secret |

Private Go modules under `github.com/hivearmor/` are accessed using
`API_SECRET` as a GitHub PAT, configured via `git config url.insteadOf`.

---

## Generate Changelog

`generate-changelog.yml` — reusable workflow called by the deployment
pipeline for production releases.

Wraps `.github/scripts/generate-changelog.sh`, which calls the ThreatWinds
`/chat/completions` endpoint to turn the commit log between two tags into
end-user release notes.

Inputs:

| Input | Default | Description |
|-------|---------|-------------|
| `current_tag` | (required) | The release tag being built (e.g. `v11.2.1`). |
| `previous_tag` | auto-detected | If empty, the script walks `git tag --sort=-v:refname` to find the tag immediately before `current_tag`. |
| `product_name` | `HiveArmor` | Included in the prompt sent to the AI model. |
| `product_description` | `Unified Threat Management and SIEM Platform` | Included in the prompt. |
| `model` | `gemini-3-flash-lite` | ThreatWinds model ID. Override per-call with `gemini-3-pro` or `claude-sonnet-4-6` for longer or more complex release notes. |

Outputs: `changelog` (multiline markdown), `previous_tag`.

The generated changelog is:

1. Written to `/tmp/changelog.md` on the runner (previewed in the job log).
2. Passed to `build_installer_release` where it becomes the GitHub release
   body (`body_path`).
3. Passed to `publish_new_version` where it is registered against the
   version in CM.

**To test locally:**

```bash
export THREATWINDS_API_KEY=...
export THREATWINDS_API_SECRET=...
bash .github/scripts/generate-changelog.sh v11.2.1
# auto-detects previous tag; also loads from a local .env if present
```

---

## Secrets and variables

### Secrets

| Secret | Used in | Description |
|--------|---------|-------------|
| `API_SECRET` | All, pr-checks, installer | GitHub PAT with `read:org` and `read:packages` scope. Used by deployment workflows for team-membership validation, private Go module access (`GOPRIVATE=github.com/hivearmor`), and by the `approver` job to check that the PR author belongs to `administrators` or `core-developers`. |
| `AGENT_SECRET_PREFIX` | v11-deployment-pipeline | Encryption key injected into agent and collector binaries via `-X config.REPLACE_KEY=`. Required at build time — do not build agents for production without it. |
| `CM_ENCRYPT_SALT` | installer-release | Injected into the installer binary as `config.REPLACE`. Used to encrypt installer payloads. |
| `CM_SIGN_PUBLIC_KEY` | installer-release | Public key injected into the installer binary as `config.PUBLIC_KEY` for payload verification. |
| `CM_SIGN_PRIVATE_KEY` | installer-release | Private key counterpart used to sign installer payloads. Keep out of logs. |
| `CM_SERVICE_ACCOUNT_PROD` | v11-deployment-pipeline | Customer Manager service account for the production CM (`cm.onlyhacker.org`). JSON `{"id":"...","key":"..."}`. |
| `CM_SERVICE_ACCOUNT_DEV` | v11-deployment-pipeline | Customer Manager service account for the dev CM (`cmdev.onlyhacker.org`). JSON `{"id":"...","key":"..."}`. |
| `THREATWINDS_API_KEY` | pr-checks, generate-changelog | ThreatWinds API key for `ai_review` prompts and AI changelog generation. |
| `THREATWINDS_API_SECRET` | pr-checks, generate-changelog | ThreatWinds API secret paired with `THREATWINDS_API_KEY`. |
| `MAVEN_TK` | v11-deployment-pipeline (backend build) | GitHub PAT with `read:packages` scope for pulling dependencies from GitHub Packages (Maven). Required by `mvn -s settings.xml`. |
| `APPROVER_APP_ID` | pr-checks | GitHub App ID for the approver bot. Without this, the approver runs in comments-only mode (no formal review, no auto-merge). See [Approver GitHub App setup](#approver-github-app-setup). |
| `APPROVER_PRIVATE_KEY` | pr-checks | GitHub App private key (full `.pem` content, multi-line) paired with `APPROVER_APP_ID`. |
| `GCP_WINDOWS_SIGNER_SA_KEY` | reusable-sign-agent (Windows) | GCP service account key JSON for Cloud KMS code signing of Windows binaries. |
| `WINDOWS_SIGNER_CERT_CHAIN_PEM` | reusable-sign-agent (Windows) | PEM cert chain for jsign. When set, overrides the `cert_chain_path` repo file. |
| `APPLE_CERTIFICATE_BASE64` | reusable-sign-agent (macOS) | Base64-encoded Apple Developer certificate (`.p12`). |
| `APPLE_CERTIFICATE_PASSWORD` | reusable-sign-agent (macOS) | Password for the `.p12` certificate. |
| `APPLE_SIGNING_IDENTITY` | reusable-sign-agent (macOS) | Apple signing identity string (e.g. `Developer ID Application: HiveArmor Inc`). |
| `APPLE_ID` | reusable-sign-agent (macOS) | Apple ID email for notarytool authentication. |
| `APPLE_APP_PASSWORD` | reusable-sign-agent (macOS) | App-specific password for notarytool. |
| `APPLE_TEAM_ID` | reusable-sign-agent (macOS) | Apple Developer Team ID. |
| `GITHUB_TOKEN` | All | Provided automatically by GitHub Actions. |

### Variables

| Variable | Used in | Description | Format |
|----------|---------|-------------|--------|
| `SCHEDULE_INSTANCES_PROD` | v11-deployment-pipeline | Instance UUIDs in CM PROD that receive the scheduled update. | Comma-separated UUIDs |
| `SCHEDULE_INSTANCES_DEV` | v11-deployment-pipeline | Instance UUIDs in CM DEV that receive the scheduled update. | Comma-separated UUIDs |
| `TW_EVENT_PROCESSOR_VERSION_PROD` | v11-deployment-pipeline | ThreatWinds Event Processor base image version for production builds. | Semver (`1.0.0`) |
| `TW_EVENT_PROCESSOR_VERSION_DEV` | v11-deployment-pipeline | ThreatWinds Event Processor base image version for dev builds. | Semver (`1.0.0-beta`) |
| `GCP_PROJECT_PROD` | reusable-sign-agent (Windows) | GCP project ID containing the KMS keyring. | String |
| `KMS_KEYRING_LOCATION` | reusable-sign-agent (Windows) | KMS keyring location (e.g. `global`). | String |
| `KMS_KEYRING_NAME` | reusable-sign-agent (Windows) | KMS keyring name. | String |
| `KMS_KEY_NAME` | reusable-sign-agent (Windows) | KMS key name within the keyring. | String |

---

## Approver GitHub App setup

The `approver` job uses a GitHub App (instead of a personal PAT) to leave
formal PR reviews and enable auto-merge. Benefits:

- Per-run installation token, valid for ~1 hour, auto-revoked when the
  job ends. No long-lived credential in the repo.
- The App acts as its own identity, so it can `APPROVE` PRs opened by any
  human contributor — including the workflow's own author (GitHub blocks
  self-approval when using a PAT).
- One place to audit who changed your branch protection state.

### One-time setup

**1. Create the App.**

Go to: `https://github.com/organizations/hivearmor/settings/apps/new`

- **GitHub App name**: e.g. `HiveArmor Approver`.
- **Homepage URL**: `https://github.com/hivearmor` or `https://hivearmor.io`.
- **Webhook**: untick **Active** — no callbacks needed.
- **Repository permissions:**
  - `Contents`: Read-only
  - `Pull requests`: Read and write
  - `Metadata`: Read-only (default, cannot be removed).
- **Organization permissions:**
  - `Members`: Read-only — needed for the team-membership check.
- **Where can this GitHub App be installed?** Only on this account.

Click **Create GitHub App**.

**2. Get the App ID and a private key.**

On the App's settings page you will see the **App ID** (numeric). Save it.

Scroll to **Private keys** → **Generate a private key**. A `.pem` file
downloads. Save the **full contents** (BEGIN/END lines included).

**3. Install the App on the HiveArmor repo.**

On the App page → **Install App** → pick the `hivearmor` org → choose
**Only select repositories** → select the HiveArmor repo → Install.

**4. Add the secrets to the repo.**

Settings → Secrets and variables → Actions → New repository secret.

- `APPROVER_APP_ID` = the numeric App ID.
- `APPROVER_PRIVATE_KEY` = the full PEM contents of the `.pem` file,
  including the `-----BEGIN/END PRIVATE KEY-----` lines. Paste as-is —
  GitHub preserves multi-line values.

**5. Optional: drop `API_SECRET` for org checks.**

If the App has `Members: Read` at org level, you can stop maintaining a
separate `API_SECRET` PAT for the permission check. The approver
workflow falls back to the App token when `API_SECRET` is not set.

`API_SECRET` is still required by the deployment workflows for private Go
module access (`GOPRIVATE=github.com/hivearmor`). Do not delete it from
the repo until you confirm those workflows no longer need it.

### How it gets minted at runtime

In `_pr-reusable-approver.yml`:

```yaml
- name: Generate approver token from GitHub App
  id: app-token
  if: ${{ env.APP_ID != '' }}
  env:
    APP_ID: ${{ secrets.APPROVER_APP_ID }}
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APPROVER_APP_ID }}
    private-key: ${{ secrets.APPROVER_PRIVATE_KEY }}
```

If the secrets are not configured, the step is skipped, the approver
runs in comments-only mode, and everything else still works (deps
comment, AI review comment, status check) — just no formal review and
no auto-merge.

### Verifying it works

1. Open a small, low-risk PR against `release/v11.x.x`.
2. After the approver job runs, check the PR page:
   - The sticky `<!-- approver:ai -->` comment is signed by your bot
     account (e.g. `hivearmor-approver[bot]`).
   - The "Files changed" tab shows a review by the same bot, marked
     `Approved` (Tier 1 + deps OK + authorized) or `Changes requested`.
3. If the target is `release/**` and Tier 1 → auto-merge is queued in
   the PR header.

---

## Reusable workflows

### PR checks

- `_pr-reusable-go-deps.yml` — runs `go-deps.sh --check --discover` at
  repo level and uploads `go-deps-result` as an artifact.
- `_pr-reusable-ai-review.yml` — fan-out per prompt; each job uploads
  `ai-review-<name>` as an artifact.
- `_pr-reusable-approver.yml` — downloads artifacts, decides verdict,
  posts sticky comments, optionally leaves a formal PR review.

### Deployment pipelines

- `reusable-basic.yml` — generic Docker image builds.
- `reusable-golang.yml` — Go microservice builds.
- `reusable-java.yml` — Java microservice builds (Maven, `settings.xml`,
  `MAVEN_TK` for GitHub Packages).
- `reusable-node.yml` — Node/Next.js builds. Installs Node 20, runs
  `npm install` + `npm run build`, then builds and pushes a Docker image
  to `ghcr.io/<owner>/<repo>/<image_name>:<tag>`.
- `reusable-sign-agent.yml` — Binary signing for Windows (jsign + GCP
  KMS, runs on `ubuntu-latest`) and macOS (codesign + notarytool, runs on
  `macos-latest`). Accepts a newline-separated `binaries` input, downloads
  the unsigned artifact, signs each binary, and re-uploads as a signed
  artifact.

---

## How to deploy

### Dev build

```bash
# Open a PR against release/v11.2.1 → checks → merge → auto-deploy
# Version is auto-incremented by querying CM DEV:
#   v11.2.1-dev.1, v11.2.1-dev.2, ...
```

Merging to the release branch triggers `v11-deployment-pipeline.yml`,
which builds all components, deploys the installer to the `hivearmor-v11-dev`
runner, registers the version in CM DEV, and schedules the update to dev
instances.

### Production release

1. GitHub Releases → "Draft a new release".
2. Create a new tag (e.g. `v11.2.1`).
3. Publish the release (prerelease or final — the pipeline runs either way).
4. The pipeline builds all components, generates the AI changelog,
   uploads the installer binary to the release, registers the version in
   CM PROD, and schedules updates to production instances.

```bash
# Alternatively via CLI:
gh release create v11.2.1 --title "HiveArmor v11.2.1" --notes ""
# Then edit the release body once the changelog job completes.
```

### Hotfix

```bash
git checkout main
git checkout -b hotfix/auth-bug
# fix → PR to main (label `urgent` if applicable) → checks → merge
# Recommended after merge: sync main into release/v11.x.x+1
#   git checkout release/v11.x.x+1
#   git merge origin/main      # or cherry-pick the specific commits
#   git push
```

---

## Troubleshooting

**Permission denied:**
- Verify membership in `core-developers` or `administrators` of the
  `hivearmor` GitHub org.

**`ai_review` artifact with tier 2 fallback "Manual review recommended":**
- The model did not return valid JSON or returned an invalid tier. The
  approver treats it as Tier 2 (changes requested) as a fail-safe. Refine
  the prompt `.md` or re-run the workflow if it was a transient API error.

**`go_deps` fails with "Could not inspect ... run 'go mod tidy' there":**
- `go.sum` is out of sync, typically due to local `replace` directives in
  `packages/`. Run `go mod tidy` in the affected module and commit.

**The approver posts two separate comments (deps + AI):**
- Expected behaviour when both dimensions fail. Each comment is
  independent and gets updated in place on subsequent runs.

**The approver does not leave a formal review (only comments):**
- The approver GitHub App is not configured. Add both `APPROVER_APP_ID`
  and `APPROVER_PRIVATE_KEY` secrets — see
  [Approver GitHub App setup](#approver-github-app-setup).

**Want a senior engineer @mentioned on Tier 3:**
- Edit `pr-checks.yml`, in the `approver` job set the `tier3_reviewers`
  input with comma-separated handles:
  ```yaml
  with:
    tier3_reviewers: 'handle1,handle2'
  ```

**Agent build fails — "REPLACE_KEY not set":**
- `AGENT_SECRET_PREFIX` secret must be configured. The agent and collector
  binaries require this value injected via ldflags at build time;
  authentication will fail without it.

**Installer build fails — "missing private module":**
- `API_SECRET` must be set and must be a GitHub PAT with `read:packages`
  and `repo` scope. The installer references private modules under
  `github.com/hivearmor/`.

**Version not incrementing:**
- Check that `CM_SERVICE_ACCOUNT_DEV` is configured with valid `id` and
  `key` fields, and that `cmdev.onlyhacker.org` is reachable from GitHub
  Actions runners.
- The branch name must follow the pattern `release/v11.x.x`.

**Changelog not generated:**
- Only runs for production release events (not dev pushes).
- Verify `THREATWINDS_API_KEY` and `THREATWINDS_API_SECRET` are
  configured.
- To test locally:
  ```bash
  export THREATWINDS_API_KEY=...
  export THREATWINDS_API_SECRET=...
  bash .github/scripts/generate-changelog.sh v11.2.1
  # auto-detects previous tag; also loads from a local .env if present
  ```

**Windows signing fails:**
- Verify `GCP_WINDOWS_SIGNER_SA_KEY` is set and the service account has
  `cloudkms.cryptoKeyVersions.useToSign` on the configured keyring.
- Verify `GCP_PROJECT_PROD`, `KMS_KEYRING_LOCATION`, `KMS_KEYRING_NAME`,
  and `KMS_KEY_NAME` variables are set.
- Check that `.github/certs/codesign-chain.pem` exists in the repo, or
  set `WINDOWS_SIGNER_CERT_CHAIN_PEM` as a secret.

**macOS signing fails:**
- All five Apple secrets (`APPLE_CERTIFICATE_BASE64`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`) must be configured.
- The certificate must not be expired.

**Build failures — general:**
- Check that all required secrets are configured (see [Secrets and
  variables](#secrets-and-variables)).
- Confirm the `hivearmor-v11-dev` self-hosted runner is online and
  connected to the repository.

---

## Notes

- Docker images are published to `ghcr.io/hivearmor/hivearmor/<component>:<tag>`.
  Agent Manager and Event Processor are published directly as
  `ghcr.io/hivearmor/agent-manager:<tag>` and
  `ghcr.io/hivearmor/eventprocessor:<tag>`.
- Agent binaries (Linux, Windows, macOS) have a **1-day artifact
  retention** — they are consumed immediately by `build_agent_manager`.
- Dev versions: `v11.x.x-dev.N` (auto-incremented via CM DEV).
- Production versions: the release tag exactly as created (e.g. `v11.2.1`).
- The OpenSearch index pattern `_v3_hive_<type>-YYYY.MM.DD` is version-locked
  across all components. Do not change it.
- HiveArmor v11.x is LTS-supported until November 2030.
- Support: support@hivearmor.io | Docs: https://docs.hivearmor.io