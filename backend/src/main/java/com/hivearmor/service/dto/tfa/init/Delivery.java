package com.hivearmor.service.dto.tfa.init;

import com.hivearmor.domain.tfa.TfaMethod;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Delivery {
    private TfaMethod method;
    private String target;
}
