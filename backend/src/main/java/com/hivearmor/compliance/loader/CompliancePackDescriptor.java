package com.hivearmor.compliance.loader;

import java.util.List;
import java.util.Map;

/**
 * POJO for SnakeYAML deserialization of compliance pack YAML files.
 */
public class CompliancePackDescriptor {

    private Map<String, Object> framework;
    private List<FamilyDescriptor> families;

    public Map<String, Object> getFramework() {
        return framework;
    }

    public void setFramework(Map<String, Object> framework) {
        this.framework = framework;
    }

    public List<FamilyDescriptor> getFamilies() {
        return families;
    }

    public void setFamilies(List<FamilyDescriptor> families) {
        this.families = families;
    }

    public static class FamilyDescriptor {
        private String id;
        private String name;
        private List<ControlDescriptor> controls;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public List<ControlDescriptor> getControls() { return controls; }
        public void setControls(List<ControlDescriptor> controls) {
            this.controls = controls;
        }
    }

    public static class ControlDescriptor {
        private String id;
        private String name;
        private String description;
        private String severity;
        private String nistRef;
        private String fedrampParameter;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getSeverity() { return severity; }
        public void setSeverity(String severity) { this.severity = severity; }
        public String getNistRef() { return nistRef; }
        public void setNistRef(String nistRef) { this.nistRef = nistRef; }
        public String getFedrampParameter() { return fedrampParameter; }
        public void setFedrampParameter(String fedrampParameter) {
            this.fedrampParameter = fedrampParameter;
        }
    }
}
