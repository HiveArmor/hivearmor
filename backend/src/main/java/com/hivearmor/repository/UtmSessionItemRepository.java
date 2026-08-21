package com.hivearmor.repository;

import com.hivearmor.domain.UtmSessionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data repository for UtmSessionItem.
 * S-5C
 */
@Repository
public interface UtmSessionItemRepository extends JpaRepository<UtmSessionItem, Long> {

    /** Returns all items in a session, newest added first. */
    List<UtmSessionItem> findBySessionIdOrderByAddedAtDesc(Long sessionId);

    /** Returns items in a session filtered by item type, newest added first. */
    List<UtmSessionItem> findBySessionIdAndItemTypeOrderByAddedAtDesc(Long sessionId, String itemType);

    Page<UtmSessionItem> findBySessionIdOrderByAddedAtDesc(Long sessionId, Pageable pageable);

    Page<UtmSessionItem> findBySessionIdAndItemTypeOrderByAddedAtDesc(Long sessionId, String itemType, Pageable pageable);

    long countBySessionId(Long sessionId);

    /** One bounded aggregate query for queue row counts; avoids a per-session N+1 read. */
    @Query("select i.session.id, count(i.id) from UtmSessionItem i "
        + "where i.session.id in :sessionIds group by i.session.id")
    List<Object[]> countBySessionIds(@Param("sessionIds") List<Long> sessionIds);
}
