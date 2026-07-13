package com.hivearmor.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SigmaImportResultDTO {
    private int imported;
    private int skipped;
    private List<String> skippedReasons;
}
