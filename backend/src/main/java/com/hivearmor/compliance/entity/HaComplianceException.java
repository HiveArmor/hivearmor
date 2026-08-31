package com.hivearmor.compliance.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/**
 * JPA entity mapped to the {@code ha_compliance_exception} table.
 * Represents a time-bound compensating-control exception for a catalog control.
 */
@Getter
@Setter
@Entity
@Table(name = "ha_compliance_exception")
public class HaComplianceException implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "control_id", nullable = false)
    private Long controlId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "reason", columnDefinition = "TEXT")
    private String reason;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "effective_from")
    private LocalDate effectiveFrom;

    @Column(name = "effective_until")
    private LocalDate effectiveUntil;

    @Column(name = "approver")
    private String approver;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
