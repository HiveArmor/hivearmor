package com.hivearmor.checks;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class MigrationIndexPatternCheck {

    private static final String CLASSNAME = "MigrationIndexPatternCheck";

    private MigrationIndexPatternCheck() {}

    /**
     * Asserts that Liquibase migration 20241227001 was applied: all system index
     * patterns must carry the "_v3_hive_" prefix. If any do not, the backend would query
     * OpenSearch on the wrong index names and return empty results silently.
     *
     * @param con an open database connection (not closed by this method)
     * @throws RuntimeException if the migration has not been applied
     */
    public static void check(Connection con) {
        final String ctx = CLASSNAME + ".check";
        ConsoleColors.cyanBold();
        System.out.println(">> Checking migration 20241227001 (_v3_hive_ index pattern prefix):");

        // Patterns may use either v3-hive- (hyphen) or _v3_hive_ (underscore) prefix
        String sql = "SELECT COUNT(*) FROM hive_index_pattern " +
                     "WHERE pattern_system = true " +
                     "AND pattern NOT LIKE 'v3-hive-%' " +
                     "AND pattern NOT LIKE '_v3_hive_%'";

        try (PreparedStatement ps = con.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                int unprefixedCount = rs.getInt(1);
                if (unprefixedCount > 0) {
                    String msg = String.format(
                        "Migration check FAILED: %d system index pattern(s) are missing the 'v3-hive-' prefix. " +
                        "Liquibase migration 20241227001 " +
                        "(20241227001_updating-system-index-pattern.xml) may not have been applied. " +
                        "Run: SELECT pattern FROM hive_index_pattern WHERE pattern_system=true " +
                        "AND pattern NOT LIKE 'v3-hive-%%' AND pattern NOT LIKE '_v3_hive_%%'; to see affected rows.",
                        unprefixedCount
                    );
                    ConsoleColors.redBold();
                    System.out.println("\t> " + msg);
                    ConsoleColors.reset();
                    throw new RuntimeException(ctx + ": " + msg);
                }
            }
            ConsoleColors.greenBold();
            System.out.println("\t> Success");
            ConsoleColors.reset();
        } catch (SQLException e) {
            // 42P01 = PostgreSQL undefined_table: fresh install before Liquibase ran
            if ("42P01".equals(e.getSQLState())) {
                ConsoleColors.yellowBold();
                System.out.println("\t> hive_index_pattern table not found — assuming fresh install, skipping.");
                ConsoleColors.reset();
                return;
            }
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage(), e);
        }
    }
}
