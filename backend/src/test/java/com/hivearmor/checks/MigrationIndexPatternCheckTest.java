package com.hivearmor.checks;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MigrationIndexPatternCheckTest {

    @Test
    void check_passesWhenAllPatternsHaveV11Prefix() throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);

        when(con.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getInt(1)).thenReturn(0);

        assertDoesNotThrow(() -> MigrationIndexPatternCheck.check(con));
    }

    @Test
    void check_throwsWhenUnprefixedPatternsExist() throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);

        when(con.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getInt(1)).thenReturn(3);

        RuntimeException ex = assertThrows(RuntimeException.class,
            () -> MigrationIndexPatternCheck.check(con));
        assertThat(ex.getMessage()).contains("20241227001");
        assertThat(ex.getMessage()).contains("v3-hive-");
        assertThat(ex.getMessage()).contains("3");
    }

    @Test
    void check_allowsStartupWhenTableDoesNotExist() throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        SQLException tableNotFound = new SQLException("table not found", "42P01");

        when(con.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenThrow(tableNotFound);

        assertDoesNotThrow(() -> MigrationIndexPatternCheck.check(con));
    }

    @Test
    void check_rethrowsNonTableNotFoundSqlException() throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        SQLException connectionError = new SQLException("connection reset", "08006");

        when(con.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenThrow(connectionError);

        RuntimeException ex = assertThrows(RuntimeException.class,
            () -> MigrationIndexPatternCheck.check(con));
        assertThat(ex.getCause()).isSameAs(connectionError);
    }
}
