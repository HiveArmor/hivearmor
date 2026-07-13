package com.hivearmor.service.dto.collectors.dto;


import com.hivearmor.domain.collector.UtmCollector;
import com.hivearmor.domain.network_scan.UtmAssetGroup;
import com.hivearmor.service.dto.collectors.CollectorModuleEnum;
import com.hivearmor.service.dto.collectors.CollectorStatusEnum;
import lombok.Getter;
import lombok.Setter;

@Setter
@Getter
public class CollectorDTO {
    private int id;
    private CollectorStatusEnum status;
    private String collectorKey;
    private String ip;
    private String hostname;
    private String version;
    private CollectorModuleEnum module;
    private String lastSeen;

    private String groupId;

    private UtmAssetGroup group;

    private boolean active;

    public CollectorDTO(){}


    public CollectorDTO(UtmCollector collector) {
        this.id = collector.getId().intValue();
        this.status = CollectorStatusEnum.valueOf(collector.getStatus());
        this.collectorKey = collector.getCollectorKey();
        this.ip = collector.getIp();
        this.hostname = collector.getHostname();
        this.version = collector.getVersion();
        this.module = CollectorModuleEnum.valueOf(collector.getModule());
        this.lastSeen = collector.getLastSeen().toString();
        this.group = collector.getAssetGroup();
        this.active = collector.isActive();
    }

}
