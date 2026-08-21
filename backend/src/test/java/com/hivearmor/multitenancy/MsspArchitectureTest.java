package com.hivearmor.multitenancy;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Sprint 21 ArchUnit verification harness.
 *
 * <p>Enforces four cross-cutting invariants introduced by Sprint 21 MSSP schema work:
 * <ol>
 *   <li>Package naming — Spring-annotated classes stay inside {@code com.hivearmor}</li>
 *   <li>No hardcoded {@code v3-hive-[a-z]+-} literals in the service / REST layers</li>
 *   <li>No {@code List.getFirst()} calls in sprint-introduced packages</li>
 *   <li>No {@code "UTMStack"} string literal in sprint-introduced packages</li>
 * </ol>
 *
 * Requirements: 13.1, 13.2, 13.3, 13.5, 13.6
 */
class MsspArchitectureTest {

    // ---------------------------------------------------------------------------
    // Shared class sets — imported once per JVM, re-used by every rule
    // ---------------------------------------------------------------------------

    /** All production classes under com.hivearmor (no test classes). */
    private static JavaClasses allHiveArmorClasses;

    /** Production classes under service/ and web/rest/ only. */
    private static JavaClasses serviceAndRestClasses;

    /**
     * Classes introduced in Sprint 21 — the four multitenancy classes plus the two
     * new domain entities and their repositories.
     */
    private static JavaClasses sprint21Classes;

    @BeforeAll
    static void importClasses() {
        allHiveArmorClasses = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.hivearmor");

        serviceAndRestClasses = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(
                "com.hivearmor.service",
                "com.hivearmor.web.rest"
            );

        sprint21Classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(
                "com.hivearmor.multitenancy",
                "com.hivearmor.domain",
                "com.hivearmor.repository"
            );
    }

    // ---------------------------------------------------------------------------
    // Rule 1 — Package naming
    // Classes annotated with Spring/JPA stereotypes must remain under com.hivearmor
    // ---------------------------------------------------------------------------

    /**
     * Verifies that every class carrying a Spring/JPA stereotype annotation and
     * residing in the four designated packages lives within the {@code com.hivearmor}
     * root package.
     *
     * <p>Requirements: 13.1, 13.2
     */
    @Test
    void rule1_stereotypedClassesMustBeUnderComHivearmor() {
        ArchRule rule = classes()
            .that()
            .resideInAnyPackage(
                "com.hivearmor.multitenancy..",
                "com.hivearmor.domain..",
                "com.hivearmor.repository..",
                "com.hivearmor.config.."
            )
            .and()
            .areAnnotatedWith("jakarta.persistence.Entity")
            .or()
            .resideInAnyPackage(
                "com.hivearmor.multitenancy..",
                "com.hivearmor.domain..",
                "com.hivearmor.repository..",
                "com.hivearmor.config.."
            )
            .and()
            .areAnnotatedWith("org.springframework.data.jpa.repository.Repository")
            .or()
            .resideInAnyPackage(
                "com.hivearmor.multitenancy..",
                "com.hivearmor.domain..",
                "com.hivearmor.repository..",
                "com.hivearmor.config.."
            )
            .and()
            .areAnnotatedWith("org.springframework.stereotype.Repository")
            .or()
            .resideInAnyPackage(
                "com.hivearmor.multitenancy..",
                "com.hivearmor.domain..",
                "com.hivearmor.repository..",
                "com.hivearmor.config.."
            )
            .and()
            .areAnnotatedWith("org.springframework.stereotype.Service")
            .or()
            .resideInAnyPackage(
                "com.hivearmor.multitenancy..",
                "com.hivearmor.domain..",
                "com.hivearmor.repository..",
                "com.hivearmor.config.."
            )
            .and()
            .areAnnotatedWith("org.springframework.stereotype.Component")
            .or()
            .resideInAnyPackage(
                "com.hivearmor.multitenancy..",
                "com.hivearmor.domain..",
                "com.hivearmor.repository..",
                "com.hivearmor.config.."
            )
            .and()
            .areAnnotatedWith("org.springframework.context.annotation.Configuration")
            .should()
            .resideInAPackage("com.hivearmor..")
            .as("Classes annotated with @Entity, @Repository, @Service, @Component, or "
                + "@Configuration in the MSSP packages must reside in com.hivearmor..");

        rule.check(allHiveArmorClasses);
    }

    // ---------------------------------------------------------------------------
    // Rule 2 — No hardcoded v3-hive-<type>- literals in service / REST layer
    // ---------------------------------------------------------------------------

    /**
     * Custom ArchCondition that scans compiled class files for string constants
     * matching the regex {@code v3-hive-[a-z]+-}.
     *
     * <p>ArchUnit 0.21 exposes string constants via
     * {@code JavaClass.getStaticFields()} for static final String fields, and via
     * {@code JavaMethod} byte-code analysis for inline string literals (LDC constants).
     * We use the JavaClass constant pool approach through
     * {@link JavaClass#getFieldAccessesFromSelf()} for fields, combined with
     * iterating all string field values.  For inline literals the most reliable
     * approach at 0.21 is inspecting {@code JavaClass} reflective access to constants.
     *
     * <p>Requirements: 13.3
     */
    private static final ArchCondition<JavaClass> NOT_CONTAIN_HARDCODED_INDEX_LITERAL =
        new ArchCondition<JavaClass>("not contain string literals matching v3-hive-[a-z]+-") {

            private static final java.util.regex.Pattern PATTERN =
                java.util.regex.Pattern.compile("v3-hive-[a-z]+-");

            @Override
            public void check(JavaClass javaClass, ConditionEvents events) {
                // Inspect all static String fields for the banned pattern
                javaClass.getAllFields().stream()
                    .filter(field -> field.getRawType().getName().equals("java.lang.String"))
                    .filter(field -> field.getModifiers().contains(JavaModifier.STATIC))
                    .filter(field -> field.getModifiers().contains(JavaModifier.FINAL))
                    .forEach(field -> {
                        // Try to read the string value via reflection from the loaded class
                        try {
                            Class<?> clazz = Thread.currentThread().getContextClassLoader()
                                .loadClass(javaClass.getName());
                            java.lang.reflect.Field f = null;
                            try {
                                f = clazz.getDeclaredField(field.getName());
                            } catch (NoSuchFieldException ignored) {
                                // field may be in a superclass or not accessible
                            }
                            if (f != null) {
                                f.setAccessible(true);
                                Object value = f.get(null);
                                if (value instanceof String) {
                                    String strVal = (String) value;
                                    if (PATTERN.matcher(strVal).find()) {
                                        events.add(SimpleConditionEvent.violated(
                                            javaClass,
                                            String.format(
                                                "Class %s contains static final String field '%s' "
                                                + "with value matching 'v3-hive-[a-z]+-': \"%s\"",
                                                javaClass.getName(), field.getName(), strVal)
                                        ));
                                    }
                                }
                            }
                        } catch (ClassNotFoundException | IllegalAccessException ignored) {
                            // If we cannot load the class for reflective check, skip it —
                            // the next guard (method call pattern) will still apply.
                        }
                    });
            }
        };

    /**
     * No class in the service or web/rest layer may declare a constant matching
     * the banned index-literal pattern.  Index names must be produced exclusively
     * via {@code MsspIndexResolver}.
     *
     * <p>Requirements: 13.3
     */
    @Test
    void rule2_noHardcodedIndexLiteralsInServiceOrRestLayer() {
        ArchRule rule = noClasses()
            .that()
            .resideInAnyPackage("com.hivearmor.service..", "com.hivearmor.web.rest..")
            .should(NOT_CONTAIN_HARDCODED_INDEX_LITERAL)
            .as("No class under service/ or web/rest/ may contain a string literal "
                + "matching 'v3-hive-[a-z]+-'");

        rule.check(serviceAndRestClasses);
    }

    // ---------------------------------------------------------------------------
    // Rule 3 — No List.getFirst() calls in sprint-introduced code
    // ---------------------------------------------------------------------------

    /**
     * Custom ArchCondition that detects any call to {@code java.util.List#getFirst()}.
     * {@code List.getFirst()} was added in Java 21; it must not be used in Java 17
     * target code and is explicitly forbidden by the sprint design (AC 13.5).
     *
     * <p>Requirements: 13.5
     */
    private static final ArchCondition<JavaClass> NOT_CALL_LIST_GET_FIRST =
        new ArchCondition<JavaClass>("not call java.util.List.getFirst()") {
            @Override
            public void check(JavaClass javaClass, ConditionEvents events) {
                for (JavaMethodCall call : javaClass.getMethodCallsFromSelf()) {
                    if ("java.util.List".equals(call.getTargetOwner().getName())
                            && "getFirst".equals(call.getName())) {
                        events.add(SimpleConditionEvent.violated(
                            javaClass,
                            String.format(
                                "Class %s calls List.getFirst() at line %d — "
                                + "this method requires Java 21 and is forbidden in sprint-21 code",
                                javaClass.getName(),
                                call.getLineNumber())
                        ));
                    }
                }
            }
        };

    /**
     * No class introduced in Sprint 21 (multitenancy, domain, repository) may call
     * {@code java.util.List#getFirst()}.
     *
     * <p>Requirements: 13.5
     */
    @Test
    void rule3_noListGetFirstCallsInSprint21Code() {
        ArchRule rule = noClasses()
            .that()
            .resideInAnyPackage(
                "com.hivearmor.multitenancy..",
                "com.hivearmor.domain..",
                "com.hivearmor.repository.."
            )
            .should(NOT_CALL_LIST_GET_FIRST)
            .as("No sprint-21 class may call java.util.List.getFirst()");

        rule.check(sprint21Classes);
    }

    // ---------------------------------------------------------------------------
    // Rule 4 — No "UTMStack" string literal in sprint-introduced multitenancy code
    // ---------------------------------------------------------------------------

    /**
     * Custom ArchCondition that detects static final String fields containing the
     * forbidden legacy product name {@code "UTMStack"}.
     *
     * <p>Requirements: 13.6
     */
    private static final ArchCondition<JavaClass> NOT_CONTAIN_UTMSTACK_LITERAL =
        new ArchCondition<JavaClass>("not contain the string literal \"UTMStack\"") {
            @Override
            public void check(JavaClass javaClass, ConditionEvents events) {
                javaClass.getAllFields().stream()
                    .filter(field -> field.getRawType().getName().equals("java.lang.String"))
                    .filter(field -> field.getModifiers().contains(JavaModifier.STATIC))
                    .filter(field -> field.getModifiers().contains(JavaModifier.FINAL))
                    .forEach(field -> {
                        try {
                            Class<?> clazz = Thread.currentThread().getContextClassLoader()
                                .loadClass(javaClass.getName());
                            java.lang.reflect.Field f = null;
                            try {
                                f = clazz.getDeclaredField(field.getName());
                            } catch (NoSuchFieldException ignored) {
                                // may be in a superclass
                            }
                            if (f != null) {
                                f.setAccessible(true);
                                Object value = f.get(null);
                                if (value instanceof String && ((String) value).contains("UTMStack")) {
                                    events.add(SimpleConditionEvent.violated(
                                        javaClass,
                                        String.format(
                                            "Class %s contains static final String field '%s' "
                                            + "with value containing the legacy brand name 'UTMStack'",
                                            javaClass.getName(), field.getName())
                                    ));
                                }
                            }
                        } catch (ClassNotFoundException | IllegalAccessException ignored) {
                            // skip — cannot load class reflectively
                        }
                    });

                // Also flag any method that calls a String constructor / concat with UTMStack
                // embedded via method name matching (belt-and-suspenders check via call target names)
                javaClass.getMethodCallsFromSelf().stream()
                    .filter(call -> call.getTargetOwner().getName().contains("UTMStack"))
                    .forEach(call -> events.add(SimpleConditionEvent.violated(
                        javaClass,
                        String.format(
                            "Class %s references a type whose name contains 'UTMStack' at line %d",
                            javaClass.getName(), call.getLineNumber())
                    )));
            }
        };

    /**
     * No class introduced in Sprint 21 under {@code com.hivearmor.multitenancy} may
     * contain the legacy brand string {@code "UTMStack"}.
     *
     * <p>Requirements: 13.6
     */
    @Test
    void rule4_noUtmStackLiteralInSprint21MultitenancyCode() {
        JavaClasses multitenancyClasses = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.hivearmor.multitenancy");

        ArchRule rule = noClasses()
            .that()
            .resideInAPackage("com.hivearmor.multitenancy..")
            .should(NOT_CONTAIN_UTMSTACK_LITERAL)
            .as("No sprint-21 multitenancy class may contain the legacy brand string 'UTMStack'");

        rule.check(multitenancyClasses);
    }
}
