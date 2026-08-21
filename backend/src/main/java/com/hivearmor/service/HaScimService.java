package com.hivearmor.service;

import com.hivearmor.domain.Authority;
import com.hivearmor.domain.User;
import com.hivearmor.repository.AuthorityRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.dto.scim.ScimEmail;
import com.hivearmor.service.dto.scim.ScimGroup;
import com.hivearmor.service.dto.scim.ScimListResponse;
import com.hivearmor.service.dto.scim.ScimMeta;
import com.hivearmor.service.dto.scim.ScimName;
import com.hivearmor.service.dto.scim.ScimUser;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HiveArmor SCIM 2.0 service — translates between the SCIM 2.0 schema (RFC 7643/7644)
 * and the JHipster {@code jhi_user} / {@code jhi_authority} data model.
 *
 * <p>Design constraints:
 * <ul>
 *   <li>Constructor injection only — no {@code @Autowired} on fields.</li>
 *   <li>No Lombok annotations.</li>
 *   <li>Never calls {@code java.util.List#getFirst()} — always uses {@code .get(0)}.</li>
 *   <li>Never logs SCIM tokens, passwords, or full user payloads.</li>
 * </ul>
 */
@Service
public class HaScimService {

    /** Regex that matches SCIM filter {@code userName eq "<value>"} (RFC 7644 §3.4.2.2). */
    private static final Pattern USERNAME_FILTER_PATTERN =
        Pattern.compile("^userName\\s+eq\\s+\"([^\"]+)\"$", Pattern.CASE_INSENSITIVE);

    private final UserRepository userRepository;
    private final AuthorityRepository authorityRepository;
    private final PasswordEncoder passwordEncoder;

    public HaScimService(UserRepository userRepository, AuthorityRepository authorityRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.authorityRepository = authorityRepository;
        this.passwordEncoder = passwordEncoder;
    }

    // -------------------------------------------------------------------------
    // Users
    // -------------------------------------------------------------------------

    /**
     * Lists users, optionally filtered by {@code userName eq "<value>"}.
     *
     * @param filter SCIM filter string, may be {@code null} or blank
     * @return a SCIM {@code ListResponse} containing matching {@link ScimUser} objects
     */
    public ScimListResponse<ScimUser> listUsers(String filter) {
        List<User> users;

        if (filter != null && !filter.isBlank()) {
            Matcher matcher = USERNAME_FILTER_PATTERN.matcher(filter.trim());
            if (matcher.matches()) {
                String loginValue = matcher.group(1);
                Optional<User> found = userRepository.findOneByLogin(loginValue);
                users = found.map(List::of).orElse(List.of());
            } else {
                users = userRepository.findAll();
            }
        } else {
            users = userRepository.findAll();
        }

        List<ScimUser> scimUsers = new ArrayList<>();
        for (User user : users) {
            scimUsers.add(toScimUser(user));
        }

        ScimListResponse<ScimUser> response = new ScimListResponse<>();
        response.setTotalResults(scimUsers.size());
        response.setItemsPerPage(scimUsers.size());
        response.setStartIndex(1);
        response.setResources(scimUsers);
        return response;
    }

    /**
     * Returns a single user by numeric string id.
     *
     * @param id string representation of the numeric user id
     * @return an {@link Optional} containing the mapped {@link ScimUser}, or empty on miss or bad id
     */
    public Optional<ScimUser> getUserById(String id) {
        try {
            long numericId = Long.parseLong(id);
            return userRepository.findById(numericId).map(this::toScimUser);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    /**
     * Creates a new HiveArmor user from a SCIM {@link ScimUser} payload.
     *
     * @param scimUser the inbound SCIM user representation
     * @return the persisted user mapped back to a {@link ScimUser}
     */
    @Transactional
    public ScimUser createUser(ScimUser scimUser) {
        User user = new User();
        user.setLogin(scimUser.getUserName());
        user.setEmail(getEmail(scimUser));
        user.setActivated(scimUser.isActive());

        if (scimUser.getName() != null) {
            user.setFirstName(scimUser.getName().getGivenName());
            user.setLastName(scimUser.getName().getFamilyName());
        }

        // BCrypt hash of a random UUID — satisfies the 60-char @Size constraint.
        // SCIM-provisioned users must authenticate via their IdP; this hash is never usable.
        user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
        user.setLangKey("en");
        user.setCreatedBy("scim");

        Optional<Authority> roleUser = authorityRepository.findById("ROLE_USER");
        if (roleUser.isPresent()) {
            Set<Authority> authorities = new HashSet<>();
            authorities.add(roleUser.get());
            user.setAuthorities(authorities);
        }

        User savedUser = userRepository.save(user);
        return toScimUser(savedUser);
    }

    /**
     * Updates an existing user from a SCIM {@link ScimUser} payload.
     *
     * @param id       string representation of the numeric user id
     * @param scimUser the inbound SCIM user representation with updated fields
     * @return an {@link Optional} containing the updated {@link ScimUser}, or empty on miss or bad id
     */
    @Transactional
    public Optional<ScimUser> updateUser(String id, ScimUser scimUser) {
        long numericId;
        try {
            numericId = Long.parseLong(id);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }

        Optional<User> existing = userRepository.findById(numericId);
        if (!existing.isPresent()) {
            return Optional.empty();
        }

        User user = existing.get();

        if (scimUser.getUserName() != null) {
            user.setLogin(scimUser.getUserName());
        }

        String email = getEmail(scimUser);
        if (email != null) {
            user.setEmail(email);
        }

        user.setActivated(scimUser.isActive());

        if (scimUser.getName() != null) {
            user.setFirstName(scimUser.getName().getGivenName());
            user.setLastName(scimUser.getName().getFamilyName());
        }

        User savedUser = userRepository.save(user);
        return Optional.of(toScimUser(savedUser));
    }

    /**
     * Deactivates a HiveArmor user by setting {@code activated = false}.
     * Per SCIM DELETE semantics, the user row is NOT physically deleted.
     *
     * @param id string representation of the numeric user id
     * @return {@code true} if the user was found and deactivated; {@code false} on miss or bad id
     */
    @Transactional
    public boolean deactivateUser(String id) {
        long numericId;
        try {
            numericId = Long.parseLong(id);
        } catch (NumberFormatException e) {
            return false;
        }

        Optional<User> existing = userRepository.findById(numericId);
        if (!existing.isPresent()) {
            return false;
        }

        User user = existing.get();
        user.setActivated(false);
        userRepository.save(user);
        return true;
    }

    // -------------------------------------------------------------------------
    // Groups
    // -------------------------------------------------------------------------

    /**
     * Lists all HiveArmor authorities mapped to SCIM {@link ScimGroup} objects.
     *
     * @return a SCIM {@code ListResponse} containing all groups
     */
    public ScimListResponse<ScimGroup> listGroups() {
        List<Authority> authorities = authorityRepository.findAll();

        List<ScimGroup> groups = new ArrayList<>();
        for (Authority authority : authorities) {
            groups.add(toScimGroup(authority));
        }

        ScimListResponse<ScimGroup> response = new ScimListResponse<>();
        response.setTotalResults(groups.size());
        response.setItemsPerPage(groups.size());
        response.setStartIndex(1);
        response.setResources(groups);
        return response;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Maps a JHipster {@link User} to a SCIM {@link ScimUser}.
     *
     * @param user the JHipster user entity
     * @return the SCIM representation
     */
    private ScimUser toScimUser(User user) {
        ScimUser scimUser = new ScimUser();
        scimUser.setId(String.valueOf(user.getId()));
        scimUser.setUserName(user.getLogin());
        scimUser.setActive(user.getActivated());

        // Name sub-attribute
        ScimName name = new ScimName();
        name.setGivenName(user.getFirstName());
        name.setFamilyName(user.getLastName());
        String firstName = user.getFirstName() != null ? user.getFirstName() : "";
        String lastName = user.getLastName() != null ? user.getLastName() : "";
        String formatted = (firstName + " " + lastName).trim();
        name.setFormatted(formatted.isEmpty() ? null : formatted);
        scimUser.setName(name);

        // Primary email
        if (user.getEmail() != null) {
            ScimEmail email = new ScimEmail();
            email.setValue(user.getEmail());
            email.setPrimary(true);
            List<ScimEmail> emails = new ArrayList<>();
            emails.add(email);
            scimUser.setEmails(emails);
        }

        // Meta
        ScimMeta meta = new ScimMeta();
        meta.setResourceType("User");
        if (user.getCreatedDate() != null) {
            meta.setCreated(user.getCreatedDate().toString());
        }
        if (user.getLastModifiedDate() != null) {
            meta.setLastModified(user.getLastModifiedDate().toString());
        }
        scimUser.setMeta(meta);

        return scimUser;
    }

    /**
     * Maps a JHipster {@link Authority} to a SCIM {@link ScimGroup}.
     *
     * @param authority the JHipster authority entity
     * @return the SCIM representation
     */
    private ScimGroup toScimGroup(Authority authority) {
        ScimGroup group = new ScimGroup();
        group.setId(authority.getName());
        group.setDisplayName(authority.getName());

        ScimMeta meta = new ScimMeta();
        meta.setResourceType("Group");
        group.setMeta(meta);

        return group;
    }

    /**
     * Extracts the primary email value from a SCIM user's email list.
     *
     * <p>Uses {@code .get(0)} — never {@code .getFirst()} — for Java 17 compatibility.
     *
     * @param scimUser the SCIM user
     * @return the first email value, or {@code null} if the list is null or empty
     */
    private String getEmail(ScimUser scimUser) {
        if (scimUser.getEmails() == null || scimUser.getEmails().isEmpty()) {
            return null;
        }
        return scimUser.getEmails().get(0).getValue();
    }
}
