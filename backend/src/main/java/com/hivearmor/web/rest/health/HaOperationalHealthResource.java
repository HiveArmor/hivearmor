package com.hivearmor.web.rest.health;

import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.concurrent.TimeUnit;

/**
 * Authenticated, redacted operational-health projection for the application shell.
 *
 * <p>This endpoint intentionally exposes neither actuator component details nor cluster
 * topology. The OpenSearch probe is cached briefly so a masthead poll from many analyst
 * sessions cannot amplify into excessive cluster traffic.</p>
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Operational Health", description = "Redacted shell health projection")
public class HaOperationalHealthResource {

    private static final Logger log = LoggerFactory.getLogger(HaOperationalHealthResource.class);
    private static final long CACHE_NANOS = TimeUnit.SECONDS.toNanos(10);

    private final OpensearchClientBuilder opensearchClientBuilder;
    private volatile OperationalHealth cachedHealth;
    private volatile long cachedAtNanos;

    public HaOperationalHealthResource(OpensearchClientBuilder opensearchClientBuilder) {
        this.opensearchClientBuilder = opensearchClientBuilder;
    }

    @GetMapping("/ha-operational-health")
    @PreAuthorize("isAuthenticated()")
    @Operation(
        summary = "Get redacted data-pipeline health",
        description = "Returns a bounded status for the shell without exposing internal component details."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Health projection returned"),
        @ApiResponse(responseCode = "401", description = "Authentication required")
    })
    public ResponseEntity<OperationalHealth> getOperationalHealth() {
        long now = System.nanoTime();
        OperationalHealth cached = cachedHealth;
        if (cached != null && now - cachedAtNanos < CACHE_NANOS) {
            return ResponseEntity.ok(cached);
        }

        OperationalHealth refreshed;
        try {
            boolean connected = opensearchClientBuilder.execute(client -> client.ping());
            refreshed = connected
                ? new OperationalHealth("UP", "Search and detection data services are reachable.", Instant.now())
                : new OperationalHealth("DEGRADED", "Search data services are not ready.", Instant.now());
        } catch (Exception exception) {
            log.warn("Operational data-pipeline health probe failed: {}", exception.getMessage());
            refreshed = new OperationalHealth("DOWN", "Search data services are unavailable.", Instant.now());
        }

        cachedHealth = refreshed;
        cachedAtNanos = now;
        return ResponseEntity.ok(refreshed);
    }

    public record OperationalHealth(String status, String message, Instant checkedAt) {}
}
