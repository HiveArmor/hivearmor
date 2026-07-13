package com.hivearmor.service.dto.agent_manager;


import com.hivearmor.service.grpc.AuthResponse;

public class AuthResponseDTO {
    private int id;
    private String key;

    public AuthResponseDTO(AuthResponse authResponse) {
        this.id = authResponse.getId();
        this.key = authResponse.getKey();
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }
}
