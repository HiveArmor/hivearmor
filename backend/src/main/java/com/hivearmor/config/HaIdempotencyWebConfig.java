package com.hivearmor.config;

import com.hivearmor.web.interceptor.HaIdempotencyInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers the {@link HaIdempotencyInterceptor} on bulk mutation endpoints that
 * require idempotency-key support.
 *
 * <p>Configured endpoints:
 * <ul>
 *   <li>{@code POST /api/ha-alerts/queue/bulk/status}</li>
 *   <li>{@code POST /api/ha-alerts/queue/bulk/tags}</li>
 *   <li>{@code POST /api/ha-alerts/queue/bulk/promote}</li>
 *   <li>{@code PATCH /api/ha-incidents/{id}}</li>
 * </ul>
 *
 * <p>Sprint 49 — HAR-003: Idempotency-Key extension for bulk operations.
 */
@Configuration
public class HaIdempotencyWebConfig implements WebMvcConfigurer {

    private final HaIdempotencyInterceptor idempotencyInterceptor;

    public HaIdempotencyWebConfig(HaIdempotencyInterceptor idempotencyInterceptor) {
        this.idempotencyInterceptor = idempotencyInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(idempotencyInterceptor)
                .addPathPatterns(
                    "/api/ha-alerts/queue/bulk/status",
                    "/api/ha-alerts/queue/bulk/tags",
                    "/api/ha-alerts/queue/bulk/promote",
                    "/api/ha-incidents/*"
                )
                .excludePathPatterns(
                    "/api/ha-incidents/stream",
                    "/api/ha-incidents/*/tasks",
                    "/api/ha-incidents/*/tasks/**",
                    "/api/ha-incidents/*/similar",
                    "/api/ha-incidents/*/similar/**",
                    "/api/ha-incidents/*/events/**",
                    "/api/ha-incidents/*/entities",
                    "/api/ha-incidents/*/entities/**",
                    "/api/ha-incidents/*/stream",
                    "/api/ha-incidents/*/timeline",
                    "/api/ha-incidents/*/response-actions",
                    "/api/ha-incidents/*/response-actions/**",
                    "/api/ha-incidents/*/activity",
                    "/api/ha-incidents/*/activity/**"
                );
    }
}
