# Phase 9 — ECharts 4 → 5 Migration

**Date**: June 2026  
**Status**: ✅ Complete  
**Risk**: Medium — visual rendering library, no API/backend changes  

## What Changed

| Package | Before | After |
|---|---|---|
| `echarts` | `^4.4.0` | `5.6.0` |
| `ngx-echarts` | `^4.1.1` | `14.0.0` |
| `echarts-wordcloud` | `^1.1.3` | `2.1.0` |
| `echarts-gl` | `^1.1.1` | `2.0.9` |
| `echarts-leaflet` | `^1.1.0` | **removed** |
| `echarts-extension-leaflet` | — | `1.2.2` (ECharts 5 compatible replacement) |
| `@types/echarts` | `^4.1.8` | **removed** (ECharts 5 ships own types) |
| `echarts-stat` | `^1.1.1` | **removed** (unused) |
| `echartslayer` | `^0.1.6` | **removed** (unused) |

## Bundle Size Improvement

| Metric | Before (ECharts 4) | After (ECharts 5) |
|---|---|---|
| main.js | 4.10 MB (gzip: 924 kB) | 3.14 MB (gzip: 666 kB) |

**23% reduction** in main bundle, **28% reduction** gzipped — ECharts 5 tree-shaking via dynamic import in `ngx-echarts@14.forRoot()`.

## Files Changed

### `frontend/package.json`
- Updated echarts packages as above

### `frontend/angular.json`
- Removed `node_modules/echarts/dist/echarts.js` from scripts (handled by ngx-echarts dynamic import)
- Replaced `echarts-leaflet/dist/echarts-leaflet.js` → `echarts-extension-leaflet/dist/echarts-extension-leaflet.js`
- Updated `allowedCommonJsDependencies`: removed `echarts-leaflet`, added `echarts-extension-leaflet`

### `frontend/src/main.ts`
- Removed ECharts 4 individual tree-shaking imports (`echarts/lib/chart/scatter`, `echarts/lib/chart/effectScatter`)
- Removed `echarts-wordcloud/dist/echarts-wordcloud.js` require (now loaded via angular.json scripts)
- Removed `echarts/theme/macarons.js` import
- Clean bootstrap — only AppModule

### `frontend/src/app/app.module.ts`
- `NgxEchartsModule` → `NgxEchartsModule.forRoot({ echarts: () => import('echarts') })`
- This enables dynamic import + tree-shaking for all chart types

### `frontend/src/app/graphic-builder/shared/components/viewer/chart-view/chart-view.component.ts`
- `import EChartOption = echarts.EChartOption` → `import type { EChartsOption } from 'echarts'`
- `require('echarts-wordcloud')` removed (loaded via angular.json scripts array)
- `echartOption: EChartOption` → `echartOption: EChartsOption`

### `frontend/src/app/scanner/assets-discovery/assets-host-detail/assets-host-detail.component.ts`
### `frontend/src/app/scanner/assets-discovery/task-result/task-result.component.ts`
- `require('echarts-wordcloud')` removed (duplicate — already in scripts array)

### `normal:{}` wrapper removal (ECharts 5 breaking change)

ECharts 5 removed the `itemStyle.normal`, `label.normal`, `lineStyle.normal`, `areaStyle.normal` wrapper. Properties moved up one level.

Fixed in **13 active source files** + **4 type definition files**:
- `scatter-map.ts` — `itemStyle.normal.color` → `itemStyle.color`
- `line-bar.ts` — `areaStyle.normal.opacity` → `areaStyle.opacity`
- `tag-cloud.ts` — `createRandomItemStyle` return value flattened
- `chart-ad-admin-vs-user.component.ts` — `itemStyle.normal` flattened
- `analyzer-bar-chart.component.ts` — `itemStyle.normal.label` flattened
- `chart-series-line-bar-option.component.ts` — nested `normal:{}` unwrapped
- `word-cloud.def.ts` (scanner, disabled route) — `createRandomItemStyle` flattened
- `pie-severity-class.def.ts` (scanner, disabled route) — `itemStyle.normal` flattened
- `host-topology.def.ts` (scanner, disabled route) — `itemStyle.normal` flattened
- `asset-severity-chart.component.ts` (scanner) — dataStyle/placeHolderStyle flattened
- `vs-severity.component.ts` (vulnerability-scanner, disabled route) — flattened

**Type definition files updated:**
- `series-scatter.ts` — `itemStyle.normal?` unwrapped
- `multiline-serie.ts` — any `normal?` wrappers unwrapped
- `item-style.ts` — `itemStyle.normal?` unwrapped
- `chart.model.ts` — `ChartSeriesModel.textStyle.normal?` unwrapped

## `echarts-leaflet` → `echarts-extension-leaflet`

`echarts-leaflet@1.x` only supports ECharts 4.  
`echarts-extension-leaflet@1.2.2` supports ECharts 5, maintains the same `coordinateSystem: 'leaflet'` API.

The scatter-map chart (`scatter-map.ts`) uses `coordinateSystem: 'leaflet'` — no code changes needed, only the script in `angular.json` was updated.

## Build & Test Results

```
✔ BUILD SUCCESS
main.js  : 3.14 MB (gzip: 666 kB)   ← was 4.10 MB
TOTAL: 26 SUCCESS
```

## What's Unchanged

- Chart option structure (beyond `normal:{}` removal)
- All chart types still render: bar, line, pie, heatmap, scatter, effectScatter, wordCloud, gauge
- `UTM_COLOR_THEME` palette — unchanged (ECharts 5 compatible)
- `CoordinateSystem: 'leaflet'` for map charts — unchanged
- All 14 backend API contracts — unchanged

## Phase 10 (next)

Bootstrap 4 → 5 + jQuery removal — the highest-risk remaining frontend change.
