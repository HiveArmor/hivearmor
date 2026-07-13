package com.hivearmor.service.dto.tfa.enroll;

import com.hivearmor.domain.tfa.TfaMethod;
import com.hivearmor.domain.tfa.TfaStage;
import com.hivearmor.service.dto.tfa.save.TfaSaveRequest;
import com.hivearmor.service.dto.tfa.verify.TfaVerifyRequest;
import lombok.Data;

@Data
public class TfaEnrollRequest {
    private TfaStage stage;
    private TfaMethod method;
    private String code;
    private boolean enable;

    public TfaVerifyRequest toVerifyRequest() {
        return new TfaVerifyRequest(method, code);
    }
}
