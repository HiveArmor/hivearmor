package com.hivearmor.web.rest.network_scan;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.network_scan.AssetGroupFilter;
import com.hivearmor.domain.network_scan.UtmAssetGroup;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.network_scan.AssetGroupDTO;
import com.hivearmor.service.network_scan.UtmAssetGroupService;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.ResponseUtil;

import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * REST controller for managing UtmAssetGroup.
 */
@RestController
@RequestMapping("/api")
public class UtmAssetGroupResource {

    private final Logger log = LoggerFactory.getLogger(UtmAssetGroupResource.class);

    private static final String ENTITY_NAME = "utmAssetGroup";
    private static final String CLASSNAME = "UtmAssetGroupResource";

    private final UtmAssetGroupService utmAssetGroupService;
    private final ApplicationEventService eventService;

    public UtmAssetGroupResource(UtmAssetGroupService utmAssetGroupService,
                                 ApplicationEventService eventService) {
        this.utmAssetGroupService = utmAssetGroupService;
        this.eventService = eventService;
    }

    /**
     * POST  /ha-asset-groups : Create a new utmAssetGroup.
     *
     * @param utmAssetGroup the utmAssetGroup to create
     * @return the ResponseEntity with status 201 (Created) and with body the new utmAssetGroup, or with status 400 (Bad Request) if the utmAssetGroup has already an ID
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PostMapping("/ha-asset-groups")
    public ResponseEntity<UtmAssetGroup> createUtmAssetGroup(@Valid @RequestBody UtmAssetGroup utmAssetGroup) throws URISyntaxException {
        final String ctx = CLASSNAME + ".createUtmAssetGroup";
        try {
            if (utmAssetGroup.getId() != null)
                throw new Exception("A new utmAssetGroup cannot already have an ID");

            utmAssetGroup.setCreatedDate(Instant.now());
            UtmAssetGroup result = utmAssetGroupService.save(utmAssetGroup);
            return ResponseEntity.created(new URI("/api/ha-asset-groups/" + result.getId()))
                    .headers(HeaderUtil.createEntityCreationAlert(ENTITY_NAME, result.getId().toString()))
                    .body(result);
        } catch (DataIntegrityViolationException e) {
            String msg = ctx + ": " + e.getMostSpecificCause().getMessage().replaceAll("\n", "");
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            throw new RuntimeException(msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    /**
     * PUT  /ha-asset-groups : Updates an existing utmAssetGroup.
     *
     * @param utmAssetGroup the utmAssetGroup to update
     * @return the ResponseEntity with status 200 (OK) and with body the updated utmAssetGroup,
     * or with status 400 (Bad Request) if the utmAssetGroup is not valid,
     * or with status 500 (Internal Server Error) if the utmAssetGroup couldn't be updated
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PutMapping("/ha-asset-groups")
    public ResponseEntity<UtmAssetGroup> updateUtmAssetGroup(@Valid @RequestBody UtmAssetGroup utmAssetGroup) throws URISyntaxException {
        final String ctx = CLASSNAME + ".updateUtmAssetGroup";
        try {
            if (utmAssetGroup.getId() == null)
                throw new Exception("Invalid id");

            UtmAssetGroup result = utmAssetGroupService.save(utmAssetGroup);
            return ResponseEntity.ok()
                    .headers(HeaderUtil.createEntityUpdateAlert(ENTITY_NAME, utmAssetGroup.getId().toString()))
                    .body(result);
        } catch (DataIntegrityViolationException e) {
            String msg = ctx + ": " + e.getMostSpecificCause().getMessage().replaceAll("\n", "");
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            throw new RuntimeException(msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    /**
     * GET  /ha-asset-groups : get all the utmAssetGroups.
     *
     * @param pageable the pagination information
     * @return the ResponseEntity with status 200 (OK) and the list of utmAssetGroups in body
     */
    @GetMapping("/ha-asset-groups/searchGroupsByFilter")
    public ResponseEntity<List<AssetGroupDTO>> searchGroupsByFilter(
            AssetGroupFilter filter, Pageable pageable) {

        Page<AssetGroupDTO> page = utmAssetGroupService.searchGroupsByFilter(filter, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/ha-asset-groups/searchGroupsByFilter");

        return ResponseEntity.ok()
                .headers(headers)
                .body(page.getContent());
    }


    /**
     * GET  /ha-asset-groups/:id : get the "id" utmAssetGroup.
     *
     * @param id the id of the utmAssetGroup to retrieve
     * @return the ResponseEntity with status 200 (OK) and with body the utmAssetGroup, or with status 404 (Not Found)
     */
    @GetMapping("/ha-asset-groups/{id}")
    public ResponseEntity<UtmAssetGroup> getUtmAssetGroup(@PathVariable Long id) {
        log.debug("REST request to get UtmAssetGroup : {}", id);
        Optional<UtmAssetGroup> utmAssetGroup = utmAssetGroupService.findOne(id);
        return ResponseUtil.wrapOrNotFound(utmAssetGroup);
    }

    /**
     * DELETE  /ha-asset-groups/:id : delete the "id" utmAssetGroup.
     *
     * @param id the id of the utmAssetGroup to delete
     * @return the ResponseEntity with status 200 (OK)
     */
    @DeleteMapping("/ha-asset-groups/{id}")
    public ResponseEntity<Void> deleteUtmAssetGroup(@PathVariable Long id) {
        log.debug("REST request to delete UtmAssetGroup : {}", id);
        utmAssetGroupService.delete(id);
        return ResponseEntity.ok().headers(HeaderUtil.createEntityDeletionAlert(ENTITY_NAME, id.toString())).build();
    }
}
