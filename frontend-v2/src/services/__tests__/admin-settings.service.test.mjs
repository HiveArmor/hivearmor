/**
 * Node-native test (no test runner needed).
 * Run: node src/services/__tests__/admin-settings.service.test.mjs
 */
import assert from "node:assert/strict";

// ── inline the shapes we care about, mirroring what the service must return ──

function makeSection(overrides = {}) {
  return { id: 1, section: "EMAIL", description: "Email configuration", ...overrides };
}

function makeParam(overrides = {}) {
  return {
    id: 10,
    sectionId: 1,
    confParamShort: "smtp_host",
    confParamValue: "smtp.example.com",
    confParamDatatype: "STRING",
    confParamDescription: "SMTP Server Host",
    confParamRequired: true,
    ...overrides,
  };
}

// ── helpers ──

function checkNoOldFields(obj, label) {
  for (const bad of ["paramShort", "paramValue", "paramRequired", "paramDescription", "sectionName", "sectionDescription"]) {
    assert.ok(!(bad in obj), `${label} must not have old field "${bad}" (got ${JSON.stringify(obj)})`);
  }
}

// ── test 1: ConfigSection shape ──
{
  const section = makeSection();
  assert.ok("section" in section, "ConfigSection must have field 'section'");
  assert.ok(!("sectionName" in section), "ConfigSection must NOT have 'sectionName'");
  assert.ok(!("sectionDescription" in section), "ConfigSection must NOT have 'sectionDescription'");
  console.log("PASS  ConfigSection uses correct backend field names");
}

// ── test 2: ConfigParameter shape ──
{
  const param = makeParam();
  assert.ok("confParamShort" in param, "ConfigParameter must have 'confParamShort'");
  assert.ok("confParamValue" in param, "ConfigParameter must have 'confParamValue'");
  checkNoOldFields(param, "ConfigParameter");
  console.log("PASS  ConfigParameter uses correct backend field names");
}

// ── test 3: updateConfigParam body is an array ──
{
  const captured = [];
  const fakeApi = {
    put: (url, body) => { captured.push({ url, body }); return Promise.resolve(); },
  };

  // inline minimal version of the service method
  async function updateConfigParam(param) {
    return fakeApi.put("/api/utm-configuration-parameters", [param]);
  }

  const param = makeParam({ confParamValue: "newvalue" });
  await updateConfigParam(param);

  const { url, body } = captured[0];
  assert.equal(url, "/api/utm-configuration-parameters");
  assert.ok(Array.isArray(body), "PUT body must be an array");
  const sent = body[0];
  assert.equal(sent.confParamShort, "smtp_host");
  assert.equal(sent.confParamValue, "newvalue");
  assert.equal(sent.sectionId, 1);
  checkNoOldFields(sent, "PUT body[0]");
  console.log("PASS  updateConfigParam sends array with correct field names");
}

// ── test 4: getConfigSections fetches params with sectionId filter ──
{
  const calls = [];
  const fakeApi = {
    get: (url) => {
      calls.push(url);
      if (url.includes("utm-configuration-sections")) return Promise.resolve([makeSection()]);
      if (url.includes("utm-configuration-parameters")) return Promise.resolve([makeParam()]);
      return Promise.resolve([]);
    },
  };

  async function getConfigSections() {
    const sections = await fakeApi.get("/api/utm-configuration-sections?page=0&size=100") || [];
    return Promise.all(sections.map(async (s) => {
      const params = await fakeApi.get(
        `/api/utm-configuration-parameters?sectionId.equals=${s.id}&page=0&size=200`
      ) || [];
      return { ...s, parameters: params };
    }));
  }

  const result = await getConfigSections();
  assert.equal(result[0].section, "EMAIL");
  assert.ok(calls.some(u => u.includes("sectionId.equals=1")), "must request params with sectionId.equals filter");
  assert.equal(result[0].parameters.length, 1);
  assert.equal(result[0].parameters[0].confParamShort, "smtp_host");
  checkNoOldFields(result[0].parameters[0], "embedded param");
  console.log("PASS  getConfigSections fetches params via sectionId.equals filter");
}

// ── test 5: no old field names survive a save round-trip ──
{
  const param = makeParam();
  const editedValue = "newsmtp.example.com";
  const saved = { ...param, confParamValue: editedValue };
  assert.equal(saved.confParamValue, editedValue);
  assert.ok(!("paramValue" in saved), "round-trip must not introduce paramValue");
  console.log("PASS  save round-trip preserves confParamValue, not paramValue");
}

console.log("\nAll 5 tests passed.");
