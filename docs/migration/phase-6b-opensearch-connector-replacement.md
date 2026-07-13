# Phase 6b — opensearch-connector Replacement (Internal Package)

**Date**: June 2026  
**Status**: ✅ Complete  
**Risk**: Medium — core data layer change, fully verified by compile + tests  

## Background

`com.utmstack:opensearch-connector:1.0.5` was a private GitHub Package artifact that:
- Required `MAVEN_TK` (GitHub PAT with `read:packages`) to download
- Blocked local builds for developers without org access
- Wrapped the official `org.opensearch.client:opensearch-java` client

Since this project is a fork being built upon independently, the dependency was replaced with
an internal package at `com.park.utmstack.opensearch.*`.

## New Internal Package

Location: `backend/src/main/java/com/park/utmstack/opensearch/`

| Class | Replaces | Purpose |
|---|---|---|
| `OpenSearch` | `com.utmstack.opensearch_connector.OpenSearch` | Facade over `OpenSearchClient` — connection, all queries |
| `enums/HttpScheme` | `...enums.HttpScheme` | `http` / `https` |
| `enums/HttpMethod` | `...enums.HttpMethod` | `GET`/`POST`/`PUT`/`DELETE` for raw HTTP |
| `enums/TermOrder` | `...enums.TermOrder` | `Count` / `Key` for terms aggregation sort |
| `enums/IndexSortableProperty` | `...enums.IndexSortableProperty` | `CreationDate`, `IndexName`, etc. |
| `exceptions/OpenSearchException` | `...exceptions.OpenSearchException` | Checked wrapper exception |
| `types/BucketAggregation` | `...types.BucketAggregation` | Single aggregation bucket (key, docCount, subAggs) |
| `types/ElasticCluster` | `...types.ElasticCluster` | Cluster health + node stats |
| `types/IndexSort` | `...types.IndexSort` | Sort criteria builder for index listings |
| `types/SearchSqlResponse<T>` | `...types.SearchSqlResponse` | SQL query response — maps datarows+schema to `List<T>` |
| `types/SqlQueryRequest` | `...types.SqlQueryRequest` | SQL query payload for `_plugins/_sql` |
| `parsers/TermAggregateParser` | `...parsers.TermAggregateParser` | Parses sterms/lterms/dterms Aggregate → BucketAggregation list |
| `parsers/DateHistogramAggregateParser` | `...parsers.DateHistogramAggregateParser` | Parses date_histogram Aggregate → BucketAggregation list |

## Files Changed

### 20 source files — import prefix replacement
All `import com.utmstack.opensearch_connector.*` → `import com.park.utmstack.opensearch.*`

### pom.xml
- Removed `com.utmstack:opensearch-connector:1.0.5`
- Added `org.opensearch.client:opensearch-java:2.10.4` (now explicit, was transitive)
- Added `org.apache.httpcomponents.client5:httpclient5:5.4.1` (compile scope for transport builder)

### Additional fixes discovered during compilation
These Hibernate 6 / Spring Boot 3.3 / Spring 6 issues were found during the compile phase:

| Issue | Fix |
|---|---|
| `jackson-datatype-hibernate5` still in `JacksonConfiguration` | → `Hibernate6Module` |
| `@org.hibernate.annotations.Type(type="text")` removed in H6 | Removed annotation; `columnDefinition="TEXT"` is sufficient |
| `org.hibernate.jpa.TypedParameterValue(LongType, value)` removed | → `TypedParameterValue(StandardBasicTypes.LONG, value)` |
| `org.hibernate.jpa.QueryHints` constant moved | → string `"hibernate.query.passDistinctThrough"` |
| `org.hibernate.type.BooleanType/LongType/StringType` removed | → `StandardBasicTypes.BOOLEAN/LONG/STRING` |
| `IdentityGenerator.generate(session, obj)` removed in H6 | Custom generator rewritten to implement `BeforeExecutionGenerator` |
| `@GenericGenerator(strategy=...)` deprecated in H6 | → `@GenericGenerator(type=...)` on 21 entities |
| `org.springframework.util.Base64Utils` removed in Spring 6 | → `java.util.Base64` in `UserJWTController` + `UtmFederationServiceClientService` |
| `org.apache.http.*` (HC4) in `RestTemplateConfiguration` | → `org.apache.hc.client5.*` (HC5) for Spring Boot 3.x |
| `ClientHttpResponse.getStatusCode()` returns `HttpStatusCode` in Spring 6 | Fixed in `RestTemplateResponseErrorHandler` and `PdfService` |
| `SpringTemplateEngine` from `thymeleaf.spring5` | → `thymeleaf.spring6` in `MailService` + `PdfUtil` |
| `LiquibaseProperties.getContexts()` returns `List<String>` in Boot 3.3 | Joined to comma-separated string |
| `LiquibaseProperties.getLabelFilter()` returns `List<String>` in Boot 3.3 | Joined to comma-separated string |
| `SpringLiquibaseUtil.createSpringLiquibase` updated API | Fixed parameter passing |

## Tests

**T-001 TokenProviderTest** — 10/10 passing ✅  
**T-002 UserJWTControllerTest** — 4/4 passing ✅  
**Build** — `mvn compile` succeeds with zero errors ✅

## No More `MAVEN_TK` Required

The private GitHub Packages dependency is fully eliminated. Local builds now work without any
GitHub authentication beyond standard Maven Central access.

## Rollback

```bash
git revert HEAD~N  # revert all Phase 6b changes
```
The `com.utmstack.opensearch_connector.*` import prefix can be restored by reverting the Python
import-rename script output, and restoring `opensearch-connector:1.0.5` in `pom.xml`.
