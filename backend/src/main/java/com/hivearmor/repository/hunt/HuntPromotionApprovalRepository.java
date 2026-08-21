package com.hivearmor.repository.hunt;

import com.hivearmor.domain.hunt.HuntPromotionApproval;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HuntPromotionApprovalRepository extends JpaRepository<HuntPromotionApproval, String> {

    List<HuntPromotionApproval> findByTenantKeyAndStatusOrderByCreatedAtDesc(String tenantKey, String status);

    List<HuntPromotionApproval> findByTenantKeyOrderByCreatedAtDesc(String tenantKey);
}
