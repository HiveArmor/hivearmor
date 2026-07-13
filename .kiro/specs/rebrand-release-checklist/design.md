# Design — Release Checklist

## Overview

A simple sign-off document. No new code. Runs existing automated tests and a manual walkthrough.

## Components and Interfaces

The release checklist references these automated tools:
- `npm test -- --watch=false` (Karma)
- `node .cursor-audit/test-rebrand.mjs` (Playwright branding check)
- `node .cursor-audit/test-security-regression.mjs` (Playwright auth check)
- `node .cursor-audit/test-all-bugs.mjs` (Playwright bug regression check)
- `mvn -B -Pprod clean package -s settings.xml` (backend WAR build)

## Data Models

No new data models.

## Correctness Properties

### Property 1: All Specs Signed Off

**Validates: Requirements 1.1–1.7**

Each spec's gate condition is verified and documented in the release checklist.

### Property 2: Zero Console Errors on Key Pages

**Validates: Requirements 3.5**

Playwright navigates login, dashboard, alerts, SOAR, compliance → zero red console errors (pre-existing backend 500 is documented as known).

## Error Handling

If ANY checklist item fails: STOP. Do not push to production. Investigate and fix in the specific spec that covers that item.
