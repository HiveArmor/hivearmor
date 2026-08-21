package com.hivearmor.service.llm.event;

import org.springframework.context.ApplicationEvent;

public class LlmConfigChangedEvent extends ApplicationEvent {
    public LlmConfigChangedEvent(Object source) {
        super(source);
    }
}
