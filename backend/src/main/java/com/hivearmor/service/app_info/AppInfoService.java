package com.hivearmor.service.app_info;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.dto.app_info.AppInfoDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;

import static com.hivearmor.config.Constants.APP_VERSION_FILE;

@Service
@Slf4j
public class AppInfoService {

    private static final String CLASSNAME = "AppInfoService";

    public AppInfoDto loadVersionInfo() {
        final String ctx = "loadVersionInfo";
        try {
            ObjectMapper mapper = new ObjectMapper();
            return mapper.readValue(new File(APP_VERSION_FILE), AppInfoDto.class);
        } catch (IOException e) {
            log.error("{}: An error occurred while reading the version file: {}", CLASSNAME + "." + ctx, e.getMessage(), e);
            throw new RuntimeException("An error occurred while reading the version file");
        }

    }
}

