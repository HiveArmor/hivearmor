package com.hivearmor.service.dto.tfa.save;

import com.hivearmor.domain.tfa.TfaMethod;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class TfaSaveRequest {
    private TfaMethod method;
    private boolean enable;
}
