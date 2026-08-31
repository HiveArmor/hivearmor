package com.hivearmor.repository.compliance;

import com.hivearmor.compliance.entity.HaPoamItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HaPoamItemRepository extends JpaRepository<HaPoamItem, Long> {

    Page<HaPoamItem> findByControlId(String controlId, Pageable pageable);
}
