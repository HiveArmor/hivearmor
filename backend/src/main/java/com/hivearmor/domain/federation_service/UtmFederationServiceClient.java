package com.hivearmor.domain.federation_service;


import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.io.Serializable;

/**
 * A UtmFederationServiceClient.
 */
@Entity
@Table(name = "hive_federation_service_client")
public class UtmFederationServiceClient implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    private Long id;

    @Column(name = "fs_client_token")
    private String fsClientToken;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFsClientToken() {
        return fsClientToken;
    }

    public UtmFederationServiceClient fsClientToken(String fsClientToken) {
        this.fsClientToken = fsClientToken;
        return this;
    }

    public void setFsClientToken(String fsClientToken) {
        this.fsClientToken = fsClientToken;
    }
}
