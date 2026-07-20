package com.hivearmor.service.dto.overview;

public class AlertTimelineBucketDTO {
    private String hour;
    private long low;
    private long medium;
    private long high;
    private long critical;

    public AlertTimelineBucketDTO() {}

    public AlertTimelineBucketDTO(String hour, long low, long medium, long high, long critical) {
        this.hour = hour;
        this.low = low;
        this.medium = medium;
        this.high = high;
        this.critical = critical;
    }

    public String getHour()     { return hour; }
    public long getLow()        { return low; }
    public long getMedium()     { return medium; }
    public long getHigh()       { return high; }
    public long getCritical()   { return critical; }

    public void setHour(String hour)       { this.hour = hour; }
    public void setLow(long low)           { this.low = low; }
    public void setMedium(long medium)     { this.medium = medium; }
    public void setHigh(long high)         { this.high = high; }
    public void setCritical(long critical) { this.critical = critical; }
}
