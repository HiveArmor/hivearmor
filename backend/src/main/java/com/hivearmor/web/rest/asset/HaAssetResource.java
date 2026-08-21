package com.hivearmor.web.rest.asset;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.asset.AssetContractException;
import com.hivearmor.service.asset.AssetInventoryService;
import com.hivearmor.service.asset.AssetInventoryService.Query;
import com.hivearmor.web.rest.asset.dto.AssetInventoryDTO;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

/** Explicitly authorized, credential-free Asset Intelligence API. */
@RestController
@RequestMapping("/api/ha-assets")
public class HaAssetResource {

    private static final String ASSET_READ_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
            + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final AssetInventoryService assetInventoryService;

    public HaAssetResource(AssetInventoryService assetInventoryService) {
        this.assetInventoryService = assetInventoryService;
    }

    @GetMapping
    @PreAuthorize(ASSET_READ_AUTH)
    public ResponseEntity<AssetInventoryDTO.Page> list(
        @RequestParam(required = false) String search,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(required = false) String category,
        @RequestParam(name = "risk", required = false) String risk,
        @RequestParam(name = "riskLevel", required = false) String riskLevel,
        @RequestParam(name = "exposure", required = false) String exposure,
        @RequestParam(name = "exposureLevel", required = false) String exposureLevel,
        @RequestParam(required = false) String sensorHealth,
        @RequestParam(required = false) String onboarding,
        @RequestParam(required = false) String criticality,
        @RequestParam(required = false) String owner,
        @RequestParam(required = false) String tag,
        @RequestParam(defaultValue = "authorized") String tenantScope,
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(defaultValue = "riskScore:desc") String sort,
        @RequestParam(defaultValue = "0") int page) {

        Query query = new Query(
            firstText(search, q), category, firstText(risk, riskLevel), firstText(exposure, exposureLevel),
            sensorHealth, onboarding, criticality, owner, tag, tenantScope, cursor,
            size == null ? limit : size, sort, Math.max(0, page));
        String tenantKey = currentTenantKey();
        if (!"authorized".equalsIgnoreCase(tenantScope) && !tenantKey.equals(tenantScope)) {
            throw new AssetContractException("ASSET_SCOPE_FORBIDDEN", "Requested tenant is outside the active authorized scope");
        }
        AssetInventoryDTO.Page response = assetInventoryService.list(query, currentOwner(), tenantKey);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(20, TimeUnit.SECONDS).cachePrivate().mustRevalidate())
            .body(response);
    }

    @GetMapping("/{assetId}")
    @PreAuthorize(ASSET_READ_AUTH)
    public ResponseEntity<AssetInventoryDTO.Detail> detail(@PathVariable long assetId) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(20, TimeUnit.SECONDS).cachePrivate().mustRevalidate())
            .body(assetInventoryService.detail(assetId));
    }

    private static String firstText(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }

    private String currentOwner() {
        return SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new AssetContractException("ASSET_PRINCIPAL_REQUIRED", "Authenticated principal is required"));
    }

    private String currentTenantKey() {
        String prefix = TenantContext.getClientPrefix();
        return prefix == null || prefix.isBlank() ? "authorized" : prefix;
    }
}
