# HiveArmor colour-system decision

## Final decision: Hive Carbon Hybrid

Hive Carbon Hybrid is the approved product colour system. It combines deep carbon surfaces for long SOC shifts, restrained teal interaction, and a separate orange-to-gold identity treatment for the HiveArmor mark. Severity, product action, intelligence, and operational state never share a token merely because their hues are visually related.

All product elements must consume semantic CSS custom properties from `frontend-v3/src/styles/foundation.css`. Raw colour literals are prohibited in components, page styles, charts, and editors. Canvas-based ECharts and Monaco integrations resolve the same CSS properties at runtime.

## Dark mode — primary analyst experience

| Semantic token | Value | Use |
|---|---:|---|
| `surface.app` | `#0B0919` | Deep application canvas |
| `surface.sidebar` / `surface.masthead` | `#12131A` | Persistent application chrome |
| `surface.panel` | `#1A1B22` | Tables, workspaces, cards |
| `surface.elevated` | `#22232B` | Menus, toolbars, raised controls |
| `surface.input` | `#13151C` | Search and form inputs |
| `surface.hover` | `#252832` | Hover state |
| `surface.selected` | `#163033` | Teal-related selection without severity ambiguity |
| `border.subtle` | `#282931` | Dense row and panel divisions |
| `border.default` | `#31323A` | Controls and panels |
| `border.strong` | `#51535E` | Hover and structural emphasis |
| `text.primary` | `#E7E5EA` | Main copy; 13.72:1 on panel |
| `text.secondary` | `#B3B0B8` | Supporting copy; 8.02:1 on panel |
| `text.tertiary` | `#908C96` | Metadata; AA on panel |
| `action.primary` | `#61C4BE` | Primary action and selection; 8.29:1 on panel |
| `action.secondary` | `#83D7D2` | Links and secondary emphasis |
| `brand.primary` | `#F0AE0B` | Logo only |
| `brand.hot` | `#FF6A00` | Logo gradient only |

The gold/orange identity colours are not warning, high-severity, chart, or button colours. Teal is not used for healthy/resolved states.

## Final severity scale

Every severity presentation must pair colour with its text label and a marker/icon.

| Level | Dark value | Contrast on dark panel | Light companion | Contrast on white |
|---|---:|---:|---:|---:|
| Critical | `#FF6677` | 6.06:1 | `#C92F47` | 5.27:1 |
| High | `#F2AD5B` | 8.91:1 | `#A65300` | 5.44:1 |
| Medium | `#E3C64C` | 10.17:1 | `#7A6200` | 5.87:1 |
| Low | `#63C79A` | 8.31:1 | `#16734E` | 5.84:1 |
| Informational | `#8B90FF` | 6.15:1 | `#4E55CC` | 6.01:1 |

The order is deliberately conventional: red, orange, yellow, green, then periwinkle. Medium is no longer blue, and low is no longer violet. This makes queue scanning more predictable and separates severity from teal interaction.

## Light mode companion

Light mode is an optional preference for bright environments, reporting, and accessibility needs. It preserves the same hierarchy rather than inverting dark values mechanically.

| Semantic token | Value |
|---|---:|
| `surface.app` | `#F3F4F6` |
| `surface.sidebar` / `surface.masthead` / `surface.panel` | `#FFFFFF` |
| `surface.elevated` | `#F7F8FA` |
| `surface.input` | `#F5F6F8` |
| `surface.hover` | `#ECEFF2` |
| `surface.selected` | `#DDF2F0` |
| `border.subtle` | `#E0E3E7` |
| `border.default` | `#CED3D9` |
| `border.strong` | `#A8B0BA` |
| `text.primary` | `#1A1B22` |
| `text.secondary` | `#4E535A` |
| `text.tertiary` | `#6C737C` |
| `action.primary` | `#287C78` |

The teal seed remains `#61C4BE`; light mode uses the darker `#287C78` action role where teal appears as text, focus, or a small control so WCAG AA is preserved.

## Implementation rules

1. Component and page CSS may use only `var(--ha-*)`, `currentColor`, `transparent`, and `color-mix()` based on HiveArmor variables.
2. Do not add a route-local hex, RGB, HSL, named colour, or shadow colour.
3. Use `--ha-severity-*` only for security severity.
4. Use `--ha-state-*` for connectivity, health, warning, and lifecycle state.
5. Use `--ha-intelligence-primary` only for AI, enrichment, and intelligence provenance.
6. Use `--ha-brand-*` only in the HiveArmor mark or deliberate brand identity assets.
7. Filled teal actions use `--ha-foreground-on-action`; never assume white text.
8. Charts and editors resolve active CSS tokens at runtime because their canvas/rendering APIs cannot reliably consume `var()` strings.
9. The analyst preference is stored locally under `ha_theme`; no backend contract is required.

## Interaction placement

The mode control is a compact icon in the navigation footer. It appears only while the navigation is expanded, remains keyboard accessible, announces the destination mode, and persists the selected preference.
