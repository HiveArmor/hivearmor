import { afterEach, describe, expect, test, vi } from "vitest";

import { hasAuthority } from "./hasAuthority";

/**
 * Helper: build a syntactically valid JWT whose payload carries `{"auth": <authClaim>}`.
 * The header and signature are inert stubs — hasAuthority never verifies them.
 */
function makeJwt(authClaim: unknown): string {
  const payload = JSON.stringify({ auth: authClaim });
  const b64 = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `header.${b64}.signature`;
}

describe("hasAuthority", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // (a) localStorage is missing the key entirely → getItem returns null
  test("returns false when localStorage lacks the key", () => {
    const mockStorage = { getItem: vi.fn().mockReturnValue(null) } as unknown as Storage;
    vi.stubGlobal("localStorage", mockStorage);

    expect(hasAuthority("MSSP_ADMIN")).toBe(false);
    expect(mockStorage.getItem).toHaveBeenCalledWith("hivearmor_auth_token");
  });

  // (b) localStorage holds the empty string
  test("returns false when the stored value is the empty string", () => {
    const mockStorage = { getItem: vi.fn().mockReturnValue("") } as unknown as Storage;
    vi.stubGlobal("localStorage", mockStorage);

    expect(hasAuthority("MSSP_ADMIN")).toBe(false);
  });

  // (c) auth = "MSSP_ADMIN", caller asks for MSSP_ADMIN → true
  test('returns true when auth = "MSSP_ADMIN" and caller asks for MSSP_ADMIN', () => {
    const token = makeJwt("MSSP_ADMIN");
    const mockStorage = { getItem: vi.fn().mockReturnValue(token) } as unknown as Storage;
    vi.stubGlobal("localStorage", mockStorage);

    expect(hasAuthority("MSSP_ADMIN")).toBe(true);
  });

  // (d) auth = "ROLE_USER,MSSP_ADMIN", caller asks for MSSP_ADMIN → true
  test('returns true when auth = "ROLE_USER,MSSP_ADMIN" and caller asks for MSSP_ADMIN', () => {
    const token = makeJwt("ROLE_USER,MSSP_ADMIN");
    const mockStorage = { getItem: vi.fn().mockReturnValue(token) } as unknown as Storage;
    vi.stubGlobal("localStorage", mockStorage);

    expect(hasAuthority("MSSP_ADMIN")).toBe(true);
  });

  // (e) auth = "ROLE_USER", caller asks for MSSP_ADMIN → false
  test('returns false when auth = "ROLE_USER" and caller asks for MSSP_ADMIN', () => {
    const token = makeJwt("ROLE_USER");
    const mockStorage = { getItem: vi.fn().mockReturnValue(token) } as unknown as Storage;
    vi.stubGlobal("localStorage", mockStorage);

    expect(hasAuthority("MSSP_ADMIN")).toBe(false);
  });

  // (f) Middle segment is not valid base64url → atob/JSON.parse throws → false
  test("returns false when the middle segment is not valid base64url", () => {
    // Deliberately malformed: middle segment contains characters that make it
    // an invalid base64 string so atob throws.
    const badToken = "header.!!!not-valid-base64!!.signature";
    const mockStorage = { getItem: vi.fn().mockReturnValue(badToken) } as unknown as Storage;
    vi.stubGlobal("localStorage", mockStorage);

    expect(hasAuthority("MSSP_ADMIN")).toBe(false);
  });

  // (g) auth claim is not a string (e.g. an array) → false
  test("returns false when the auth claim is not a string", () => {
    // Encode a payload where auth is an array, not a string
    const token = makeJwt(["MSSP_ADMIN", "ROLE_USER"]);
    const mockStorage = { getItem: vi.fn().mockReturnValue(token) } as unknown as Storage;
    vi.stubGlobal("localStorage", mockStorage);

    expect(hasAuthority("MSSP_ADMIN")).toBe(false);
  });
});
