# Implementation Plan: Angular UI Refresh

## Overview

A pure SCSS visual refresh converting the UTMStack Angular 7 frontend from a light theme to a cohesive dark-mode design. Implementation proceeds in layers: variables first, then the new dark-theme partial, then global style overrides, then component-specific fixes, and finally build verification. All changes are limited to `.scss` files and must compile with `node-sass@4`.

## Tasks

- [x] 1. Update color variable definitions in theme.scss
  - [x] 1.1 Update primary palette variables with new dark-mode values
    - Change `$primary-color` from `#232f3e` to `#3B82F6` (vibrant blue)
    - Change `$primary-color-hover` from `#1a202f` to `#2563EB`
    - Change `$blue-scroll` from `#0277bd` to `#3B82F6`
    - Change `$blue-component` from `#0277bd` to `#60A5FA`
    - Change `$active` from `#0a6ebd` to `#3B82F6`
    - Update `$success-color` to `#10B981`, `$danger-color` to `#EF4444`, `$info-color` to `#F59E0B`
    - Update `$grey-color` to `#64748B`, `$white-color` to `#F1F5F9`
    - Preserve all existing variable names exactly
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 1.2 Add new dark surface, text, border, and severity color variables to theme.scss
    - Add `$surface-ground: #0F172A`, `$surface-primary: #1E293B`, `$surface-secondary: #334155`, `$surface-elevated: #475569`
    - Add `$text-primary: #E2E8F0`, `$text-secondary: #94A3B8`, `$text-tertiary: #64748B`
    - Add `$border-color-dark: #334155`, `$border-radius-base: 6px`
    - Add severity variables: `$severity-critical: #DC2626`, `$severity-high: #F97316`, `$severity-medium: #FBBF24`, `$severity-low: #3B82F6`, `$severity-info: #6B7280`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 10.5_

- [x] 2. Add spacing, shadow, and border-radius variables to var.scss
  - [x] 2.1 Add spacing scale and elevation variables to var.scss
    - Add spacing scale: `$space-1: 4px` through `$space-12: 48px`
    - Add shadow levels: `$shadow-low`, `$shadow-medium`, `$shadow-high` with dark-mode-appropriate rgba values
    - Add border radius variables: `$radius-sm: 4px`, `$radius-base: 6px`, `$radius-lg: 8px`, `$radius-pill: 9999px`
    - Place new variables after existing `$grid-breakpoints` definition
    - _Requirements: 3.1, 4.1, 5.1, 5.3_

- [x] 3. Create the _dark-theme.scss partial
  - [x] 3.1 Create `frontend/src/assets/styles/_dark-theme.scss` with dark surface overrides
    - Import `./theme` and `./var` at the top
    - Add body styles: `background: $surface-ground`, `color: $text-primary`
    - Add card styles: dark background, border, radius, low shadow, card-header/card-body padding
    - Add modal-content styles: dark background, border, radius, high shadow
    - Add form-control styles: `$surface-secondary` background, dark border, light text, radius
    - Add `.ng-select-container` styles: dark background matching form-control
    - Add table row alternating dark colors using `$surface-primary` and rgba variant
    - Add text color overrides for `p`, `span`, `label` using `$text-primary`
    - Add popover/dropdown dark background with `$shadow-high`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 4.2, 5.2_

- [x] 4. Update styles.scss with imports and global overrides
  - [x] 4.1 Add `@import "assets/styles/dark-theme"` to styles.scss and update body/typography/scrollbar rules
    - Add `@import "assets/styles/dark-theme"` after the existing partial imports (after `svg-icon` import)
    - Update body font-size to `0.875rem` (14px base)
    - Remove `background: #F2F3F7` from body (now handled by _dark-theme)
    - Update `color` on body to `$text-primary`
    - Update heading hierarchy (h1-h6) with distinct sizes and weights following consistent ratio
    - Add monospace font stack (`'JetBrains Mono', 'Fira Code', 'Consolas', monospace`) rules for `.terminal`, `.command`, `.console-info`, and code/pre elements
    - Remove global `font-size: .75rem !important` overrides on `span` and `label` selectors — replace with context-appropriate sizes
    - Update scrollbar styles: dark track (`$surface-secondary`), lighter thumb (`$grey-color`), 8px width maintained
    - Update `p` tag color from `#212529` to `$text-primary`
    - Update `a` tag color from `#666666` to `$text-secondary`, hover to `$primary-color`
    - Update `.form-group label, span` to use `$text-primary` instead of hardcoded dark colors
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 10.1, 10.5_

  - [x] 4.2 Update interactive states and button styles in styles.scss
    - Update button hover states to include `box-shadow` transition and subtle color shift
    - Add focus ring using `$primary-color` for `textarea:focus` and `input:focus`
    - Update `.utm-button-grey` background from `#f5f5f5` to `$surface-secondary`
    - Update `.pagination` colors to use dark surfaces with accent active state
    - Update table row hover: add `tr:hover` background change using `rgba($primary-color, 0.1)`
    - Update `.card-header-chart` from `#FFFFFF` to `$surface-primary`
    - Update popover backgrounds from `white` to `$surface-primary`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 10.2_

- [x] 5. Update custom-elements.scss with dark theme and spacing fixes
  - [x] 5.1 Replace hardcoded light colors in custom-elements.scss with dark-theme variables
    - Replace any hardcoded `#FFFFFF`, `white`, `#f8f9fa` backgrounds with `$surface-primary` or `$surface-secondary`
    - Replace hardcoded text colors (`#212529`, `#666666`, `#333`) with `$text-primary` or `$text-secondary`
    - Replace hardcoded border colors with `$border-color-dark`
    - Update nav-tab active states to use underline or background distinction with `$primary-color`
    - Apply `$radius-base` to buttons, dropdowns, nav-tabs, and badges
    - Apply consistent table cell padding using `$space-3` (12px)
    - Apply consistent `.form-group` vertical spacing using `$space-4` (16px) margin-bottom
    - _Requirements: 3.2, 3.3, 3.4, 4.3, 4.4, 6.5, 10.2, 10.4_

- [x] 6. Checkpoint - Verify global styles compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Fix component-level SCSS files
  - [x] 7.1 Update component `.scss` files that contain hardcoded light backgrounds
    - Search component `.scss` files for hardcoded `#FFFFFF`, `#fff`, `white`, `#F2F3F7`, and light grey backgrounds
    - Replace with appropriate dark surface variables (`$surface-primary`, `$surface-secondary`)
    - Ensure each component file has the proper `@import` for theme variables if referencing new variables
    - Target approximately 10-15 component files as identified in the design
    - Do NOT change any `.ts` or `.html` files
    - Do NOT remove or rename any existing CSS class names
    - _Requirements: 8.1, 8.2, 8.4, 10.2, 10.4_

  - [x] 7.2 Apply severity color consistency to alert/badge component styles
    - Ensure severity-related elements (critical, high, medium, low, info) use the `$severity-*` variables
    - Update any component badge or severity indicator styles to reference the centralized severity palette
    - _Requirements: 1.4_

- [x] 8. Checkpoint - Full build verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Build compilation and constraint verification
  - [x] 9.1 Verify SCSS compiles with node-sass@4 and Angular CLI 7.3.6
    - Run `NODE_OPTIONS=--max_old_space_size=8192 npm run build` from `frontend/` directory
    - Confirm exit code 0 with no SCSS compilation errors
    - Confirm no `@use`, `@forward`, or `math.div()` syntax present in any modified file
    - Confirm output bundle stays within 15MB budget
    - Confirm no `.ts`, `.html`, or `.json` files were modified (except potentially `angular.json` if new import needed)
    - Confirm no new npm dependencies added
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 8.1, 8.2, 8.3_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- No property-based tests are applicable — this feature is purely SCSS changes with no runtime logic
- All existing SCSS variable names are preserved; only values change
- The single new file `_dark-theme.scss` is imported last to ensure dark overrides take precedence
- `node-sass@4` constraints: no `@use`, `@forward`, `math.div()` — only `@import` and `/` division with interpolation where ambiguous
- Spacing system must not alter sidebar width, header height, or main content area dimensions (Requirement 3.5)
- Print styles (`@media print`) should retain white backgrounds for printability
- Component SCSS files use `@import "../theme"` pattern — updated variable values propagate automatically in most cases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2"] },
    { "id": 5, "tasks": ["7.1", "7.2"] },
    { "id": 6, "tasks": ["9.1"] }
  ]
}
```
