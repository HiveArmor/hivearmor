# Logstash Pipeline & Filter Management — Admin Guide

**Audience:** Tool Administrators, Security Engineers  
**Feature:** F-04 — Logstash Pipeline & Filter Management  
**Location in UI:** Sidebar → Data Parsing (pipeline icon)

---

## Table of Contents

1. [What Is This Feature and Why It Exists](#1-what-is-this-feature-and-why-it-exists)
2. [Core Concepts](#2-core-concepts)
3. [Navigating the UI](#3-navigating-the-ui)
4. [Pipelines Tab](#4-pipelines-tab)
5. [Filters Tab](#5-filters-tab)
6. [Test Tab](#6-test-tab)
7. [Creating a New Filter — Step by Step](#7-creating-a-new-filter--step-by-step)
8. [Editing an Existing Filter](#8-editing-an-existing-filter)
9. [Deleting a Filter](#9-deleting-a-filter)
10. [Importing and Exporting Filters](#10-importing-and-exporting-filters)
11. [Filter Groups](#11-filter-groups)
12. [System-Owned vs. User-Owned Objects](#12-system-owned-vs-user-owned-objects)
13. [API Reference](#13-api-reference)
14. [Data Model Reference](#14-data-model-reference)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What Is This Feature and Why It Exists

ArmorSight uses **Logstash** as its log processing engine. Logstash reads raw events from sources (syslog, Windows beats, JSON inputs, etc.), applies transformation rules called **filters**, and writes the enriched events into OpenSearch for alerting and analysis.

Without correctly configured filters, raw logs arrive in OpenSearch unparsed — fields like `source_ip`, `user`, `action`, and `severity` are not extracted, and correlation rules cannot match them.

This feature gives administrators a GUI to:

- **View** all registered Logstash pipelines and their status
- **Create and manage custom filters** attached to any pipeline without editing config files on the server
- **Test** filter logic against sample log lines before deploying
- **Import / export** filter definitions for backup or migration between environments

> **Important:** All changes made here are persisted to the ArmorSight database and pushed to the running Logstash process by the backend. You do not need SSH access to the Logstash server to manage filters.

---

## 2. Core Concepts

### Pipeline

A pipeline is the top-level processing unit in Logstash. Each pipeline has:

| Field | Description |
|---|---|
| `pipelineName` | Human-readable name (e.g., "Syslog", "Windows agent") |
| `pipelineId` | Internal Logstash identifier (e.g., `syslog`, `beats_windows_agent`) |
| `pipelineStatus` | `up` or `down` — whether Logstash is actively running this pipeline |
| `moduleName` | The ArmorSight module that owns this pipeline (e.g., `SYSLOG`, `WINDOWS_AGENT`) |
| `systemOwner` | `true` = built-in, managed by ArmorSight; `false` = user-created |
| `pipelineInternal` | `true` = internal infrastructure pipeline, not shown in most views |

Pipelines are the parent. Filters are children attached to a pipeline.

### Filter

A filter is a block of **Logstash DSL** (YAML/Ruby-like syntax) that tells Logstash how to parse, enrich, or transform log events passing through a pipeline.

| Field | Description |
|---|---|
| `filterName` | A descriptive name for humans |
| `logstashFilter` | The actual filter configuration text (Logstash DSL) |
| `filterVersion` | Optional semver string (e.g., `2.0.0`) for tracking changes |
| `filterGroupId` | Optional grouping reference |
| `isActive` | Whether this filter is applied (`true`) or skipped (`false`) |
| `systemOwner` | `true` = read-only built-in; `false` = admin can edit/delete |
| `moduleName` | The module this filter belongs to |

### Filter Group

An optional organizational label that groups related filters together (e.g., "Windows Security Events", "Network Normalization"). Has no effect on processing — it is for display and management only.

---

## 3. Navigating the UI

1. Log in to the ArmorSight portal.
2. In the left sidebar, click the **Data Parsing** icon (looks like stacked layers / pipeline symbol).
3. The page has three tabs at the top:

```
[ Pipelines ]   [ Filters ]   [ Test ]
```

The header also shows **Backend: :8088** confirming which API server is serving the data.

---

## 4. Pipelines Tab

This tab gives an overview of all active Logstash pipelines registered with the system.

### What you see

| Column | Meaning |
|---|---|
| Name | Human-readable pipeline name |
| Pipeline ID | Internal Logstash pipeline ID string |
| Module | The ArmorSight module that registered this pipeline |
| Status | Green dot = Up, Grey dot = Down |
| Owner | Orange "System" badge = built-in; Blue "User" badge = custom |
| Actions | Delete button (disabled for system pipelines) |

### Expanding a pipeline

Click the **›** chevron on the left of any row to expand it. The expanded row shows:

- The full `pipelineDescription` if set
- A "Internal" badge if `pipelineInternal` is true

### Refreshing

Click **Refresh** (top right of the tab) to reload the pipeline list from the backend without a full page reload.

### Deleting a pipeline

Only user-owned pipelines can be deleted. The Delete button is disabled (greyed out) for system-owned pipelines. Deleting a pipeline removes it and all its associated pipeline-filter relations from the database. The filters themselves are not deleted — they remain in `utm_logstash_filter` but are no longer linked to the pipeline.

> **Warning:** Deleting a pipeline that Logstash is actively running will cause log processing for that source to stop. Confirm the pipeline is no longer needed before deleting.

---

## 5. Filters Tab

This is the primary working area for managing log parsing logic.

### Layout

The tab is split into two panes:

**Left pane — Pipeline selector and filter list**

- A dropdown to select which pipeline's filters to view
- Count of filters in the selected pipeline
- Export (download), Import (upload), and New buttons
- A scrollable list of filter cards

**Right pane — Filter editor**

- Appears when you select or create a filter
- Shows the filter name, filter group assignment, and the Monaco code editor for the filter body

### Filter cards

Each filter card in the left pane shows:

- Filter name
- Version (if set)
- "System" badge (orange) if system-owned
- Active/Inactive status indicator

Clicking a card loads it into the editor on the right.

---

## 6. Test Tab

The Test tab lets you validate filter logic before applying it to a live pipeline.

> **Note:** The current implementation performs a client-side simulation. It parses JSON-formatted log inputs and applies basic field extraction. Full server-side Logstash execution is planned for a future release.

### How to use

1. Paste a sample raw log line into **Sample Log Input** (top left text area).
2. Write or paste a Logstash filter block into the **Logstash Filter (YAML)** editor (bottom left).
3. Click **Run Test**.
4. The **Parsed Output** panel on the right shows the result or any parsing errors.

### Tips

- The sample log should be a single line representing one log event.
- If your log is JSON-structured, the test will parse the JSON fields directly.
- Use this tab to catch syntax errors in filter DSL before saving to a live pipeline.

---

## 7. Creating a New Filter — Step by Step

### Prerequisites

- You must be logged in with an admin account.
- At least one pipeline must exist that you want to attach the filter to.

### Steps

**Step 1 — Open the Filters tab**

Click **Filters** in the tab bar at the top of the Data Parsing page.

**Step 2 — Select a pipeline**

Use the **Pipeline** dropdown in the left pane to select which pipeline this filter will belong to. The filter list below will load all existing filters for that pipeline.

**Step 3 — Click New**

Click the green **+ New** button (top right of the filter list). The right pane will show a blank **New Filter** form with a default filter body:

```logstash
filter {
  # add your logstash filter here
}
```

**Step 4 — Enter the filter name**

In the **Filter Name** field, type a clear descriptive name. Examples:

- `Apache Access Log Parser`
- `Windows Security Event 4625 Enrichment`
- `Cisco ASA Deny Extractor`

**Step 5 — Optionally assign a filter group**

Use the **Filter Group** dropdown to assign the filter to an organizational group. If no groups exist or this isn't needed, leave it as "No group".

**Step 6 — Write the filter body**

In the Monaco editor, write your Logstash filter DSL. Example:

```logstash
filter {
  grok {
    match => {
      "message" => "%{SYSLOGTIMESTAMP:syslog_timestamp} %{SYSLOGHOST:syslog_hostname} %{DATA:syslog_program}(?:\[%{POSINT:syslog_pid}\])?: %{GREEDYDATA:syslog_message}"
    }
  }
  date {
    match => [ "syslog_timestamp", "MMM  d HH:mm:ss", "MMM dd HH:mm:ss" ]
  }
  mutate {
    remove_field => [ "message" ]
  }
}
```

The editor supports syntax highlighting and has a dark theme to match the ArmorSight UI.

**Step 7 — Click Save Filter**

Click the **Save Filter** button (top right of the editor pane). A green success toast will appear at the top of the screen and the new filter card will appear in the left list immediately.

The filter is now stored in the database and linked to the selected pipeline.

---

## 8. Editing an Existing Filter

You can only edit **user-owned** filters. System-owned filters are read-only.

### Steps

1. In the **Filters** tab, select the pipeline containing the filter you want to edit.
2. Click the filter card in the left list.
3. If the filter is user-owned, the right pane shows **Edit Filter** with the Save button enabled.
4. Modify the **Filter Name**, **Filter Group**, or the filter body in the Monaco editor.
5. Click **Save Filter**.

### Read-only indicator

If you click a system-owned filter, you will see:

- An orange **"Read-only (system)"** badge next to the title
- An orange **"⚠ Read-only"** label in the editor header
- The **Save Filter** button is greyed out and cannot be clicked

You cannot edit or delete system-owned filters through the UI or the API.

---

## 9. Deleting a Filter

Only user-owned filters can be deleted.

### Steps

1. In the filter card list, locate the filter you want to delete.
2. Click the **trash icon** (top right of the filter card).
3. The filter is immediately removed from the database and the list refreshes.

If the trash icon is greyed out, the filter is system-owned and cannot be deleted.

> **Warning:** There is no confirmation dialog — deletion is immediate. Make sure you want to remove the filter before clicking the trash icon. If needed, export the filter first (see Section 10).

---

## 10. Importing and Exporting Filters

### Exporting

1. Select a pipeline in the Filters tab.
2. Click the **download icon** (⬇) next to the New button.
3. A `.json` file is downloaded to your computer named `logstash-filters-YYYY-MM-DD.json`.

The exported file contains all filters for the selected pipeline as a JSON array:

```json
[
  {
    "filterName": "My Custom Parser",
    "logstashFilter": "filter {\n  grok { ... }\n}",
    "filterGroupId": null,
    "isActive": true,
    "filterVersion": "1.0.0",
    "moduleName": null,
    "updatedAt": "2026-07-07T06:38:35.762996Z"
  }
]
```

Note: `id` and `systemOwner` fields are stripped from the export so the file can be imported cleanly into any environment.

### Importing

1. Select the **destination pipeline** in the Filters tab.
2. Click the **upload icon** (⬆) next to the New button.
3. A file picker opens — select the `.json` export file.
4. The system imports each filter in the file one by one, linking each to the selected pipeline.
5. A toast shows how many filters were imported successfully (e.g., "3 of 3 filter(s) imported").

**Rules for import:**

- The file must be a valid JSON array of filter objects.
- Each object must have at minimum a `logstashFilter` field (the filter body).
- `id` and `systemOwner` are ignored if present — new IDs are assigned and ownership defaults to user.
- Importing creates new filters; it does not overwrite existing ones by name.

### Use case: migrating between environments

1. On the source environment (e.g., staging), export filters from a pipeline.
2. On the target environment (e.g., production), select the same pipeline and import the file.

---

## 11. Filter Groups

Filter groups are organizational containers — they do not affect how Logstash processes events, they only affect how filters are displayed and managed in the UI.

### Viewing groups

Filter groups are loaded automatically in the **Filter Group** dropdown when you open the Filters tab.

### Creating a group (API)

Filter groups currently have no creation UI. To create one, use the API directly:

```http
POST /api/utm-logstash-filter-groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "groupName": "Windows Security Events",
  "groupDescription": "Filters for Windows Security log parsing and enrichment"
}
```

Response (201 Created):
```json
{
  "id": 5,
  "groupName": "Windows Security Events",
  "groupDescription": "Filters for Windows Security log parsing and enrichment",
  "systemOwner": null
}
```

Once created, the group name will appear in the Filter Group dropdown when creating or editing filters.

---

## 12. System-Owned vs. User-Owned Objects

This is the most important access-control concept in this feature.

| | System-owned | User-owned |
|---|---|---|
| Created by | ArmorSight installer / module setup | Admin via UI or API |
| `systemOwner` field | `true` | `false` or `null` |
| Can be edited | No | Yes |
| Can be deleted | No | Yes |
| Badge in UI | Orange "System" | No badge |
| API PUT/DELETE | Returns 500 error | Allowed |

### Why system filters are protected

System-owned filters are part of ArmorSight's built-in log processing logic. Editing or deleting them would break parsing for the corresponding module (e.g., deleting the syslog filter means syslog events arrive unparsed).

When ArmorSight modules are updated, the system may overwrite system-owned filters automatically. Any changes you make to system filters would be lost and could conflict with the new version.

**Best practice:** Never try to work around the system-owner restriction. If you need to modify the behavior of a system filter, create a new user-owned filter in the same pipeline with a higher processing priority (using Logstash's `add_tag` / `if` guards to handle already-processed events).

---

## 13. API Reference

All endpoints require a Bearer token obtained from `POST /api/authenticate`.

### Authentication

```http
POST /api/authenticate
Content-Type: application/json

{
  "username": "admin",
  "password": "<password>",
  "rememberMe": false
}
```

Response includes `id_token`. Use it as `Authorization: Bearer <id_token>` on all subsequent requests.

---

### Pipelines

#### List all pipelines

```http
GET /api/logstash-pipelines?page=0&size=50&sort=id,asc
Authorization: Bearer <token>
```

Response: paginated array of pipeline objects. Total count in `X-Total-Count` header.

#### Get a single pipeline

```http
GET /api/logstash-pipelines/{id}
Authorization: Bearer <token>
```

#### Delete a pipeline

```http
DELETE /api/logstash-pipelines/{id}
Authorization: Bearer <token>
```

Returns 500 if the pipeline is system-owned.

---

### Filters

#### List filters for a pipeline

```http
GET /api/utm-filters/by-pipelineid?pipelineId={id}
Authorization: Bearer <token>
```

Returns all filters linked to the given pipeline. No pagination — full list.

#### List all filters (paginated)

```http
GET /api/utm-filters?page=0&size=100&sort=id,asc
Authorization: Bearer <token>
```

Total count in `X-Total-Count` header.

#### Get a single filter

```http
GET /api/utm-filters/{id}
Authorization: Bearer <token>
```

#### Create a filter

```http
POST /api/utm-filters?pipelineId={pipelineId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "filterName": "My Parser",
  "logstashFilter": "filter {\n  grok { ... }\n}",
  "isActive": true,
  "filterVersion": "1.0.0"
}
```

- `pipelineId` query parameter is **required** — it links the filter to the pipeline.
- Do not include `id` in the body (causes a 400 error).
- `systemOwner` in the body is ignored.

Response: the created filter object with its assigned `id`.

#### Update a filter

```http
PUT /api/utm-filters
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": 1000001,
  "filterName": "My Parser v2",
  "logstashFilter": "filter {\n  grok { ... }\n}",
  "isActive": true
}
```

- `id` is required. Returns 500 if omitted.
- Returns 500 if the filter is system-owned.

#### Delete a filter

```http
DELETE /api/utm-filters/{id}
Authorization: Bearer <token>
```

---

### Filter Groups

#### List all filter groups

```http
GET /api/utm-logstash-filter-groups?page=0&size=100&sort=id,asc
Authorization: Bearer <token>
```

#### Create a filter group

```http
POST /api/utm-logstash-filter-groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "groupName": "Network Events",
  "groupDescription": "Normalization filters for firewall and router logs"
}
```

#### Update a filter group

```http
PUT /api/utm-logstash-filter-groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": 3,
  "groupName": "Network Events",
  "groupDescription": "Updated description"
}
```

#### Delete a filter group

```http
DELETE /api/utm-logstash-filter-groups/{id}
Authorization: Bearer <token>
```

---

## 14. Data Model Reference

### Database tables

| Table | Purpose |
|---|---|
| `utm_logstash_pipeline` | One row per pipeline |
| `utm_logstash_filter` | One row per filter |
| `utm_logstash_filter_group` | One row per filter group |
| `utm_group_logstash_pipeline_filters` | Join table linking filters to pipelines (many-to-many) |

### `utm_logstash_pipeline` columns

| Column | Type | Notes |
|---|---|---|
| `id` | bigint (PK) | Auto-assigned by DB sequence |
| `pipeline_id` | varchar | Logstash internal ID string |
| `pipeline_name` | varchar(200) | Display name |
| `pipeline_status` | varchar | `up` or `down` |
| `module_name` | varchar | FK to `utm_module.module_name` |
| `system_owner` | boolean | `true` = protected |
| `pipeline_description` | varchar(2000) | Optional description |
| `pipeline_internal` | boolean | Default `false` |
| `events_out` | bigint | Statistic: events processed |

### `utm_logstash_filter` columns

| Column | Type | Notes |
|---|---|---|
| `id` | bigint (PK) | Auto-assigned by DB sequence |
| `filter_name` | varchar | Human label |
| `logstash_filter` | text | Filter DSL body. **Required, not blank.** |
| `filter_group_id` | bigint (FK) | Optional group reference |
| `data_type_id` | bigint (FK) | Internal data type mapping |
| `system_owner` | boolean | `true` = protected |
| `is_active` | boolean | Default `true` |
| `module_name` | varchar | FK to `utm_module.module_name` |
| `filter_version` | varchar | Semver string, e.g. `2.0.0` |
| `updated_at` | timestamptz | Set automatically on update |

### `utm_logstash_filter_group` columns

| Column | Type | Notes |
|---|---|---|
| `id` | bigint (PK) | Auto-assigned by DB sequence |
| `group_name` | varchar(150) | Unique. Required. |
| `group_description` | varchar | Optional |
| `system_owner` | boolean | `true` = protected |

### `utm_group_logstash_pipeline_filters` columns

| Column | Type | Notes |
|---|---|---|
| `id` | bigint (PK) | Auto-assigned |
| `pipeline_id` | int (FK) | References `utm_logstash_pipeline.id` |
| `filter_id` | int (FK) | References `utm_logstash_filter.id` |
| `relation` | varchar | Relation type, e.g. `USER_CUSTOM_FILTER` |

---

## 15. Troubleshooting

### Save Filter returns an error and shows "Could not save filter"

**Cause:** The backend returned a 500 error.  
**Check:**
1. Is the filter body empty? The `logstashFilter` field is required and cannot be blank.
2. Are you trying to save a system-owned filter? The Save button should be disabled, but if you bypass the UI via API, the backend will reject it.
3. Check backend logs for the specific error message.

---

### The filter list shows 0 filters for a pipeline I know has filters

**Cause:** The `GET /api/utm-filters/by-pipelineid` call may have failed or returned an empty array.  
**Check:**
1. Open browser DevTools → Network tab and look for the `by-pipelineid` request.
2. If it returns 401, your session has expired — log out and log back in.
3. If it returns 500, check backend logs.

---

### Pipelines all show "Down" status

**Cause:** The Logstash process is not running, or the backend cannot reach the Logstash API.  
**Action:** This is an infrastructure issue. Contact your deployment team to verify the Logstash service is running and that `LOGSTASH_API_URL` is correctly configured in the backend environment.

---

### Import says "0 of N filter(s) imported"

**Cause:** Each filter creation failed on the backend.  
**Check:**
1. Is the JSON file format correct? It must be an array `[{...}, {...}]`.
2. Each object must have a non-empty `logstashFilter` field.
3. Open browser DevTools → Network tab and inspect the failed `POST /api/utm-filters` requests for the specific error.

---

### The system filter delete button is greyed out

This is expected behavior. System-owned filters are protected. See [Section 12](#12-system-owned-vs-user-owned-objects).

---

### After creating a filter it doesn't appear in the list

**Cause:** The pipeline selector may have changed, or the list didn't refresh.  
**Action:** Re-select the pipeline in the dropdown. The list reloads when you change the selected pipeline. If the issue persists, check the network tab for errors on the `by-pipelineid` call after the successful POST.

---

*Document version: 1.0 — 2026-07-07*  
*Maintainer: ArmorSight Platform Team*
