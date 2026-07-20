package com.hivearmor.service.search;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.hivearmor.config.Constants;
import com.hivearmor.config.TlsClientFactory;
import com.hivearmor.service.dto.search.NlQueryRequest;
import com.hivearmor.service.dto.search.NlQueryResultDTO;
import okhttp3.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Service
public class NlSearchService {

    private static final String CLASSNAME = "NlSearchService";
    private static final String NL_QUERY_ENDPOINT = "/api/v1/nl-to-query";

    private final Logger log = LoggerFactory.getLogger(NlSearchService.class);
    private final OkHttpClient httpClient;
    private final Gson gson = new Gson();
    private final String socAiBaseUrl;

    public NlSearchService() {
        this.httpClient = TlsClientFactory.buildOkHttpClient(10, 10, 90);
        this.socAiBaseUrl = System.getenv("SOC_AI_BASE_URL");
    }

    public NlQueryResultDTO translateQuery(NlQueryRequest request) {
        final String ctx = CLASSNAME + ".translateQuery";

        if (!StringUtils.hasText(socAiBaseUrl)) {
            throw new RuntimeException("SOC_AI_BASE_URL is not configured");
        }

        String internalKey = System.getenv(Constants.ENV_INTERNAL_KEY);
        if (!StringUtils.hasText(internalKey)) {
            throw new RuntimeException("INTERNAL_KEY is not configured");
        }

        String url = socAiBaseUrl + NL_QUERY_ENDPOINT;
        String bodyJson = gson.toJson(request);

        Request httpRequest = new Request.Builder()
            .url(url)
            .post(RequestBody.create(bodyJson, MediaType.parse("application/json; charset=utf-8")))
            .addHeader("Content-Type", "application/json")
            .addHeader("X-Internal-Key", internalKey)
            .build();

        try (Response response = httpClient.newCall(httpRequest).execute()) {
            String responseBody = response.body() != null ? response.body().string() : "";

            if (!response.isSuccessful()) {
                throw new RuntimeException("soc-ai plugin returned " + response.code() + ": " + responseBody);
            }

            return parsePluginResponse(responseBody);
        } catch (IOException e) {
            log.error("{}: {}", ctx, e.getMessage());
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    private NlQueryResultDTO parsePluginResponse(String json) {
        JsonObject root = gson.fromJson(json, JsonObject.class);

        NlQueryResultDTO dto = new NlQueryResultDTO();

        // Keep query as raw JSON string so Jackson @JsonRawValue re-serialises it unchanged
        if (root.has("query")) {
            dto.setQuery(root.get("query").toString());
        }
        if (root.has("explanation")) {
            dto.setExplanation(root.get("explanation").getAsString());
        }
        if (root.has("suggestedFilters") && root.get("suggestedFilters").isJsonArray()) {
            List<NlQueryResultDTO.SuggestedFilter> filters = new ArrayList<>();
            root.getAsJsonArray("suggestedFilters").forEach(el -> {
                JsonObject obj = el.getAsJsonObject();
                NlQueryResultDTO.SuggestedFilter f = new NlQueryResultDTO.SuggestedFilter();
                if (obj.has("field")) f.setField(obj.get("field").getAsString());
                if (obj.has("value")) f.setValue(obj.get("value").getAsString());
                if (obj.has("label")) f.setLabel(obj.get("label").getAsString());
                filters.add(f);
            });
            dto.setSuggestedFilters(filters);
        }
        return dto;
    }
}
