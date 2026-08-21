package com.hivearmor.domain;

import jakarta.persistence.*;
import java.io.Serializable;

/**
 * JPA entity for the {@code ha_client} table.
 *
 * <p>Represents a HiveArmor managed tenant / customer record. The four MSSP
 * fields ({@code clientPrefix}, {@code msspManaged}, {@code maxUsers},
 * {@code licenceType}) were added in Sprint 21 changeset {@code 20260724050-1}.
 *
 * <p>Sprint 21 — MSSP foundation layer.
 *
 * @see com.hivearmor.repository.HaClientRepository
 */
@Entity
@Table(name = "ha_client")
public class HaClient implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name")
    private String name;

    // -------------------------------------------------------------------------
    // Sprint 21 — MSSP fields (changeset 20260724050-1)
    // -------------------------------------------------------------------------

    @Column(name = "client_prefix", length = 20)
    private String clientPrefix;

    @Column(name = "mssp_managed", nullable = false)
    private boolean msspManaged = false;

    @Column(name = "max_users")
    private Integer maxUsers = 50;

    @Column(name = "licence_type", length = 20)
    private String licenceType = "standard";

    // Sprint 23 — T04: contact email for tenant
    @Column(name = "contact_email", length = 254)
    private String contactEmail;

    // -------------------------------------------------------------------------
    // Getters and setters
    // -------------------------------------------------------------------------

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getClientPrefix() {
        return clientPrefix;
    }

    public void setClientPrefix(String clientPrefix) {
        this.clientPrefix = clientPrefix;
    }

    public boolean isMsspManaged() {
        return msspManaged;
    }

    public void setMsspManaged(boolean msspManaged) {
        this.msspManaged = msspManaged;
    }

    public Integer getMaxUsers() {
        return maxUsers;
    }

    public void setMaxUsers(Integer maxUsers) {
        this.maxUsers = maxUsers;
    }

    public String getLicenceType() {
        return licenceType;
    }

    public void setLicenceType(String licenceType) {
        this.licenceType = licenceType;
    }

    public String getContactEmail() {
        return contactEmail;
    }

    public void setContactEmail(String contactEmail) {
        this.contactEmail = contactEmail;
    }
}
