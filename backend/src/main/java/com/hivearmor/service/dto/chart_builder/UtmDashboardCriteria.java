package com.hivearmor.service.dto.chart_builder;

import tech.jhipster.service.filter.BooleanFilter;
import tech.jhipster.service.filter.InstantFilter;
import tech.jhipster.service.filter.LongFilter;
import tech.jhipster.service.filter.StringFilter;

import java.io.Serializable;

public class UtmDashboardCriteria implements Serializable {
    private LongFilter id;
    private StringFilter name;
    private InstantFilter createdDate;
    private InstantFilter modifiedDate;
    private StringFilter userCreated;
    private StringFilter userModified;
    private BooleanFilter sidebarPinned;

    public LongFilter getId() {
        return id;
    }

    public void setId(LongFilter id) {
        this.id = id;
    }

    public StringFilter getName() {
        return name;
    }

    public void setName(StringFilter name) {
        this.name = name;
    }

    public InstantFilter getCreatedDate() {
        return createdDate;
    }

    public void setCreatedDate(InstantFilter createdDate) {
        this.createdDate = createdDate;
    }

    public InstantFilter getModifiedDate() {
        return modifiedDate;
    }

    public void setModifiedDate(InstantFilter modifiedDate) {
        this.modifiedDate = modifiedDate;
    }

    public StringFilter getUserCreated() {
        return userCreated;
    }

    public void setUserCreated(StringFilter userCreated) {
        this.userCreated = userCreated;
    }

    public StringFilter getUserModified() {
        return userModified;
    }

    public void setUserModified(StringFilter userModified) {
        this.userModified = userModified;
    }

    public BooleanFilter getSidebarPinned() {
        return sidebarPinned;
    }

    public void setSidebarPinned(BooleanFilter sidebarPinned) {
        this.sidebarPinned = sidebarPinned;
    }
}
