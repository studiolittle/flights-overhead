import { NextRequest, NextResponse } from "next/server";
import { updatePresence } from "@/lib/presence";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  }
  const raw = await request.text();
  if (raw.length > 256) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  let body;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  }
  if (!body || typeof body.session !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.session) ||
      typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  }
  try {
    const count = await updatePresence(body.session, body.active);
    return NextResponse.json({ count }, { headers });
  } catch {
    return NextResponse.json({ error: "Viewer count unavailable" }, { status: 503, headers });
  }
}
