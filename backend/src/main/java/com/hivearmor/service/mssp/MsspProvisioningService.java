package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.domain.User;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.mssp.dto.NewTenantRequest;
import com.hivearmor.service.mssp.dto.NewTenantResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

/**
 * Provisions a new MSSP-managed tenant with an atomic three-table insert.
 *
 * <p>Every public method in this class runs inside a single JDBC transaction
 * (class-level {@link Transactional}). If any step throws a {@link RuntimeException}
 * Spring rolls back all inserts, leaving the database unchanged.
 *
 * <h2>Provisioning sequence</h2>
 * <ol>
 *   <li>Pre-flight uniqueness check: reject duplicate {@code clientPrefix}
 *       ({@link DuplicatePrefixException}) or duplicate {@code adminLogin}
 *       ({@link DuplicateLoginException}) before touching the database.</li>
 *   <li>Step (a) — insert one {@code ha_client} row.</li>
 *   <li>Step (b) — insert one {@code jhi_user} row with {@code activated = false}
 *       and a randomly-generated {@code activationKey}; no real password is
 *       set — the activation flow replaces the placeholder.</li>
 *   <li>Step (c) — insert one {@code ha_tenant_user} row linking the two new
 *       rows with {@code tenant_role = "TENANT_ADMIN"}.</li>
 * </ol>
 *
 * <p><strong>Security note:</strong> No log line in this class may include
 * tenant name, clientPrefix, email, or login. Only the numeric {@code id} is
 * safe to log (platform "no raw customer data at any log level" rule).
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@Service
@Transactional
public class MsspProvisioningService {

    /**
     * A 60-character placeholder written to {@code jhi_user.password_hash}.
     *
     * <p>The {@link User} entity declares {@code password} as
     * {@code @NotNull @Size(min=60, max=60)}, so a value shorter than 60
     * characters causes a constraint violation. This string starts with an
     * invalid BCrypt cost factor ({@code $2a$10$!}) and therefore can never
     * match any real password — {@code PasswordEncoder.matches()} always returns
     * {@code false}. The activation flow replaces it with a real hash.
     *
     * <p>Exactly 60 characters: {@code "$2a$10$!"} (8) + 52 {@code 'X'} chars.
     */
    // @formatter:off
    private static final String UNUSABLE_PASSWORD_HASH =
            "$2a$10$!XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    // @formatter:on

    private final HaClientRepository clients;
    private final UserRepository users;
    private final HaTenantUserRepository memberships;
    private final SecureRandom random;

    public MsspProvisioningService(
            HaClientRepository clients,
            UserRepository users,
            HaTenantUserRepository memberships,
            SecureRandom random) {
        this.clients = clients;
        this.users = users;
        this.memberships = memberships;
        this.random = random;
    }

    /**
     * Atomically provisions a new MSSP-managed tenant.
     *
     * <p>Performs pre-flight uniqueness checks, then inserts one row each into
     * {@code ha_client}, {@code jhi_user}, and {@code ha_tenant_user} within
     * the surrounding transaction.
     *
     * <p>Any {@link RuntimeException} thrown during any step propagates out
     * unchanged, triggering Spring's {@code @Transactional} rollback of all
     * three inserts.
     *
     * @param req the validated provisioning request; must not be {@code null}
     * @return a response record containing the new tenant's database id, name,
     *         prefix, and the admin login name
     * @throws DuplicatePrefixException if {@code req.clientPrefix()} already
     *         exists in {@code ha_client}
     * @throws DuplicateLoginException  if {@code req.adminLogin()} already
     *         exists in {@code jhi_user}
     */
    public NewTenantResponse provisionTenant(NewTenantRequest req) {

        // ── Pre-flight uniqueness checks ──────────────────────────────────────
        if (clients.existsByClientPrefix(req.clientPrefix())) {
            throw new DuplicatePrefixException(req.clientPrefix());
        }
        if (users.existsByLogin(req.adminLogin())) {
            throw new DuplicateLoginException(req.adminLogin());
        }

        // ── Step (a): ha_client ───────────────────────────────────────────────
        HaClient client = new HaClient();
        client.setName(req.name());
        client.setClientPrefix(req.clientPrefix());
        client.setMsspManaged(true);
        client.setMaxUsers(req.maxUsers());
        client.setLicenceType(req.licenceType());
        client = clients.save(client);

        // ── Step (b): jhi_user ────────────────────────────────────────────────
        // activation_key column is VARCHAR(20); 15 bytes → exactly 20 base64url chars.
        // password column is @NotNull @Size(min=60,max=60): set the unusable placeholder.
        User user = new User();
        user.setLogin(req.adminLogin());
        user.setEmail(req.adminEmail());
        user.setActivated(false);
        user.setActivationKey(secureRandomKey(15));
        user.setPassword(UNUSABLE_PASSWORD_HASH);
        user = users.save(user);

        // ── Step (c): ha_tenant_user ──────────────────────────────────────────
        HaTenantUser member = new HaTenantUser();
        member.setClientId(client.getId());
        member.setJhiUserId(user.getId());
        member.setTenantRole("TENANT_ADMIN");
        memberships.save(member);

        return new NewTenantResponse(
                client.getId(),
                client.getName(),
                client.getClientPrefix(),
                user.getLogin(),
                Instant.now());
    }

    /**
     * Generates a URL-safe base64 string (no padding) from {@code bytes} random bytes.
     *
     * <p>15 bytes produces exactly 20 characters, fitting the
     * {@code jhi_user.activation_key} {@code VARCHAR(20)} column constraint.
     *
     * @param bytes number of random bytes to generate; must be positive
     * @return a base64url-encoded string without padding
     */
    private String secureRandomKey(int bytes) {
        byte[] buf = new byte[bytes];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }
}
