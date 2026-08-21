# Sprint 39 — E2E UI Verification Checklist

## Automated Verification (PASSED)

| Check | Command | Result |
|-------|---------|--------|
| 10.1 TypeScript compile | `cd frontend-v3 && npx tsc --noEmit` | ✅ Zero errors |
| 10.2 Production build | `cd frontend-v3 && npm run build` | ✅ Zero errors (dist/ generated) |

## Manual Browser Verification (Requires Running Stack)

Prerequisites:
- Full local stack running: `cd local-dev && docker compose up -d`
- Frontend dev server: `cd frontend-v3 && npm run dev` (port 3000)
- Investigation-ready alerts seeded (Task 1 seed script executed)

### Checklist

- [ ] **10.3** Navigate to `http://localhost:3000/alerts` — verify grid loads with investigation-ready alerts
- [ ] **10.4** Click an investigation-ready alert → verify navigation to `/alerts/{id}` — page loads without error
- [ ] **10.5** Verify page header: severity badge visible, title rendered, summary present, risk/confidence/verdict metrics populated (not "—")
- [ ] **10.6** Verify attack chain bar: 2-6 MITRE tactic hexagons displayed with event count numbers
- [ ] **10.7** Click a stage in the attack chain → execution story scrolls to first event in that stage
- [ ] **10.8** Verify execution story panel: chronological events with category icons (process/file/network/identity), timestamps, titles, summaries
- [ ] **10.9** Select an event in the story → process tree highlights the associated process node
- [ ] **10.10** Click "Guide" button → investigation guide panel opens with 3-7 investigation steps (not "Awaiting backend contract ALT-009")
- [ ] **10.11** Switch to "Event details" tab → highlighted fields render with type badges (IP, hash, hostname, process) and emphasis coloring
- [ ] **10.12** Switch to "Raw event" evidence tab → formatted JSON document displayed
- [ ] **10.13** Switch to "History & response" tab → activity feed shows creation event and any status changes/notes
- [ ] **10.14** Verify the `missingDataNotice` banner is NOT displayed for investigation-ready alerts
- [ ] **10.15** Verify keyboard navigation: J/K moves story selection up/down
- [ ] **10.16** Verify no JavaScript console errors related to null/undefined field access or failed queries
- [ ] **10.17** Test graceful degradation: manually 404 the story endpoint → attack chain shows DataUnavailable without crashing the page
- [ ] **10.18** Take screenshot of final investigation board state for visual review

## What the Compile/Build Validates

The successful TypeScript compilation and Vite production build confirm:

1. **Type-level integration** — All new types (`AlertStoryResponse`, `AlertActivityResponse`, `AlertGuideResponse`, `AlertEventHighlightedResponse`, `AlertEventRawResponse`, `EnhancedAlertDetail`) are correctly defined and used
2. **Import graph** — All service functions (`fetchAlertStory`, `fetchAlertActivity`, `fetchAlertGuide`, `fetchAlertEventDetail`) are properly exported and imported
3. **React Query wiring** — All `useQuery` hooks in `AlertInvestigationPage.tsx` have correct type signatures
4. **No dead code paths** — TypeScript strict mode ensures no unreachable code or unused variables
5. **Component props** — All sub-components receive correctly-typed props from the new data sources
6. **No null safety violations** — Optional chaining and nullish coalescing are correctly applied

## Notes

- Tasks 10.3-10.18 require the full backend (with Sprint 39 endpoints deployed) + seeded data
- Run `local-dev/seed-investigation-alerts.sh` before UI verification
- Run `local-dev/rebuild-backend.sh` after backend compilation to deploy the new WAR
