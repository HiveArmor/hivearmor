# HiveArmor Three-Theme Design System — Decision & Governance Record

**Status:** shipped (PR #182)
**Product-owner sign-off:** 2026-09-03
**Scope:** `frontend-v3/` — the Dark / White / Modern theme system, the squarer
radius scale, the field-type icon, the Modern polish layer, and the `HaStepper`
primitive.

This is the **version-controlled** home for the three-theme decisions. The
`.kiro/steering/*.md` rule files carry the same amendments for the benefit of
future agent sessions, but `.kiro/` is git-ignored in this repo, so the
authoritative, reviewable record lives here.

---

## 1. The three themes

HiveArmor ships **three** user-selectable themes, stored per user in
`localStorage` under `ha_theme` and applied via `data-ha-theme` on the document
root. The theme is chosen from a 3-way selector in the sidebar (Dark / Modern /
White).

| Theme | `data-ha-theme` | Family | Character |
|-------|-----------------|--------|-----------|
| **Dark** (default) | *(unqualified `:root`)* | dark | Hive Carbon — deep carbon surfaces for long SOC shifts |
| **White** | `light` | light | Tuned light companion, WCAG-AA verified |
| **Modern** | `modern` | dark | Deep Navy Command — navy surfaces, brighter teal, opaque elevated overlay chrome |

`isDarkFamily(theme)` returns true for `dark` and `modern`; the document
`color-scheme` follows that. Downstream consumers that only knew `dark|light`
treat `modern` as dark (e.g. Monaco maps `modern → hivearmor-dark` via
`monacoThemeName()`; the AG-grid class routes any non-light theme to the dark
grid).

Semantic tokens (severity, intelligence-violet, brand gold/orange, state) are
defined once on `:root` and **inherited** by the Modern block — meaning is
identical across all three themes. Verified: every inherited semantic colour
clears WCAG AA on the Modern navy surfaces (6.0–11.2:1).

---

## 2. Glass / `backdrop-filter: blur` — exception RETIRED (2026-09-06)

A scoped glass exception was briefly in force (product-owner approved
2026-09-03): `backdrop-filter: blur` was permitted only under
`:root[data-ha-theme='modern']` on transient overlay chrome. **That exception is
now retired.** Glassmorphism (`backdrop-filter: blur`) is once again **forbidden
in every theme, including Modern** — the anti-pattern list stands unqualified.

What replaced it: Modern overlay chrome (menus, dialogs, sheets, popovers,
tooltips, toasts) now paints a **fully opaque elevated surface**
(`var(--ha-surface-elevated)`) separated from the mesh background by a **crisp
elevation shadow** and a stronger border — no blur, no translucency. This keeps
the lifted, layered Modern feel, guarantees text contrast unconditionally, and
removes the GPU cost of `backdrop-filter`.

Implementation still lives in one file, `src/styles/modern-polish.css`, every
rule prefixed by the `[data-ha-theme='modern']` scope. Data surfaces
(`.ha-grid` / `.ag-*` / `.ha-card`) retain an explicit `backdrop-filter: none`
guard as belt-and-suspenders. The Modern mesh background, teal action glow, and
guarded overlay entrance motion are unchanged.

---

## 3. Radius scale — squared (values retuned, names kept)

The surface radius scale was retuned squarer to suit a dense SOC surface:

| Token | Before | After |
|-------|--------|-------|
| `--ha-radius-control` | 8px | **6px** |
| `--ha-radius-panel` | 12px | **8px** |
| `--ha-radius-workspace` | 16px | **10px** |
| `--ha-radius-pill` | 999px | 999px |

Token **names were kept**, so all 91 consuming stylesheets inherit the change
with no rename sweep. This also brings primary surfaces into compliance with the
design-system rule "border-radius ≤ 8px on primary surfaces" — `panel` and
`workspace` previously exceeded it.

---

## 4. Typography — display font deferred

The `--ha-type-*` scale is complete and unchanged. A display font (Space Grotesk)
was **not** added: the app has no font-loading mechanism today (no `@fontsource`,
no `<link>`, no `@font-face` — Inter and JetBrains Mono resolve from the OS). A
display token pointing at a non-system font would silently fall back everywhere.
Adding a display font requires introducing font bundling first, which is out of
scope for this rollout. UI font stays **Inter**, mono stays **JetBrains Mono**.

---

## 5. New components

| Component | Lifecycle | Why it exists |
|-----------|-----------|---------------|
| `HaFieldTypeIcon` | beta | Distinct glyph per SIEM field type (date/keyword/text/ip/number/boolean). Pairs type with an icon so type is never conveyed by text or colour alone (WCAG 2.2). Wired into the search-hunt FieldBrowser. |
| `HaStepper` | beta | Read-only step progress indicator. Consolidates **five** hand-rolled steppers (gov/iam/int/pipe/tfa) — well past the rule-of-three extraction trigger. Not a wizard (see `HaWizard` for interactive flows). |

Both ship the full HaUI contract (`.tsx` + `.test.tsx` + `.stories.tsx` +
`.css` + barrel), tokens only, WCAG-AA, registered in the Storybook `HaUI` tree.

---

## 6. Components deliberately NOT built (Phase 4 audit)

Four of the six originally-listed "missing" components already exist. Building
them would violate the design-system decision rule (don't free-build, don't wrap
to rename, extract only after 3× use):

| Requested | Reality | Decision |
|-----------|---------|----------|
| Snackbar | `toast-stack` already wraps PF Alert/AlertGroup with a toast store | Already covered |
| Sheet | `ha-drawer` + `alert-context-drawer` (PF Drawer) already exist | Already covered |
| Wizard/stepper | `ha-wizard` already exists (interactive) | Covered; the read-only indicator became `HaStepper` |
| Pickers | `time-range-selector` covers the SIEM time picker | Covered for the real need |
| Pagination | Lives in `SiemDataGrid` (cursor), used **1×** | Rule-of-three not met — not extracted |
| FAB | No use case in a dense SOC shell; PatternFly has none | **Not built** — a mobile/Material pattern, wrong for this product |

---

## 7. Storybook reference

Storybook is the living design-system reference (replacing the throwaway
`.plan/*.html` showcase). `.storybook/preview.tsx` carries a **Dark / Modern /
White** theme toolbar toggle (default Dark) that sets `data-ha-theme` on the
story root and loads `modern-polish.css`, so every component — and the
`Foundations/Theme Modes` overview story — is reviewable in all three themes.
This also seeds the three-theme visual-regression baselines.

---

## 8. Rollout (PR #182, `feat/haui-three-theme-modern`)

| Phase | Commit | Delivered |
|-------|--------|-----------|
| 0 | `ce24867` | Theme architecture: `HaTheme = dark\|light\|modern`, 3-way selector, Modern Deep Navy block, Monaco/grid mapping |
| 1 | `ee93f64` | Palettes AA-complete; white metadata contrast fix |
| 2 | `bca220f` | Squarer radii + `HaFieldTypeIcon` |
| 3 | `218cb71` | Modern polish layer (glass/mesh/glow) + Storybook theme toggle |
| 4 | `2c9f813` | `HaStepper` (+ TfaPage migration); audit of what not to build |
| 5 | *(this)* | Storybook `Foundations/Theme Modes` reference + this governance record |
