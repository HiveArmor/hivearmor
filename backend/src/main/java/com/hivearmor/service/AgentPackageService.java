package com.hivearmor.service;

import com.hivearmor.service.dto.AgentPackageDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Resolves allowlisted agent installer binaries from mounted update directories.
 *
 * <p>Filenames are a fixed catalog. Path traversal is rejected before any filesystem
 * lookup. Missing files are a 404 at the resource layer, not an error.
 */
@Service
public class AgentPackageService {

    private static final Logger log = LoggerFactory.getLogger(AgentPackageService.class);

    public static final List<String> ALLOWED_FILENAMES = List.of(
        "hivearmor_agent_service_linux_amd64",
        "hivearmor_agent_service_linux_arm64",
        "hivearmor_agent_service_darwin_amd64",
        "hivearmor_agent_service_darwin_arm64",
        "hivearmor_agent_service_windows_amd64.exe",
        "hivearmor_agent_service_windows_arm64.exe"
    );

    private final List<Path> directories;

    public AgentPackageService(
        @Value("${hivearmor.agent-packages.directories:/dependencies/agent,/updates/agent}")
        String directoriesCsv
    ) {
        List<Path> resolved = new ArrayList<>();
        for (String entry : directoriesCsv.split(",")) {
            String trimmed = entry.trim();
            if (!trimmed.isEmpty()) {
                resolved.add(Path.of(trimmed));
            }
        }
        this.directories = List.copyOf(resolved);
    }

    public boolean isAllowedFilename(String filename) {
        return filename != null
            && ALLOWED_FILENAMES.contains(filename)
            && filename.indexOf('/') < 0
            && filename.indexOf('\\') < 0;
    }

    public Optional<Path> resolveExistingFile(String filename) {
        if (!isAllowedFilename(filename)) {
            return Optional.empty();
        }
        for (Path directory : directories) {
            Path candidate = directory.resolve(filename).normalize();
            Path base = directory.toAbsolutePath().normalize();
            if (!candidate.toAbsolutePath().normalize().startsWith(base)) {
                continue;
            }
            if (Files.isRegularFile(candidate) && Files.isReadable(candidate)) {
                return Optional.of(candidate);
            }
        }
        return Optional.empty();
    }

    public List<AgentPackageDTO> catalog() {
        List<AgentPackageDTO> items = new ArrayList<>();
        for (String filename : ALLOWED_FILENAMES) {
            Optional<Path> file = resolveExistingFile(filename);
            Long size = null;
            if (file.isPresent()) {
                try {
                    size = Files.size(file.get());
                } catch (IOException ex) {
                    log.debug("Agent package size unavailable for {}: {}", filename, ex.toString());
                }
            }
            items.add(new AgentPackageDTO(
                filename,
                "/agent-packages/" + filename,
                file.isPresent(),
                size
            ));
        }
        return List.copyOf(items);
    }
}
