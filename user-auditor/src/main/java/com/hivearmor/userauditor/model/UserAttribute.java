package com.hivearmor.userauditor.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.hivearmor.userauditor.model.audit.Auditable;
import lombok.*;

import jakarta.persistence.*;

/**
 * A UtmAuditorUserAttributes.
 */
@Entity
@Table(name = "hive_user_attribute")
@Getter
@Setter
@Builder
@AllArgsConstructor
@RequiredArgsConstructor
public class UserAttribute extends Base implements Auditable {

    @Column(name = "attribute_key")
    private String attributeKey;

    @Column(name = "attribute_value")
    private String attributeValue;

    @Embedded
    Audit audit;

    @ManyToOne
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;
}
