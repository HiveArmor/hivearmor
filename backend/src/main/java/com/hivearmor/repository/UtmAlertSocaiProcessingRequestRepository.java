package com.hivearmor.repository;

import com.hivearmor.domain.UtmAlertSocaiProcessingRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@SuppressWarnings("unused")
@Repository
public interface UtmAlertSocaiProcessingRequestRepository extends JpaRepository<UtmAlertSocaiProcessingRequest, String> {

}
