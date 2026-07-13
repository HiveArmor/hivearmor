package com.hivearmor.service.dto.notification;


import com.hivearmor.domain.notification.NotificationSource;
import com.hivearmor.domain.notification.NotificationStatus;
import com.hivearmor.domain.notification.NotificationType;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class NotificationDTO {

    private Long id;

    @NotNull
    private NotificationSource source;

    private NotificationType type;

    @NotEmpty
    @Size(min = 5, max = 50)
    private String message;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    private boolean read;

    private NotificationStatus status;
}
