package com.hivearmor.userauditor.repository;

import com.hivearmor.userauditor.model.UserAttribute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data SQL repository for the UtmAuditorUserAttributes entity.
 */

@Repository
public interface UserAttributeRepository extends JpaRepository<UserAttribute, Long> {}
