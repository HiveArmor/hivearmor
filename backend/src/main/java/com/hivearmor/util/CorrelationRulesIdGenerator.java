package com.hivearmor.util;

import org.hibernate.HibernateException;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.generator.BeforeExecutionGenerator;
import org.hibernate.generator.EventType;
import org.hibernate.generator.EventTypeSets;
import org.hibernate.persister.entity.EntityPersister;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.EnumSet;
import java.util.Objects;

public class CorrelationRulesIdGenerator implements BeforeExecutionGenerator {

    @Override
    public EnumSet<EventType> getEventTypes() {
        return EventTypeSets.INSERT_ONLY;
    }

    @Override
    public Object generate(SharedSessionContractImplementor session,
                           Object owner,
                           Object currentValue,
                           EventType eventType) {
        EntityPersister persister = session.getEntityPersister(null, owner);
        Object existingId = persister.getIdentifier(owner, session);
        if (existingId != null && !Objects.equals(existingId, 0L) && !Objects.equals(existingId, 0)) {
            return existingId;
        }
        try {
            Connection conn = session.getJdbcConnectionAccess().obtainConnection();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT nextval('hive_correlation_rules_id_seq')");
                 ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getLong(1);
                }
                throw new HibernateException("No result from sequence hive_correlation_rules_id_seq");
            } finally {
                session.getJdbcConnectionAccess().releaseConnection(conn);
            }
        } catch (SQLException e) {
            throw new HibernateException("Could not obtain next value from hive_correlation_rules_id_seq", e);
        }
    }
}
