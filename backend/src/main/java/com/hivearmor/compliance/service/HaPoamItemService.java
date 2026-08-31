package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.PoamItemDTO;
import com.hivearmor.compliance.entity.HaPoamItem;
import com.hivearmor.repository.compliance.HaPoamItemRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

@Service
@Transactional(readOnly = true)
public class HaPoamItemService {

    private final HaPoamItemRepository poamItemRepository;
    private final Clock clock;

    public HaPoamItemService(HaPoamItemRepository poamItemRepository, Clock clock) {
        this.poamItemRepository = poamItemRepository;
        this.clock = clock;
    }

    public Page<PoamItemDTO> listByControlId(Long controlId, Pageable pageable) {
        String controlKey = String.valueOf(controlId);
        Page<HaPoamItem> page = poamItemRepository.findByControlId(controlKey, pageable);
        return page.map(item -> PoamItemDTO.from(item, clock));
    }
}
