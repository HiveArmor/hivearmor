const JWT_LOCAL_STORAGE_KEY = "hivearmor_auth_token";

interface JwtPayload {
  readonly auth?: unknown;
  readonly [key: string]: unknown;
}

export function hasAuthority(authority: string): boolean {
  const token = window.localStorage.getItem(JWT_LOCAL_STORAGE_KEY);
  if (token === null || token === "") {
    return false;
  }
  const segments = token.split(".");
  if (segments.length < 2) {
    return false;
  }
  let payload: JwtPayload;
  try {
    const b64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const decoded = atob(b64 + pad);
    payload = JSON.parse(decoded) as JwtPayload;
  } catch {
    return false;
  }
  const claim = payload.auth;
  if (typeof claim !== "string") {
    return false;
  }
  return claim.split(",").some((entry) => entry === authority);
}
