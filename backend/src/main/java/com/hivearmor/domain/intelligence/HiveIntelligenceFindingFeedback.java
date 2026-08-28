package com.hivearmor.domain.intelligence;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_intelligence_finding_feedback")
public class HiveIntelligenceFindingFeedback implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "finding_id", nullable = false)
    private HiveIntelligenceFinding finding;

    @Column(name = "user_login", nullable = false, length = 255)
    private String userLogin;

    @Column(name = "rating", nullable = false, length = 32)
    private String rating;

    @Column(name = "comment", columnDefinition = "TEXT")
    private String comment;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public HiveIntelligenceFinding getFinding() { return finding; }
    public void setFinding(HiveIntelligenceFinding finding) { this.finding = finding; }
    public String getUserLogin() { return userLogin; }
    public void setUserLogin(String userLogin) { this.userLogin = userLogin; }
    public String getRating() { return rating; }
    public void setRating(String rating) { this.rating = rating; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
