package com.hivearmor.repository;

import com.hivearmor.domain.FindingNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for the {@link FindingNote} entity.
 *
 * <p>Provides lookup methods for retrieving notes attached to correlated findings,
 * ordered by creation time for chronological display.
 *
 * <p>Sprint 44 — Correlated findings lifecycle mutations (COR-004).
 */
@Repository
public interface FindingNoteRepository extends JpaRepository<FindingNote, String> {

    /**
     * Finds all notes for a given finding, ordered by creation time descending
     * (newest first).
     *
     * @param findingId the correlated finding identifier
     * @return list of notes belonging to the finding, newest first
     */
    List<FindingNote> findByFindingIdOrderByCreatedAtDesc(String findingId);
}
