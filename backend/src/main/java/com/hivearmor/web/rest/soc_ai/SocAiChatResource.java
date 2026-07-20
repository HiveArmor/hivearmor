package com.hivearmor.web.rest.soc_ai;

import com.hivearmor.service.dto.soc_ai.ChatRequest;
import com.hivearmor.service.soc_ai.SocAiChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/ha-ai")
@RequiredArgsConstructor
public class SocAiChatResource {

    private final SocAiChatService socAiChatService;

    /**
     * POST /api/ha-ai/chat — stream a conversational AI response via SSE.
     *
     * The client sends a JSON body with a messages array (OpenAI-style roles)
     * and optional context. The backend forwards it to the soc-ai plugin which
     * proxies the streaming LLM response back as "data: {json}\n\n" chunks.
     *
     * Each SSE payload is a JSON object with either:
     *   {"delta": "token text"}  — incremental text
     *   {"done": true}           — stream complete
     *   {"error": "msg", "done": true} — error from AI layer
     */
    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
    public SseEmitter chat(@RequestBody @Valid ChatRequest request) {
        SseEmitter emitter = new SseEmitter(120_000L); // 2 min timeout
        socAiChatService.streamChat(request, emitter);
        return emitter;
    }
}
