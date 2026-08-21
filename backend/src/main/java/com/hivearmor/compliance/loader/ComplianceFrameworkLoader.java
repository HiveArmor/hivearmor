package com.hivearmor.compliance.loader;

import com.hivearmor.domain.compliance.UtmComplianceControlConfig;
import com.hivearmor.domain.compliance.UtmComplianceStandard;
import com.hivearmor.domain.compliance.UtmComplianceStandardSection;
import com.hivearmor.domain.compliance.enums.ComplianceStrategy;
import com.hivearmor.repository.compliance.UtmComplianceControlConfigRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardSectionRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

/**
 * Scans classpath:compliance/*.yml at startup, parses each YAML pack
 * with SnakeYAML, and upserts frameworks into the relational compliance schema.
 *
 * <p>Running init() N times produces the same database state as running it once
 * (idempotent). Every loader-created row has strategy=QUERY and system_owner=true.
 * Control names are normalized to [10, 200] characters.
 */
@Component
public class ComplianceFrameworkLoader {

    private static final Logger log = LoggerFactory.getLogger(ComplianceFrameworkLoader.class);
    private static final String PAD_SUFFIX = " (pad)";
    private static final int MIN_NAME_LENGTH = 10;
    private static final int MAX_NAME_LENGTH = 200;

    private final UtmComplianceStandardRepository standardRepo;
    private final UtmComplianceStandardSectionRepository sectionRepo;
    private final UtmComplianceControlConfigRepository controlRepo;

    private int parseErrorCount;

    public ComplianceFrameworkLoader(
            UtmComplianceStandardRepository standardRepo,
            UtmComplianceStandardSectionRepository sectionRepo,
            UtmComplianceControlConfigRepository controlRepo) {
        this.standardRepo = standardRepo;
        this.sectionRepo = sectionRepo;
        this.controlRepo = controlRepo;
    }

    @PostConstruct
    @Transactional
    public void init() {
        parseErrorCount = 0;
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        try {
            Resource[] resources = resolver.getResources("classpath:compliance/*.yml");
            for (Resource resource : resources) {
                try {
                    CompliancePackDescriptor pack = parsePack(resource);
                    if (pack == null || pack.getFramework() == null
                            || pack.getFramework().get("id") == null) {
                        log.warn("Skipping compliance pack [{}]: missing required framework.id",
                                resource.getFilename());
                        parseErrorCount++;
                        continue;
                    }
                    upsertPack(pack);
                } catch (Exception e) {
                    log.warn("Failed to parse compliance pack [{}]: {}",
                            resource.getFilename(), e.getMessage());
                    parseErrorCount++;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to scan classpath:compliance/*.yml: {}", e.getMessage());
        }
        if (parseErrorCount > 0) {
            log.warn("ComplianceFrameworkLoader completed with {} parse error(s)", parseErrorCount);
        } else {
            log.info("ComplianceFrameworkLoader completed successfully");
        }
    }

    public int getParseErrorCount() {
        return parseErrorCount;
    }

    CompliancePackDescriptor parsePack(Resource yaml) throws Exception {
        Yaml snakeYaml = new Yaml();
        try (InputStream is = yaml.getInputStream()) {
            return snakeYaml.loadAs(is, CompliancePackDescriptor.class);
        }
    }

    void upsertPack(CompliancePackDescriptor pack) {
        Map<String, Object> fw = pack.getFramework();
        String frameworkName = (String) fw.get("name");
        String frameworkDesc = fw.containsKey("description")
                ? (String) fw.get("description") : "";

        // Upsert standard
        UtmComplianceStandard standard = standardRepo.findByStandardName(frameworkName)
                .orElseGet(UtmComplianceStandard::new);
        standard.setStandardName(frameworkName);
        standard.setStandardDescription(frameworkDesc.trim());
        standard.setSystemOwner(true);
        standard = standardRepo.save(standard);

        // Upsert sections and controls
        List<CompliancePackDescriptor.FamilyDescriptor> families = pack.getFamilies();
        if (families == null) {
            return;
        }

        for (CompliancePackDescriptor.FamilyDescriptor family : families) {
            UtmComplianceStandardSection section = sectionRepo
                    .findByStandardIdAndStandardSectionName(standard.getId(), family.getName())
                    .orElseGet(UtmComplianceStandardSection::new);
            section.setStandardId(standard.getId());
            section.setStandardSectionName(family.getName());
            section.setStandardSectionDescription(
                    family.getName() + " (" + family.getId() + ")");
            section = sectionRepo.save(section);

            List<CompliancePackDescriptor.ControlDescriptor> controls = family.getControls();
            if (controls == null) {
                continue;
            }
            for (CompliancePackDescriptor.ControlDescriptor ctrl : controls) {
                String normalizedName = normalizeControlName(ctrl.getName());
                UtmComplianceControlConfig config = controlRepo
                        .findByStandardSectionIdAndControlName(
                                section.getId(), normalizedName)
                        .orElseGet(UtmComplianceControlConfig::new);
                config.setStandardSectionId(section.getId());
                config.setControlName(normalizedName);
                config.setControlStrategy(ComplianceStrategy.QUERY);
                controlRepo.save(config);
            }
        }
    }

    /**
     * Normalizes a control name to be within [10, 200] characters.
     * Names shorter than 10 chars are right-padded with " (pad)" repeated, then truncated to 10.
     * Names longer than 200 chars are truncated to 200.
     */
    String normalizeControlName(String rawName) {
        if (rawName == null) {
            rawName = "";
        }
        rawName = rawName.trim();
        if (rawName.length() < MIN_NAME_LENGTH) {
            StringBuilder sb = new StringBuilder(rawName);
            while (sb.length() < MIN_NAME_LENGTH) {
                sb.append(PAD_SUFFIX);
            }
            return sb.substring(0, MIN_NAME_LENGTH);
        }
        if (rawName.length() > MAX_NAME_LENGTH) {
            return rawName.substring(0, MAX_NAME_LENGTH);
        }
        return rawName;
    }
}
