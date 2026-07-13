package com.hivearmor.security;

import com.hivearmor.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class TrustedProxyResolver {

    private final AppProperties appProperties;

    public String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();

        List<String> trustedCidrs = appProperties.getSecurity().getTrustedProxyCidrs();
        if (trustedCidrs.isEmpty()) {
            return remoteAddr;
        }

        if (!isInTrustedCidr(remoteAddr, trustedCidrs)) {
            return remoteAddr;
        }

        String xfHeader = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(xfHeader)) {
            return xfHeader.split(",")[0].trim();
        }
        return remoteAddr;
    }

    private boolean isInTrustedCidr(String ipAddress, List<String> cidrs) {
        try {
            InetAddress addr = InetAddress.getByName(ipAddress);
            for (String cidr : cidrs) {
                if (isInCidr(addr, cidr)) return true;
            }
        } catch (UnknownHostException e) {
            return false;
        }
        return false;
    }

    private boolean isInCidr(InetAddress addr, String cidr) {
        try {
            String[] parts = cidr.split("/");
            InetAddress network = InetAddress.getByName(parts[0]);
            int prefix = parts.length > 1 ? Integer.parseInt(parts[1]) : 32;
            byte[] addrBytes = addr.getAddress();
            byte[] networkBytes = network.getAddress();
            if (addrBytes.length != networkBytes.length) return false;
            int mask = prefix == 0 ? 0 : (0xFFFFFFFF << (32 - prefix));
            int addrInt = bytesToInt(addrBytes);
            int networkInt = bytesToInt(networkBytes);
            return (addrInt & mask) == (networkInt & mask);
        } catch (Exception e) {
            return false;
        }
    }

    private int bytesToInt(byte[] bytes) {
        int result = 0;
        for (byte b : bytes) result = (result << 8) | (b & 0xFF);
        return result;
    }
}
