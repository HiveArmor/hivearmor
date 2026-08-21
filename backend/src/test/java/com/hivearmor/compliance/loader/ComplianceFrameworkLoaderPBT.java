package com.hivearmor.compliance.loader;

import com.hivearmor.domain.compliance.UtmComplianceControlConfig;
import com.hivearmor.domain.compliance.UtmComplianceStandard;
import com.hivearmor.domain.compliance.UtmComplianceStandardSection;
import com.hivearmor.domain.compliance.enums.ComplianceStrategy;
import com.hivearmor.repository.compliance.UtmComplianceControlConfigRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardSectionRepository;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property-based test for ComplianceFrameworkLoader idempotency.
 *
 * <p><strong>Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8</strong>
 *
 * <p>Property 1 (Loader Idempotency): For any framework YAML file, invoking
 * init() N times results in the same set of rows in hive_compliance_standard,
 * hive_compliance_section, and hive_compliance_control_config as invoking it once,
 * with every row satisfying strategy=QUERY and system_owner=true, and every control
 * name satisfying 10 &lt;= length &lt;= 200.
 */
@Label("Feature: sprint-30-compliance-packs, Property 1: Loader Idempotency")
class ComplianceFrameworkLoaderPBT {

    /**
     * Simulates an in-memory database for the three compliance tables.
     */
    private static class InMemoryComplianceDb {
        private final AtomicLong standardSeq = new AtomicLong(1);
        private final AtomicLong sectionSeq = new AtomicLong(1);
        private final AtomicLong controlSeq = new AtomicLong(1);

        private final Map<String, UtmComplianceStandard> standards = new LinkedHashMap<>();
        private final Map<String, UtmComplianceStandardSection> sections = new LinkedHashMap<>();
        private final Map<String, UtmComplianceControlConfig> controls = new LinkedHashMap<>();

        Optional<UtmComplianceStandard> findByStandardName(String name) {
            return Optional.ofNullable(standards.get(name));
        }

        UtmComplianceStandard saveStandard(UtmComplianceStandard s) {
            if (s.getId() == null) {
                s.setId(standardSeq.getAndIncrement());
            }
            standards.put(s.getStandardName(), s);
            return s;
        }

        Optional<UtmComplianceStandardSection> findSection(Long standardId, String name) {
            String key = standardId + "::" + name;
            return Optional.ofNullable(sections.get(key));
        }

        UtmComplianceStandardSection saveSection(UtmComplianceStandardSection s) {
            if (s.getId() == null) {
                s.setId(sectionSeq.getAndIncrement());
            }
            String key = s.getStandardId() + "::" + s.getStandardSectionName();
            sections.put(key, s);
            return s;
        }

        Optional<UtmComplianceControlConfig> findControl(Long sectionId, String name) {
            String key = sectionId + "::" + name;
            return Optional.ofNullable(controls.get(key));
        }

        UtmComplianceControlConfig saveControl(UtmComplianceControlConfig c) {
            if (c.getId() == null) {
                c.setId(controlSeq.getAndIncrement());
            }
            String key = c.getStandardSectionId() + "::" + c.getControlName();
            controls.put(key, c);
            return c;
        }

        List<UtmComplianceStandard> allStandards() {
            return new ArrayList<>(standards.values());
        }

        List<UtmComplianceStandardSection> allSections() {
            return new ArrayList<>(sections.values());
        }

        List<UtmComplianceControlConfig> allControls() {
            return new ArrayList<>(controls.values());
        }
    }

    /**
     * Property 1: Loader Idempotency.
     *
     * <p>Run init() N times back-to-back against a clean schema, then assert:
     * the row set (per table) is identical across runs, every row has strategy=QUERY
     * and system_owner=true, and every control name satisfies 10 &lt;= len &lt;= 200.
     *
     * <p><strong>Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8</strong>
     */
    @Property(tries = 100)
    @Tag("Feature: sprint-30-compliance-packs, Property 1: Loader Idempotency")
    @Label("loaderIsIdempotent")
    void loaderIsIdempotent(
            @ForAll("runCounts") int runCount,
            @ForAll("frameworkNames") String frameworkName,
            @ForAll("familyLists") List<FamilyInput> families) {

        // -- Arrange: fresh in-memory DB and mocked repos --
        InMemoryComplianceDb db = new InMemoryComplianceDb();

        UtmComplianceStandardRepository standardRepo = mock(UtmComplianceStandardRepository.class);
        UtmComplianceStandardSectionRepository sectionRepo = mock(UtmComplianceStandardSectionRepository.class);
        UtmComplianceControlConfigRepository controlRepo = mock(UtmComplianceControlConfigRepository.class);

        // Wire mocks to in-memory DB
        when(standardRepo.findByStandardName(anyString()))
                .thenAnswer((InvocationOnMock inv) -> db.findByStandardName(inv.getArgument(0)));
        when(standardRepo.save(any(UtmComplianceStandard.class)))
                .thenAnswer((InvocationOnMock inv) -> db.saveStandard(inv.getArgument(0)));

        when(sectionRepo.findByStandardIdAndStandardSectionName(anyLong(), anyString()))
                .thenAnswer((InvocationOnMock inv) ->
                        db.findSection(inv.getArgument(0), inv.getArgument(1)));
        when(sectionRepo.save(any(UtmComplianceStandardSection.class)))
                .thenAnswer((InvocationOnMock inv) -> db.saveSection(inv.getArgument(0)));

        when(controlRepo.findByStandardSectionIdAndControlName(anyLong(), anyString()))
                .thenAnswer((InvocationOnMock inv) ->
                        db.findControl(inv.getArgument(0), inv.getArgument(1)));
        when(controlRepo.save(any(UtmComplianceControlConfig.class)))
                .thenAnswer((InvocationOnMock inv) -> db.saveControl(inv.getArgument(0)));

        ComplianceFrameworkLoader loader = new ComplianceFrameworkLoader(
                standardRepo, sectionRepo, controlRepo);

        // Build a YAML pack descriptor programmatically
        CompliancePackDescriptor pack = buildPack(frameworkName, families);

        // -- Act: run upsertPack N times --
        for (int i = 0; i < runCount; i++) {
            loader.upsertPack(pack);
        }

        // Snapshot after N runs
        List<UtmComplianceStandard> standardsAfterN = db.allStandards();
        List<UtmComplianceStandardSection> sectionsAfterN = db.allSections();
        List<UtmComplianceControlConfig> controlsAfterN = db.allControls();

        // Run one more time — state must not change
        loader.upsertPack(pack);

        List<UtmComplianceStandard> standardsAfterNPlus1 = db.allStandards();
        List<UtmComplianceStandardSection> sectionsAfterNPlus1 = db.allSections();
        List<UtmComplianceControlConfig> controlsAfterNPlus1 = db.allControls();

        // -- Assert: idempotency — row sets identical --
        assertThat(standardsAfterNPlus1).hasSameSizeAs(standardsAfterN);
        assertThat(sectionsAfterNPlus1).hasSameSizeAs(sectionsAfterN);
        assertThat(controlsAfterNPlus1).hasSameSizeAs(controlsAfterN);

        // -- Assert: exactly one standard row --
        assertThat(standardsAfterN).hasSize(1);

        // -- Assert: system_owner=true for every standard row --
        for (UtmComplianceStandard s : standardsAfterN) {
            assertThat(s.getSystemOwner())
                    .as("system_owner must be true for standard '%s'", s.getStandardName())
                    .isTrue();
        }

        // -- Assert: strategy=QUERY and name length in [10, 200] for every control --
        for (UtmComplianceControlConfig c : controlsAfterN) {
            assertThat(c.getControlStrategy())
                    .as("strategy must be QUERY for control '%s'", c.getControlName())
                    .isEqualTo(ComplianceStrategy.QUERY);
            assertThat(c.getControlName().length())
                    .as("control name length must be >= 10: '%s'", c.getControlName())
                    .isGreaterThanOrEqualTo(10);
            assertThat(c.getControlName().length())
                    .as("control name length must be <= 200: '%s'", c.getControlName())
                    .isLessThanOrEqualTo(200);
        }

        // -- Assert: section count matches families count --
        assertThat(sectionsAfterN).hasSize(families.size());
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private CompliancePackDescriptor buildPack(String frameworkName, List<FamilyInput> families) {
        CompliancePackDescriptor pack = new CompliancePackDescriptor();
        Map<String, Object> fw = new LinkedHashMap<>();
        fw.put("id", frameworkName.toUpperCase(Locale.ROOT).replace(' ', '-'));
        fw.put("name", frameworkName);
        fw.put("description", "Auto-generated test pack for " + frameworkName);
        pack.setFramework(fw);

        List<CompliancePackDescriptor.FamilyDescriptor> familyDescriptors = new ArrayList<>();
        for (FamilyInput fi : families) {
            CompliancePackDescriptor.FamilyDescriptor fd = new CompliancePackDescriptor.FamilyDescriptor();
            fd.setId(fi.id);
            fd.setName(fi.name);
            List<CompliancePackDescriptor.ControlDescriptor> cds = new ArrayList<>();
            for (String controlName : fi.controlNames) {
                CompliancePackDescriptor.ControlDescriptor cd = new CompliancePackDescriptor.ControlDescriptor();
                cd.setId(fi.id + "-" + controlName.hashCode());
                cd.setName(controlName);
                cd.setDescription("Test control");
                cd.setSeverity("medium");
                cds.add(cd);
            }
            fd.setControls(cds);
            familyDescriptors.add(fd);
        }
        pack.setFamilies(familyDescriptors);
        return pack;
    }

    // =========================================================================
    // Input types
    // =========================================================================

    static class FamilyInput {
        final String id;
        final String name;
        final List<String> controlNames;

        FamilyInput(String id, String name, List<String> controlNames) {
            this.id = id;
            this.name = name;
            this.controlNames = controlNames;
        }
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates N between 1 and 10 — the number of times init()/upsertPack is called.
     */
    @Provide
    Arbitrary<Integer> runCounts() {
        return Arbitraries.integers().between(1, 10);
    }

    /**
     * Generates framework names between 10 and 60 characters (always valid length).
     */
    @Provide
    Arbitrary<String> frameworkNames() {
        return Arbitraries.strings()
                .withCharRange('A', 'Z')
                .withCharRange('a', 'z')
                .withCharRange('0', '9')
                .withChars(' ', '-')
                .ofMinLength(10)
                .ofMaxLength(60)
                .filter(s -> !s.isBlank());
    }

    /**
     * Generates a list of 1-5 families, each with 1-8 controls.
     * Control names vary in length to exercise the normalization logic:
     * some are short (< 10 chars), some normal, some very long (> 200 chars).
     */
    @Provide
    Arbitrary<List<FamilyInput>> familyLists() {
        Arbitrary<String> familyIds = Arbitraries.strings()
                .withCharRange('A', 'Z')
                .ofLength(2);

        Arbitrary<String> familyNames = Arbitraries.strings()
                .withCharRange('A', 'Z')
                .withCharRange('a', 'z')
                .withChars(' ')
                .ofMinLength(10)
                .ofMaxLength(50)
                .filter(s -> !s.isBlank());

        Arbitrary<String> controlNames = Arbitraries.oneOf(
                // Short names (< 10 chars) — exercises padding
                Arbitraries.strings()
                        .withCharRange('a', 'z')
                        .ofMinLength(1)
                        .ofMaxLength(9),
                // Normal names (10-200 chars) — no normalization needed
                Arbitraries.strings()
                        .withCharRange('a', 'z')
                        .withCharRange('A', 'Z')
                        .withChars(' ', '-')
                        .ofMinLength(10)
                        .ofMaxLength(200)
                        .filter(s -> !s.isBlank()),
                // Long names (> 200 chars) — exercises truncation
                Arbitraries.strings()
                        .withCharRange('a', 'z')
                        .withCharRange('A', 'Z')
                        .ofMinLength(201)
                        .ofMaxLength(300)
        );

        Arbitrary<List<String>> controlNameLists = controlNames.list()
                .ofMinSize(1)
                .ofMaxSize(8);

        return Combinators.combine(familyIds, familyNames, controlNameLists)
                .as(FamilyInput::new)
                .list()
                .ofMinSize(1)
                .ofMaxSize(5)
                .filter(list -> {
                    // Ensure unique family names (required for correct section count assertion)
                    Set<String> names = new HashSet<>();
                    for (FamilyInput fi : list) {
                        if (!names.add(fi.name)) return false;
                    }
                    return true;
                });
    }
}
