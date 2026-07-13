package com.hivearmor.service.dto.tfa.verify;

import com.hivearmor.domain.tfa.TfaMethod;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class TfaVerifyRequest {
    private TfaMethod method;
    private String code;
}
