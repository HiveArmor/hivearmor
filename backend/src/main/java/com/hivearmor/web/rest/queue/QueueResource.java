package com.hivearmor.web.rest.queue;

import com.hivearmor.service.dto.QueueItemDTO;
import com.hivearmor.service.queue.QueueService;
import com.hivearmor.service.queue.QueueService.QueueParams;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for the composite analyst queue.
 * GET /api/ha-queue
 * S-3B-QUEUE
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class QueueResource {

    private final QueueService queueService;

    /**
     * GET /api/ha-queue
     *
     * Returns a prioritised, paginated mix of alerts, incidents, offenses, and tasks.
     * X-Total-Count header carries the total count across all pages.
     */
    @GetMapping("/ha-queue")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    public ResponseEntity<List<QueueItemDTO>> getQueue(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String[] type,
            @RequestParam(required = false) String assignedTo,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String[] status,
            Authentication authentication
    ) {
        String currentUser = authentication != null ? authentication.getName() : "";

        QueueParams params = new QueueParams(page, size, type, assignedTo, severity, status);
        Page<QueueItemDTO> result = queueService.getQueue(params, currentUser);

        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Total-Count", String.valueOf(result.getTotalElements()));
        headers.add("Access-Control-Expose-Headers", "X-Total-Count");

        return ResponseEntity.ok().headers(headers).body(result.getContent());
    }
}
