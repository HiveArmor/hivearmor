package com.hivearmor.service.impl.index_pattern;

import com.hivearmor.domain.index_pattern.UtmIndexPattern;
import com.hivearmor.repository.index_pattern.UtmIndexPatternRepository;
import com.hivearmor.service.index_pattern.UtmIndexPatternService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Service Implementation for managing UtmIndexPattern.
 */
@Service
@Transactional
public class UtmIndexPatternServiceImpl implements UtmIndexPatternService {

    private final Logger log = LoggerFactory.getLogger(UtmIndexPatternServiceImpl.class);
    private static final String CLASSNAME = "UtmIndexPatternServiceImpl";

    private final UtmIndexPatternRepository indexPatternRepository;

    public UtmIndexPatternServiceImpl(UtmIndexPatternRepository utmIndexPatternRepository) {
        this.indexPatternRepository = utmIndexPatternRepository;
    }



    /**
     * Save a utmIndexPattern.
     *
     * @param utmIndexPattern the entity to save
     * @return the persisted entity
     */
    @Override
    public UtmIndexPattern save(UtmIndexPattern utmIndexPattern) {
        log.debug("Request to save UtmIndexPattern : {}", utmIndexPattern);
        return indexPatternRepository.save(utmIndexPattern);
    }

    @Override
    public void saveAll(List<UtmIndexPattern> patterns) {
        indexPatternRepository.saveAll(patterns);
    }

    /**
     * Get all the utmIndexPatterns.
     *
     * @param pageable the pagination information
     * @return the list of entities
     */
    @Override
    @Transactional(readOnly = true)
    public Page<UtmIndexPattern> findAll(Pageable pageable) {
        log.debug("Request to get all UtmIndexPatterns");
        return indexPatternRepository.findAll(pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UtmIndexPattern> findAll() {
        return indexPatternRepository.findAll();
    }

    /**
     * Get one utmIndexPattern by id.
     *
     * @param id the id of the entity
     * @return the entity
     */
    @Override
    @Transactional(readOnly = true)
    public Optional<UtmIndexPattern> findOne(Long id) {
        log.debug("Request to get UtmIndexPattern : {}", id);
        return indexPatternRepository.findById(id);
    }

    /**
     * Delete the utmIndexPattern by id.
     *
     * @param id the id of the entity
     */
    @Override
    public void delete(Long id) {
        log.debug("Request to delete UtmIndexPattern : {}", id);
        indexPatternRepository.deleteById(id);
    }

    @Override
    public void deleteAllByPatternSystemIsTrueAndIdNotIn(List<Long> ids) {
        indexPatternRepository.deleteAllByPatternSystemIsTrueAndIdNotIn(ids);
    }

    public Long getSystemSequenceNextValue() {
        long value = 1;
        Optional<UtmIndexPattern> opt = indexPatternRepository.findFirstByPatternSystemIsTrueOrderByIdDesc();
        if (opt.isPresent())
            value = opt.get().getId() + 1;
        return value;
    }

    @Override
    public List<UtmIndexPattern> findAllByPatternModule(String nameShort) {
        return indexPatternRepository.findAllByPatternModule(nameShort);
    }
}
