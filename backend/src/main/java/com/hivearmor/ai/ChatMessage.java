package com.hivearmor.ai;

/**
 * A single message in a chat conversation sent to the LLM.
 *
 * <p>Roles follow the OpenAI convention:
 * <ul>
 *   <li>{@code system} — developer-injected system prompt</li>
 *   <li>{@code user} — analyst-authored message</li>
 *   <li>{@code assistant} — LLM response</li>
 * </ul>
 */
public class ChatMessage {

    private final String role;
    private final String content;

    public ChatMessage(String role, String content) {
        this.role    = role;
        this.content = content;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    @Override
    public String toString() {
        return "ChatMessage{role='" + role + "', content=<" + (content == null ? "null" : content.length() + " chars") + ">}";
    }
}
