import { NextResponse } from "next/server";
import { forwardGeocode, normalizeQuery } from "@/lib/geocode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = normalizeQuery(raw);

  if (!q) {
    return NextResponse.json(
      { error: "Enter a postal code, ZIP or place name." },
      { status: 400 },
    );
  }
  if (q.length > 120) {
    return NextResponse.json({ error: "Query is too long." }, { status: 400 });
  }

  try {
    const result = await forwardGeocode(q);
    if (!result) {
      return NextResponse.json(
        { error: `No location found for "${q}".` },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Location lookup failed. Try again." },
      { status: 502 },
    );
  }
}
