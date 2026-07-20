package com.hivearmor.service.dto.overview;

public class GeoThreatPointDTO {
    private double lat;
    private double lon;
    private String country;
    private long alertCount;
    private String maxSeverity;
    private String ip;

    public GeoThreatPointDTO() {}

    public GeoThreatPointDTO(double lat, double lon, String country, long alertCount, String maxSeverity, String ip) {
        this.lat = lat;
        this.lon = lon;
        this.country = country;
        this.alertCount = alertCount;
        this.maxSeverity = maxSeverity;
        this.ip = ip;
    }

    public double getLat()          { return lat; }
    public double getLon()          { return lon; }
    public String getCountry()      { return country; }
    public long getAlertCount()     { return alertCount; }
    public String getMaxSeverity()  { return maxSeverity; }
    public String getIp()           { return ip; }

    public void setLat(double lat)              { this.lat = lat; }
    public void setLon(double lon)              { this.lon = lon; }
    public void setCountry(String country)      { this.country = country; }
    public void setAlertCount(long alertCount)  { this.alertCount = alertCount; }
    public void setMaxSeverity(String s)        { this.maxSeverity = s; }
    public void setIp(String ip)                { this.ip = ip; }
}
