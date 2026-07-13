import { NextRequest } from "next/server";

const BACKEND = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8088";

// Streaming SSE proxy — pipes the backend response body directly to the browser.
// The main catch-all proxy at /api/[...path] buffers via res.text(), which kills SSE.
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const { path } = params;
  const url = `${BACKEND}/api/${path.join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = {
    // Explicitly clear Origin — Next.js 14 inherits the browser Origin into
    // server-side fetch calls, which causes Spring CORS filter to reject unknown origins.
    "Origin": "",
  };
  const auth = req.headers.get("Authorization");
  if (auth) headers["Authorization"] = auth;

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: "GET", headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sse-proxy] fetch failed for ${url}: ${msg}`);
    return new Response(JSON.stringify({ error: msg, url }), { status: 502, headers: { "Content-Type": "application/json" } });
  }

  console.log(`[sse-proxy] upstream ${url} → ${upstream.status} ${upstream.statusText}`);

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => "");
    console.error(`[sse-proxy] upstream error ${upstream.status}: ${body.slice(0, 200)}`);
    return new Response(JSON.stringify({ status: upstream.status, body }), { status: upstream.status, headers: { "Content-Type": "application/json" } });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
