package com.hivearmor.service.soc_ai;

import com.google.gson.Gson;
import com.hivearmor.config.Constants;
import com.hivearmor.service.dto.soc_ai.ChatRequest;
import okhttp3.*;
import okio.BufferedSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Service
public class SocAiChatService {

    private static final String CLASSNAME = "SocAiChatService";
    private static final String CHAT_PATH = "/api/v1/chat";

    private final Logger log = LoggerFactory.getLogger(SocAiChatService.class);
    private final String socAiBaseUrl;
    private final OkHttpClient httpClient;
    private final Gson gson = new Gson();

    // Dedicated thread pool so we don't block Tomcat request threads
    private final ExecutorService executor = Executors.newCachedThreadPool();

    public SocAiChatService() {
        this.socAiBaseUrl = System.getenv("SOC_AI_BASE_URL");
        // Long timeouts — chat streams can take up to 2 min
        this.httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build();
    }

    /**
     * Forwards a chat request to the soc-ai plugin and streams SSE deltas back
     * through the provided SseEmitter. The emitter is completed/failed on the
     * executor thread; callers should return the emitter immediately.
     */
    public void streamChat(ChatRequest chatRequest, SseEmitter emitter) {
        executor.submit(() -> {
            try {
                doStreamChat(chatRequest, emitter);
            } catch (Exception e) {
                log.error(CLASSNAME + ".streamChat: " + e.getMessage());
                try {
                    emitter.send(SseEmitter.event()
                        .data(Map.of("error", "AI assistant unavailable: " + e.getMessage(), "done", true)));
                } catch (IOException ignored) {
                    // Client already disconnected
                }
                emitter.completeWithError(e);
            }
        });
    }

    private void doStreamChat(ChatRequest chatRequest, SseEmitter emitter) throws IOException {
        String baseUrl = socAiBaseUrl;
        if (!StringUtils.hasText(baseUrl)) {
            throw new RuntimeException("SOC_AI_BASE_URL is not configured");
        }

        String internalKey = System.getenv(Constants.ENV_INTERNAL_KEY);
        if (!StringUtils.hasText(internalKey)) {
            throw new RuntimeException("INTERNAL_KEY is not configured");
        }

        // Always request streaming from the plugin
        Map<String, Object> body = new HashMap<>();
        body.put("messages", chatRequest.getMessages());
        body.put("stream", true);
        if (chatRequest.getContext() != null) {
            body.put("context", chatRequest.getContext());
        }

        RequestBody requestBody = RequestBody.create(
            gson.toJson(body),
            MediaType.parse("application/json; charset=utf-8")
        );

        Request request = new Request.Builder()
            .url(baseUrl + CHAT_PATH)
            .post(requestBody)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-Internal-Key", internalKey)
            .addHeader("Accept", "text/event-stream")
            .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                String errBody = response.body() != null ? response.body().string() : "";
                throw new RuntimeException("Plugin returned " + response.code() + ": " + errBody);
            }

            ResponseBody responseBody = response.body();
            if (responseBody == null) {
                throw new RuntimeException("Plugin returned empty response body");
            }

            BufferedSource source = responseBody.source();
            while (!source.exhausted()) {
                String line = source.readUtf8Line();
                if (line == null) break;
                if (!line.startsWith("data:")) continue;

                String data = line.substring("data:".length()).trim();
                if (data.isEmpty()) continue;

                // Forward the raw JSON payload as an SSE event to the browser
                emitter.send(SseEmitter.event().data(data));

                // If the plugin signalled done, stop reading
                if (data.contains("\"done\":true")) break;
            }
        }

        emitter.complete();
    }
}
