package com.hivearmor.service.telemetry;

import com.hivearmor.service.dto.vuln.VulnRemediationConnectorDTO;

import java.util.List;

public final class VulnRemediationCatalog {

    private VulnRemediationCatalog() {
    }

    public static List<VulnRemediationConnectorDTO> connectors() {
        String note = "Not configured. HiveArmor will not invent a patch job.";
        return List.of(
                new VulnRemediationConnectorDTO("apt", "APT / Debian package update", "os-package", "not_configured", note),
                new VulnRemediationConnectorDTO("wua", "Windows Update Agent", "os-package", "not_configured", note),
                new VulnRemediationConnectorDTO("ansible", "Ansible playbook", "orchestration", "not_configured", note)
        );
    }
}
