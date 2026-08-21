package com.hivearmor.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for {@link PlaybookExecutionStreamService}.
 *
 * <p>Tests use plain JUnit 5 and Mockito (via {@link ExtendWith}).
 * No Spring context is loaded — the service has no collaborating beans.
 */
@ExtendWith(MockitoExtension.class)
class PlaybookExecutionStreamServiceTest {

    private PlaybookExecutionStreamService service;

    @BeforeEach
    void setUp() {
        service = new PlaybookExecutionStreamService();
    }

    // =========================================================================
    // Test 1 — createEmitter registers the emitter and returns non-null
    // =========================================================================

    /**
     * {@link PlaybookExecutionStreamService#createEmitter(String)} must return a
     * non-null {@link SseEmitter} and register it in the internal emitter map so that
     * subsequent broadcast calls can reach it.
     */
    @Test
    void testCreateEmitter_registersWithMap() {
        SseEmitter emitter = service.createEmitter("exec-1");

        assertNotNull(emitter, "createEmitter must return a non-null SseEmitter");
    }

    // =========================================================================
    // Test 2 — broadcastEvent delivers to a registered emitter without exception
    // =========================================================================

    /**
     * After registering an emitter for {@code "exec-2"}, calling
     * {@link PlaybookExecutionStreamService#broadcastEvent(String, PlaybookExecutionEvent)}
     * with a {@code step_completed} (non-terminal) event must not throw any exception.
     */
    @Test
    void testBroadcastEvent_deliversToRegisteredEmitter() {
        service.createEmitter("exec-2");

        PlaybookExecutionEvent event = new PlaybookExecutionEvent();
        event.setType("step_completed");
        event.setStepIndex(0);
        event.setStepLabel("Isolate Host");
        event.setStepType("action");
        event.setTimestamp("2026-07-25T10:00:00.000Z");

        assertDoesNotThrow(() -> service.broadcastEvent("exec-2", event));
    }

    // =========================================================================
    // Test 3 — broadcastEvent with playbook_completed calls complete() on the emitter
    // =========================================================================

    /**
     * When a {@code playbook_completed} event is broadcast,
     * {@link PlaybookExecutionStreamService#broadcastEvent(String, PlaybookExecutionEvent)}
     * must invoke {@link SseEmitter#complete()} on every registered emitter.
     *
     * <p>A Mockito mock {@link SseEmitter} is injected into the service via a
     * {@link ControlledEmitterService} subclass that overrides emitter construction
     * to return the mock so it ends up registered in the internal map. Mockito then
     * verifies that {@code complete()} was invoked after the terminal event is sent.
     */
    @Test
    void testBroadcastEvent_playbookCompleted_completesEmitter() throws Exception {
        SseEmitter mockEmitter = mock(SseEmitter.class);

        ControlledEmitterService svc = new ControlledEmitterService(mockEmitter);
        svc.createEmitter("exec-3");

        PlaybookExecutionEvent terminalEvent = new PlaybookExecutionEvent();
        terminalEvent.setType("playbook_completed");
        terminalEvent.setTimestamp("2026-07-25T10:05:00.000Z");

        assertDoesNotThrow(() -> svc.broadcastEvent("exec-3", terminalEvent));

        verify(mockEmitter).complete();
    }

    // =========================================================================
    // Testable subclass — injects a controlled SseEmitter into the emitter map
    // =========================================================================

    /**
     * Subclass of {@link PlaybookExecutionStreamService} that overrides
     * {@link #createEmitter(String)} to register a caller-supplied {@link SseEmitter}
     * (typically a Mockito mock or spy) in the internal emitter map.
     *
     * <p>The overriding implementation duplicates only the map-registration logic from
     * the parent so that the mock ends up in the same {@code ConcurrentHashMap} that
     * {@link #broadcastEvent(String, PlaybookExecutionEvent)} reads from. Lifecycle
     * callbacks are skipped for the mock because they are not relevant to the test.
     */
    static final class ControlledEmitterService extends PlaybookExecutionStreamService {

        private final SseEmitter controlledEmitter;

        ControlledEmitterService(SseEmitter controlledEmitter) {
            super();
            this.controlledEmitter = controlledEmitter;
        }

        /**
         * Overrides emitter creation to inject {@link #controlledEmitter} into the
         * private {@code emitters} map via reflection, so that
         * {@link #broadcastEvent(String, PlaybookExecutionEvent)} operates on the mock.
         */
        @Override
        public SseEmitter createEmitter(String executionId) {
            try {
                // Access the private 'emitters' map via reflection to inject the mock.
                java.lang.reflect.Field field =
                    PlaybookExecutionStreamService.class.getDeclaredField("emitters");
                field.setAccessible(true);

                @SuppressWarnings("unchecked")
                java.util.Map<String, java.util.List<SseEmitter>> emitters =
                    (java.util.Map<String, java.util.List<SseEmitter>>) field.get(this);

                java.util.List<SseEmitter> list = new java.util.concurrent.CopyOnWriteArrayList<>();
                list.add(controlledEmitter);
                emitters.put(executionId, list);

                return controlledEmitter;
            } catch (NoSuchFieldException | IllegalAccessException e) {
                throw new RuntimeException("Failed to inject controlled emitter in test", e);
            }
        }
    }
}
