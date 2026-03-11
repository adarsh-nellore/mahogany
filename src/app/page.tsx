"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zipValidSourceLinks } from "@/lib/sourceUrl";

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
  if (mins < 60) return { text: `${mins}m ago`, isNew: true };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 4) return { text: `${hours}h ago`, isNew: true };
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

function storyIcon(section: string): string {
  const icons: Record<string, string> = {
    "Safety & Recalls": "\u26A0",
    "Approvals & Designations": "\u2713",
    "Clinical Trials": "\u2697",
    "Guidance & Policy": "\u1F4D8",
    "EU & International": "\u1F30D",
    "Standards & Compliance": "\u1F4CF",
    "Industry & Analysis": "\u1F4C8",
  };
  return icons[section] || "\u2022";
}

function SourceLinks({ source_urls, source_labels }: { source_urls: string[]; source_labels: string[] }) {
  const pairs = zipValidSourceLinks(source_urls, source_labels).slice(0, 4);
  const linkStyle: React.CSSProperties = {
    fontSize: "var(--text-2xs)",
    color: "var(--color-primary)",
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    textDecoration: "none",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {pairs.map(({ label, url }, i) => (
        <a key={`${label}-${i}`} href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {label}
        </a>
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [stories, setStories] = useState<FeedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchMode, setSearchMode] = useState<"idle" | "searching" | "results" | "prompt">("idle");
  const [searchAnswer, setSearchAnswer] = useState("");
  const autoGenAttempted = useRef(false);

  useEffect(() => {
    fetch("/api/profiles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setHasProfile(!!p))
      .catch(() => setHasProfile(false));
  }, []);

  const fetchStories = useCallback(async (autoGenerate = false) => {
    setLoading(true);
    setSearchMode("idle");
    setSearchAnswer("");
    const params = new URLSearchParams({ global: "true", per_page: "80" });
    try {
      const res = await fetch(`/api/feed/stories?${params}`);
      const data = await res.json();
      const fetched: FeedStory[] = data.stories || [];
      setStories(fetched);

      if (autoGenerate && fetched.length < 6 && !autoGenAttempted.current) {
        autoGenAttempted.current = true;
        setGenerating(true);
        try {
          await fetch("/api/generate-feed", { method: "POST" });
          const res2 = await fetch(`/api/feed/stories?${params}`);
          const data2 = await res2.json();
          setStories(data2.stories || []);
        } catch { /* ignore */ }
        setGenerating(false);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStories(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchSubmit = useCallback(() => {
    const q = searchInput.trim();
    if (!q) {
      setSearchMode("idle");
      setSearchAnswer("");
      fetchStories();
      return;
    }
    if (hasProfile === false) {
      setSearchMode("prompt");
      return;
    }
    if (hasProfile === true) {
      setSearchMode("searching");
      setLoading(true);
      fetch("/api/feed/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
      })
        .then((res) => res.json())
        .then((data) => {
          setStories(data.results || []);
          setSearchAnswer(data.answer || "");
          setSearchMode("results");
        })
        .catch(() => setSearchMode("idle"))
        .finally(() => setLoading(false));
      return;
    }
    setSearchMode("prompt");
  }, [searchInput, hasProfile, fetchStories]);

  const handleSearchInputChange = (val: string) => {
    setSearchInput(val);
    if (!val.trim()) {
      setSearchMode("idle");
      setSearchAnswer("");
      fetchStories();
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setSignInError("");
    setSigningIn(true);
    try {
      const res = await fetch("/api/profiles/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setSignInError(data.error || "Sign in failed"); setSigningIn(false); return; }
      router.push("/feed");
    } catch (err) { setSignInError(String(err)); setSigningIn(false); }
  };

  const displayStories = stories;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <header className="topbar" style={{ position: "sticky", top: 0, zIndex: 40 }}>
        <span className="topbar-brand">Mahogany</span>
        <div style={{ flex: 1 }} />
        {hasProfile === true ? (
          <Link href="/feed" className="btn btn-primary btn-sm">Go to my briefing</Link>
        ) : (
          <Link href="/onboarding" className="btn btn-primary btn-sm">Get started</Link>
        )}
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "var(--space-6) var(--space-5) var(--space-12)" }}>
        {/* Headline + value prop */}
        <div style={{ marginBottom: "var(--space-5)" }}>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", marginBottom: "var(--space-2)" }}>
            Life sciences regulatory intelligence
          </h1>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-relaxed)" }}>
            Real-time FDA, EMA, and MHRA intelligence, synthesized for your portfolio. This preview is general; after sign-up you get a personalized feed and daily digests.
          </p>
        </div>

        {/* Semantic search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearchSubmit(); }}
          style={{ marginBottom: "var(--space-4)" }}
        >
          <div style={{ position: "relative" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.45, pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="Search your briefing — ask anything..."
              style={{
                width: "100%", fontSize: "var(--text-base)", padding: "12px 48px 12px 42px",
                fontFamily: "var(--font-sans)", color: "var(--color-fg)",
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
                background: "var(--color-surface)", outline: "none",
                boxSizing: "border-box",
              }}
            />
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
              AI Search
            </span>
          </div>
        </form>

        {/* Onboarding prompt when guest tries to search */}
        {searchMode === "prompt" && (
          <div style={{
            padding: "var(--space-5)", marginBottom: "var(--space-5)", borderRadius: "var(--radius-lg)",
            background: "var(--color-primary-subtle)", border: "1px solid var(--color-primary)",
          }}>
            <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg)", fontFamily: "var(--font-sans)", marginBottom: "var(--space-3)", fontWeight: 600 }}>
              Create a profile to search your personalized briefing
            </p>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: "var(--space-4)", fontFamily: "var(--font-sans)" }}>
              Sign up and tell us your focus — then search by portfolio, therapeutic area, and more.
            </p>
            <Link href="/onboarding" className="btn btn-primary btn-md">Get started</Link>
          </div>
        )}

        {/* Search results answer (when logged in and search ran) */}
        {searchMode === "results" && searchAnswer && !loading && (
          <div style={{
            padding: "12px 16px", marginBottom: "var(--space-5)", borderRadius: "var(--radius-lg)",
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
          }}>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg)", fontFamily: "var(--font-sans)", lineHeight: 1.5, margin: 0 }}>{searchAnswer}</p>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginTop: 4, marginBottom: 0 }}>{displayStories.length} results</p>
          </div>
        )}

        {(loading || generating) && (
          <p style={{ color: "var(--color-fg-muted)", padding: "var(--space-8)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
            {generating ? "Synthesizing today\u2019s regulatory intelligence\u2026" : "Loading\u2026"}
          </p>
        )}

        {/* Full scroll of story cards — one column, each with headline, summary, metadata, clickable sources */}
        {!loading && displayStories.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-4)", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--color-border)" }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: "var(--color-fg-muted)" }} />
              <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: "var(--color-fg-muted)" }}>
                Latest in regulatory news
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginBottom: "var(--space-10)" }}>
              {displayStories.map((s) => (
                <article
                  key={s.id}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    padding: "var(--space-5)",
                    background: "var(--color-surface)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: SECTION_COLORS[s.section] || "var(--color-fg-muted)" }}>
                      {s.section}
                    </span>
                    {s.regions?.length > 0 && (
                      <>
                        {s.regions.map((r) => (
                          <span key={r} className="badge badge-default" style={{ fontSize: "var(--text-2xs)" }}>{r}</span>
                        ))}
                      </>
                    )}
                    <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--color-surface-raised)", color: "var(--color-fg-muted)", whiteSpace: "nowrap" }} title={`Source: ${s.published_at}`}>
                      {freshnessLabel(s.published_at).text.startsWith("Updated") ? freshnessLabel(s.published_at).text : `Published ${freshnessLabel(s.published_at).text}`}
                    </span>
                  </div>
                  <h2 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 8, letterSpacing: "var(--tracking-tight)" }}>
                    {storyIcon(s.section)} {s.headline}
                  </h2>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-relaxed)", marginBottom: 12 }}>
                    {truncate(s.summary || s.body, 200)}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <SourceLinks source_urls={s.source_urls || []} source_labels={s.source_labels || []} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {/* Bottom CTA — start onboarding after scrolling through content */}
        <div style={{ textAlign: "center", padding: "var(--space-12) 0", borderTop: "1px solid var(--color-border)" }}>
          <p style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: "var(--space-2)" }}>
            Get your personalized briefing
          </p>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", marginBottom: "var(--space-6)", fontFamily: "var(--font-sans)", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            Create a profile and we&apos;ll deliver AI-curated intelligence every morning, tailored to your portfolio and markets.
          </p>
          <Link href="/onboarding" className="btn btn-primary btn-lg" style={{ marginBottom: "var(--space-4)" }}>Get started</Link>

          <div style={{ marginTop: "var(--space-5)" }}>
            {!showSignIn ? (
              <button type="button" onClick={() => setShowSignIn(true)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-fg-muted)", textDecoration: "underline" }}>
                Already have an account? Sign in
              </button>
            ) : (
              <form onSubmit={handleSignIn} style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", maxWidth: 360, margin: "0 auto" }}>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" style={{ flex: "1 1 200px", minWidth: 0, fontSize: "var(--text-sm)", padding: "6px 10px" }} />
                <button type="submit" disabled={signingIn || !email.includes("@")} className="btn btn-secondary btn-sm">
                  {signingIn ? "\u2026" : "Sign in"}
                </button>
              </form>
            )}
            {signInError && <p style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", marginTop: "var(--space-2)" }}>{signInError}</p>}
          </div>
        </div>

        {/* Empty state */}
        {!loading && displayStories.length === 0 && (
          <div style={{ textAlign: "center", padding: "var(--space-12) 0" }}>
            <p style={{ fontSize: "var(--text-lg)", color: "var(--color-fg-muted)", marginBottom: "var(--space-3)" }}>No stories yet</p>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: "var(--space-5)", fontFamily: "var(--font-sans)" }}>
              Sign up to get your first personalized digest when we have new intelligence.
            </p>
            <Link href="/onboarding" className="btn btn-primary btn-md">Get started</Link>
          </div>
        )}
      </div>
    </div>
  );
}
