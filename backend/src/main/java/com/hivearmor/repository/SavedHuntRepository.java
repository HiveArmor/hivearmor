package com.hivearmor.repository;

import com.hivearmor.domain.SavedHunt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link SavedHunt}.
 *
 * Provides access to saved hunts scoped to a tenant. Supports filtering
 * by shared visibility, name search, and tag search.
 *
 * Backs GET /api/ha-hunts/saved
 */
@Repository
public interface SavedHuntRepository extends JpaRepository<SavedHunt, String> {

    List<SavedHunt> findByTenantIdAndSharedTrueOrCreatedBy(Long tenantId, String createdBy);

    List<SavedHunt> findByTenantIdAndNameContaining(Long tenantId, String name);

    List<SavedHunt> findByTenantIdAndTagsContaining(Long tenantId, String tags);
}
