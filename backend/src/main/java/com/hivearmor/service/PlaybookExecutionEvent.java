package com.hivearmor.service;

/**
 * Represents a single SSE event emitted during playbook execution.
 *
 * <p>Event types:
 * <ul>
 *   <li>{@code step_started}     — a step has begun executing</li>
 *   <li>{@code step_completed}   — a step finished successfully</li>
 *   <li>{@code step_failed}      — a step finished with an error</li>
 *   <li>{@code playbook_completed} — all steps finished successfully</li>
 *   <li>{@code playbook_failed}  — the playbook was cancelled or a fatal error occurred</li>
 * </ul>
 *
 * <p>Playbook-level events ({@code playbook_completed}, {@code playbook_failed}) have
 * {@code stepIndex}, {@code stepLabel}, and {@code stepType} set to {@code null}.
 * The {@code errorMessage} field is populated only on {@code *_failed} events.
 *
 * <p>No Lombok — all accessors are explicit public methods.
 */
public class PlaybookExecutionEvent {

    /**
     * Event type. One of:
     * {@code "step_started"}, {@code "step_completed"}, {@code "step_failed"},
     * {@code "playbook_completed"}, {@code "playbook_failed"}.
     */
    private String type;

    /**
     * Zero-based index of the step that this event relates to.
     * {@code null} for playbook-level events ({@code playbook_completed} / {@code playbook_failed}).
     */
    private Integer stepIndex;

    /** Human-readable label of the step. {@code null} for playbook-level events. */
    private String stepLabel;

    /**
     * Step type identifier (e.g. {@code "action"}, {@code "condition"}, {@code "delay"},
     * {@code "loop"}). {@code null} for playbook-level events.
     */
    private String stepType;

    /**
     * Step output produced by the action handler.
     * Present on {@code step_completed} events; {@code null} otherwise.
     */
    private Object output;

    /**
     * Human-readable error description.
     * Populated only on {@code step_failed} and {@code playbook_failed} events.
     * MUST NOT carry verbatim exception messages or internal stack traces in production.
     */
    private String errorMessage;

    /**
     * ISO 8601 timestamp at which this event was generated,
     * e.g. {@code "2026-07-25T14:22:04.123Z"}.
     */
    private String timestamp;

    // ── Getters ──────────────────────────────────────────────────────────────

    public String getType() {
        return type;
    }

    public Integer getStepIndex() {
        return stepIndex;
    }

    public String getStepLabel() {
        return stepLabel;
    }

    public String getStepType() {
        return stepType;
    }

    public Object getOutput() {
        return output;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public String getTimestamp() {
        return timestamp;
    }

    // ── Setters ──────────────────────────────────────────────────────────────

    public void setType(String type) {
        this.type = type;
    }

    public void setStepIndex(Integer stepIndex) {
        this.stepIndex = stepIndex;
    }

    public void setStepLabel(String stepLabel) {
        this.stepLabel = stepLabel;
    }

    public void setStepType(String stepType) {
        this.stepType = stepType;
    }

    public void setOutput(Object output) {
        this.output = output;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }
}
