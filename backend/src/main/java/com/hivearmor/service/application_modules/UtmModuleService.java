package com.hivearmor.service.application_modules;

import com.hivearmor.domain.UtmMenu;
import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.enums.ModuleName;
import com.hivearmor.domain.index_pattern.UtmIndexPattern;
import com.hivearmor.domain.logstash_filter.UtmLogstashFilter;
import com.hivearmor.repository.UtmModuleGroupRepository;
import com.hivearmor.repository.application_modules.UtmModuleRepository;
import com.hivearmor.service.UtmMenuService;
import com.hivearmor.service.dto.application_modules.ModuleActivationDTO;
import com.hivearmor.service.index_pattern.UtmIndexPatternService;
import com.hivearmor.service.logstash_filter.UtmLogstashFilterService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

/**
 * Service Implementation for managing UtmModule.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class UtmModuleService {

    private final Logger log = LoggerFactory.getLogger(UtmModuleService.class);
    private static final String CLASSNAME = "UtmModuleService";

    private final UtmModuleRepository moduleRepository;
    private final UtmMenuService menuService;
    private final UtmIndexPatternService indexPatternService;
    private final UtmLogstashFilterService logstashFilterService;
    private final UtmModuleGroupRepository moduleGroupRepository;


    /**
     * Activate or deactivate the module requested
     *
     * @param moduleActivationDTO The module activation information
     * @return The current module information
     * @throws NoSuchElementException In case the module definition is not found for the server
     */
    public UtmModule activateDeactivate(ModuleActivationDTO moduleActivationDTO) {
        final String ctx = CLASSNAME + ".activateDeactivate";

        long serverId = moduleActivationDTO.getServerId();
        ModuleName nameShort = moduleActivationDTO.getModuleName();
        boolean activationStatus = moduleActivationDTO.getActivationStatus();

        return moduleRepository.findByServerIdAndModuleName(serverId, nameShort)
                .map(module -> {
                    module.setModuleActive(activationStatus);
                    module = moduleRepository.save(module);

                    if (!activationStatus)
                        moduleGroupRepository.deleteAllByModuleId(module.getId());

                    enableDisableModuleMenus(nameShort, activationStatus);
                    enableDisableModuleIndexPatterns(nameShort, activationStatus);
                    enableDisableModuleFilter(nameShort, activationStatus);

                    return module;
                })
                .orElseThrow(() -> new NoSuchElementException(
                        String.format("Definition of the module %1$s not found for the server ID %2$s", nameShort.name(), serverId)
                ));
    }

    private void enableDisableModuleMenus(ModuleName nameShort, Boolean activationStatus) {
        final String ctx = CLASSNAME + ".enableDisableModuleMenus";
        try {
            List<UtmMenu> menus = menuService.findAllByModuleNameShort(nameShort.name());

            if (CollectionUtils.isEmpty(menus))
                return;

            Integer moduleInstancesActives = moduleRepository.countAllByModuleNameAndModuleActiveIsTrue(nameShort);

            if ((!activationStatus && moduleInstancesActives > 0) || (activationStatus && moduleInstancesActives > 1))
                return;

            menus.forEach(menu -> menu.setMenuActive(activationStatus));
            menuService.saveAll(menus);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    private void enableDisableModuleIndexPatterns(ModuleName nameShort, Boolean activationStatus) {
        final String ctx = CLASSNAME + ".enableDisableModuleIndexPatterns";
        try {
            List<UtmIndexPattern> patterns = indexPatternService.findAllByPatternModule(nameShort.name());

            if (CollectionUtils.isEmpty(patterns))
                return;

            Integer moduleInstancesActives = moduleRepository.countAllByModuleNameAndModuleActiveIsTrue(nameShort);

            if ((!activationStatus && moduleInstancesActives > 0) || (activationStatus && moduleInstancesActives > 1))
                return;

            patterns.forEach(pattern -> pattern.setActive(activationStatus));
            indexPatternService.saveAll(patterns);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    private void enableDisableModuleFilter(ModuleName nameShort, Boolean activationStatus) {
        final String ctx = CLASSNAME + ".enableDisableModuleFilter";
        try {
            List<UtmLogstashFilter> filters = logstashFilterService.findAllByModuleName(nameShort.name());

            if (!CollectionUtils.isEmpty(filters)) {
                Integer moduleInstancesActives = moduleRepository.countAllByModuleNameAndModuleActiveIsTrue(nameShort);

                if ((!activationStatus && moduleInstancesActives > 0) || (activationStatus && moduleInstancesActives > 1))
                    return;

                filters.forEach(filter -> {
                    filter.setActive(activationStatus);
                    filter.setUpdatedAt(Instant.now());
                });
                logstashFilterService.saveAll(filters);
            } else {
                return;
            }

        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * Gets all distinct categories from de application modules
     *
     * @return A list of string with all module categories
     * @throws Exception In case of any error
     */
    public List<String> getModuleCategories(Long serverId) {
        final String ctx = CLASSNAME + ".getModuleCategories";
        try {
            return moduleRepository.findModuleCategories(serverId);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * Get all the utmModules.
     *
     * @param pageable the pagination information
     * @return the list of entities
     */
    @Transactional(readOnly = true)
    public Page<UtmModule> findAll(Pageable pageable) {
        log.debug("Request to get all UtmModules");
        return moduleRepository.findAll(pageable);
    }


    /**
     * Get one utmModule by id.
     *
     * @param id the id of the entity
     * @return the entity
     */
    @Transactional(readOnly = true)
    public Optional<UtmModule> findOne(Long id) {
        log.debug("Request to get UtmModule : {}", id);
        return moduleRepository.findById(id);
    }

    public UtmModule findByServerIdAndModuleName(Long serverId, ModuleName shortName) {
        final String ctx = CLASSNAME + ".findByServerIdAndModuleName";

        return moduleRepository.findByServerIdAndModuleName(serverId, shortName)
                .orElseThrow(() -> new NoSuchElementException(
                        String.format("%s: The module %s not found for the server ID %s", ctx, shortName.name(), serverId)
                ));

    }

    public boolean isModuleActive(ModuleName shortName) {
        final String ctx = CLASSNAME + ".isModuleActive";
        try {
            return moduleRepository.countAllByModuleNameAndModuleActiveIsTrue(shortName) > 0;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }
}
