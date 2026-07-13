package com.hivearmor.service.dto.threat_management;

import com.hivearmor.domain.shared_types.alert.Side;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import lombok.Data;
import lombok.Builder;
import java.util.List;

@Data
@Builder
public class AdversaryAlertsResponseDto {

    private Side adversary;
    private List<AlertWithChildren> alerts;

    @Data
    @Builder
    public static class AlertWithChildren {
        private UtmAlert alert;
        private List<UtmAlert> children;
    }
}

