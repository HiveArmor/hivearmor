package com.hivearmor.service.intelligence;

import com.hivearmor.service.dto.intelligence.IntelligenceFactDTO;
import com.hivearmor.service.dto.intelligence.IntelligenceInferenceDTO;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Parses SOC AI free-text answers into facts vs inferences when structured sections exist.
 * Falls back to a single inference line when no structure is detected.
 */
public final class IntelligenceFindingParser {

    private static final Pattern SECTION_FACTS =
        Pattern.compile("(?is)(?:^|\\n)\\s*(?:facts?|observations?)\\s*:\\s*\\n?");
    private static final Pattern SECTION_INFERENCE =
        Pattern.compile("(?is)(?:^|\\n)\\s*(?:inferences?|analysis|assessment)\\s*:\\s*\\n?");
    private static final Pattern SECTION_CONTRADICTIONS =
        Pattern.compile("(?is)(?:^|\\n)\\s*(?:contradictions?|conflicts?)\\s*:\\s*\\n?");
    private static final Pattern SECTION_GAPS =
        Pattern.compile("(?is)(?:^|\\n)\\s*(?:missing evidence|evidence gaps?|gaps?)\\s*:\\s*\\n?");

    private IntelligenceFindingParser() {}

    public record ParsedFinding(
        List<IntelligenceFactDTO> facts,
        List<IntelligenceInferenceDTO> inferences,
        List<IntelligenceInferenceDTO> contradictions,
        List<String> missingEvidence,
        String summary
    ) {}

    public static ParsedFinding parse(String answer) {
        if (answer == null || answer.isBlank()) {
            return new ParsedFinding(List.of(), List.of(), List.of(), List.of(), "");
        }

        String normalized = answer.trim();
        SectionSplit split = splitSections(normalized);

        List<IntelligenceFactDTO> facts = toFacts(split.factsBlock());
        List<IntelligenceInferenceDTO> inferences = toInferences(split.inferenceBlock(), false);
        List<IntelligenceInferenceDTO> contradictions = toInferences(split.contradictionBlock(), true);
        List<String> gaps = toGaps(split.gapBlock());

        if (facts.isEmpty() && inferences.isEmpty() && contradictions.isEmpty() && gaps.isEmpty()) {
            inferences = List.of(new IntelligenceInferenceDTO(null, normalized, null));
        }

        String summary = facts.isEmpty() ? firstLine(normalized) : facts.get(0).text();
        return new ParsedFinding(facts, inferences, contradictions, gaps, summary);
    }

    private record SectionSplit(String factsBlock, String inferenceBlock, String contradictionBlock, String gapBlock) {}

    private static SectionSplit splitSections(String text) {
        int factsStart = indexAfter(SECTION_FACTS, text, 0);
        int inferenceStart = indexAfter(SECTION_INFERENCE, text, 0);
        int contradictionStart = indexAfter(SECTION_CONTRADICTIONS, text, 0);
        int gapStart = indexAfter(SECTION_GAPS, text, 0);

        List<Marker> markers = new ArrayList<>();
        if (factsStart >= 0) markers.add(new Marker(factsStart, "facts"));
        if (inferenceStart >= 0) markers.add(new Marker(inferenceStart, "inference"));
        if (contradictionStart >= 0) markers.add(new Marker(contradictionStart, "contradiction"));
        if (gapStart >= 0) markers.add(new Marker(gapStart, "gap"));
        markers.sort((a, b) -> Integer.compare(a.start(), b.start()));

        String factsBlock = "";
        String inferenceBlock = "";
        String contradictionBlock = "";
        String gapBlock = "";

        for (int i = 0; i < markers.size(); i++) {
            Marker marker = markers.get(i);
            int end = i + 1 < markers.size() ? markers.get(i + 1).start() : text.length();
            String block = text.substring(marker.start(), end).trim();
            switch (marker.kind()) {
                case "facts" -> factsBlock = block;
                case "inference" -> inferenceBlock = block;
                case "contradiction" -> contradictionBlock = block;
                case "gap" -> gapBlock = block;
                default -> { /* no-op */ }
            }
        }

        return new SectionSplit(factsBlock, inferenceBlock, contradictionBlock, gapBlock);
    }

    private record Marker(int start, String kind) {}

    private static int indexAfter(Pattern pattern, String text, int from) {
        var matcher = pattern.matcher(text);
        if (matcher.find(from)) {
            return matcher.end();
        }
        return -1;
    }

    private static List<IntelligenceFactDTO> toFacts(String block) {
        return bulletLines(block).stream()
            .map(line -> new IntelligenceFactDTO(null, line, null))
            .toList();
    }

    private static List<IntelligenceInferenceDTO> toInferences(String block, boolean contradiction) {
        return bulletLines(block).stream()
            .map(line -> new IntelligenceInferenceDTO(null, line, contradiction ? 0.5 : null))
            .toList();
    }

    private static List<String> toGaps(String block) {
        return bulletLines(block);
    }

    private static List<String> bulletLines(String block) {
        if (block == null || block.isBlank()) {
            return List.of();
        }
        List<String> lines = new ArrayList<>();
        for (String raw : block.split("\\R")) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            line = line.replaceFirst("^[-*•]\\s+", "");
            line = line.replaceFirst("^\\d+\\.\\s+", "");
            if (!line.isBlank()) {
                lines.add(line);
            }
        }
        return lines;
    }

    private static String firstLine(String text) {
        int newline = text.indexOf('\n');
        String line = newline >= 0 ? text.substring(0, newline) : text;
        return line.trim();
    }
}
