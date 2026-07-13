package com.hivearmor.userauditor.model.audit;

import com.hivearmor.userauditor.model.Audit;

public interface Auditable {
    Audit getAudit();
    void setAudit(Audit audit);
}
