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

const SECTION_COLORS: Record<string, string> = {
  "Safety & Recalls": "#9E3B1E",
  "Approvals & Designations": "#3D7A5C",
  "Clinical Trials": "#2E6482",
  "Guidance & Policy": "#A36A1E",
  "EU & International": "#6B5CA5",
  "Standards & Compliance": "#544F4B",
  "Industry & Analysis": "#2E6482",
};

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

function truncate(text: string, max: number): string {
  const plain = text.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if (plain.length <= max) return plain;
  return plain.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
}

const SECTION_ORDER = [
  "Safety & Recalls",
  "Approvals & Designations",
  "Clinical Trials",
  "Guidance & Policy",
  "EU & International",
  "Standards & Compliance",
  "Industry & Analysis",
];

function groupBySection(stories: FeedStory[]): { section: string; stories: FeedStory[] }[] {
  const map = new Map<string, FeedStory[]>();
  for (const s of stories) {
    const sec = s.section || "Regulatory Updates";
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(s);
  }
  const ordered: { section: string; stories: FeedStory[] }[] = [];
  for (const sec of SECTION_ORDER) {
    if (map.has(sec)) { ordered.push({ section: sec, stories: map.get(sec)! }); map.delete(sec); }
  }
  for (const [sec, stories] of map) { ordered.push({ section: sec, stories }); }
  return ordered;
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

function storyIcon(section: string): string {
  const icons: Record<string, string> = {
    "Safety & Recalls": "⚠",
    "Approvals & Designations": "✓",
    "Clinical Trials": "⚗",
    "Guidance & Policy": "📘",
    "EU & International": "🌍",
    "Standards & Compliance": "📏",
    "Industry & Analysis": "📈",
  };
  return icons[section] || "•";
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
    try {
      const res = await fetch(`/api/feed/stories?${params}`);
      const data = await res.json();
      setStories(data.stories || []);
      setTotal(data.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [profile?.domains, profile?.regions]);

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

  const hero = stories[0];
  const secondary = stories.slice(1, 3);
  const sections = groupBySection(stories.slice(3));

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "var(--space-5) var(--space-5) var(--space-8)" }}>
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

        <p style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
          Briefing content is based on your saved profile settings.
        </p>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: "var(--color-border)", marginBottom: "var(--space-5)" }} />

        {loading && (
          <p style={{ color: "var(--color-fg-muted)", padding: "var(--space-12)", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
            {searchMode === "searching" ? "Searching with AI\u2026" : "Loading\u2026"}
          </p>
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
          <div style={{ textAlign: "center", padding: "var(--space-16)", color: "var(--color-fg-muted)" }}>
            <p style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>No stories yet</p>
            <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-5)", fontFamily: "var(--font-sans)" }}>
              Generate your first AI-synthesized briefing.
            </p>
            <button onClick={handleGenerate} disabled={generating} className="btn btn-primary btn-md">
              {generating ? "Generating\u2026" : "Generate Briefing"}
            </button>
          </div>
        )}

        {/* ── HERO + SECONDARY ── */}
        {searchMode !== "results" && !loading && hero && (
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "var(--space-5)", marginBottom: "var(--space-6)", paddingBottom: "var(--space-6)", borderBottom: "1px solid var(--color-border)" }}>
            <Link href={`/stories/${hero.id}`} style={{ textDecoration: "none", color: "inherit", gridRow: "1 / 3" }}>
              <article style={{ height: "100%", display: "flex", flexDirection: "column", cursor: "pointer", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: SECTION_COLORS[hero.section] || "var(--color-fg-muted)" }}>
                    {hero.section}
                  </span>
                  <FreshnessBadge dateStr={hero.published_at} />
                </div>
                <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", lineHeight: "var(--leading-snug)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", marginBottom: "var(--space-3)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span aria-hidden="true" style={{ color: SECTION_COLORS[hero.section] || "var(--color-fg-muted)", lineHeight: 1 }}>{storyIcon(hero.section)}</span>
                  <span>{hero.headline}</span>
                </h2>
                <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-secondary)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-3)" }}>
                  {hero.summary}
                </p>
                <ProfileMatchTags story={hero} profile={profile} />
                <div style={{ marginTop: "auto", paddingTop: "var(--space-3)" }}>
                  <SourceBlock labels={hero.source_labels} max={2} />
                </div>
              </article>
            </Link>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {secondary.map((s, i) => (
                <Link key={s.id} href={`/stories/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <article style={{
                    display: "flex", flexDirection: "column", cursor: "pointer",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "var(--space-4)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: SECTION_COLORS[s.section] || "var(--color-fg-muted)" }}>
                        {s.section}
                      </span>
                      <FreshnessBadge dateStr={s.published_at} />
                    </div>
                    <h3 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span aria-hidden="true" style={{ color: SECTION_COLORS[s.section] || "var(--color-fg-muted)", lineHeight: 1 }}>{storyIcon(s.section)}</span>
                      <span>{s.headline}</span>
                    </h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", marginBottom: 6 }}>
                      {truncate(s.summary, 120)}
                    </p>
                    <ProfileMatchTags story={s} profile={profile} />
                    <SourceBlock labels={s.source_labels} max={1} />
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
                <article style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                    {s.regions.map((r) => <span key={r} className="badge badge-default">{r}</span>)}
                    <FreshnessBadge dateStr={s.published_at} />
                  </div>
                  <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: SECTION_COLORS[s.section] || "var(--color-fg-muted)", marginBottom: 4, display: "block" }}>
                    {s.section}
                  </span>
                  <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span aria-hidden="true" style={{ color: SECTION_COLORS[s.section] || "var(--color-fg-muted)", lineHeight: 1 }}>{storyIcon(s.section)}</span>
                    <span>{s.headline}</span>
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", flex: 1, marginBottom: 6 }}>
                    {truncate(s.summary || s.body, 120)}
                  </p>
                  <ProfileMatchTags story={s} profile={profile} />
                  <SourceBlock labels={s.source_labels} max={2} />
                </article>
              </Link>
            ))}
          </div>
        )}

        {/* ── THEMATIC SECTIONS ── */}
        {searchMode !== "results" && !loading && sections.map(({ section, stories: sectionStories }) => (
          <div key={section} style={{ marginBottom: "var(--space-6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-4)", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--color-border)" }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: SECTION_COLORS[section] || "var(--color-fg-muted)" }} />
              <h2 style={{
                fontSize: "var(--text-base)", fontWeight: "var(--weight-bold)", fontFamily: "var(--font-sans)",
                letterSpacing: "var(--tracking-wider)", textTransform: "uppercase",
                color: SECTION_COLORS[section] || "var(--color-fg-muted)", margin: 0,
              }}>
                {section}
              </h2>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
                {sectionStories.length}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-5)" }}>
              {sectionStories.map((s) => (
                <Link key={s.id} href={`/stories/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <article style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                      {s.regions.map((r) => <span key={r} className="badge badge-default">{r}</span>)}
                      {s.domains.map((d) => <span key={d} className="badge badge-default">{d === "pharma" ? "Pharma" : "Devices"}</span>)}
                      <FreshnessBadge dateStr={s.published_at} />
                    </div>
                    <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span aria-hidden="true" style={{ color: SECTION_COLORS[s.section] || "var(--color-fg-muted)", lineHeight: 1 }}>{storyIcon(s.section)}</span>
                      <span>{s.headline}</span>
                    </h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", flex: 1, marginBottom: 8 }}>
                      {truncate(s.summary || s.body, 100)}
                    </p>
                    <ProfileMatchTags story={s} profile={profile} />
                    <SourceBlock labels={s.source_labels} max={2} />
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
function FreshnessBadge({ dateStr }: { dateStr: string }) {
  const { text, isNew } = freshnessLabel(dateStr);
  const label = text.startsWith("Updated") ? text : `Published ${text}`;
  return (
    <span style={{
      fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600,
      padding: "1px 6px", borderRadius: "var(--radius-full)",
      background: isNew ? "var(--color-primary)" : "var(--color-surface-raised)",
      color: isNew ? "#fff" : "var(--color-fg-muted)",
      whiteSpace: "nowrap",
    }} title={`Source published: ${dateStr}`}>
      {isNew ? "\u26A1 " : ""}{label}
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

/* ─── Source block ─── */
function SourceBlock({ labels, max }: { labels: string[]; max: number }) {
  const unique = [...new Set(labels)].slice(0, max);
  if (unique.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {unique.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--color-border-strong)", flexShrink: 0 }} />
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-secondary)", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
