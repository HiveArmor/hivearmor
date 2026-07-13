# Requirements Document

## Introduction

A visual/cosmetic-only refresh of the existing UTMStack Angular 7 frontend. The goal is to modernize the color palette, improve spacing and typography consistency, and polish the dark-themed SIEM interface — without changing any TypeScript logic, services, API calls, component behavior, or project dependencies. All modifications are limited to SCSS files (`theme.scss`, `var.scss`, `custom-elements.scss`, `styles.scss`, and component-level `.scss` files).

## Glossary

- **Style_System**: The collection of SCSS files in `frontend/src/assets/styles/` that define global variables, theme colors, and reusable style rules (`theme.scss`, `var.scss`, `custom-elements.scss`, `styles.scss`).
- **Color_Palette**: The set of SCSS variables defined in `theme.scss` that control primary, semantic, surface, and text colors throughout the application.
- **Component_Stylesheet**: Any `.scss` file co-located with an Angular component (e.g., `my-component.component.scss`).
- **Typography_Scale**: The systematic hierarchy of font sizes, weights, and line-heights applied to headings, body text, labels, and monospace elements.
- **Spacing_System**: The collection of padding, margin, and gap values applied to cards, tables, inputs, and layout containers.
- **Surface_Colors**: Background colors for page backgrounds, cards, panels, modals, and elevated elements.
- **Border_Treatment**: The visual treatment of element borders including color, radius, and width.
- **Shadow_System**: Box-shadow values applied to elevated elements like cards, modals, and dropdowns.
- **Build_Pipeline**: The Angular CLI 7 build using `node-sass@4` on Node 14.16.1 that compiles SCSS to CSS.

## Requirements

### Requirement 1: Modernize the Color Palette

**User Story:** As a SOC analyst, I want a refreshed, modern dark-themed color palette, so that the interface feels more polished and reduces eye strain during extended monitoring sessions.

#### Acceptance Criteria

1. THE Color_Palette SHALL define a cohesive dark-mode surface scale with at least four distinct surface tones (ground, primary surface, secondary surface, elevated surface) as SCSS variables in `theme.scss`.
2. THE Color_Palette SHALL define a primary brand accent color that replaces the current `$primary-color: #232f3e` with a more vibrant, accessible value while maintaining WCAG AA contrast ratio (4.5:1) against the dark surface background.
3. THE Color_Palette SHALL define distinct semantic color variables for success, warning, danger, and info states that are visually distinguishable from each other on dark backgrounds.
4. WHEN a severity-related UI element is rendered, THE Style_System SHALL apply a severity-specific color (critical, high, medium, low, info) that is consistent across all components.
5. THE Color_Palette SHALL maintain all existing SCSS variable names (e.g., `$primary-color`, `$danger-color`, `$success-color`, `$grey-color`) so that component stylesheets referencing them continue to resolve without modification.

### Requirement 2: Establish Consistent Typography

**User Story:** As a SOC analyst, I want readable and consistently-sized text throughout the interface, so that I can scan log data and alert details without straining.

#### Acceptance Criteria

1. THE Typography_Scale SHALL define a base body font-size of 14px (0.875rem) to replace the current 13px/12px inconsistency.
2. THE Typography_Scale SHALL define a heading hierarchy (h1 through h6) with distinct sizes and weights that follow a consistent ratio.
3. THE Style_System SHALL apply a monospace font (`'JetBrains Mono', 'Fira Code', 'Consolas', monospace`) to log viewers, code editors, terminal displays, and JSON data.
4. THE Typography_Scale SHALL use the existing Poppins font family for all non-monospace text, preserving the current font import mechanism.
5. THE Style_System SHALL remove all global `font-size: .75rem !important` overrides on `span` and `label` selectors, replacing them with context-appropriate sizes defined by the Typography_Scale.

### Requirement 3: Standardize Spacing and Padding

**User Story:** As a SOC analyst, I want consistent spacing between UI elements, so that the interface feels organized and predictable.

#### Acceptance Criteria

1. THE Spacing_System SHALL define a spacing scale based on a 4px base unit (4px, 8px, 12px, 16px, 24px, 32px, 48px) as SCSS variables.
2. THE Style_System SHALL apply consistent internal padding to all card elements (`.card`, `.card-header`, `.card-body`) using values from the Spacing_System.
3. THE Style_System SHALL apply consistent cell padding to table elements (`td`, `th`) that provides adequate breathing room without wasting vertical space.
4. THE Style_System SHALL apply uniform vertical spacing between form elements (`.form-group`) and between sections within modals.
5. THE Spacing_System SHALL not alter the overall page layout structure, sidebar width, header height, or main content area dimensions.

### Requirement 4: Polish Borders and Border Radius

**User Story:** As a SOC analyst, I want a modern, consistent border treatment across UI elements, so that the interface looks cohesive and professionally finished.

#### Acceptance Criteria

1. THE Border_Treatment SHALL define a consistent border-radius value (between 4px and 8px) applied to cards, modals, inputs, buttons, and dropdowns via SCSS variables.
2. THE Border_Treatment SHALL replace the current `border-radius: 0` on `.card` and `.modal-content` with the standardized radius value.
3. THE Border_Treatment SHALL define a subtle border color for dark-mode elements that provides visual separation without harsh contrast.
4. THE Style_System SHALL apply the consistent border-radius to `.form-control`, `.btn`, `.dropdown-menu`, `.nav-tabs .nav-link`, and `.badge` elements.

### Requirement 5: Add Subtle Shadow Depth

**User Story:** As a SOC analyst, I want subtle elevation cues on overlapping panels, so that I can distinguish layered elements (modals, dropdowns, popovers) from the base surface.

#### Acceptance Criteria

1. THE Shadow_System SHALL define at least three elevation levels (low, medium, high) as SCSS variables using `box-shadow`.
2. THE Style_System SHALL apply the low elevation shadow to card elements and the high elevation shadow to modals, popovers, and dropdowns.
3. THE Shadow_System SHALL use dark-mode-appropriate shadow colors (semi-transparent black with reduced opacity) that do not create visible harsh edges on dark backgrounds.

### Requirement 6: Refresh Interactive State Colors

**User Story:** As a SOC analyst, I want clear visual feedback when hovering over or focusing on interactive elements, so that I can easily identify clickable targets.

#### Acceptance Criteria

1. WHEN a user hovers over a button, THE Style_System SHALL display a visible color shift or subtle shadow transition distinct from the resting state.
2. WHEN an input or select element receives focus, THE Style_System SHALL display a visible focus ring using the brand accent color.
3. THE Style_System SHALL ensure all link hover states use the refreshed accent color consistently.
4. THE Style_System SHALL ensure table row hover states provide a subtle background color change that is visible on dark surfaces.
5. THE Style_System SHALL ensure nav-tab active states use underline or background distinction that contrasts with inactive tabs.

### Requirement 7: Refresh Scrollbar Appearance

**User Story:** As a SOC analyst, I want scrollbars that blend with the dark theme, so that they do not visually clash with the surrounding interface.

#### Acceptance Criteria

1. THE Style_System SHALL style WebKit scrollbar thumb and track to use dark-theme-appropriate colors (dark track, slightly lighter thumb).
2. THE Style_System SHALL maintain a narrow scrollbar width (8px) for both vertical and horizontal scrollbars.

### Requirement 8: Zero Logic Changes Constraint

**User Story:** As a developer, I want the visual refresh to contain zero TypeScript changes, so that the application behavior, API integrations, and state management remain untouched and risk-free.

#### Acceptance Criteria

1. THE Style_System SHALL achieve the entire visual refresh by modifying only `.scss` files (global and component-level).
2. THE Style_System SHALL not require any changes to `.ts`, `.html`, or `.json` files (excluding `angular.json` only if a new global SCSS partial must be imported).
3. THE Style_System SHALL not introduce any new npm dependencies or modify `package.json`.
4. THE Style_System SHALL not remove or rename any existing CSS class names used in HTML templates.

### Requirement 9: Build Compatibility

**User Story:** As a developer, I want the refreshed styles to compile successfully with the existing build toolchain, so that the CI/CD pipeline continues to pass without modification.

#### Acceptance Criteria

1. THE Style_System SHALL use only SCSS syntax compatible with `node-sass@4` (no Dart Sass-only features like `math.div()`, `@use`, or `@forward`).
2. THE Style_System SHALL compile without errors when `npm run build` is executed with Node 14.16.1 and Angular CLI 7.3.6.
3. THE Style_System SHALL not exceed the existing production build budget of 15MB maximum error threshold.
4. IF a new SCSS partial file is created, THEN THE Style_System SHALL import it via `@import` in `styles.scss` following the existing import pattern.

### Requirement 10: Dark-Mode Surface Consistency

**User Story:** As a SOC analyst, I want every panel, card, and container to use the dark theme consistently, so that no bright-white areas flash on screen during navigation.

#### Acceptance Criteria

1. THE Style_System SHALL set the `body` background to a dark surface color replacing the current light `#F2F3F7`.
2. THE Style_System SHALL set card backgrounds (`.card`, `.modal-content`, `.popover`) to a slightly elevated dark surface tone.
3. THE Style_System SHALL set form input backgrounds (`.form-control`, `.ng-select-container`) to a dark surface tone with light text color.
4. THE Style_System SHALL ensure table backgrounds (including striped rows) use dark surface tones rather than white or light grey.
5. THE Style_System SHALL update text colors (`body`, `p`, `a`, `span`, `label`) to light tones (e.g., `#E2E8F0` for primary text, `#94A3B8` for secondary text) appropriate for dark backgrounds.
