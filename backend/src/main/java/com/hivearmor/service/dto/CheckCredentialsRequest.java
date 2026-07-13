package com.hivearmor.service.dto;

public class CheckCredentialsRequest {
    private String password;
    private String checkUUID;

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getCheckUUID() { return checkUUID; }
    public void setCheckUUID(String checkUUID) { this.checkUUID = checkUUID; }
}
