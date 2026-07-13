# Design — Rebrand Steering Files

## Overview

Update `.kiro/steering/*.md` and `AGENTS.md` to reflect NilaChakra branding. Pure documentation changes — no code impact.

## Files to Modify

| File | Change |
|---|---|
| `.kiro/steering/branding.md` | Product name UTMStack → NilaChakra; cookie/header names in "frozen" table |
| `.kiro/steering/product.md` | Product name in description |
| `.kiro/steering/development-workflow.md` | Note new image registry (pending) |
| `AGENTS.md` | Overview section product name |

## Architecture

This spec is documentation-only. No architectural changes. The steering files are read by Kiro AI to generate contextually correct code. Updating them ensures future auto-generated code uses "NilaChakra" not "UTMStack".

## Components and Interfaces

No code interfaces change. Documentation only.

## Data Models

No data models change.

## Correctness Properties

### Property 1: No UTMStack in Steering Files

**Validates: Requirements 1.1, 1.2**

After this spec, `grep -r 'UTMStack' .kiro/steering/*.md` should return zero results except in "FROZEN" warning tables where it explains the frozen identifiers.

### Property 2: Frozen Identifiers Documented

**Validates: Requirements 2.1, 2.2**

The steering files SHALL include the complete frozen identifier table from `REBRAND_NILACHAKRA_PLAN.md`.

## Error Handling

No runtime error handling — documentation only.

## Testing Strategy

No automated tests required — steering files are documentation. Manual review: read each updated file and confirm "UTMStack" does not appear outside the frozen identifiers table.
