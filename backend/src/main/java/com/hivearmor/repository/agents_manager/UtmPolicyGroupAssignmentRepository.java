package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.UtmPolicyGroupAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmPolicyGroupAssignmentRepository extends JpaRepository<UtmPolicyGroupAssignment, Long> {
    List<UtmPolicyGroupAssignment> findByPolicyId(Long policyId);
    List<UtmPolicyGroupAssignment> findByGroupId(Long groupId);
    void deleteByPolicyIdAndGroupId(Long policyId, Long groupId);
    boolean existsByPolicyIdAndGroupId(Long policyId, Long groupId);
}
