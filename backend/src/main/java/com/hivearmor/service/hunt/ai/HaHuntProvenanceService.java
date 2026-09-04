package com.hivearmor.service.hunt.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.hivearmor.service.hunt.HaHuntService;
import com.hivearmor.web.rest.hunt.dto.HuntFieldDefinitionDTO;
import com.hivearmor.web.rest.hunt.ai.dto.HuntFieldProvenanceDTO;

/**
 * Hunt AI — field provenance for the "show AI's hand" lens (HUNT-AI-CONTRACT §4, BACKEND-SCOPE §1c).
 *
 * <p>Deterministic, NO LLM. Classifies each field the hunt schema projects as {@code raw} (straight
 * off the normalized log), {@code enrichment} (added by the enrich stage — geo lookup, threat-intel),
 * or {@code model} (a model-derived score). The map is derived from the LIVE schema so it stays in
 * sync as fields are added, and it is honest: only fields the enrichment/model stages actually
 * produce are marked non-raw. Today the hunt projection surfaces geo as the one enrichment field;
 * risk/model scores are not yet projected into hunt results, so none are falsely marked "model".
 */
@Service
public class HaHuntProvenanceService {

    /** Field-name prefix → (origin, agent). Longest-prefix-ish match wins in insertion order. */
    private static final Map<String, String[]> ENRICHMENT_PREFIXES = Map.of(
        "source.geo", new String[]{"enrichment", "geo-enrichment"},
        "destination.geo", new String[]{"enrichment", "geo-enrichment"},
        "threat.", new String[]{"enrichment", "threat-intel"},
        "threatintel.", new String[]{"enrichment", "threat-intel"},
        "risk.", new String[]{"model", "hunt-triage"},
        "ml.", new String[]{"model", "hunt-triage"}
    );

    private final HaHuntService huntService;

    public HaHuntProvenanceService(HaHuntService huntService) {
        this.huntService = huntService;
    }

    /** Provenance for every field the hunt schema currently projects. */
    public List<HuntFieldProvenanceDTO> fieldProvenance() {
        List<HuntFieldProvenanceDTO> out = new ArrayList<>();
        for (HuntFieldDefinitionDTO def : huntService.getSchemaFields()) {
            out.add(classify(def.getName()));
        }
        return out;
    }

    private HuntFieldProvenanceDTO classify(String field) {
        if (field == null) {
            return HuntFieldProvenanceDTO.raw("");
        }
        for (Map.Entry<String, String[]> e : ENRICHMENT_PREFIXES.entrySet()) {
            if (field.startsWith(e.getKey())) {
                return HuntFieldProvenanceDTO.of(field, e.getValue()[0], e.getValue()[1]);
            }
        }
        return HuntFieldProvenanceDTO.raw(field);
    }
}
