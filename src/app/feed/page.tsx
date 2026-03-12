"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Header from "@/components/Header";

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
  created_at: string;
}

interface Profile {
  id: string;
  name: string;
  regions: string[];
  domains: string[];
  therapeutic_areas: string[];
  product_types: string[];
  tracked_products: string[];
}

// Deterministic color assignment for dynamic AI-generated sections
const SECTION_PALETTE = [
  "#9E3B1E", "#3D7A5C", "#2E6482", "#A36A1E",
  "#6B5CA5", "#544F4B", "#8B4513", "#2F4F4F",
  "#6A5ACD", "#B8860B", "#556B2F", "#4682B4",
];
function sectionColor(section: string): string {
  let hash = 0;
  for (let i = 0; i < section.length; i++) hash = ((hash << 5) - hash + section.charCodeAt(i)) | 0;
  return SECTION_PALETTE[Math.abs(hash) % SECTION_PALETTE.length];
}

function addedAgoLabel(dateStr: string): { text: string; isNew: boolean } {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { text: `Added ${mins}m ago`, isNew: true };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 4) return { text: `Added ${hours}h ago`, isNew: true };
  if (hours < 24) return { text: `Added ${hours}h ago`, isNew: false };
  const days = Math.floor(hours / 24);
  if (days === 1) return { text: "Added yesterday", isNew: false };
  if (days < 7) return { text: `Added ${days}d ago`, isNew: false };
  return { text: `Added ${new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, isNew: false };
}

function contentDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  const plain = text.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if (plain.length <= max) return plain;
  return plain.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
}

function groupBySection(stories: FeedStory[]): { section: string; stories: FeedStory[] }[] {
  const map = new Map<string, FeedStory[]>();
  for (const s of stories) {
    const sec = s.section || "Regulatory Updates";
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(s);
  }
  // Preserve insertion order (which matches the agent's narrative flow)
  return Array.from(map, ([section, stories]) => ({ section, stories }));
}

function storyMatchesProfile(story: FeedStory, profile: Profile | null): string[] {
  if (!profile) return [];
  const matches: string[] = [];
  for (const ta of story.therapeutic_areas) {
    if (profile.therapeutic_areas.some((pt) => ta.toLowerCase().includes(pt.toLowerCase()) || pt.toLowerCase().includes(ta.toLowerCase()))) {
      matches.push(ta);
    }
  }
  for (const prod of profile.tracked_products || []) {
    if (story.headline.toLowerCase().includes(prod.toLowerCase()) || story.summary.toLowerCase().includes(prod.toLowerCase())) {
      matches.push(prod);
    }
  }
  return [...new Set(matches)].slice(0, 3);
}

function storyIcon(_section: string): string {
  return "•";
}

export default function FeedPage() {
  const [stories, setStories] = useState<FeedStory[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchMode, setSearchMode] = useState<"idle" | "searching" | "results">("idle");
  const [searchAnswer, setSearchAnswer] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/profiles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) return;
        setProfile(p);
      })
      .catch(() => {});
  }, []);

  const fetchStories = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ per_page: "60" });
    // Apply profile domain/region filter so Devices-only (or Pharma-only) gets the right content
    if (profile?.domains?.length) {
      params.set("domains", profile.domains.join(","));
    }
    if (profile?.regions?.length) {
      params.set("regions", profile.regions.join(","));
    }
    // Therapeutic areas: API includes untagged + TA overlap + full-text match, so not overly restrictive
    if (profile?.therapeutic_areas?.length) {
      params.set("therapeutic_areas", profile.therapeutic_areas.join(","));
    }
    try {
      const res = await fetch(`/api/feed/stories?${params}`);
      const data = await res.json();
      setStories(data.stories || []);
      setTotal(data.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [profile?.domains, profile?.regions, profile?.therapeutic_areas]);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  const handleSemanticSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchMode("idle");
      setSearchAnswer("");
      fetchStories();
      return;
    }
    setSearchMode("searching");
    setLoading(true);
    try {
      const res = await fetch("/api/feed/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: q.trim() }),
      });
      const data = await res.json();
      setStories(data.results || []);
      setTotal(data.total || 0);
      setSearchAnswer(data.answer || "");
      setSearchMode("results");
    } catch {
      setSearchMode("idle");
    }
    setLoading(false);
  }, [fetchStories]);

  const handleSearchInputChange = (val: string) => {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setSearchMode("idle");
      setSearchAnswer("");
      fetchStories();
      return;
    }
    searchTimerRef.current = setTimeout(() => handleSemanticSearch(val), 800);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch("/api/feed/generate", { method: "POST" });
      await fetchStories();
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const [lastUpdated] = useState(() => new Date());
  const hero = stories[0];
  const secondary = stories.slice(1, 3);
  const sections = groupBySection(stories.slice(3));

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "var(--space-5) var(--space-6) var(--space-8)" }}>
        {/* ── Masthead: evidence date first, then briefing date ── */}
        <div style={{ marginBottom: "var(--space-4)" }}>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", margin: 0, lineHeight: "var(--leading-tight)" }}>
            {profile ? `${profile.name.split(" ")[0]}\u2019s Briefing` : "Regulatory Briefing"}
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            {stories.length > 0 && (() => {
              const dates = stories.map((s) => new Date(s.published_at).getTime());
              const minD = new Date(Math.min(...dates));
              const maxD = new Date(Math.max(...dates));
              const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const rangeStr = minD.getTime() === maxD.getTime() ? fmt(minD) : `${fmt(minD)} – ${fmt(maxD)}`;
              return (
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-fg)", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
                  Evidence from {rangeStr}
                </span>
              );
            })()}
            <span style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
              Briefing for {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              {total > 0 && ` · ${total} stories`}
            </span>
          </div>
        </div>

        {/* ── Search bar — full width, prominent ── */}
        <form onSubmit={(e) => { e.preventDefault(); handleSemanticSearch(searchInput); }}
          style={{ marginBottom: "var(--space-4)" }}>
          <div style={{ position: "relative" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.45, pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="Search your briefing — ask anything..."
              style={{
                width: "100%", fontSize: "var(--text-base)", padding: "12px 48px 12px 42px",
                fontFamily: "var(--font-sans)", color: "var(--color-fg)",
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
                background: "var(--color-surface)", outline: "none",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
            />
            <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
              {searchMode === "searching" && (
                <span style={{ width: 16, height: 16, border: "2px solid var(--color-border)", borderTopColor: "var(--color-primary)", borderRadius: "50%", animation: "searchSpin 0.6s linear infinite", display: "block" }} />
              )}
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "0.02em" }}>
                AI Search
              </span>
            </div>
          </div>
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", margin: 0 }}>
            Briefing content is based on your saved profile settings.
          </p>
          {!loading && stories.length > 0 && (
            <span className="last-updated">
              Last updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: "var(--color-border)", marginBottom: "var(--space-5)" }} />

        {loading && (
          <div style={{ padding: "var(--space-4) 0" }}>
            {searchMode === "searching" ? (
              <p style={{ color: "var(--color-fg-muted)", padding: "var(--space-8)", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
                Searching with AI&hellip;
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "var(--space-5)" }}>
                <div className="skeleton-card" style={{ height: 280 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  <div className="skeleton-card" style={{ height: 130 }} />
                  <div className="skeleton-card" style={{ height: 130 }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Semantic search answer banner */}
        {searchMode === "results" && searchAnswer && !loading && (
          <div style={{
            padding: "12px 16px", marginBottom: "var(--space-5)",
            borderRadius: "var(--radius-lg)", background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 1,
              background: "var(--color-fg)", color: "var(--color-fg-inverse)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, fontFamily: "var(--font-sans)",
            }}>AI</div>
            <div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg)", fontFamily: "var(--font-sans)", lineHeight: 1.5, margin: 0 }}>
                {searchAnswer}
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", margin: 0, marginTop: 4 }}>
                {total} {total === 1 ? "result" : "results"} found
              </p>
            </div>
          </div>
        )}

        {!loading && stories.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📰</div>
            <div className="empty-state-title">No stories yet</div>
            <div className="empty-state-desc">
              Generate your first AI-synthesized briefing from the latest regulatory signals.
            </div>
            <button onClick={handleGenerate} disabled={generating} className="btn btn-primary btn-md">
              {generating ? "Generating\u2026" : "Generate Briefing"}
            </button>
          </div>
        )}

        {/* ── HERO + SECONDARY ── */}
        {searchMode !== "results" && !loading && hero && (
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "var(--space-5)", marginBottom: "var(--space-6)", paddingBottom: "var(--space-6)", borderBottom: "1px solid var(--color-border)" }}>
            <Link href={`/stories/${hero.id}`} style={{ textDecoration: "none", color: "inherit", gridRow: "1 / 3" }}>
              <article className={`card-interactive glass severity-border-${hero.severity || "low"}`} style={{ height: "100%", display: "flex", flexDirection: "column", cursor: "pointer", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor(hero.section) }}>
                    {hero.section}
                  </span>
                  <FreshnessBadge createdAt={hero.created_at} publishedAt={hero.published_at} />
                </div>
                <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", lineHeight: "var(--leading-snug)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", marginBottom: "var(--space-3)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span aria-hidden="true" style={{ color: sectionColor(hero.section), lineHeight: 1 }}>{storyIcon(hero.section)}</span>
                  <span>{hero.headline}</span>
                </h2>
                <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-secondary)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-3)" }}>
                  {hero.summary}
                </p>
                <ProfileMatchTags story={hero} profile={profile} />
                <div style={{ marginTop: "auto", paddingTop: "var(--space-3)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <SourceBlock labels={hero.source_labels} urls={hero.source_urls} max={2} />
                  <TrustIndicator sourceCount={hero.source_urls.length} severity={hero.severity} />
                </div>
              </article>
            </Link>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {secondary.map((s, i) => (
                <Link key={s.id} href={`/stories/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <article className={`card-interactive glass severity-border-${s.severity || "low"}`} style={{
                    display: "flex", flexDirection: "column", cursor: "pointer",
                    borderRadius: "var(--radius-lg)",
                    padding: "var(--space-4)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor(s.section) }}>
                        {s.section}
                      </span>
                      <FreshnessBadge createdAt={s.created_at} publishedAt={s.published_at} />
                    </div>
                    <h3 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span aria-hidden="true" style={{ color: sectionColor(s.section), lineHeight: 1 }}>{storyIcon(s.section)}</span>
                      <span>{s.headline}</span>
                    </h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", marginBottom: 6 }}>
                      {truncate(s.summary, 120)}
                    </p>
                    <ProfileMatchTags story={s} profile={profile} />
                    <SourceBlock labels={s.source_labels} urls={s.source_urls} max={1} />
                  </article>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search results grid */}
        {searchMode === "results" && !loading && stories.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-5)", marginBottom: "var(--space-8)" }}>
            {stories.map((s) => (
              <Link key={s.id} href={`/stories/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <article className={`card-interactive glass severity-border-${s.severity || "low"}`} style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                    {s.regions.map((r) => <span key={r} className="badge badge-default">{r}</span>)}
                    <FreshnessBadge createdAt={s.created_at} publishedAt={s.published_at} />
                  </div>
                  <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor(s.section), marginBottom: 4, display: "block" }}>
                    {s.section}
                  </span>
                  <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span aria-hidden="true" style={{ color: sectionColor(s.section), lineHeight: 1 }}>{storyIcon(s.section)}</span>
                    <span>{s.headline}</span>
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", flex: 1, marginBottom: 6 }}>
                    {truncate(s.summary || s.body, 120)}
                  </p>
                  <ProfileMatchTags story={s} profile={profile} />
                  <SourceBlock labels={s.source_labels} urls={s.source_urls} max={2} />
                </article>
              </Link>
            ))}
          </div>
        )}

        {/* ── THEMATIC SECTIONS ── */}
        {searchMode !== "results" && !loading && sections.map(({ section, stories: sectionStories }) => (
          <div key={section} style={{ marginBottom: "var(--space-8)" }}>
            <div className="section-divider" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-5)" }}>
              <div style={{ width: 5, height: 20, borderRadius: 2, background: sectionColor(section) }} />
              <h2 style={{
                fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)", fontFamily: "var(--font-sans)",
                letterSpacing: "var(--tracking-wider)", textTransform: "uppercase",
                color: sectionColor(section), margin: 0,
              }}>
                {section}
              </h2>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
                {sectionStories.length}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-6)" }}>
              {sectionStories.map((s) => (
                <Link key={s.id} href={`/stories/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <article className={`card-interactive glass severity-border-${s.severity || "low"}`} style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                      {s.regions.map((r) => <span key={r} className="badge badge-default">{r}</span>)}
                      {s.domains.map((d) => <span key={d} className="badge badge-default">{d === "pharma" ? "Pharma" : "Devices"}</span>)}
                      <FreshnessBadge createdAt={s.created_at} publishedAt={s.published_at} />
                    </div>
                    <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span aria-hidden="true" style={{ color: sectionColor(s.section), lineHeight: 1 }}>{storyIcon(s.section)}</span>
                      <span>{s.headline}</span>
                    </h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", flex: 1, marginBottom: 8 }}>
                      {truncate(s.summary || s.body, 100)}
                    </p>
                    <ProfileMatchTags story={s} profile={profile} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                      <SourceBlock labels={s.source_labels} urls={s.source_urls} max={2} />
                      <FeedbackButtons storyId={s.id} />
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>


      <style>{`
        @keyframes searchSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ─── Freshness badge ─── */
function FreshnessBadge({ createdAt, publishedAt }: { createdAt?: string; publishedAt: string }) {
  const feedDate = createdAt || publishedAt;
  const { text, isNew } = addedAgoLabel(feedDate);
  const contentDate = contentDateLabel(publishedAt);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{
        fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600,
        padding: "1px 6px", borderRadius: "var(--radius-full)",
        background: isNew ? "var(--color-primary)" : "var(--color-surface-raised)",
        color: isNew ? "#fff" : "var(--color-fg-muted)",
      }} title={`Added to feed: ${feedDate}`}>
        {isNew ? "\u26A1 " : ""}{text}
      </span>
      <span style={{
        fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 500,
        color: "var(--color-fg-muted)",
      }} title={`Source published: ${publishedAt}`}>
        {contentDate}
      </span>
    </span>
  );
}

/* ─── Profile match tags ─── */
function ProfileMatchTags({ story, profile }: { story: FeedStory; profile: Profile | null }) {
  const matches = storyMatchesProfile(story, profile);
  if (matches.length === 0 && story.therapeutic_areas.length === 0) return null;
  const display = matches.length > 0 ? matches : story.therapeutic_areas.slice(0, 2);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
      {display.map((tag) => (
        <span key={tag} style={{
          fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 500,
          padding: "1px 6px", borderRadius: "var(--radius-full)",
          background: matches.includes(tag) ? "var(--color-primary-subtle)" : "var(--color-surface-raised)",
          color: matches.includes(tag) ? "var(--color-primary)" : "var(--color-fg-muted)",
          border: matches.includes(tag) ? "1px solid var(--color-primary-muted)" : "none",
        }}>
          {matches.includes(tag) ? "\u2713 " : ""}{tag}
        </span>
      ))}
    </div>
  );
}

/* ─── Feedback buttons ─── */
function FeedbackButtons({ storyId }: { storyId: string }) {
  const [signal, setSignal] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFeedback = async (value: "up" | "down") => {
    if (submitting) return;
    const newValue = signal === value ? null : value;
    setSubmitting(true);
    try {
      if (newValue) {
        await fetch("/api/feed/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story_id: storyId, signal: newValue }),
        });
      }
      setSignal(newValue);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleFeedback("up"); }}
        title="Relevant"
        style={{
          padding: "2px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
          background: signal === "up" ? "var(--color-primary-subtle)" : "transparent",
          color: signal === "up" ? "var(--color-primary)" : "var(--color-fg-muted)",
          cursor: "pointer", fontSize: "var(--text-xs)", lineHeight: 1,
          transition: "all 0.15s ease",
        }}
        aria-label="Mark as relevant"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleFeedback("down"); }}
        title="Not relevant"
        style={{
          padding: "2px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
          background: signal === "down" ? "#FEE2E2" : "transparent",
          color: signal === "down" ? "#DC2626" : "var(--color-fg-muted)",
          cursor: "pointer", fontSize: "var(--text-xs)", lineHeight: 1,
          transition: "all 0.15s ease",
        }}
        aria-label="Mark as not relevant"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Trust indicator ─── */
function TrustIndicator({ sourceCount, severity }: { sourceCount: number; severity: string }) {
  const severityLabel = severity === "high" ? "High" : severity === "medium" ? "Med" : "Low";
  const severityClass = severity === "high" ? "badge-danger" : severity === "medium" ? "badge-warning" : "badge-info";
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {sourceCount > 0 && (
        <span className="trust-badge">
          {sourceCount} {sourceCount === 1 ? "source" : "sources"}
        </span>
      )}
      <span className={`badge ${severityClass}`} style={{ fontSize: "var(--text-2xs)", padding: "1px 6px" }}>
        {severityLabel}
      </span>
    </div>
  );
}

/* ─── Source block ─── */
function SourceBlock({ labels, urls, max }: { labels: string[]; urls?: string[]; max: number }) {
  // Dedupe by label, keeping first occurrence and its URL
  const seen = new Set<string>();
  const items: { label: string; url?: string }[] = [];
  for (let i = 0; i < labels.length && items.length < max; i++) {
    const label = labels[i];
    if (seen.has(label)) continue;
    seen.add(label);
    items.push({ label, url: urls?.[i] });
  }
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((item, i) => {
        const inner = (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--color-border-strong)", flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-2xs)", color: item.url ? "var(--color-primary)" : "var(--color-fg-secondary)", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
              {item.label}
            </span>
            {item.url && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-fg-placeholder)", flexShrink: 0 }}>
                <path d="M7 17 17 7" /><path d="M7 7h10v10" />
              </svg>
            )}
          </div>
        );
        return item.url ? (
          <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", color: "inherit" }}>
            {inner}
          </a>
        ) : (
          <div key={i}>{inner}</div>
        );
      })}
    </div>
  );
}
