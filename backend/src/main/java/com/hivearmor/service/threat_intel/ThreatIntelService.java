package com.hivearmor.service.threat_intel;

import com.hivearmor.domain.threat_intel.UtmIocIndicator;
import com.hivearmor.domain.threat_intel.UtmThreatFeed;
import com.hivearmor.repository.threat_intel.UtmIocIndicatorRepository;
import com.hivearmor.repository.threat_intel.UtmThreatFeedRepository;
import com.hivearmor.service.dto.threat_intel.IocResultDTO;
import com.hivearmor.service.dto.threat_intel.ThreatFeedDTO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class ThreatIntelService {

    private final UtmIocIndicatorRepository iocRepo;
    private final UtmThreatFeedRepository feedRepo;

    public ThreatIntelService(UtmIocIndicatorRepository iocRepo, UtmThreatFeedRepository feedRepo) {
        this.iocRepo = iocRepo;
        this.feedRepo = feedRepo;
    }

    @Transactional(readOnly = true)
    public Optional<IocResultDTO> lookupIoc(String value) {
        return iocRepo.findByValue(value).map(IocResultDTO::from);
    }

    @Transactional(readOnly = true)
    public List<ThreatFeedDTO> listFeeds() {
        return feedRepo.findAll().stream()
            .map(ThreatFeedDTO::new)
            .collect(Collectors.toList());
    }

    public ThreatFeedDTO toggleFeed(String id, boolean enabled) {
        UtmThreatFeed feed = feedRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Feed not found: " + id));
        feed.setEnabled(enabled);
        feed.setStatus(enabled ? "active" : "paused");
        return new ThreatFeedDTO(feedRepo.save(feed));
    }

    public ThreatFeedDTO syncFeed(String id) {
        UtmThreatFeed feed = feedRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Feed not found: " + id));
        // Record that sync was triggered; real ingestion would happen async
        feed.setLastUpdated(Instant.now());
        feed.setStatus("active");
        return new ThreatFeedDTO(feedRepo.save(feed));
    }

    public IocResultDTO ingestIoc(UtmIocIndicator indicator) {
        indicator.setCreatedAt(Instant.now());
        indicator.setUpdatedAt(Instant.now());
        return IocResultDTO.from(iocRepo.save(indicator));
    }
}
