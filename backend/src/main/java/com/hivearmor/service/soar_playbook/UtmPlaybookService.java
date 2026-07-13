package com.hivearmor.service.soar_playbook;

import com.hivearmor.domain.soar_playbook.UtmPlaybook;
import com.hivearmor.repository.soar_playbook.UtmPlaybookRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional
public class UtmPlaybookService {

    private static final String CLASSNAME = "UtmPlaybookService";
    private final Logger log = LoggerFactory.getLogger(UtmPlaybookService.class);

    private final UtmPlaybookRepository playbookRepository;

    public UtmPlaybook save(UtmPlaybook playbook, boolean isCreate) {
        final String ctx = CLASSNAME + ".save";
        try {
            if (!isCreate) {
                UtmPlaybook current = playbookRepository.findById(playbook.getId())
                        .orElseThrow(() -> new RuntimeException(
                                String.format("Playbook with ID: %1$s not found", playbook.getId())));
                current.setName(playbook.getName());
                current.setDescription(playbook.getDescription());
                current.setDefinitionJson(playbook.getDefinitionJson());
                current.setIsActive(playbook.getIsActive());
                current.setSystemOwner(playbook.getSystemOwner());
                return playbookRepository.save(current);
            }
            return playbookRepository.save(playbook);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    @Transactional(readOnly = true)
    public Optional<UtmPlaybook> findOne(Long id) {
        final String ctx = CLASSNAME + ".findOne";
        try {
            return playbookRepository.findById(id);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<UtmPlaybook> findAll() {
        final String ctx = CLASSNAME + ".findAll";
        try {
            return playbookRepository.findAllByIsActiveTrueOrderByLastModifiedDateDesc();
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    public void delete(Long id) {
        final String ctx = CLASSNAME + ".delete";
        try {
            playbookRepository.deleteById(id);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }
}
