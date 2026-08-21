package com.hivearmor.repository;

import com.hivearmor.domain.HaAiChatHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link HaAiChatHistory}.
 *
 * <p>Both finders are scoped by {@code userLogin} to enforce per-user data isolation
 * (Requirements 3.7, 3.8, 3.9, 5.7). Spring Data JPA derives the queries from the
 * method names — no {@code @Query} annotation is needed.</p>
 *
 * <ul>
 *   <li>{@link #findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc} — used
 *       when a specific context record is known (e.g. alert or incident ID).</li>
 *   <li>{@link #findByUserLoginAndContextTypeOrderByCreatedAtDesc} — used when listing
 *       all chat history for a context type regardless of record ID.</li>
 * </ul>
 *
 * Both methods return results sorted by {@code createdAt} descending so callers can
 * use {@code rows.get(0)} to obtain the most-recent entry.
 */
@Repository
public interface HaAiChatHistoryRepository extends JpaRepository<HaAiChatHistory, Long> {

    /**
     * Returns all chat-history rows for the given user, context type, and context ID,
     * ordered by creation time descending (newest first).
     *
     * @param userLogin   the authenticated principal's login name
     * @param contextType the context category (e.g. {@code "alert"}, {@code "triage"})
     * @param contextId   the ID of the specific alert / incident / record
     * @return list of matching rows, may be empty, never null
     */
    List<HaAiChatHistory> findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
        String userLogin, String contextType, String contextId);

    /**
     * Returns all chat-history rows for the given user and context type, regardless of
     * context ID, ordered by creation time descending (newest first).
     *
     * @param userLogin   the authenticated principal's login name
     * @param contextType the context category (e.g. {@code "incident"}, {@code "general"})
     * @return list of matching rows, may be empty, never null
     */
    List<HaAiChatHistory> findByUserLoginAndContextTypeOrderByCreatedAtDesc(
        String userLogin, String contextType);
}
