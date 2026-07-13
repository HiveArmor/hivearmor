package com.hivearmor.service.dto.notification;

import com.hivearmor.domain.notification.UtmNotification;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;


@Mapper(componentModel = "spring")
public interface UtmNotificationMapper {
    public NotificationDTO toDto(UtmNotification entity);
    public UtmNotification toEntity(NotificationDTO dto);

}
