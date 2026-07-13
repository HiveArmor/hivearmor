package com.hivearmor.userauditor.service.interfaces;

import com.hivearmor.userauditor.model.UserSource;
import com.hivearmor.userauditor.model.event.Event;
import com.hivearmor.userauditor.service.type.SourceType;

import java.util.List;
import java.util.Map;

public interface Source {
    Map<String, List<Event>> findUsers(UserSource userSource) throws Exception;
    SourceType getType();
}
