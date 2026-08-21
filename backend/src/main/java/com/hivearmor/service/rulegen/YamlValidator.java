package com.hivearmor.service.rulegen;

import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;
import org.yaml.snakeyaml.error.YAMLException;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Validates YAML rule documents produced by the LLM against the required schema.
 *
 * <p>Uses {@link SafeConstructor} with default {@link LoaderOptions} to prevent
 * YAML deserialization attacks (no arbitrary class instantiation).
 *
 * <p>The required top-level keys are: {@code name}, {@code severity},
 * {@code dataTypes}, and {@code definition}. All must be present and non-null.
 */
public final class YamlValidator {

    /**
     * The set of top-level keys that every valid rule YAML document must contain.
     */
    public static final Set<String> REQUIRED_KEYS =
        Set.of("name", "severity", "dataTypes", "definition");

    private YamlValidator() {
        // Utility class — not instantiable
    }

    /**
     * Parses the given YAML string and validates that all required top-level keys
     * are present and non-null.
     *
     * @param yaml the raw YAML text to parse and validate
     * @return the parsed top-level map
     * @throws YamlValidationException if the YAML cannot be parsed, the root is not
     *                                  a mapping, or any required key is missing/null
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseAndValidate(String yaml) {
        if (yaml == null || yaml.isBlank()) {
            throw new YamlValidationException("YAML input is null or blank");
        }

        Map<String, Object> tree;
        try {
            Object loaded = new Yaml(new SafeConstructor(new LoaderOptions())).load(yaml);
            if (loaded == null) {
                throw new YamlValidationException("YAML root is empty (null document)");
            }
            if (!(loaded instanceof Map)) {
                throw new YamlValidationException(
                    "YAML root is not a mapping; got " + loaded.getClass().getSimpleName());
            }
            tree = (Map<String, Object>) loaded;
        } catch (YAMLException ye) {
            throw new YamlValidationException("YAML parse failed: " + ye.getMessage(), ye);
        }

        // Check for missing or null required keys
        Set<String> missing = new HashSet<>();
        for (String key : REQUIRED_KEYS) {
            if (!tree.containsKey(key) || tree.get(key) == null) {
                missing.add(key);
            }
        }
        if (!missing.isEmpty()) {
            throw new YamlValidationException(
                "Missing required YAML keys: " + missing, missing);
        }

        return tree;
    }
}
