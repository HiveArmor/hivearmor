package com.hivearmor.service;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.Authority;
import com.hivearmor.domain.User;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.repository.AuthorityRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.UserDTO;
import com.hivearmor.service.util.RandomUtil;
import com.hivearmor.util.exceptions.CurrentUserLoginNotFoundException;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import com.hivearmor.web.rest.errors.InvalidPasswordException;
import com.hivearmor.web.rest.errors.ResetKeyExpiredException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Service class for managing users.
 */
@Service
@Transactional
public class UserService {

    private final Logger log = LoggerFactory.getLogger(UserService.class);
    private final String CLASS_NAME = "UserService";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthorityRepository authorityRepository;
    private final ApplicationEventService eventService;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                       AuthorityRepository authorityRepository, ApplicationEventService eventService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authorityRepository = authorityRepository;
        this.eventService = eventService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        final String ctx = CLASS_NAME + ".init";
        try {
            User admin = userRepository.findById(1L).orElseThrow(() ->
                new RuntimeException("Couldn't found de default admin user"));

            if (admin.getDefaultPassword())
                return;

            String dbPass = System.getenv("DB_PASS");
            if (!StringUtils.hasText(dbPass))
                throw new Exception("Environment variable DB_PASS is missing or his value is null or empty");

            admin.setDefaultPassword(true);
            admin.setPassword(passwordEncoder.encode(dbPass));
            userRepository.save(admin);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
        }
    }

    public void completePasswordReset(String newPassword, String key) {
        final String ctx = CLASS_NAME + ".completePasswordReset";
        log.debug("{}: Processing password reset with key: {}", ctx, key);

        Optional<User> userOptional = userRepository.findOneByResetKey(key);

        if (userOptional.isEmpty()) {
            log.info("{}: No user found with reset key", ctx);
            throw new CurrentUserLoginNotFoundException(
                "The password reset link is invalid or no longer exists. Please request a new password reset."
            );
        }

        User user = userOptional.get();
        Instant resetDeadline = Instant.now().minusSeconds(86400);

        if (!user.getResetDate().isAfter(resetDeadline)) {
            log.error("{}: Reset key expired for user: {}", ctx, user.getLogin());
            throw new ResetKeyExpiredException(
                "The password reset link has expired. Password reset links are valid for 24 hours. Please request a new one."
            );
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setResetKey(null);
        user.setResetDate(null);
        user.setActivated(true);

        log.info("{}: Password reset completed successfully for user: {}", ctx, user.getLogin());
    }

    public Optional<User> requestPasswordReset(String mail) {
        return userRepository.findOneByEmailIgnoreCase(mail).filter(User::getActivated).map(user -> {
            user.setResetKey(RandomUtil.generateResetKey());
            user.setResetDate(Instant.now());
            return user;
        });
    }

    private boolean removeNonActivatedUser(User existingUser) {
        if (existingUser.getActivated()) {
            return false;
        }
        userRepository.delete(existingUser);
        userRepository.flush();
        return true;
    }

    public User createUser(UserDTO userDTO) {
        String ctx = CLASS_NAME + ".createUser";
        try {
            User user = new User();
            user.setLogin(userDTO.getLogin().toLowerCase());
            user.setFirstName(userDTO.getFirstName());
            user.setLastName(userDTO.getLastName());
            user.setEmail(userDTO.getEmail().toLowerCase());
            user.setImageUrl(userDTO.getImageUrl());
            if (userDTO.getLangKey() == null) {
                user.setLangKey(Constants.DEFAULT_LANGUAGE); // default language
            } else {
                user.setLangKey(userDTO.getLangKey());
            }
            String encryptedPassword = passwordEncoder.encode(RandomUtil.generatePassword());
            user.setPassword(encryptedPassword);
            user.setResetKey(RandomUtil.generateResetKey());
            user.setResetDate(Instant.now());
            user.setActivated(false);
            if (userDTO.getAuthorities() != null) {
                Set<Authority> authorities = userDTO.getAuthorities().stream().map(authorityRepository::findById).filter(
                    Optional::isPresent).map(Optional::get).collect(Collectors.toSet());
                user.setAuthorities(authorities);
            }
            userRepository.save(user);
            log.debug("Created Information for User: {}", user);
            return user;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    public void createFederationServiceUser(String password) {
        String ctx = CLASS_NAME + ".createFederationServiceUser";
        try {
            User user = userRepository.findOneByLogin(Constants.FS_USER).orElse(new User());

            if (!Objects.isNull(user.getId())) {
                user.setPassword(passwordEncoder.encode(password));
            } else {
                user.setLogin(Constants.FS_USER);
                user.setFirstName("Federation");
                user.setLastName("Service Client");
                user.setEmail(Constants.FS_USER + "@localhost");
                user.setLangKey(Constants.DEFAULT_LANGUAGE);
                user.setPassword(passwordEncoder.encode(password));
                user.setActivated(true);
                Set<Authority> authorities = Stream.of(AuthoritiesConstants.USER).map(authorityRepository::findById).filter(
                    Optional::isPresent).map(Optional::get).collect(Collectors.toSet());
                user.setAuthorities(authorities);
                user.setFsManager(true);
            }

            userRepository.save(user);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * Update basic information (first name, last name, email, language) for the current user.
     *
     * @param firstName first name of user
     * @param lastName  last name of user
     * @param email     email id of user
     * @param langKey   language key
     * @param imageUrl  image URL of user
     */
    public void updateUser(String firstName, String lastName, String email, String langKey, String imageUrl) {
        SecurityUtils.getCurrentUserLogin().flatMap(userRepository::findOneByLogin).ifPresent(user -> {
            user.setFirstName(firstName);
            user.setLastName(lastName);
            user.setEmail(email.toLowerCase());
            user.setLangKey(langKey);
            user.setImageUrl(imageUrl);
            log.debug("Changed Information for User: {}", user);
        });
    }

    /**
     * Update all information for a specific user, and return the modified user.
     *
     * @param userDTO user to update
     * @return updated user
     */
    public Optional<UserDTO> updateUser(UserDTO userDTO) {
        String ctx = CLASS_NAME + ".updateUser";
        Optional<User> userOptional = userRepository.findById(userDTO.getId());

        return Optional.of(userOptional).filter(Optional::isPresent).map(Optional::get).map(user -> {
            user.setLogin(userDTO.getLogin().toLowerCase());
            user.setFirstName(userDTO.getFirstName());
            user.setLastName(userDTO.getLastName());
            user.setEmail(userDTO.getEmail().toLowerCase());
            user.setImageUrl(userDTO.getImageUrl());
            user.setActivated(userDTO.isActivated());
            user.setLangKey(userDTO.getLangKey());
            Set<Authority> managedAuthorities = user.getAuthorities();
            managedAuthorities.clear();
            userDTO.getAuthorities().stream().map(authorityRepository::findById).filter(Optional::isPresent).map(
                Optional::get).forEach(managedAuthorities::add);
            log.debug("Changed Information for User: {}", user);
            return user;
        }).map(UserDTO::new);
    }

    public void updateUserTfaSecret(String userLogin, String tfaSecret, String tfaMethod) {
            User user = userRepository.findOneByLogin(userLogin)
                .orElseThrow(() -> new NoSuchElementException(String.format("User %1$s not found", userLogin)));
            user.setTfaMethod(tfaMethod);
            user.setTfaSecret(tfaSecret);

            userRepository.save(user);
    }

    public Optional<UserDTO> activateUser(String login) {
        return userRepository.findOneByLogin(login.toLowerCase())
            .map(user -> {
                user.setActivated(true);
                userRepository.save(user);
                log.debug("Activated user: {}", login);
                return new UserDTO(user);
            });
    }

    public Optional<UserDTO> deactivateUser(String login) {
        return userRepository.findOneByLogin(login.toLowerCase())
            .map(user -> {
                user.setActivated(false);
                userRepository.save(user);
                log.debug("Deactivated user: {}", login);
                return new UserDTO(user);
            });
    }

    public void deleteUser(String login) {
        String ctx = CLASS_NAME + ".deleteUser";
        User user = userRepository.findOneByLogin(login)
                .orElseThrow(() -> new NoSuchElementException(String.format("User %1$s not found", login)));

        if (user.getAuthorities().stream().anyMatch(authority -> authority.getName().equals("ROLE_ADMIN")) && userRepository.countAdmins() == 1) {
            throw new BadRequestAlertException(ctx, "Cannot delete the last admin user.", UserService.class.toString());
        }

        userRepository.delete(user);
        log.debug("Deleted User: {}", user);
    }

    public void changePassword(String currentClearTextPassword, String newPassword) {
        SecurityUtils.getCurrentUserLogin().flatMap(userRepository::findOneByLogin).ifPresent(user -> {
            String currentEncryptedPassword = user.getPassword();
            if (!passwordEncoder.matches(currentClearTextPassword, currentEncryptedPassword)) {
                throw new InvalidPasswordException();
            }
            String encryptedPassword = passwordEncoder.encode(newPassword);
            user.setPassword(encryptedPassword);
            log.debug("Changed password for User: {}", user);
        });
    }

    @Transactional(readOnly = true)
    public Page<UserDTO> getAllManagedUsers(Pageable pageable, String login) {
        if (StringUtils.hasText(login))
            return userRepository.findAllByLoginLike(pageable, login).map(UserDTO::new);
        return userRepository.findAllByLoginNotAndFsManagerIsNullOrFsManagerIsFalse(pageable, Constants.ANONYMOUS_USER).map(UserDTO::new);
    }

    @Transactional(readOnly = true)
    public List<UserDTO> getAllUsersIn(List<Long> ids) {
        return userRepository.findUserByIdIn(ids).stream().map(UserDTO::new).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserWithAuthoritiesByLogin(String login) {
        return userRepository.findOneWithAuthoritiesByLogin(login);
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserWithAuthorities(Long id) {
        return userRepository.findOneWithAuthoritiesById(id);
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserWithAuthorities() {
        return SecurityUtils.getCurrentUserLogin().flatMap(userRepository::findOneWithAuthoritiesByLogin);
    }

    public Page<UserDTO> getUsersByLogin(Pageable pageable, String login) {
        return userRepository.findAllByLoginLike(pageable, login).map(UserDTO::new);
    }

    /**
     * Not activated users should be automatically deleted after 3 days.
     * <p>
     * This is scheduled to get fired everyday, at 01:00 (am).
     */
    @Scheduled(cron = "0 0 1 * * ?")
    public void removeNotActivatedUsers() {
        userRepository.findAllByActivatedIsFalseAndCreatedDateBefore(Instant.now().minus(3, ChronoUnit.DAYS)).forEach(
            user -> {
                log.debug("Deleting not activated user {}", user.getLogin());
                userRepository.delete(user);
            });
    }

    /**
     * @return a list of all the authorities
     */
    public List<String> getAuthorities() {
        return authorityRepository.findAll().stream().map(Authority::getName).collect(Collectors.toList());
    }

    public User getCurrentUserLogin() {
        String userLogin = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new CurrentUserLoginNotFoundException("No current user login was found"));
        return userRepository.findOneWithAuthoritiesByLogin(userLogin)
                .orElseThrow(() -> new CurrentUserLoginNotFoundException(String.format("No user with login %1$s was found", userLogin)));
    }
}
