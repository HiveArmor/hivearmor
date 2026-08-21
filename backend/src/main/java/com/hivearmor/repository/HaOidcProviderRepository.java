package com.hivearmor.repository;

import com.hivearmor.domain.HaOidcProvider;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for the {@link HaOidcProvider} entity.
 *
 * Provides standard CRUD operations via {@link JpaRepository} plus a derived
 * query to retrieve only enabled providers for the public /providers/enabled endpoint.
 */
@Repository
public interface HaOidcProviderRepository extends JpaRepository<HaOidcProvider, Long> {

    /**
     * Returns all OIDC providers whose {@code enabled} flag is {@code true}.
     *
     * Used by {@code GET /api/ha-oidc/providers/enabled} (public endpoint) and
     * by the login page SSO button list.
     *
     * @return list of enabled providers; never {@code null}, may be empty
     */
    List<HaOidcProvider> findByEnabledTrue();
}
