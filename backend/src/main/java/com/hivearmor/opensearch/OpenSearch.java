package com.hivearmor.opensearch;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.TlsClientFactory;
import com.hivearmor.opensearch.enums.HttpMethod;
import com.hivearmor.opensearch.enums.HttpScheme;
import com.hivearmor.opensearch.enums.IndexSortableProperty;
import com.hivearmor.opensearch.enums.TermOrder;
import com.hivearmor.opensearch.exceptions.OpenSearchException;
import com.hivearmor.opensearch.types.ElasticCluster;
import com.hivearmor.opensearch.types.IndexSort;
import com.hivearmor.opensearch.types.SearchSqlResponse;
import com.hivearmor.opensearch.types.SqlQueryRequest;
import okhttp3.*;
import org.apache.hc.core5.http.HttpHost;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.cat.IndicesRequest;
import org.opensearch.client.opensearch.cat.indices.IndicesRecord;
import org.opensearch.client.opensearch.core.*;
import org.opensearch.client.opensearch.indices.GetMappingRequest;
import org.opensearch.client.opensearch.indices.GetMappingResponse;
import org.opensearch.client.opensearch.indices.get_mapping.IndexMappingRecord;
import org.opensearch.client.transport.OpenSearchTransport;
import org.opensearch.client.transport.httpclient5.ApacheHttpClient5TransportBuilder;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.AbstractMap;
import java.util.stream.Collectors;

/**
 * Facade over the official OpenSearch Java client.
 * Replaces com.hivearmor.opensearch_connector.OpenSearch
 *
 * Provides the same high-level API surface that the rest of the application
 * relies on, built on top of org.opensearch.client:opensearch-java.
 *
 * Thread-safe. Use OpenSearch.builder() to construct.
 */
public class OpenSearch implements AutoCloseable {

    private final OpenSearchClient client;
    private final OkHttpClient httpClient;   // for raw HTTP requests (ISM policy API)
    private final String baseUrl;
    private final String credentials;       // Basic auth header value

    private OpenSearch(OpenSearchClient client, OkHttpClient httpClient,
                       String baseUrl, String credentials) {
        this.client      = client;
        this.httpClient  = httpClient;
        this.baseUrl     = baseUrl;
        this.credentials = credentials;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Builder
    // ─────────────────────────────────────────────────────────────────────────

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String host;
        private int port;
        private HttpScheme scheme;
        private String username;
        private String password;

        public Builder withHost(String host, int port, HttpScheme scheme) {
            this.host   = host;
            this.port   = port;
            this.scheme = scheme;
            return this;
        }

        public Builder withCredentials(String username, String password) {
            this.username = username;
            this.password = password;
            return this;
        }

        public OpenSearch build() {
            String schemeStr = scheme != null ? scheme.getValue() : "https";
            String baseUrl   = schemeStr + "://" + host + ":" + port;

            // Build the transport using ApacheHttpClient5 (the official transport for opensearch-java 2.x)
            HttpHost httpHost = new HttpHost(schemeStr, host, port);

            ApacheHttpClient5TransportBuilder transportBuilder =
                    ApacheHttpClient5TransportBuilder.builder(httpHost);

            final javax.net.ssl.SSLContext sslCtx = TlsClientFactory.buildSslContext();

            // Set Basic auth + validated SSL via custom connection manager
            if (username != null && password != null) {
                final String user = username;
                final String pass = password;
                transportBuilder.setHttpClientConfigCallback(httpClientBuilder -> {
                    org.apache.hc.client5.http.impl.auth.BasicCredentialsProvider credentialsProvider =
                            new org.apache.hc.client5.http.impl.auth.BasicCredentialsProvider();
                    credentialsProvider.setCredentials(
                            new org.apache.hc.client5.http.auth.AuthScope(httpHost),
                            new org.apache.hc.client5.http.auth.UsernamePasswordCredentials(
                                    user, pass.toCharArray()));
                    httpClientBuilder.setDefaultCredentialsProvider(credentialsProvider);
                    try {
                        org.apache.hc.client5.http.nio.AsyncClientConnectionManager cm =
                            org.apache.hc.client5.http.impl.nio.PoolingAsyncClientConnectionManagerBuilder.create()
                                .setTlsStrategy(new org.apache.hc.client5.http.ssl.DefaultClientTlsStrategy(sslCtx))
                                .build();
                        httpClientBuilder.setConnectionManager(cm);
                    } catch (Exception ignored) {}
                    return httpClientBuilder;
                });
            } else {
                transportBuilder.setHttpClientConfigCallback(httpClientBuilder -> {
                    try {
                        org.apache.hc.client5.http.nio.AsyncClientConnectionManager cm =
                            org.apache.hc.client5.http.impl.nio.PoolingAsyncClientConnectionManagerBuilder.create()
                                .setTlsStrategy(new org.apache.hc.client5.http.ssl.DefaultClientTlsStrategy(sslCtx))
                                .build();
                        httpClientBuilder.setConnectionManager(cm);
                    } catch (Exception ignored) {}
                    return httpClientBuilder;
                });
            }

            OpenSearchTransport transport = transportBuilder
                    .setMapper(new JacksonJsonpMapper())
                    .build();

            // Force-initialize PathEncoder before creating the client.
            // In Spring Boot WAR mode the nested-JAR classloader must load PathEncoder
            // before any HTTP request triggers it via MethodHandles.lookup().
            // We try multiple classloaders to maximize the chance of success.
            for (ClassLoader cl : new ClassLoader[]{
                    Thread.currentThread().getContextClassLoader(),
                    OpenSearch.class.getClassLoader(),
                    ClassLoader.getSystemClassLoader()}) {
                try {
                    if (cl != null) {
                        Class.forName("org.opensearch.client.util.PathEncoder", true, cl);
                        break; // loaded successfully
                    }
                } catch (Throwable ignored) {}
            }

            OpenSearchClient osClient = new OpenSearchClient(transport);

            // Build OkHttpClient for raw HTTP calls (ISM policy management, SQL endpoint)
            String credentialsValue = null;
            if (username != null && password != null) {
                credentialsValue = okhttp3.Credentials.basic(username, password);
            }

            OkHttpClient okClient = TlsClientFactory.buildOkHttpClient();

            return new OpenSearch(osClient, okClient, baseUrl, credentialsValue);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core operations (used by ElasticsearchService)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check if an index or index pattern exists.
     */
    public boolean indexExist(String index) throws Exception {
        return client.indices().exists(r -> r.index(index)).value();
    }

    /**
     * Index a single document.
     */
    public <T> IndexResponse index(String index, T document) throws Exception {
        return client.index(IndexRequest.of(r -> r
                .index(index)
                .document(document)));
    }

    /**
     * Get all field values for a keyword field using a terms aggregation.
     *
     * @param field        the keyword field name
     * @param indexPattern index or pattern
     * @param filter       optional query filter (may be null)
     * @param size         max number of terms to return
     * @param order        TermOrder.Count or TermOrder.Key
     * @param sortOrder    SortOrder.Asc or SortOrder.Desc
     * @return map of field value → doc count
     */
    public Map<String, Long> getFieldValues(String field, String indexPattern,
                                            Query filter, int size,
                                            TermOrder order, SortOrder sortOrder) throws Exception {
        String aggName = "field_values";

        SearchRequest.Builder srb = new SearchRequest.Builder()
                .index(indexPattern)
                .size(0)
                .aggregations(aggName, a -> a.terms(t -> t.field(field).size(size)));

        if (filter != null) srb.query(filter);

        SearchResponse<Void> response = client.search(srb.build(), Void.class);

        Aggregate agg = response.aggregations().get(aggName);
        if (agg == null || !agg.isSterms()) return Collections.emptyMap();

        // Collect results
        List<Map.Entry<String, Long>> entries = agg.sterms().buckets().array().stream()
                .map(b -> new AbstractMap.SimpleEntry<>(b.key(), b.docCount()))
                .collect(Collectors.toList());

        // Apply client-side sort per the requested order (opensearch default is count-desc)
        if (order == TermOrder.Key) {
            entries.sort(sortOrder == SortOrder.Asc
                    ? Comparator.comparing(Map.Entry::getKey)
                    : Comparator.comparing(Map.Entry<String, Long>::getKey).reversed());
        } else {
            entries.sort(sortOrder == SortOrder.Asc
                    ? Comparator.comparingLong(Map.Entry::getValue)
                    : Comparator.comparingLong(Map.Entry<String, Long>::getValue).reversed());
        }

        Map<String, Long> result = new LinkedHashMap<>();
        entries.forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    /**
     * Get all field name → type mappings for an index.
     */
    public Map<String, String> getIndexProperties(String indexPattern) throws Exception {
        GetMappingResponse mapping = client.indices()
                .getMapping(GetMappingRequest.of(r -> r.index(indexPattern)));

        Map<String, String> properties = new LinkedHashMap<>();
        for (Map.Entry<String, IndexMappingRecord> entry : mapping.result().entrySet()) {
            flattenProperties("", entry.getValue().mappings().properties(), properties);
        }
        return properties;
    }

    private void flattenProperties(String prefix,
                                   Map<String, org.opensearch.client.opensearch._types.mapping.Property> props,
                                   Map<String, String> result) {
        if (props == null) return;
        for (Map.Entry<String, org.opensearch.client.opensearch._types.mapping.Property> e : props.entrySet()) {
            String name = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            var prop = e.getValue();
            if (prop.isObject() && prop.object().properties() != null) {
                flattenProperties(name, prop.object().properties(), result);
            } else if (prop.isNested() && prop.nested().properties() != null) {
                flattenProperties(name, prop.nested().properties(), result);
            } else {
                result.put(name, prop._kind().name().toLowerCase(Locale.ROOT));
            }
        }
    }

    /**
     * Get index list sorted by the specified IndexSort.
     */
    public List<IndicesRecord> getIndices(String pattern, IndexSort sort) throws Exception {
        List<IndicesRecord> indices;
        if (pattern != null && !pattern.isEmpty()) {
            indices = client.cat().indices(IndicesRequest.of(r -> r.index(pattern))).valueBody();
        } else {
            indices = client.cat().indices().valueBody();
        }

        if (indices == null) return Collections.emptyList();
        if (sort == null || sort.isUnsorted()) return indices;

        List<IndicesRecord> sorted = new ArrayList<>(indices);
        for (IndexSort.Entry entry : sort.getEntries()) {
            Comparator<IndicesRecord> cmp = buildComparator(entry.getProperty());
            if (entry.getOrder() == SortOrder.Desc) cmp = cmp.reversed();
            sorted.sort(cmp);
        }
        return sorted;
    }

    private Comparator<IndicesRecord> buildComparator(IndexSortableProperty prop) {
        switch (prop) {
            case CreationDate:
                return Comparator.comparingLong(r -> {
                    try { return r.creationDate() != null ? Long.parseLong(r.creationDate()) : 0L; }
                    catch (NumberFormatException e) { return 0L; }
                });
            case DocsCount:
                return Comparator.comparingLong(r -> {
                    try { return r.docsCount() != null ? Long.parseLong(r.docsCount()) : 0L; }
                    catch (NumberFormatException e) { return 0L; }
                });
            case StoreSize:
                return Comparator.comparing(r -> r.storeSize() != null ? r.storeSize() : "");
            case IndexName:
            default:
                return Comparator.comparing(r -> r.index() != null ? r.index() : "");
        }
    }

    /**
     * Delete one or more indices by name.
     */
    public void deleteIndex(List<String> indices) throws Exception {
        client.indices().delete(r -> r.index(indices));
    }

    /**
     * Get cluster health and node statistics.
     * Maps cat/nodes response to ElasticCluster.
     */
    public Optional<ElasticCluster> getClusterNodesInfo() throws OpenSearchException {
        try {
            var nodesResponse = client.cat().nodes(r -> r.bytes(org.opensearch.client.opensearch._types.Bytes.GigaBytes));

            if (nodesResponse == null || nodesResponse.valueBody().isEmpty())
                return Optional.empty();

            ElasticCluster cluster = new ElasticCluster();
            for (var node : nodesResponse.valueBody()) {
                ElasticCluster.ElasticNode n = new ElasticCluster.ElasticNode();
                n.setName(node.name());
                n.setDiskTotal(parseGb(node.diskTotal()));
                n.setDiskUsed(parseGb(node.diskUsed()));
                n.setDiskAvailable(parseGb(node.diskAvail()));
                n.setRamMax(parseGb(node.ramMax()));
                n.setRamCurrent(parseGb(node.ramCurrent()));
                n.setCpuPercent(parseFloat(node.cpu()));
                n.setHeapMax(parseGb(node.heapMax()));
                n.setHeapCurrent(parseGb(node.heapCurrent()));
                cluster.getNodes().add(n);
            }
            return Optional.of(cluster);
        } catch (Exception e) {
            throw new OpenSearchException("getClusterNodesInfo: " + e.getMessage(), e);
        }
    }

    /**
     * Execute a search against the OpenSearch client.
     */
    public <T> SearchResponse<T> search(SearchRequest request, Class<T> type) throws Exception {
        return client.search(request, type);
    }

    /**
     * Update documents matching a query using a Painless script.
     */
    public void updateByQuery(Query query, String index, String script) throws OpenSearchException {
        try {
            client.updateByQuery(r -> r
                    .index(index)
                    .query(query)
                    .script(s -> s.inline(i -> i.source(script))));
        } catch (Exception e) {
            throw new OpenSearchException("updateByQuery: " + e.getMessage(), e);
        }
    }

    /**
     * Execute an OpenSearch SQL query via the _plugins/_sql endpoint.
     * Uses OkHttp for raw HTTP because the opensearch-java client doesn't
     * natively support the SQL plugin API.
     */
    public <T> SearchSqlResponse<T> searchBySqlQuery(SqlQueryRequest request,
                                                      Class<T> responseType) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        String body = mapper.writeValueAsString(request);

        okhttp3.Request.Builder rb = new okhttp3.Request.Builder()
                .url(baseUrl + "/_plugins/_sql?format=json")
                .post(RequestBody.create(body, MediaType.get("application/json")));

        if (credentials != null) rb.header("Authorization", credentials);

        try (Response response = httpClient.newCall(rb.build()).execute()) {
            if (!response.isSuccessful())
                throw new OpenSearchException("SQL query failed: HTTP " + response.code());
            String json = response.body().string();
            return mapper.readValue(json,
                    mapper.getTypeFactory().constructParametricType(
                            SearchSqlResponse.class, responseType));
        }
    }

    /**
     * Execute a raw HTTP request to the OpenSearch REST API.
     * Used by IndexPolicyService for ISM policy management endpoints.
     *
     * @param path   request path (e.g. "/_plugins/_ism/policies/my-policy")
     * @param params optional query parameters map (may be null)
     * @param body   optional request body object (will be JSON-serialised, may be null)
     * @param method HTTP method
     * @return OkHttp Response — caller is responsible for closing it
     */
    public Response executeHttpRequest(String path, Map<String, String> params,
                                       Object body, HttpMethod method) throws Exception {
        // Use Gson for serialization — all index_policy domain classes use @SerializedName (Gson)
        // Do NOT use serializeNulls — ISM API rejects null fields
        com.google.gson.Gson gson = new com.google.gson.Gson();

        StringBuilder url = new StringBuilder(baseUrl).append(path);
        if (params != null && !params.isEmpty()) {
            url.append("?");
            params.forEach((k, v) -> {
                url.append(java.net.URLEncoder.encode(k, StandardCharsets.UTF_8))
                   .append("=")
                   .append(java.net.URLEncoder.encode(v, StandardCharsets.UTF_8))
                   .append("&");
            });
        }

        RequestBody requestBody = null;
        if (body != null) {
            requestBody = RequestBody.create(
                    gson.toJson(body),
                    MediaType.get("application/json"));
        }

        okhttp3.Request.Builder rb = new okhttp3.Request.Builder().url(url.toString());
        if (credentials != null) rb.header("Authorization", credentials);

        switch (method) {
            case GET:    rb.get(); break;
            case DELETE: rb.delete(); break;
            case POST:   rb.post(requestBody != null ? requestBody : RequestBody.create(new byte[0])); break;
            case PUT:    rb.put(requestBody != null ? requestBody : RequestBody.create(new byte[0])); break;
            default:     rb.method(method.name(), requestBody); break;
        }

        return httpClient.newCall(rb.build()).execute();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private static float parseGb(String value) {
        if (value == null || value.isBlank()) return 0f;
        String v = value.trim().toLowerCase(Locale.ROOT);
        try {
            if (v.endsWith("gb")) return Float.parseFloat(v.replace("gb", ""));
            if (v.endsWith("mb")) return Float.parseFloat(v.replace("mb", "")) / 1024f;
            if (v.endsWith("kb")) return Float.parseFloat(v.replace("kb", "")) / (1024f * 1024f);
            if (v.endsWith("b"))  return Float.parseFloat(v.replace("b", ""))  / (1024f * 1024f * 1024f);
            return Float.parseFloat(v) / (1024f * 1024f * 1024f); // assume bytes
        } catch (NumberFormatException e) {
            return 0f;
        }
    }

    private static float parseFloat(String value) {
        if (value == null || value.isBlank()) return 0f;
        try { return Float.parseFloat(value.trim()); }
        catch (NumberFormatException e) { return 0f; }
    }

    @Override
    public void close() throws Exception {
        // The RestClient underlying the transport is closed when the OpenSearchClient
        // transport is closed. OkHttpClient has no close method.
        if (client != null) {
            client._transport().close();
        }
    }
}
