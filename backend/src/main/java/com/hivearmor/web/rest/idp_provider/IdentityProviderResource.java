package com.hivearmor.web.rest.idp_provider;


import com.hivearmor.service.dto.idp_provider.dto.IdentityProviderConfigResponseDto;
import com.hivearmor.service.dto.idp_provider.dto.IdentityProviderCriteria;
import com.hivearmor.service.idp_provider.IdentityProviderService;
import com.hivearmor.web.rest.util.PaginationUtil;
import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ha-providers")
@RequiredArgsConstructor
@Hidden
public class IdentityProviderResource {

    private final IdentityProviderService service;


    @GetMapping
    public ResponseEntity<List<IdentityProviderConfigResponseDto>> getAll(IdentityProviderCriteria criteria, Pageable pageable) {

        Page<IdentityProviderConfigResponseDto> page = service.findAll(criteria, pageable);

        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-providers");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }


}
