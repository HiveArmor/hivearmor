package com.hivearmor.service.admin.event;

/**
 * Spring application event published by HaSystemSettingsController immediately after
 * a successful {@code PUT /api/ha-admin/settings/ai} request.
 *
 * <p>Exactly one instance is published per successful AI-settings update (Req 2.2).
 * Listeners must be idempotent — Spring's synchronous event dispatch guarantees the
 * listener runs on the same thread before the controller returns the response.
 *
 * @param source the object that published this event (typically the controller
 *               instance); never {@code null} — matches the {@link Object} contract
 *               expected by {@link org.springframework.context.ApplicationEvent}.
 */
public record LlmConfigChangedEvent(Object source) {
}
