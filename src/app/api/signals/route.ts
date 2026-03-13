import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Profile } from "@/lib/types";
import { getAuthUser } from "@/lib/auth-guards";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const region = sp.get("region");
  const domain = sp.get("domain");
  const severity = sp.get("severity");
  const authority = sp.get("authority");
  const search = sp.get("search");
  const fromDate = sp.get("from_date");
  const toDate = sp.get("to_date");
  const personalized = sp.get("personalized") === "true";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(sp.get("per_page") || "20", 10)));
  const offset = (page - 1) * perPage;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (personalized) {
    const user = await getAuthUser(request);
    const profileId = user?.id ?? null;
    if (profileId) {
      const profileRows = await query<Profile>(
        `SELECT regions, domains FROM profiles WHERE id = $1`,
        [profileId]
      );
      if (profileRows.length > 0) {
        const p = profileRows[0];
        if (p.regions?.length) {
          paramIdx++;
          conditions.push(`region = ANY($${paramIdx})`);
          params.push(p.regions);
        }
        if (p.domains?.length) {
          paramIdx++;
          conditions.push(`domains && $${paramIdx}`);
          params.push(p.domains);
        }
      }
    }
  }

  if (region) {
    paramIdx++;
    conditions.push(`region = $${paramIdx}`);
    params.push(region);
  }

  if (domain) {
    paramIdx++;
    conditions.push(`$${paramIdx} = ANY(domains)`);
    params.push(domain);
  }

  if (severity) {
    paramIdx++;
    conditions.push(`impact_severity = $${paramIdx}`);
    params.push(severity);
  }

  if (authority) {
    paramIdx++;
    conditions.push(`authority ILIKE $${paramIdx}`);
    params.push(`%${authority}%`);
  }

  if (fromDate) {
    paramIdx++;
    conditions.push(`published_at >= $${paramIdx}`);
    params.push(fromDate);
  }

  if (toDate) {
    paramIdx++;
    conditions.push(`published_at <= $${paramIdx}`);
    params.push(toDate);
  }

  if (search) {
    paramIdx++;
    conditions.push(
      `to_tsvector('english', title || ' ' || summary) @@ plainto_tsquery('english', $${paramIdx})`
    );
    params.push(search);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countResult = await query<{ count: string }>(
      `SELECT count(*)::text as count FROM signals ${where}`,
      params
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    paramIdx++;
    const limitParam = paramIdx;
    paramIdx++;
    const offsetParam = paramIdx;

    const signals = await query(
      `SELECT * FROM signals ${where}
       ORDER BY published_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, perPage, offset]
    );

    return NextResponse.json({
      signals,
      total,
      page,
      per_page: perPage,
    });
  } catch (err) {
    console.error("[api/signals] error:", err);
    return NextResponse.json(
      { error: "Failed to query signals", details: String(err) },
      { status: 500 }
    );
  }
}
