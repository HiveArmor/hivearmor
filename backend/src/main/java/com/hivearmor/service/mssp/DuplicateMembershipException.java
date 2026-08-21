package com.hivearmor.service.mssp;

public class DuplicateMembershipException extends RuntimeException {
    public DuplicateMembershipException(Long tenantId, Long userId) {
        super("membership already exists for tenantId=" + tenantId + " userId=" + userId);
    }
}
