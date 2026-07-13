package com.hivearmor.web.rest.opensearch;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.opensearch.enums.HttpMethod;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.util.ResponseUtil;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST controller for OpenSearch cluster management (Phase C.1).
 * All endpoints proxy raw HTTP calls to OpenSearch via OpensearchClientBuilder.
 */
@RestController
@RequestMapping("/api/opensearch")
public class OpenSearchManagementResource {

    private static final String CLASSNAME = "OpenSearchManagementResource";
    private final Logger log = LoggerFactory.getLogger(OpenSearchManagementResource.class);

    private final OpensearchClientBuilder client;
    private final ApplicationEventService eventService;
    private final Gson gson = new Gson();

    public OpenSearchManagementResource(OpensearchClientBuilder client,
                                        ApplicationEventService eventService) {
        this.client = client;
        this.eventService = eventService;
    }

    // ── Cluster health ──────────────────────────────────────────────────────

    @GetMapping("/cluster/health")
    public ResponseEntity<String> clusterHealth() {
        final String ctx = CLASSNAME + ".clusterHealth";
        try (Response rs = client.getClient().executeHttpRequest("/_cluster/health", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/cluster/stats")
    public ResponseEntity<String> clusterStats() {
        final String ctx = CLASSNAME + ".clusterStats";
        try (Response rs = client.getClient().executeHttpRequest("/_cluster/stats", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Indices ─────────────────────────────────────────────────────────────

    @GetMapping("/indices")
    public ResponseEntity<String> listIndices(@RequestParam(defaultValue = "") String pattern) {
        final String ctx = CLASSNAME + ".listIndices";
        try {
            String pat = pattern.isEmpty() ? "*" : pattern;
            String url = String.format("/_cat/indices/%s?format=json&bytes=b&h=index,health,status,pri,rep,docs.count,store.size,creation.date.string", pat);
            try (Response rs = client.getClient().executeHttpRequest(url, null, null, HttpMethod.GET)) {
                if (!rs.isSuccessful() || rs.body() == null)
                    return ResponseEntity.status(rs.code()).build();
                return ResponseEntity.ok(rs.body().string());
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/indices/{index}/settings")
    public ResponseEntity<String> getIndexSettings(@PathVariable String index) {
        final String ctx = CLASSNAME + ".getIndexSettings";
        try (Response rs = client.getClient().executeHttpRequest("/" + index + "/_settings", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/indices/{index}/mappings")
    public ResponseEntity<String> getIndexMappings(@PathVariable String index) {
        final String ctx = CLASSNAME + ".getIndexMappings";
        try (Response rs = client.getClient().executeHttpRequest("/" + index + "/_mapping", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/indices/{index}")
    public ResponseEntity<String> deleteIndex(@PathVariable String index) {
        final String ctx = CLASSNAME + ".deleteIndex";
        try (Response rs = client.getClient().executeHttpRequest("/" + index, null, null, HttpMethod.DELETE)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            String body = rs.body().string();
            eventService.createEvent(ctx + ": deleted index " + index, ApplicationEventType.INFO);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/indices/{index}/forcemerge")
    public ResponseEntity<String> forceMerge(@PathVariable String index) {
        final String ctx = CLASSNAME + ".forceMerge";
        try (Response rs = client.getClient().executeHttpRequest("/" + index + "/_forcemerge", null, null, HttpMethod.POST)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/indices/{index}/refresh")
    public ResponseEntity<String> refreshIndex(@PathVariable String index) {
        final String ctx = CLASSNAME + ".refreshIndex";
        try (Response rs = client.getClient().executeHttpRequest("/" + index + "/_refresh", null, null, HttpMethod.POST)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Index Templates ─────────────────────────────────────────────────────

    @GetMapping("/templates")
    public ResponseEntity<String> listTemplates() {
        final String ctx = CLASSNAME + ".listTemplates";
        try (Response rs = client.getClient().executeHttpRequest("/_index_template", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/templates/{name}")
    public ResponseEntity<String> getTemplate(@PathVariable String name) {
        final String ctx = CLASSNAME + ".getTemplate";
        try (Response rs = client.getClient().executeHttpRequest("/_index_template/" + name, null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/templates/{name}")
    public ResponseEntity<String> upsertTemplate(@PathVariable String name, @RequestBody String body) {
        final String ctx = CLASSNAME + ".upsertTemplate";
        try {
            JsonObject jsonBody = gson.fromJson(body, JsonObject.class);
            try (Response rs = client.getClient().executeHttpRequest("/_index_template/" + name, null, jsonBody, HttpMethod.PUT)) {
                if (!rs.isSuccessful() || rs.body() == null)
                    return ResponseEntity.status(rs.code()).build();
                return ResponseEntity.ok(rs.body().string());
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/templates/{name}")
    public ResponseEntity<String> deleteTemplate(@PathVariable String name) {
        final String ctx = CLASSNAME + ".deleteTemplate";
        try (Response rs = client.getClient().executeHttpRequest("/_index_template/" + name, null, null, HttpMethod.DELETE)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── ISM Policies ────────────────────────────────────────────────────────

    @GetMapping("/ism/policies")
    public ResponseEntity<String> listIsmPolicies() {
        final String ctx = CLASSNAME + ".listIsmPolicies";
        try (Response rs = client.getClient().executeHttpRequest("/_plugins/_ism/policies", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/ism/policies/{id}")
    public ResponseEntity<String> getIsmPolicy(@PathVariable String id) {
        final String ctx = CLASSNAME + ".getIsmPolicy";
        try (Response rs = client.getClient().executeHttpRequest("/_plugins/_ism/policies/" + id, null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/ism/explain/{index}")
    public ResponseEntity<String> explainIsmState(@PathVariable String index) {
        final String ctx = CLASSNAME + ".explainIsmState";
        try (Response rs = client.getClient().executeHttpRequest("/_plugins/_ism/explain/" + index, null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Snapshots ───────────────────────────────────────────────────────────

    @GetMapping("/snapshots/repositories")
    public ResponseEntity<String> listRepositories() {
        final String ctx = CLASSNAME + ".listRepositories";
        try (Response rs = client.getClient().executeHttpRequest("/_snapshot", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/snapshots/{repository}")
    public ResponseEntity<String> listSnapshots(@PathVariable String repository) {
        final String ctx = CLASSNAME + ".listSnapshots";
        try (Response rs = client.getClient().executeHttpRequest("/_snapshot/" + repository + "/_all", null, null, HttpMethod.GET)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/snapshots/{repository}/{snapshot}")
    public ResponseEntity<String> createSnapshot(@PathVariable String repository,
                                                  @PathVariable String snapshot,
                                                  @RequestBody(required = false) String body) {
        final String ctx = CLASSNAME + ".createSnapshot";
        try {
            Object requestBody = body != null ? gson.fromJson(body, JsonObject.class) : new JsonObject();
            try (Response rs = client.getClient().executeHttpRequest(
                    "/_snapshot/" + repository + "/" + snapshot, null, requestBody, HttpMethod.PUT)) {
                if (!rs.isSuccessful() || rs.body() == null)
                    return ResponseEntity.status(rs.code()).build();
                eventService.createEvent(ctx + ": snapshot " + snapshot + " triggered", ApplicationEventType.INFO);
                return ResponseEntity.ok(rs.body().string());
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/snapshots/{repository}/{snapshot}")
    public ResponseEntity<String> deleteSnapshot(@PathVariable String repository,
                                                  @PathVariable String snapshot) {
        final String ctx = CLASSNAME + ".deleteSnapshot";
        try (Response rs = client.getClient().executeHttpRequest(
                "/_snapshot/" + repository + "/" + snapshot, null, null, HttpMethod.DELETE)) {
            if (!rs.isSuccessful() || rs.body() == null)
                return ResponseEntity.status(rs.code()).build();
            return ResponseEntity.ok(rs.body().string());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/snapshots/{repository}/{snapshot}/restore")
    public ResponseEntity<String> restoreSnapshot(@PathVariable String repository,
                                                   @PathVariable String snapshot,
                                                   @RequestBody(required = false) String body) {
        final String ctx = CLASSNAME + ".restoreSnapshot";
        try {
            Object requestBody = body != null ? gson.fromJson(body, JsonObject.class) : new JsonObject();
            try (Response rs = client.getClient().executeHttpRequest(
                    "/_snapshot/" + repository + "/" + snapshot + "/_restore", null, requestBody, HttpMethod.POST)) {
                if (!rs.isSuccessful() || rs.body() == null)
                    return ResponseEntity.status(rs.code()).build();
                eventService.createEvent(ctx + ": restore from " + snapshot + " triggered", ApplicationEventType.INFO);
                return ResponseEntity.ok(rs.body().string());
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Generic raw proxy ────────────────────────────────────────────────────

    /**
     * Generic POST proxy to OpenSearch. Passes the body as-is (ndjson or JSON).
     * Used for _bulk, _doc, and other write operations during dev/seed.
     * Path example: /_bulk  or  /_v3_hive_alert-2026.07.07/_doc/some-id
     */
    @PostMapping("/raw/**")
    public ResponseEntity<String> rawPost(jakarta.servlet.http.HttpServletRequest request,
                                          @RequestBody(required = false) String body) {
        final String ctx = CLASSNAME + ".rawPost";
        try {
            String fullPath = request.getRequestURI();
            // Strip the /api/opensearch/raw prefix
            String osPath = fullPath.replaceFirst(".*/api/opensearch/raw", "");
            if (!osPath.startsWith("/")) osPath = "/" + osPath;
            Object requestBody = null;
            if (body != null && !body.isBlank()) {
                try { requestBody = gson.fromJson(body, JsonObject.class); }
                catch (Exception ignored) {
                    // ndjson (bulk) — pass as raw string via JsonArray workaround
                    requestBody = body;
                }
            }
            try (Response rs = client.getClient().executeHttpRequest(osPath, null, requestBody, HttpMethod.POST)) {
                if (!rs.isSuccessful() || rs.body() == null)
                    return ResponseEntity.status(rs.code()).build();
                return ResponseEntity.ok(rs.body().string());
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/raw/**")
    public ResponseEntity<String> rawPut(jakarta.servlet.http.HttpServletRequest request,
                                         @RequestBody(required = false) String body) {
        final String ctx = CLASSNAME + ".rawPut";
        try {
            String fullPath = request.getRequestURI();
            String osPath = fullPath.replaceFirst(".*/api/opensearch/raw", "");
            if (!osPath.startsWith("/")) osPath = "/" + osPath;
            Object requestBody = null;
            if (body != null && !body.isBlank()) {
                try { requestBody = gson.fromJson(body, JsonObject.class); }
                catch (Exception ignored) { requestBody = body; }
            }
            try (Response rs = client.getClient().executeHttpRequest(osPath, null, requestBody, HttpMethod.PUT)) {
                if (!rs.isSuccessful() || rs.body() == null)
                    return ResponseEntity.status(rs.code()).build();
                return ResponseEntity.ok(rs.body().string());
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
