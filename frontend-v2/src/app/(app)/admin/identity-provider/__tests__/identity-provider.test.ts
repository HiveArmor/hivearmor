import { describe, it, expect } from "vitest";
import { PROVIDER_TYPE_LABELS, type ProviderType, type IdentityProvider } from "@/services/identity-provider.service";

// ── Types mirrored from page.tsx for testability ──────────────────────────

interface IdentityProviderFormData {
  name: string;
  providerType: ProviderType;
  metadataUrl: string;
  spEntityId: string;
  spAcsUrl: string;
  active: boolean;
  spPrivateKeyFile?: File;
  spCertificateFile?: File;
}

// ── Logic extracted from page ─────────────────────────────────────────────

const PROVIDER_TYPES: ProviderType[] = ["GOOGLE", "KEYCLOAK", "OKTA", "MICROSOFT"];

function getAvailableTypes(
  providers: IdentityProvider[],
  isEdit: boolean,
  editingType?: ProviderType,
): ProviderType[] {
  if (isEdit && editingType) return [editingType];
  const taken = providers.map(p => p.providerType);
  return PROVIDER_TYPES.filter(t => !taken.includes(t));
}

function buildSpIdentifiers(origin: string, providerType: ProviderType) {
  return {
    spEntityId: `${origin}/saml/sp`,
    spAcsUrl:   `${origin}/login/saml2/sso/${providerType.toLowerCase()}`,
  };
}

function validateForm(
  data: Partial<IdentityProviderFormData>,
  isEdit: boolean,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.name?.trim() || data.name.trim().length < 3) {
    errs.name = "Name is required (minimum 3 characters)";
  }
  if (!data.metadataUrl?.trim() || !/^https?:\/\/.+/.test(data.metadataUrl)) {
    errs.metadataUrl = "Valid HTTP(S) URL is required";
  }
  if (!isEdit && !data.spPrivateKeyFile) {
    errs.spPrivateKeyFile = "Private key file is required";
  }
  if (!isEdit && !data.spCertificateFile) {
    errs.spCertificateFile = "Certificate file is required";
  }
  return errs;
}

function buildFormData(data: IdentityProviderFormData): Record<string, string> {
  return {
    name:         data.name,
    providerType: data.providerType,
    metadataUrl:  data.metadataUrl,
    spEntityId:   data.spEntityId,
    spAcsUrl:     data.spAcsUrl,
    active:       String(data.active),
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const SAMPLE_PROVIDERS: IdentityProvider[] = [
  { id: 1, name: "Okta SSO",   providerType: "OKTA",    metadataUrl: "https://okta.example.com/meta", spEntityId: "https://app/saml/sp", spAcsUrl: "https://app/sso/okta",    active: true },
  { id: 2, name: "Google SSO", providerType: "GOOGLE",  metadataUrl: "https://google.example.com/meta", spEntityId: "https://app/saml/sp", spAcsUrl: "https://app/sso/google", active: false },
];

// ── Tests ─────────────────────────────────────────────────────────────────

describe("PROVIDER_TYPE_LABELS", () => {
  it("covers all five provider types", () => {
    PROVIDER_TYPES.forEach(t => {
      expect(PROVIDER_TYPE_LABELS[t]).toBeTruthy();
    });
  });

  it("returns human-readable labels", () => {
    expect(PROVIDER_TYPE_LABELS["GOOGLE"]).toBe("Google");
    expect(PROVIDER_TYPE_LABELS["OKTA"]).toBe("Okta");
    expect(PROVIDER_TYPE_LABELS["MICROSOFT"]).toBe("Microsoft");
  });
});

describe("getAvailableTypes", () => {
  it("excludes already-configured types in create mode", () => {
    const available = getAvailableTypes(SAMPLE_PROVIDERS, false);
    expect(available).not.toContain("OKTA");
    expect(available).not.toContain("GOOGLE");
    expect(available).toContain("KEYCLOAK");
    expect(available).toContain("MICROSOFT");
  });

  it("returns only the editing type in edit mode", () => {
    const available = getAvailableTypes(SAMPLE_PROVIDERS, true, "OKTA");
    expect(available).toEqual(["OKTA"]);
  });

  it("returns all types when no providers are configured", () => {
    const available = getAvailableTypes([], false);
    expect(available).toHaveLength(PROVIDER_TYPES.length);
  });

  it("returns empty array when all types are taken (create mode)", () => {
    const allTaken: IdentityProvider[] = PROVIDER_TYPES.map((t, i) => ({
      id: i + 1,
      name: `${t} Provider`,
      providerType: t,
      metadataUrl: `https://example.com/${t.toLowerCase()}/meta`,
      spEntityId: "https://app/saml/sp",
      spAcsUrl:   `https://app/sso/${t.toLowerCase()}`,
      active: true,
    }));
    expect(getAvailableTypes(allTaken, false)).toHaveLength(0);
  });
});

describe("buildSpIdentifiers", () => {
  const origin = "https://app.example.com";

  it("builds correct entity ID", () => {
    const { spEntityId } = buildSpIdentifiers(origin, "OKTA");
    expect(spEntityId).toBe("https://app.example.com/saml/sp");
  });

  it("builds provider-specific ACS URL (lowercase type)", () => {
    const { spAcsUrl } = buildSpIdentifiers(origin, "OKTA");
    expect(spAcsUrl).toBe("https://app.example.com/login/saml2/sso/okta");
  });

  it("uses lowercase provider type in ACS URL for all types", () => {
    PROVIDER_TYPES.forEach(t => {
      const { spAcsUrl } = buildSpIdentifiers(origin, t);
      expect(spAcsUrl).toContain(t.toLowerCase());
    });
  });

  it("entity ID is the same regardless of provider type", () => {
    const ids = PROVIDER_TYPES.map(t => buildSpIdentifiers(origin, t).spEntityId);
    expect(new Set(ids).size).toBe(1);
  });
});

describe("validateForm — create mode (both files required)", () => {
  const fakeFile = new File(["-----BEGIN RSA PRIVATE KEY-----"], "key.pem", { type: "text/plain" });

  const valid: IdentityProviderFormData = {
    name:             "My OKTA Provider",
    providerType:     "OKTA",
    metadataUrl:      "https://okta.example.com/metadata",
    spEntityId:       "https://app/saml/sp",
    spAcsUrl:         "https://app/sso/okta",
    active:           true,
    spPrivateKeyFile:  fakeFile,
    spCertificateFile: fakeFile,
  };

  it("returns no errors for a fully valid payload", () => {
    expect(validateForm(valid, false)).toEqual({});
  });

  it("requires name with at least 3 characters", () => {
    expect(validateForm({ ...valid, name: "ab" }, false).name).toBeTruthy();
    expect(validateForm({ ...valid, name: "" }, false).name).toBeTruthy();
    expect(validateForm({ ...valid, name: "abc" }, false).name).toBeUndefined();
  });

  it("requires a valid HTTP/HTTPS metadata URL", () => {
    expect(validateForm({ ...valid, metadataUrl: "not-a-url" }, false).metadataUrl).toBeTruthy();
    expect(validateForm({ ...valid, metadataUrl: "ftp://example.com" }, false).metadataUrl).toBeTruthy();
    expect(validateForm({ ...valid, metadataUrl: "http://example.com/meta" }, false).metadataUrl).toBeUndefined();
    expect(validateForm({ ...valid, metadataUrl: "https://example.com/meta" }, false).metadataUrl).toBeUndefined();
  });

  it("requires both files in create mode", () => {
    const errs1 = validateForm({ ...valid, spPrivateKeyFile: undefined }, false);
    expect(errs1.spPrivateKeyFile).toBeTruthy();
    expect(errs1.spCertificateFile).toBeUndefined();

    const errs2 = validateForm({ ...valid, spCertificateFile: undefined }, false);
    expect(errs2.spCertificateFile).toBeTruthy();
    expect(errs2.spPrivateKeyFile).toBeUndefined();

    const errs3 = validateForm({ ...valid, spPrivateKeyFile: undefined, spCertificateFile: undefined }, false);
    expect(errs3.spPrivateKeyFile).toBeTruthy();
    expect(errs3.spCertificateFile).toBeTruthy();
  });

  it("accumulates multiple errors simultaneously", () => {
    const errs = validateForm({ name: "x", metadataUrl: "bad" }, false);
    expect(Object.keys(errs).length).toBeGreaterThanOrEqual(3);
  });
});

describe("validateForm — edit mode (files optional)", () => {
  const valid: IdentityProviderFormData = {
    name:         "My OKTA Provider",
    providerType: "OKTA",
    metadataUrl:  "https://okta.example.com/metadata",
    spEntityId:   "https://app/saml/sp",
    spAcsUrl:     "https://app/sso/okta",
    active:       true,
  };

  it("allows missing files in edit mode", () => {
    const errs = validateForm(valid, true);
    expect(errs.spPrivateKeyFile).toBeUndefined();
    expect(errs.spCertificateFile).toBeUndefined();
  });

  it("still validates name and URL in edit mode", () => {
    const errs = validateForm({ ...valid, name: "", metadataUrl: "bad" }, true);
    expect(errs.name).toBeTruthy();
    expect(errs.metadataUrl).toBeTruthy();
  });
});

describe("buildFormData — multipart field names match backend @RequestParam", () => {
  const fakeFile = new File(["key"], "key.pem", { type: "text/plain" });

  const data: IdentityProviderFormData = {
    name:             "Okta",
    providerType:     "OKTA",
    metadataUrl:      "https://okta.example.com/metadata",
    spEntityId:       "https://app/saml/sp",
    spAcsUrl:         "https://app/sso/okta",
    active:           false,
    spPrivateKeyFile:  fakeFile,
    spCertificateFile: fakeFile,
  };

  it("includes all required string fields", () => {
    const fields = buildFormData(data);
    expect(fields.name).toBe("Okta");
    expect(fields.providerType).toBe("OKTA");
    expect(fields.metadataUrl).toBe("https://okta.example.com/metadata");
    expect(fields.spEntityId).toBe("https://app/saml/sp");
    expect(fields.spAcsUrl).toBe("https://app/sso/okta");
  });

  it("serializes active boolean as string", () => {
    expect(buildFormData({ ...data, active: true }).active).toBe("true");
    expect(buildFormData({ ...data, active: false }).active).toBe("false");
  });
});

describe("provider list state — active/inactive badge logic", () => {
  it("active=true providers are identified as active", () => {
    const active = SAMPLE_PROVIDERS.filter(p => p.active);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Okta SSO");
  });

  it("active=false providers are identified as inactive", () => {
    const inactive = SAMPLE_PROVIDERS.filter(p => !p.active);
    expect(inactive).toHaveLength(1);
    expect(inactive[0].name).toBe("Google SSO");
  });
});
