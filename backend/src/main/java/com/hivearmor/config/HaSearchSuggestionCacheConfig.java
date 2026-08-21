package com.hivearmor.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import java.time.Duration;

/**
 * Sprint 26 — Cache configuration for the search suggestions endpoint.
 *
 * <p>Exposes a dedicated Caffeine-backed {@link CacheManager} bean named
 * {@code searchSuggestionsCacheManager} holding a single cache named
 * {@code searchSuggestions}.  The 15-minute TTL matches the
 * {@code staleTime} configured in {@code useSearchSuggestions} on the
 * frontend so that clients and server-side cache expire together.
 *
 * <p>{@code @EnableCaching} is placed here rather than on the main application
 * class so that the caching infrastructure is co-located with its configuration.
 */
@Configuration
@EnableCaching
public class HaSearchSuggestionCacheConfig {

    /** Spring cache name used by {@code @Cacheable} in HaSearchSuggestionService. */
    public static final String CACHE_NAME = "searchSuggestions";

    /** Time-to-live for cached suggestion lists (15 minutes). */
    private static final long TTL_SECONDS = 900L;

    /** Maximum number of distinct (indexPattern, count) key combinations to cache. */
    private static final long MAX_SIZE = 200L;

    /**
     * Creates the {@link CacheManager} that backs the {@code searchSuggestions}
     * Spring cache.  Named {@code searchSuggestionsCacheManager} so that it does
     * not conflict with any other {@link CacheManager} bean that may be introduced
     * by future sprints.
     *
     * @return a Caffeine-backed cache manager with a 900-second TTL
     */
    @Bean("searchSuggestionsCacheManager")
    @Primary
    public CacheManager searchSuggestionsCacheManager() {
        CaffeineCacheManager mgr = new CaffeineCacheManager(CACHE_NAME);
        mgr.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(TTL_SECONDS))
                .maximumSize(MAX_SIZE));
        return mgr;
    }
}
