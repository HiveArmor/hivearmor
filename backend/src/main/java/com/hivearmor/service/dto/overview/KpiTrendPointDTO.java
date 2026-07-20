package com.hivearmor.service.dto.overview;

public class KpiTrendPointDTO {
    private String date;
    private long count;

    public KpiTrendPointDTO() {}

    public KpiTrendPointDTO(String date, long count) {
        this.date = date;
        this.count = count;
    }

    public String getDate()  { return date; }
    public long getCount()   { return count; }

    public void setDate(String date)  { this.date = date; }
    public void setCount(long count)  { this.count = count; }
}
