import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { FeedStory, Profile } from "@/lib/types";
import { getAuthUser } from "@/lib/auth-guards";
import { zipValidSourceLinks } from "@/lib/sourceUrl";
import { isBlockedSource, storyImpactPriority } from "@/lib/fetchers/sourceRegistry";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const domains = sp.get("domains")?.split(",").filter(Boolean) || [];
  const regions = sp.get("regions")?.split(",").filter(Boolean) || [];
  const severity = sp.get("severity");
  const search = sp.get("search");
  const therapeutic = sp.get("therapeutic_areas")?.split(",").filter(Boolean) || [];
  const productCodes = sp.get("product_codes")?.split(",").filter(Boolean) || [];
  const globalOnly = sp.get("global") === "true";
  const sinceDaysRaw = sp.get("since_days");
  const sinceDays = sinceDaysRaw && /^\d+$/.test(sinceDaysRaw) ? parseInt(sinceDaysRaw, 10) : null;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const perPage = Math.min(120, Math.max(1, parseInt(sp.get("per_page") || "40", 10)));
  const offset = (page - 1) * perPage;

  // Also accept legacy single-value params
  const legacyDomain = sp.get("domain");
  const legacyRegion = sp.get("region");
  if (legacyDomain && domains.length === 0) domains.push(legacyDomain);
  if (legacyRegion && regions.length === 0) regions.push(legacyRegion);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (globalOnly) {
    conditions.push(`is_global = true`);
  } else {
    const authUser = await getAuthUser(request);
    let profileId: string | null = null;
    if (authUser?.id) {
      const byId = await query<Profile>(`SELECT id FROM profiles WHERE id = $1 LIMIT 1`, [authUser.id]);
      if (byId.length > 0) profileId = byId[0].id;
    }
    if (!profileId && authUser?.email) {
      const byEmail = await query<Profile>(`SELECT id FROM profiles WHERE email = $1 LIMIT 1`, [authUser.email]);
      if (byEmail.length > 0) profileId = byEmail[0].id;
    }
    if (profileId) {
      paramIdx++;
      conditions.push(`(profile_id = $${paramIdx} OR is_global = true)`);
      params.push(profileId);
    } else {
      conditions.push(`is_global = true`);
    }
  }

  if (domains.length > 0) {
    paramIdx++;
    // Only show stories that match at least one of the requested domains, or are untagged (general).
    // This excludes e.g. pharma-only stories when the profile is Devices-only.
    conditions.push(`(cardinality(domains) = 0 OR domains && $${paramIdx})`);
    params.push(domains);
  }

  if (regions.length > 0) {
    paramIdx++;
    // Include stories that match region or have no region tags (general content)
    conditions.push(`(cardinality(regions) = 0 OR regions && $${paramIdx})`);
    params.push(regions);
  }

  if (severity) {
    paramIdx++;
    conditions.push(`severity = $${paramIdx}`);
    params.push(severity);
  }

  if (therapeutic.length > 0) {
    paramIdx++;
    const taParam = paramIdx;
    paramIdx++;
    const taTextParam = paramIdx;
    // Build a tsquery using OR between terms (replace spaces within terms, separate with |)
    const taSearchTerms = therapeutic
      .map((t) => t.replace(/\s+/g, " & "))
      .join(" | ");
    // Include stories that match TA, match via text search, or have no TA tags (general content)
    conditions.push(
      `(therapeutic_areas && $${taParam} OR to_tsvector('english', headline || ' ' || summary || ' ' || body) @@ to_tsquery('english', $${taTextParam}) OR cardinality(therapeutic_areas) = 0)`
    );
    params.push(therapeutic);
    params.push(taSearchTerms);
  }

  if (productCodes.length > 0) {
    const pcConditions: string[] = [];
    for (const pc of productCodes) {
      paramIdx++;
      pcConditions.push(`(headline || ' ' || COALESCE(summary,'') || ' ' || COALESCE(body,'')) ILIKE $${paramIdx}`);
      params.push(`%${String(pc).replace(/%/g, "\\%")}%`);
    }
    conditions.push(`(${pcConditions.join(" OR ")})`);
  }

  if (sinceDays !== null) {
    paramIdx++;
    conditions.push(`published_at >= NOW() - ($${paramIdx}::text || ' days')::interval`);
    params.push(sinceDays);
  }

  if (search) {
    paramIdx++;
    conditions.push(
      `to_tsvector('english', headline || ' ' || summary || ' ' || body) @@ plainto_tsquery('english', $${paramIdx})`
    );
    params.push(search);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countResult = await query<{ count: string }>(
      `SELECT count(*)::text as count FROM feed_stories ${where}`,
      params
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const rawStories = await query<FeedStory>(
      `SELECT DISTINCT ON (
         lower(regexp_replace(left(headline, 80), '[^a-zA-Z0-9]+', ' ', 'g'))
       ) *
       FROM feed_stories ${where}
       ORDER BY
         lower(regexp_replace(left(headline, 80), '[^a-zA-Z0-9]+', ' ', 'g')),
         published_at DESC`,
      params
    );

    const filtered = rawStories.filter((s) => !isBlockedSource(s));
    filtered.sort((a, b) => {
      const sevOrder = { high: 1, medium: 2, low: 3 } as Record<string, number>;
      const sa = sevOrder[a.severity] || 2;
      const sb = sevOrder[b.severity] || 2;
      if (sa !== sb) return sa - sb;
      // Within same severity: guidance first, then recalls/legislation, then rest
      const ia = storyImpactPriority(a.impact_types);
      const ib = storyImpactPriority(b.impact_types);
      if (ia !== ib) return ia - ib;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });

    const sliced = filtered.slice(offset, offset + perPage);
    const stories = sliced.map((s) => {
      const valid = zipValidSourceLinks(s.source_urls, s.source_labels);
      return { ...s, source_urls: valid.map((x) => x.url), source_labels: valid.map((x) => x.label) };
    });
    const dedupTotal = filtered.length;

    return NextResponse.json({ stories, total: dedupTotal, page, per_page: perPage });
  } catch (err) {
    console.error("[api/feed/stories] error:", err);
    return NextResponse.json(
      { error: "Failed to query stories", details: String(err) },
      { status: 500 }
    );
  }
}
