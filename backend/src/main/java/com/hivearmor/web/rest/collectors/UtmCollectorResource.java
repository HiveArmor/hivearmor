package com.hivearmor.web.rest.collectors;

import com.hivearmor.aop.logging.AuditEvent;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.application_modules.UtmModuleGroup;
import com.hivearmor.domain.network_scan.AssetGroupFilter;
import com.hivearmor.domain.network_scan.NetworkScanFilter;
import com.hivearmor.service.application_modules.UtmModuleGroupService;
import com.hivearmor.service.collectors.CollectorService;
import com.hivearmor.service.collectors.UtmCollectorService;
import com.hivearmor.service.dto.collectors.CollectorActionEnum;
import com.hivearmor.service.dto.collectors.dto.CollectorConfigDTO;
import com.hivearmor.service.dto.collectors.dto.CollectorDTO;
import com.hivearmor.service.dto.collectors.CollectorModuleEnum;
import com.hivearmor.service.dto.collectors.dto.ListCollectorsResponseDTO;
import com.hivearmor.service.dto.network_scan.AssetGroupDTO;
import com.hivearmor.service.dto.network_scan.UpdateGroupDTO;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;


/**
 * REST controller for managing {@link UtmCollectorResource}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/collectors")
public class UtmCollectorResource {

    private final UtmModuleGroupService moduleGroupService;
    private final UtmCollectorService utmCollectorService;
    private final CollectorService collectorService;

    @AuditEvent(
            attemptType = ApplicationEventType.CONFIG_UPDATE_ATTEMPT,
            successType = ApplicationEventType.CONFIG_UPDATE_SUCCESS,
            attemptMessage = "Attempt to upsert collector configuration initiated",
            successMessage = "Collector configuration upserted successfully"
    )
    @PostMapping("/config")
    public ResponseEntity<Void> upsertCollectorConfig(@Valid @RequestBody CollectorConfigDTO collectorConfig,
                                                      @RequestParam(name = "action", defaultValue = "CREATE") CollectorActionEnum action) {

        collectorService.upsertCollectorConfig(collectorConfig);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<ListCollectorsResponseDTO> listCollectorsByModule(@RequestParam(required = false, defaultValue = "0") Integer pageNumber,
                                                                            @RequestParam(required = false, defaultValue = "10") Integer pageSize,
                                                                            @RequestParam(required = false) String hostname,
                                                                            @RequestParam(required = false) CollectorModuleEnum module,
                                                                            @RequestParam(required = false) String sortBy) {


        ListCollectorsResponseDTO response = collectorService.listCollector(hostname, pageNumber, pageSize, sortBy, module);
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Total-Count", Long.toString(response.getTotal()));
        return ResponseEntity.ok().headers(headers).body(response);
    }

    @GetMapping("/{collectorId}/module-groups")
    public ResponseEntity<List<UtmModuleGroup>> getModuleGroups(@PathVariable String collectorId) {

        return ResponseEntity.ok(moduleGroupService.findAllByCollectorId(collectorId));

    }

    @PutMapping("/asset-group")
    public ResponseEntity<Void> updateGroup(@Valid @RequestBody UpdateGroupDTO body) {

        utmCollectorService.updateGroup(body.getAssetsIds(), body.getAssetGroupId());

        return ResponseEntity.ok().build();
    }


    @GetMapping("/asset-groups")
    public ResponseEntity<List<AssetGroupDTO>> searchGroupsByFilter(AssetGroupFilter filter, Pageable pageable) {


        Page<AssetGroupDTO> page = collectorService.searchGroupsByFilter(filter, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/ha-asset-groups/searchGroupsByFilter");
        return ResponseEntity.ok().headers(headers).body(page.getContent());

    }

    @GetMapping("/search-by-filters")
    public ResponseEntity<List<CollectorDTO>> searchByFilters(@ParameterObject NetworkScanFilter filters,
                                                              @ParameterObject Pageable pageable) {

        Page<CollectorDTO> page = this.utmCollectorService.searchByFilters(filters, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/search-by-filters");
        return ResponseEntity.ok().headers(headers).body(page.getContent());

    }

    @AuditEvent(
            attemptType = ApplicationEventType.COLLECTOR_DELETE_ATTEMPT,
            successType = ApplicationEventType.COLLECTOR_DELETE_SUCCESS,
            attemptMessage = "Attempt to delete collector initiated",
            successMessage = "Collector deleted successfully"
    )
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCollector(@PathVariable Long id) {
        collectorService.deleteCollector(id);
        return ResponseEntity.ok().headers(HeaderUtil.createEntityDeletionAlert("UtmCollector", id.toString())).build();
    }

}
