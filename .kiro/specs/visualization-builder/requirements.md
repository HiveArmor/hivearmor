# Requirements Document

## Introduction

The Visualization Builder is a full-featured chart creation and configuration module for the UTMStack SIEM platform's React/Next.js frontend (frontend-v2). It replaces the existing Angular 7 chart-builder module and enables analysts to create, configure, preview, and save data visualizations backed by OpenSearch indices via the existing UTMStack backend API.

## Glossary

- **Visualization_Builder**: The complete feature module encompassing chart type selection, aggregation configuration, live preview, filtering, and persistence.
- **Chart_Type_Selector**: A modal or page that presents available chart types for the user to choose from before entering the builder workspace.
- **Builder_Workspace**: The main three-panel layout where users configure metrics, preview charts, and apply filters.
- **Metric_Aggregation**: A computation applied to a numeric field to produce a single summary value (e.g., Count, Sum, Average, Min, Max, Cardinality, Percentiles, Top Hits).
- **Bucket_Aggregation**: A grouping strategy that partitions documents into discrete sets (e.g., Terms, Date Histogram, Histogram, Range, Filters).
- **Index_Pattern**: A named pattern referencing one or more OpenSearch indices (e.g., log-wineventlog-*, log-linux-*).
- **Live_Preview**: The real-time rendering of the configured visualization using data fetched from the backend run endpoint.
- **ECharts_Renderer**: The charting library (echarts-for-react) responsible for rendering the chart in the center panel.
- **Field_Autocomplete**: A searchable dropdown that displays available fields from the selected Index_Pattern, annotated with data types.
- **Visualization_Store**: The Zustand-based client state that holds the current visualization configuration during editing.
- **API_Client**: The existing fetch-based HTTP client at @/lib/api used for all backend communication.
- **Filter_Panel**: The right-side panel where users define Elasticsearch-compatible filter conditions applied to the visualization query.

## Requirements

### Requirement 1: Chart Type Selection

**User Story:** As a security analyst, I want to select a chart type from a catalog of available options, so that I can choose the most appropriate visualization for my data.

#### Acceptance Criteria

1. WHEN the user navigates to the new visualization page, THE Chart_Type_Selector SHALL display all supported chart types: Line, Area, Bar, Bar Horizontal, Pie, Tag Cloud, Table, List, Gauge, Goal, Metric, Region Map, Heat Map, and Text.
2. WHEN the user selects a chart type, THE Chart_Type_Selector SHALL visually highlight the selected option and enable the proceed action.
3. WHEN the user has not selected a chart type, THE Chart_Type_Selector SHALL disable the proceed action.
4. WHEN the user provides a visualization name and selects a chart type and confirms selection, THE Visualization_Builder SHALL navigate to the Builder_Workspace with the selected chart type and name pre-configured.

### Requirement 2: Builder Workspace Layout

**User Story:** As a security analyst, I want a structured workspace with configuration, preview, and filter panels, so that I can efficiently build visualizations without switching between separate pages.

#### Acceptance Criteria

1. THE Builder_Workspace SHALL display a three-panel layout consisting of a left configuration panel, a center preview area, and a right filter panel.
2. THE Builder_Workspace SHALL display the visualization name, the selected index pattern, and a save button in the top header area.
3. WHEN the browser viewport width is less than 768px, THE Builder_Workspace SHALL collapse the panels into a stacked vertical layout with accessible tab navigation.
4. THE Builder_Workspace SHALL provide a back navigation action that returns the user to the visualization list without saving unsaved changes.

### Requirement 3: Index Pattern Selection

**User Story:** As a security analyst, I want to select which data index to query, so that my visualization draws from the correct log source.

#### Acceptance Criteria

1. WHEN the Builder_Workspace loads, THE Visualization_Builder SHALL fetch available index patterns from GET /api/utm-index-patterns and populate the index pattern selector.
2. WHEN the user selects an Index_Pattern, THE Visualization_Builder SHALL store the selected pattern ID and pattern string in the Visualization_Store.
3. WHEN the user selects an Index_Pattern, THE Field_Autocomplete SHALL refresh its available fields list to reflect fields from the newly selected pattern.
4. IF the GET /api/utm-index-patterns request fails, THEN THE Visualization_Builder SHALL display an error notification and allow the user to retry.

### Requirement 4: Metric Aggregation Configuration

**User Story:** As a security analyst, I want to define one or more metric aggregations, so that I can specify which computations to perform on my data.

#### Acceptance Criteria

1. THE Builder_Workspace SHALL allow the user to add one or more Metric_Aggregation entries, each specifying an aggregation type and optionally a field.
2. THE Builder_Workspace SHALL support the following Metric_Aggregation types: Count, Sum, Average, Min, Max, Cardinality (Unique Count), Percentiles, and Top Hits.
3. WHEN the user selects Count as the aggregation type, THE Builder_Workspace SHALL not require a field selection since Count operates on all documents.
4. WHEN the user selects Sum, Average, Min, Max, or Percentiles as the aggregation type, THE Field_Autocomplete SHALL display only numeric fields from the selected Index_Pattern.
5. WHEN the user selects Cardinality or Top Hits as the aggregation type, THE Field_Autocomplete SHALL display all fields from the selected Index_Pattern regardless of data type.
6. THE Builder_Workspace SHALL allow the user to provide a custom label for each Metric_Aggregation entry.
7. WHEN no Index_Pattern is selected, THE Builder_Workspace SHALL disable field selection inputs for Metric_Aggregation and display a prompt to select an index pattern first.

### Requirement 5: Bucket Aggregation Configuration

**User Story:** As a security analyst, I want to define bucket aggregations, so that I can group my data into meaningful categories or time intervals.

#### Acceptance Criteria

1. THE Builder_Workspace SHALL allow the user to add one or more Bucket_Aggregation entries to define how data is grouped.
2. THE Builder_Workspace SHALL support the following Bucket_Aggregation types: Terms, Date Histogram, Histogram, Range, and Filters.
3. WHEN the user selects Terms as the bucket type, THE Builder_Workspace SHALL display a field selector, a size input (top N values, default 5), and an order selector (ascending or descending by count or by term).
4. WHEN the user selects Date Histogram as the bucket type, THE Builder_Workspace SHALL display a date field selector and an interval selector (auto, second, minute, hourly, daily, weekly, monthly, yearly).
5. WHEN the user selects Histogram as the bucket type, THE Builder_Workspace SHALL display a numeric field selector and a minimum interval input.
6. WHEN the user selects Range as the bucket type, THE Builder_Workspace SHALL display a numeric field selector and allow the user to define one or more from/to range pairs.
7. WHEN the user selects Filters as the bucket type, THE Builder_Workspace SHALL allow the user to define one or more named filter conditions using field, operator, and value inputs.
8. THE Builder_Workspace SHALL support nested sub-buckets by allowing the user to add a child Bucket_Aggregation under an existing bucket entry.
9. WHEN the user selects Date Histogram, THE Field_Autocomplete SHALL display only date-type fields from the selected Index_Pattern.
10. WHEN the user selects Histogram or Range, THE Field_Autocomplete SHALL display only numeric fields from the selected Index_Pattern.

### Requirement 6: Live Chart Preview

**User Story:** As a security analyst, I want to see a real-time preview of my visualization as I configure it, so that I can iterate quickly and validate my choices visually.

#### Acceptance Criteria

1. WHEN the user has a valid configuration (at least one metric aggregation, an index pattern selected, and either zero or valid bucket aggregations), THE Live_Preview SHALL execute the query by calling POST /api/utm-visualizations/run and render the result using the ECharts_Renderer.
2. WHEN the user modifies any metric aggregation, bucket aggregation, or filter, THE Live_Preview SHALL re-execute the query within 500ms of the last change (debounced) and update the rendered chart.
3. WHILE the POST /api/utm-visualizations/run request is in progress, THE Live_Preview SHALL display a loading indicator over the chart area.
4. IF the POST /api/utm-visualizations/run request fails, THEN THE Live_Preview SHALL display the error message in the preview area and allow the user to retry.
5. WHEN the backend returns empty data, THE Live_Preview SHALL display a "No data" placeholder message in the chart area instead of an empty chart.
6. THE ECharts_Renderer SHALL render charts using the dark theme to match the UTMStack dark-mode-first design system.

### Requirement 7: Field Autocomplete

**User Story:** As a security analyst, I want field selection inputs to show available fields with their data types, so that I can accurately choose the correct fields for my aggregations.

#### Acceptance Criteria

1. WHEN the user focuses on a field selection input, THE Field_Autocomplete SHALL display a searchable dropdown of available fields from the selected Index_Pattern.
2. THE Field_Autocomplete SHALL display each field entry with its name and data type indicator (string, number, date, boolean, ip, geo_point).
3. WHEN the user types in the field input, THE Field_Autocomplete SHALL filter the displayed fields to those whose names contain the typed text (case-insensitive match).
4. WHEN no fields match the typed filter text, THE Field_Autocomplete SHALL display a "No matching fields" message.
5. THE Field_Autocomplete SHALL group fields by data type when displaying the unfiltered list.

### Requirement 8: Filter Panel

**User Story:** As a security analyst, I want to apply filters to my visualization query, so that I can narrow the data to specific conditions.

#### Acceptance Criteria

1. THE Filter_Panel SHALL allow the user to add one or more filter conditions, each consisting of a field, an operator, and a value.
2. THE Filter_Panel SHALL support the following operators: is, is not, contains, does not contain, exists, does not exist, is between, is greater than, is less than.
3. WHEN the user adds or removes a filter condition, THE Visualization_Store SHALL update the filterType array and trigger a Live_Preview refresh.
4. THE Filter_Panel SHALL include a default time range filter on the @timestamp field with initial values of "now-24h" to "now".
5. WHEN the user modifies the time range filter, THE Filter_Panel SHALL update the filter condition and trigger a Live_Preview refresh.

### Requirement 9: Save Visualization

**User Story:** As a security analyst, I want to save my configured visualization to the database, so that I can reuse it on dashboards and share it with my team.

#### Acceptance Criteria

1. WHEN the user clicks the save button, THE Visualization_Builder SHALL validate that the visualization has a non-empty name, a selected index pattern, and at least one metric aggregation defined.
2. IF validation fails, THEN THE Visualization_Builder SHALL display specific validation error messages indicating which fields require attention.
3. WHEN validation passes and the visualization has no existing ID (new creation), THE Visualization_Builder SHALL send a POST request to /api/utm-visualizations with the complete visualization configuration.
4. WHEN validation passes and the visualization has an existing ID (edit mode), THE Visualization_Builder SHALL send a PUT request to /api/utm-visualizations with the updated configuration.
5. WHEN the save request succeeds, THE Visualization_Builder SHALL navigate the user to the visualization list page and display a success notification.
6. IF the save request fails, THEN THE Visualization_Builder SHALL display the error message and remain on the Builder_Workspace to allow the user to retry.

### Requirement 10: Edit Existing Visualization

**User Story:** As a security analyst, I want to load and edit existing visualizations, so that I can refine previously saved configurations.

#### Acceptance Criteria

1. WHEN the user navigates to the builder with an existing visualization ID, THE Visualization_Builder SHALL fetch the visualization from the backend and populate the Builder_Workspace with its saved configuration.
2. WHEN loading an existing visualization, THE Builder_Workspace SHALL restore the chart type, name, index pattern, metric aggregations, bucket aggregations, chart config, and filters from the saved data.
3. WHEN loading completes, THE Live_Preview SHALL execute the restored configuration and render the chart.
4. IF the visualization fetch request fails, THEN THE Visualization_Builder SHALL display an error message and provide a navigation option back to the visualization list.

### Requirement 11: Visualization State Management

**User Story:** As a security analyst, I want the builder to maintain my configuration state reliably during the editing session, so that I do not lose work due to component re-renders or panel interactions.

#### Acceptance Criteria

1. THE Visualization_Store SHALL hold the complete visualization state including chart type, name, index pattern, metric aggregations, bucket aggregations, chart config, filters, and metadata (ID, modified date, system owner flag).
2. WHEN any configuration field changes, THE Visualization_Store SHALL update synchronously and notify subscribed components.
3. THE Visualization_Store SHALL provide a computed validity state indicating whether the current configuration meets minimum requirements for execution (index pattern selected and at least one metric defined).
4. WHEN the user navigates away from the Builder_Workspace, THE Visualization_Store SHALL reset to its initial empty state to prevent stale data in subsequent sessions.

### Requirement 12: Chart-Type-Specific Rendering

**User Story:** As a security analyst, I want each chart type to render appropriately for its data format, so that Line charts show time series, Pie charts show proportions, and Tables show raw data.

#### Acceptance Criteria

1. WHEN the chart type is Line or Area, THE ECharts_Renderer SHALL render a time-series chart with the X-axis representing the date histogram bucket and the Y-axis representing metric values.
2. WHEN the chart type is Bar or Bar Horizontal, THE ECharts_Renderer SHALL render categorical bars with bucket labels on the category axis and metric values on the value axis.
3. WHEN the chart type is Pie, THE ECharts_Renderer SHALL render a pie or donut chart with slices representing bucket categories and slice sizes proportional to the metric value.
4. WHEN the chart type is Table, THE ECharts_Renderer SHALL render a data table with columns for each bucket field and each metric value.
5. WHEN the chart type is Metric, THE ECharts_Renderer SHALL render a large formatted number representing the primary metric aggregation value.
6. WHEN the chart type is Gauge or Goal, THE ECharts_Renderer SHALL render a gauge or progress indicator showing the metric value relative to a configurable target.
7. WHEN the chart type is Tag Cloud, THE ECharts_Renderer SHALL render terms as variably-sized text where size correlates with the metric value.
8. WHEN the chart type is Heat Map, THE ECharts_Renderer SHALL render a matrix with color intensity representing metric values across two bucket dimensions.
9. WHEN the chart type is Text, THE Builder_Workspace SHALL provide a text/markdown input instead of metric and bucket configuration, and THE ECharts_Renderer SHALL render the formatted text content.

### Requirement 13: SQL Query Mode

**User Story:** As an advanced analyst, I want to write raw SQL queries against my data, so that I can create visualizations from complex queries that cannot be expressed through the aggregation UI.

#### Acceptance Criteria

1. THE Builder_Workspace SHALL provide a toggle to switch between DSL aggregation mode and SQL query mode.
2. WHEN SQL mode is active, THE Builder_Workspace SHALL hide the metric and bucket aggregation panels and display a SQL code editor in their place.
3. WHEN the user writes a SQL query and triggers execution, THE Visualization_Builder SHALL send the query via POST /api/utm-visualizations/run with the queryLanguage field set to "sql".
4. IF the SQL query is empty when the user attempts to save or run, THEN THE Visualization_Builder SHALL display a validation error stating that the SQL query cannot be empty.
5. WHEN switching from SQL mode back to DSL mode, THE Visualization_Builder SHALL clear the SQL query and restore the metric and bucket aggregation panels.
