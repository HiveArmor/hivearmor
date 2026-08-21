package com.hivearmor.service;

import com.hivearmor.service.dto.AgentPackageDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class AgentPackageServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void catalogMarksPublishedBinariesAvailable() throws Exception {
        Path published = tempDir.resolve("hivearmor_agent_service_linux_amd64");
        Files.writeString(published, "agent-bytes");
        AgentPackageService service = new AgentPackageService(tempDir.toString());

        List<AgentPackageDTO> catalog = service.catalog();
        AgentPackageDTO linux = catalog.stream()
            .filter(item -> "hivearmor_agent_service_linux_amd64".equals(item.getFilename()))
            .findFirst()
            .orElseThrow();
        AgentPackageDTO windows = catalog.stream()
            .filter(item -> "hivearmor_agent_service_windows_amd64.exe".equals(item.getFilename()))
            .findFirst()
            .orElseThrow();

        assertThat(catalog).hasSize(AgentPackageService.ALLOWED_FILENAMES.size());
        assertThat(linux.isAvailable()).isTrue();
        assertThat(linux.getSizeBytes()).isEqualTo(11L);
        assertThat(linux.getHref()).isEqualTo("/agent-packages/hivearmor_agent_service_linux_amd64");
        assertThat(windows.isAvailable()).isFalse();
        assertThat(service.resolveExistingFile("hivearmor_agent_service_linux_amd64")).contains(published);
    }

    @Test
    void rejectsNamesOutsideTheAllowList() {
        AgentPackageService service = new AgentPackageService(tempDir.toString());
        assertThat(service.isAllowedFilename("../hivearmor_agent_service_linux_amd64")).isFalse();
        assertThat(service.isAllowedFilename("hivearmor_agent_service_linux_amd64/../../passwd")).isFalse();
        assertThat(service.resolveExistingFile("not-an-agent")).isEqualTo(Optional.empty());
    }
}
