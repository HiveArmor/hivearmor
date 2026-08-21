package com.hivearmor.service.hunt;

import com.hivearmor.domain.HuntHistory;
import com.hivearmor.repository.HuntHistoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service for query execution history management.
 *
 * <p>Provides record, list, and clear operations for per-user query history.
 * Auto-prunes entries to keep a maximum of 100 per user after each insert.
 *
 * <p>Backs GET/DELETE /api/ha-hunts/history and is called internally
 * from the POST /ha-hunts/search flow for auto-recording.
 */
@Service
public class HuntHistoryService {

    private static final Logger log = LoggerFactory.getLogger(HuntHistoryService.class);
    private static final String CLASSNAME = "HuntHistoryService";

    /** Maximum number of history entries per user. */
    private static final int MAX_ENTRIES_PER_USER = 100;

    private final HuntHistoryRepository huntHistoryRepository;

    public HuntHistoryService(HuntHistoryRepository huntHistoryRepository) {
        this.huntHistoryRepository = huntHistoryRepository;
    }

    /**
     * Records a new history entry for a search execution.
     * After recording, auto-prunes if the user exceeds 100 entries.
     *
     * @param query       the executed query string
     * @param filters     optional JSON filters applied
     * @param duration    execution duration in milliseconds
     * @param resultCount number of results returned
     * @param status      execution status (completed, failed, cancelled, timeout)
     * @param userId      the user who executed the search
     * @param tenantId    the tenant ID
     * @param savedHuntId optional saved hunt ID if this was a saved hunt execution
     * @return the created HuntHistory entry
     */
    @Transactional
    public HuntHistory record(String query, String filters, Long duration,
                              Integer resultCount, String status,
                              String userId, Long tenantId, String savedHuntId) {
        final String ctx = CLASSNAME + ".record";
        log.debug("{}: query='{}', userId={}, tenantId={}", ctx,
            query != null && query.length() > 50 ? query.substring(0, 50) + "..." : query,
            userId, tenantId);

        HuntHistory entry = new HuntHistory();
        entry.setId(UUID.randomUUID().toString());
        entry.setQuery(query);
        entry.setFilters(filters);
        entry.setExecutedAt(Instant.now());
        entry.setDuration(duration);
        entry.setResultCount(resultCount);
        entry.setStatus(status);
        entry.setUserId(userId);
        entry.setTenantId(tenantId);
        entry.setSavedHuntId(savedHuntId);

        HuntHistory saved = huntHistoryRepository.save(entry);

        // Auto-prune: keep only MAX_ENTRIES_PER_USER entries per user
        autoPrune(userId);

        return saved;
    }

    /**
     * Lists history entries for a user, ordered by executedAt DESC, limited to 100.
     * Optionally filters by date range.
     *
     * @param userId   the user ID
     * @param tenantId the tenant ID
     * @param from     optional start of date range (inclusive)
     * @param to       optional end of date range (inclusive)
     * @return list of history entries ordered by executedAt DESC
     */
    @Transactional(readOnly = true)
    public List<HuntHistory> list(String userId, Long tenantId, Instant from, Instant to) {
        final String ctx = CLASSNAME + ".list";
        log.debug("{}: userId={}, tenantId={}, from={}, to={}", ctx, userId, tenantId, from, to);

        List<HuntHistory> entries = huntHistoryRepository.findByUserIdOrderByExecutedAtDesc(userId);

        // Apply date range filter if provided
        if (from != null || to != null) {
            entries = entries.stream()
                .filter(e -> {
                    if (from != null && e.getExecutedAt().isBefore(from)) return false;
                    if (to != null && e.getExecutedAt().isAfter(to)) return false;
                    return true;
                })
                .collect(Collectors.toList());
        }

        // Limit to 100 entries
        if (entries.size() > MAX_ENTRIES_PER_USER) {
            entries = entries.subList(0, MAX_ENTRIES_PER_USER);
        }

        return entries;
    }

    /**
     * Clears history entries for a user. Optionally deletes only entries before
     * a specified date.
     *
     * @param userId the user ID
     * @param tenantId the tenant ID
     * @param before optional cutoff date — only entries before this date are deleted
     * @return the number of entries deleted
     */
    @Transactional
    public long clear(String userId, Long tenantId, Instant before) {
        final String ctx = CLASSNAME + ".clear";
        log.debug("{}: userId={}, tenantId={}, before={}", ctx, userId, tenantId, before);

        if (before != null) {
            // Count entries before the cutoff for reporting
            List<HuntHistory> entries = huntHistoryRepository.findByUserIdOrderByExecutedAtDesc(userId);
            long countBefore = entries.stream()
                .filter(e -> e.getExecutedAt().isBefore(before))
                .count();
            huntHistoryRepository.deleteByUserIdAndExecutedAtBefore(userId, before);
            return countBefore;
        } else {
            // Delete all entries for the user
            List<HuntHistory> entries = huntHistoryRepository.findByUserIdOrderByExecutedAtDesc(userId);
            long count = entries.size();
            huntHistoryRepository.deleteAll(entries);
            return count;
        }
    }

    /**
     * Auto-prune logic: after insert, if user has more than 100 entries,
     * delete the oldest entries to bring count back to 100.
     *
     * @param userId the user ID to prune
     */
    private void autoPrune(String userId) {
        long count = huntHistoryRepository.countByUserId(userId);
        if (count > MAX_ENTRIES_PER_USER) {
            List<HuntHistory> allEntries = huntHistoryRepository.findByUserIdOrderByExecutedAtDesc(userId);
            if (allEntries.size() > MAX_ENTRIES_PER_USER) {
                // Keep the first MAX_ENTRIES_PER_USER (most recent), delete the rest
                List<HuntHistory> toDelete = allEntries.subList(MAX_ENTRIES_PER_USER, allEntries.size());
                huntHistoryRepository.deleteAll(toDelete);
                log.debug("{}.autoPrune: pruned {} entries for userId={}",
                    CLASSNAME, toDelete.size(), userId);
            }
        }
    }
}
