import { NextResponse } from "next/server";

// This server-side route calls the SOC-AI plugin's /api/v1/config/reload endpoint
// directly using the internal key, so it works without a backend rebuild.
// The browser never sees the internal key.

const PLUGIN_URL =
  process.env.SOC_AI_PLUGIN_URL ||
  "http://localhost:8099";

const INTERNAL_KEY =
  process.env.SOC_AI_INTERNAL_KEY ||
  process.env.INTERNAL_KEY ||
  "";

export async function POST() {
  if (!PLUGIN_URL) {
    return NextResponse.json(
      { error: "SOC_AI_PLUGIN_URL not configured" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`${PLUGIN_URL}/api/v1/config/reload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_KEY,
      },
      signal: AbortSignal.timeout(15_000),
    });

    const body = await res.json();

    if (!res.ok) {
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Plugin unreachable: ${msg}` }, { status: 503 });
  }
}
