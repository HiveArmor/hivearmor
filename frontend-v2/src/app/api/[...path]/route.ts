import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8088";

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${BACKEND}/api/${path.join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("Content-Type") || "application/json",
  };
  const auth = req.headers.get("Authorization");
  if (auth) headers["Authorization"] = auth;

  const body = req.method !== "GET" && req.method !== "HEAD"
    ? await req.text()
    : undefined;

  let res: Response;
  try {
    res = await fetch(url, { method: req.method, headers, body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(JSON.stringify({ message: `Proxy error: ${msg}`, target: url }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resHeaders = new Headers();
  const ct = res.headers.get("Content-Type") ?? "";
  if (ct) resHeaders.set("Content-Type", ct);
  // Forward pagination, attachment, and error headers
  for (const h of ["X-Total-Count", "X-Total-Pages", "Link", "X-app-error", "X-app-params", "x-hivearmor-error", "x-hivearmor-params", "Content-Disposition"]) {
    const v = res.headers.get(h);
    if (v) resHeaders.set(h, v);
  }

  // SSE streams must be piped directly — buffering via res.text() hangs indefinitely.
  if (ct.includes("text/event-stream") && res.body) {
    resHeaders.set("Cache-Control", "no-cache");
    resHeaders.set("Connection", "keep-alive");
    resHeaders.set("X-Accel-Buffering", "no");
    return new NextResponse(res.body, { status: 200, headers: resHeaders });
  }

  // Binary responses (PDF, octet-stream, images) must not go through res.text()
  // because that transcodes bytes as UTF-8 and corrupts non-ASCII content.
  const isBinary = ct.includes("pdf") || ct.includes("octet-stream") || ct.includes("image/");
  if (isBinary) {
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, { status: res.status, headers: resHeaders });
  }

  const resBody = await res.text();
  return new NextResponse(resBody || null, {
    status: res.status,
    headers: resHeaders,
  });
}

export const GET    = proxy;
export const POST   = proxy;
export const PUT    = proxy;
export const PATCH  = proxy;
export const DELETE = proxy;
