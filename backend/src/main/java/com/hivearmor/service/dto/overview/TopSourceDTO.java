package com.hivearmor.service.dto.overview;

public class TopSourceDTO {
    private String dataSource;
    private double eps;
    private long totalEvents;

    public TopSourceDTO() {}

    public TopSourceDTO(String dataSource, double eps, long totalEvents) {
        this.dataSource = dataSource;
        this.eps = eps;
        this.totalEvents = totalEvents;
    }

    public String getDataSource()    { return dataSource; }
    public double getEps()           { return eps; }
    public long getTotalEvents()     { return totalEvents; }

    public void setDataSource(String s)     { this.dataSource = s; }
    public void setEps(double eps)          { this.eps = eps; }
    public void setTotalEvents(long n)      { this.totalEvents = n; }
}
