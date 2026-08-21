package com.hivearmor.domain.rulegen;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * JPA entity for the {@code ha_alert_signal} table.
 *
 * <p>Stores one row per analyst signal recording whether an alert was
 * a true positive or false positive. The unique constraint on
 * {@code (alert_id, signal_type)} ensures at-most-one signal per
 * alert-type combination (idempotent recording).
 *
 * @see com.hivearmor.domain.rulegen.HaAlertSignal.SignalType
 */
@Entity
@Table(name = "ha_alert_signal",
       uniqueConstraints = @UniqueConstraint(
           name = "uk_ha_alert_signal_alert_type",
           columnNames = {"alert_id", "signal_type"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HaAlertSignal implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "alert_id", nullable = false, length = 64)
    private String alertId;

    @Enumerated(EnumType.STRING)
    @Column(name = "signal_type", nullable = false, length = 32)
    private SignalType signalType;

    @Column(name = "alert_name", length = 255)
    private String alertName;

    @Column(name = "data_type", length = 64)
    private String dataType;

    @Column(name = "severity")
    private Integer severity;

    @Column(name = "recorded_by", length = 128)
    private String recordedBy;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    // ---- equals / hashCode on id ----

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof HaAlertSignal)) return false;
        HaAlertSignal other = (HaAlertSignal) o;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public String toString() {
        return "HaAlertSignal{" +
            "id=" + id +
            ", alertId='" + alertId + '\'' +
            ", signalType=" + signalType +
            ", alertName='" + alertName + '\'' +
            ", dataType='" + dataType + '\'' +
            ", severity=" + severity +
            ", recordedBy='" + recordedBy + '\'' +
            ", recordedAt=" + recordedAt +
            '}';
    }

    // ---- nested enum ----

    /**
     * Type of analyst signal — whether an alert was confirmed as a true positive
     * or dismissed as a false positive.
     */
    public enum SignalType {
        TRUE_POSITIVE,
        FALSE_POSITIVE
    }
}
