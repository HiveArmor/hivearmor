package com.hivearmor.service;

import com.hivearmor.checks.ElasticsearchConnectionCheck;
import com.hivearmor.domain.User;
import com.hivearmor.domain.mail_sender.MailConfig;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import tech.jhipster.config.JHipsterConstants;

import jakarta.mail.MessagingException;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class UtmStackService {
    private static final String CLASSNAME = "UtmStackService";

    private final Environment env;
    private final MailService mailService;
    private final UserService userService;
    private final DataSource dataSource;

    public UtmStackService(Environment env,
                           MailService mailService,
                           UserService userService,
                           DataSource dataSource) {
        this.env = env;
        this.mailService = mailService;
        this.userService = userService;
        this.dataSource = dataSource;
    }

    public boolean isInDevelop() throws Exception {
        final String ctx = CLASSNAME + ".isInDevelop";
        try {
            String[] profiles = env.getActiveProfiles().length == 0 ? env.getDefaultProfiles() : env.getActiveProfiles();
            List<String> activeProfiles = Arrays.asList(profiles);
            return activeProfiles.contains(JHipsterConstants.SPRING_PROFILE_DEVELOPMENT);
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    public void checkEmailConfiguration(MailConfig config) throws MessagingException {
        final String ctx = CLASSNAME + ".checkEmailConfiguration";
        try {
            User user = userService.getCurrentUserLogin();
            List<String> to = Collections.singletonList(user.getEmail());
            mailService.sendCheckEmail(to, config);
        } catch (MessagingException e) {
            throw new MessagingException(ctx + ": " + e.getMessage());
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    public void executeChecks() {
        ElasticsearchConnectionCheck.getInstance().connectionCheck(-1);
    }

    public Map<String, Object> getMigrationStatus() {
        final String ctx = CLASSNAME + ".getMigrationStatus";
        Map<String, Object> result = new LinkedHashMap<>();
        String sql = "SELECT pattern FROM hive_index_pattern " +
                     "WHERE pattern_system = true AND pattern NOT LIKE 'v3-hive-%'";
        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            List<String> unprefixed = new ArrayList<>();
            while (rs.next()) {
                unprefixed.add(rs.getString("pattern"));
            }
            result.put("migration_20241227001_applied", unprefixed.isEmpty());
            if (!unprefixed.isEmpty()) {
                result.put("unprefixed_patterns", unprefixed);
                result.put("remediation",
                    "Apply Liquibase migration 20241227001_updating-system-index-pattern.xml");
            }
        } catch (SQLException e) {
            result.put("migration_20241227001_applied", false);
            result.put("error", ctx + ": " + e.getMessage());
        }
        return result;
    }
}
