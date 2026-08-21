---
name: issue-triage
description: Triage GitHub issues for HiveArmor — categorize bugs/features/questions, assign priority P0-P3, add labels, draft responses. Triggered by "triage issues", "check open issues", "label this issue". Uses GitHub MCP or gh CLI.
---

# Issue Triage Skill

Systematically categorize and prioritize GitHub issues.

## Fetch Issues

```bash
# Using gh CLI
gh issue list --state open --limit 50 --json number,title,body,labels,createdAt

# Single issue
gh issue view <number>

# Issues without labels
gh issue list --state open --no-assignee --label ""
```

## Categories

### Bug
**Indicators:** stack trace, exception, error message, "doesn't work", "broken", "fails", reproduction steps
**Required info:** steps to reproduce, expected vs actual, version/environment
**Label:** `bug`

### Feature Request
**Indicators:** "would be nice", "add support for", "can you add", "enhancement"
**Label:** `enhancement`

### Question / Support
**Indicators:** "how do I", "is it possible", "what is the best way"
**Label:** `question`
**Action:** Answer if clear, link to docs if available

### Duplicate
**Indicators:** Same root cause as an existing open issue
**Action:** Comment "Duplicate of #NNN", close with `gh issue close <n> --comment "Duplicate of #NNN"`
**Label:** `duplicate`

### Invalid / Won't Fix
**Indicators:** Works as designed, out of scope, user error
**Action:** Polite explanation + close
**Label:** `invalid` or `wontfix`

## Priority Levels

| Priority | Criteria | Response SLA |
|---|---|---|
| **P0 — Critical** | Security vulnerability, data loss, production down | Same day |
| **P1 — High** | Core feature broken, significant user impact, affects SOC operations | 1–3 days |
| **P2 — Medium** | Feature degraded, workaround exists | 1–2 sprints |
| **P3 — Low** | Minor, cosmetic, "nice to have" | Backlog |

## Batch Processing (efficient)

Process 10–15 issues at once, output a triage table first, then apply labels:

```
Issue | Category | Priority | Action
#123  | bug      | P1       | Needs repro steps
#124  | feature  | P3       | Add to backlog
#125  | question | —        | Answer + close
```

This approach uses ~60% fewer tokens than processing one-by-one.

## Apply Labels

```bash
gh issue edit <number> --add-label "bug,P1"
gh issue edit <number> --add-label "enhancement,P3"
```

## Response Templates

### Needs More Information
```
Thanks for the report! To investigate this, we need:
- Steps to reproduce (minimal, exact sequence)
- Expected behavior vs. actual behavior
- HiveArmor version / Docker image tag
- Relevant logs (from `docker compose logs <service>`)

Labeling as `needs-info` — will revisit once we have the details.
```

### Duplicate
```
Thanks for reporting this! This appears to be a duplicate of #NNN which is currently being tracked.

I'll close this one and continue discussion there.
```

### Feature — Backlog
```
Thanks for the suggestion! This aligns with our roadmap direction. Added to backlog for prioritization.

Feel free to add a +1 reaction on this issue to help us gauge demand.
```

## HiveArmor-Specific Labels

```bash
# Create these if missing
gh label create "bug" --color "d73a4a"
gh label create "enhancement" --color "a2eeef"
gh label create "P0" --color "e11d48"
gh label create "P1" --color "f97316"
gh label create "P2" --color "eab308"
gh label create "P3" --color "22c55e"
gh label create "security" --color "e11d48"
gh label create "needs-info" --color "d876e3"
gh label create "duplicate" --color "cfd3d7"
gh label create "component:backend" --color "0075ca"
gh label create "component:frontend" --color "0075ca"
gh label create "component:event-processor" --color "0075ca"
gh label create "component:agent" --color "0075ca"
```
