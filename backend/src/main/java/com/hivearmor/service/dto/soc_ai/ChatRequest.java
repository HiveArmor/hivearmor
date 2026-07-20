package com.hivearmor.service.dto.soc_ai;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public class ChatRequest {

    @NotEmpty
    private List<ChatMessageDTO> messages;

    private ChatContextDTO context;

    public List<ChatMessageDTO> getMessages() { return messages; }
    public void setMessages(List<ChatMessageDTO> messages) { this.messages = messages; }

    public ChatContextDTO getContext() { return context; }
    public void setContext(ChatContextDTO context) { this.context = context; }

    // ── Nested types ──────────────────────────────────────────────────────────

    public static class ChatMessageDTO {
        private String role;
        private String content;

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }

    public static class ChatContextDTO {
        private String currentAlertId;
        private String currentIncidentId;
        private String timeRange;

        public String getCurrentAlertId() { return currentAlertId; }
        public void setCurrentAlertId(String currentAlertId) { this.currentAlertId = currentAlertId; }

        public String getCurrentIncidentId() { return currentIncidentId; }
        public void setCurrentIncidentId(String currentIncidentId) { this.currentIncidentId = currentIncidentId; }

        public String getTimeRange() { return timeRange; }
        public void setTimeRange(String timeRange) { this.timeRange = timeRange; }
    }
}
