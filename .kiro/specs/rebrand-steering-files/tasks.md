# Implementation Plan: Rebrand Steering Files

## Overview

Update `.kiro/steering/*.md` and `AGENTS.md` to reflect NilaChakra branding. Pure documentation changes — no code impact.

## Tasks

- [ ] 1. Update `.kiro/steering/branding.md`
  - [ ] 1.1 Change product name from UTMStack to NilaChakra
  - [ ] 1.2 Update logo file inventory to canonical names (logo-full.svg etc.)
  - [ ] 1.3 Add "FROZEN IDENTIFIERS" table from REBRAND_NILACHAKRA_PLAN.md
  - [ ] 1.4 Update cookie name documentation (keep utmauth, mark as frozen)

- [ ] 2. Update `.kiro/steering/product.md`
  - [ ] 2.1 Update product name in description line
  - [ ] 2.2 Update active line description

- [ ] 3. Update `AGENTS.md`
  - [ ] 3.1 Update Overview section product name

- [ ] 4. Verify no unintentional regressions
  - [ ] 4.1 Grep all steering files for UTMStack (expect zero except frozen table)

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": [1, 2, 3],
      "description": "Update all steering files in parallel"
    },
    {
      "wave": 1,
      "tasks": [4],
      "description": "Verify",
      "dependsOn": [0]
    }
  ]
}
```

## Notes

- These are documentation-only changes — no build step required.
- Keep the "FROZEN IDENTIFIERS" table in branding.md accurate — it is the primary reference for developers.
