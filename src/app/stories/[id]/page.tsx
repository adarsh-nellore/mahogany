"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { getHeroImage } from "@/lib/heroImages";
import { isValidSourceUrl } from "@/lib/sourceUrl";

interface FeedStory {
  id: string;
  headline: string;
  summary: string;
  body: string;
  section: string;
  severity: string;
  domains: string[];
  regions: string[];
  therapeutic_areas: string[];
  impact_types: string[];
  source_urls: string[];
  source_labels: string[];
  published_at: string;
}

interface Profile {
  name: string;
  therapeutic_areas: string[];
  product_types: string[];
  tracked_products: string[];
  domains: string[];
  regions: string[];
}

const SECTION_COLORS: Record<string, string> = {
  "Safety & Recalls": "#862b00",
  "Approvals & Designations": "#3D7A5C",
  "Clinical Trials": "#2E6482",
  "Guidance & Policy": "#aa5d3d",
  "EU & International": "#6B5CA5",
  "Standards & Compliance": "#6e6b67",
  "Industry & Analysis": "#2E6482",
};

function renderMarkdown(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary); text-decoration: underline; text-underline-offset: 2px;">$1</a>')
    .replace(/\n\n/g, '</p><p style="margin-top: 1.25em;">')
    .replace(/\n/g, "<br/>");
}

function freshnessLabel(dateStr: string): { text: string; isNew: boolean } {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { text: `Updated ${mins}m ago`, isNew: true };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 4) return { text: `Updated ${hours}h ago`, isNew: true };
  if (hours < 24) return { text: `${hours}h ago`, isNew: false };
  const days = Math.floor(hours / 24);
  if (days === 1) return { text: "Yesterday", isNew: false };
  if (days < 7) return { text: `${days}d ago`, isNew: false };
  return { text: new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" }), isNew: false };
}

function storyImage(story: FeedStory): string {
  return getHeroImage(story.headline + story.section).url;
}

function canonicalizeSourceUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Remove common marketing noise so equivalent links dedupe cleanly
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ].forEach((k) => u.searchParams.delete(k));
    const path = u.pathname.replace(/\/+$/, "");
    u.pathname = path || "/";
    return u.toString();
  } catch {
    return raw.trim();
  }
}

function inferSourceLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Source";
  }
}

function dedupeSources(story: FeedStory): { url: string; label: string }[] {
  const byUrl = new Map<string, { url: string; label: string }>();

  for (let i = 0; i < story.source_urls.length; i++) {
    const rawUrl = (story.source_urls[i] || "").trim();
    if (!rawUrl || !isValidSourceUrl(rawUrl)) continue;
    const canonical = canonicalizeSourceUrl(rawUrl);
    const label = (story.source_labels[i] || "").trim() || inferSourceLabel(rawUrl);

    if (!byUrl.has(canonical)) {
      byUrl.set(canonical, { url: rawUrl, label });
      continue;
    }

    // If we already have this URL but stored a weak label, upgrade it.
    const current = byUrl.get(canonical)!;
    const currentGeneric = /^source$/i.test(current.label) || current.label === inferSourceLabel(current.url);
    const nextGeneric = /^source$/i.test(label) || label === inferSourceLabel(rawUrl);
    if (currentGeneric && !nextGeneric) {
      byUrl.set(canonical, { url: rawUrl, label });
    }
  }

  return Array.from(byUrl.values());
}

export default function StoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [story, setStory] = useState<FeedStory | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profiles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/feed/stories/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setStory)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <Header />
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
          <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius-lg)", marginBottom: "var(--space-5)" }} />
          <div className="skeleton-text" style={{ width: "40%", height: 12, marginBottom: "var(--space-3)" }} />
          <div className="skeleton-text" style={{ width: "80%", height: 24, marginBottom: "var(--space-4)" }} />
          <div className="skeleton-text" style={{ width: "100%", height: 14, marginBottom: "var(--space-2)" }} />
          <div className="skeleton-text" style={{ width: "90%", height: 14, marginBottom: "var(--space-2)" }} />
          <div className="skeleton-text" style={{ width: "70%", height: 14 }} />
        </div>
      </div>
    );
  }

  if (error || !story) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <Header />
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--space-12)" }}>
          <div className="error-boundary">
            <div className="error-boundary-title">Story not found</div>
            <div className="error-boundary-desc">This story may have been removed or the link is invalid.</div>
            <Link href="/feed" className="btn btn-secondary btn-sm">Back to Feed</Link>
          </div>
        </div>
      </div>
    );
  }

  const dateStr = new Date(story.published_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const freshness = freshnessLabel(story.published_at);
  const sectionColor = SECTION_COLORS[story.section] || "var(--color-fg-muted)";

  const uniqueSources = dedupeSources(story);

  const profileMatches: string[] = [];
  if (profile) {
    for (const ta of story.therapeutic_areas) {
      if (profile.therapeutic_areas.some((pt) => ta.toLowerCase().includes(pt.toLowerCase()) || pt.toLowerCase().includes(ta.toLowerCase()))) {
        profileMatches.push(ta);
      }
    }
    for (const prod of profile.tracked_products || []) {
      if (story.headline.toLowerCase().includes(prod.toLowerCase()) || story.body.toLowerCase().includes(prod.toLowerCase())) {
        profileMatches.push(prod);
      }
    }
  }
  const uniqueMatches = [...new Set(profileMatches)];

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />

      <article style={{ maxWidth: 760, margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)", fontWeight: 500,
            color: "var(--color-fg-muted)", padding: 0, marginBottom: "var(--space-5)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-fg-muted)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to feed
        </button>

        {/* Hero image */}
        <div style={{ width: "100%", height: 240, borderRadius: "var(--radius-xl)", marginBottom: "var(--space-6)", overflow: "hidden", background: "var(--color-surface-raised)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={storyImage(story)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        {/* Section + Freshness header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 4, height: 14, borderRadius: 2, background: sectionColor }} />
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor }}>
              {story.section}
            </span>
          </div>
          <span style={{
            fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600,
            padding: "2px 8px", borderRadius: "var(--radius-full)",
            background: freshness.isNew ? "var(--color-primary)" : "var(--color-surface-raised)",
            color: freshness.isNew ? "#fff" : "var(--color-fg-muted)",
          }}>
            {freshness.isNew ? "\u26A1 " : ""}{freshness.text}
          </span>
          <span className={`badge ${story.severity === "high" ? "badge-danger" : story.severity === "medium" ? "badge-warning" : "badge-info"}`} style={{ fontSize: "var(--text-2xs)", padding: "1px 6px" }}>
            {story.severity === "high" ? "High Impact" : story.severity === "medium" ? "Medium Impact" : "Low Impact"}
          </span>
          <span className="trust-badge-ai" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 500, padding: "1px 6px", borderRadius: "var(--radius-full)" }}>
            AI-synthesized
          </span>
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-bold)", lineHeight: "var(--leading-tight)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", margin: 0, marginBottom: "var(--space-5)" }}>
          {story.headline}
        </h1>

        {/* Meta row: evidence/source date first */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
          <span style={{ color: "var(--color-fg)", fontWeight: 500 }} title="When this was published or updated at the source">Published {dateStr}</span>
          <span style={{ color: "var(--color-border-strong)" }}>\u00B7</span>
          {story.regions.map((r) => <span key={r}>{r}</span>)}
          <span style={{ color: "var(--color-border-strong)" }}>\u00B7</span>
          {story.domains.map((d) => <span key={d}>{d === "pharma" ? "Pharma" : "Devices"}</span>)}
        </div>

        {/* Profile relevance callout */}
        {uniqueMatches.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
            borderRadius: "var(--radius-md)", background: "var(--color-primary-subtle)",
            border: "1px solid var(--color-primary-muted)", marginBottom: "var(--space-5)",
          }}>
            <span style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)", color: "var(--color-primary)", fontWeight: 500 }}>
              Relevant to your profile:
            </span>
            {uniqueMatches.map((m) => (
              <span key={m} style={{
                fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", fontWeight: 500,
                padding: "1px 8px", borderRadius: "var(--radius-full)",
                background: "var(--color-primary-solid)", color: "#fff",
              }}>
                {m}
              </span>
            ))}
          </div>
        )}

        {/* Summary lede */}
        <p style={{
          fontSize: "var(--text-lg)", color: "var(--color-fg-secondary)",
          lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-8)",
          fontStyle: "italic",
          paddingBottom: "var(--space-8)", borderBottom: "1px solid var(--color-border)",
        }}>
          {story.summary}
        </p>

        {/* Body */}
        <div
          style={{ fontSize: "var(--text-base)", color: "var(--color-fg)", lineHeight: 1.85, marginBottom: "var(--space-10)" }}
          dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(story.body)}</p>` }}
        />

        {/* Tags area */}
        {(story.therapeutic_areas.length > 0 || story.impact_types.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--space-6)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
            {story.therapeutic_areas.map((ta) => (
              <span key={ta} style={{
                fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", fontWeight: 500,
                padding: "2px 10px", borderRadius: "var(--radius-full)",
                background: uniqueMatches.includes(ta) ? "var(--color-primary-subtle)" : "var(--color-surface-raised)",
                color: uniqueMatches.includes(ta) ? "var(--color-primary)" : "var(--color-fg-muted)",
                border: uniqueMatches.includes(ta) ? "1px solid var(--color-primary-muted)" : "1px solid var(--color-border)",
              }}>
                {uniqueMatches.includes(ta) ? "\u2713 " : ""}{ta}
              </span>
            ))}
            {story.impact_types.map((t) => (
              <span key={t} className="badge badge-default" style={{ fontSize: "var(--text-xs)", padding: "2px 10px" }}>{t.replace(/_/g, " ")}</span>
            ))}
          </div>
        )}

        {/* Sources — richer display */}
        {uniqueSources.length > 0 && (
          <div style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: "var(--space-5)",
            marginBottom: "var(--space-8)",
          }}>
            <h3 style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", fontFamily: "var(--font-sans)", color: "var(--color-fg-secondary)", marginBottom: "var(--space-4)", textTransform: "uppercase", letterSpacing: "var(--tracking-wider)" }}>
              Sources ({uniqueSources.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {uniqueSources.map((src, i) => {
                const card = (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: "var(--space-3)",
                    padding: "10px 12px", borderRadius: "var(--radius-md)",
                    background: "var(--color-surface)", border: "1px solid var(--color-border)",
                    transition: "border-color 0.15s ease",
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-border-strong)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
                  >
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", minWidth: 18, textAlign: "right", paddingTop: 1 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--color-primary)" }}>{src.label}</span>
                      </div>
                      <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)", wordBreak: "break-all", lineHeight: 1.3 }}>
                        {src.url.length > 100 ? src.url.slice(0, 97) + "\u2026" : src.url}
                      </span>
                    </div>
                    {isValidSourceUrl(src.url) && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)", flexShrink: 0, paddingTop: 2 }}>\u2197</span>}
                  </div>
                );
                return isValidSourceUrl(src.url)
                  ? <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{card}</a>
                  : <div key={i}>{card}</div>;
              })}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
