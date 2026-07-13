package com.hivearmor.util;

import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.generator.BeforeExecutionGenerator;
import org.hibernate.generator.EventType;
import org.hibernate.generator.EventTypeSets;
import org.hibernate.id.IdentifierGeneratorHelper;
import org.hibernate.persister.entity.EntityPersister;

import java.util.EnumSet;
import java.util.Objects;

/**
 * Custom identity generator that reuses an existing entity ID if one is already set,
 * otherwise falls back to letting the database generate it via an identity column.
 *
 * Phase 6b: Hibernate 6 removed the old IdentityGenerator.generate(session, object) override.
 * Now implements BeforeExecutionGenerator to check for existing IDs before insert.
 *
 * Usage:
 *   @GenericGenerator(name = "CustomIdentityGenerator",
 *       type = com.hivearmor.util.CustomIdentityGenerator.class)
 *   @GeneratedValue(generator = "CustomIdentityGenerator")
 *   private Long id;
 */
public class CustomIdentityGenerator implements BeforeExecutionGenerator {

    @Override
    public EnumSet<EventType> getEventTypes() {
        return EventTypeSets.INSERT_ONLY;
    }

    @Override
    public Object generate(SharedSessionContractImplementor session,
                           Object owner,
                           Object currentValue,
                           EventType eventType) {
        // If the entity already has an ID set, reuse it
        EntityPersister persister = session.getEntityPersister(null, owner);
        Object existingId = persister.getIdentifier(owner, session);
        if (existingId != null && !Objects.equals(existingId, 0L) && !Objects.equals(existingId, 0)) {
            return existingId;
        }
        // Otherwise return null — the DB identity column will assign the ID
        return null;
    }
}
