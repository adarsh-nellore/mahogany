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
  source_urls: string[];
  source_labels: string[];
  published_at: string;
  created_at?: string;
}

const SECTION_PALETTE = ["#9E3B1E", "#3D7A5C", "#2E6482", "#A36A1E", "#6B5CA5", "#544F4B", "#8B4513", "#2F4F4F"];
function sectionColor(section: string): string {
  let hash = 0;
  for (let i = 0; i < section.length; i++) hash = ((hash << 5) - hash + section.charCodeAt(i)) | 0;
  return SECTION_PALETTE[Math.abs(hash) % SECTION_PALETTE.length];
}

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
  const plain = (text || "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
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
  return Array.from(map, ([section, stories]) => ({ section, stories }));
}

function storyIcon(_s: string): string {
  return "•";
}

function SourceBlock({ labels, urls, max }: { labels: string[]; urls?: string[]; max: number }) {
  const pairs = zipValidSourceLinks(urls || [], labels).slice(0, max);
  if (pairs.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {pairs.map(({ label, url }, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-2xs)", color: "var(--color-primary)", fontFamily: "var(--font-sans)", fontWeight: 500, textDecoration: "none" }}>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--color-border-strong)", flexShrink: 0 }} />
          {label}
        </a>
      ))}
    </div>
  );
}

const SCROLL_THRESHOLD_RATIO = 0.45; // Show overlay when user scrolls past ~45% of content

export default function Home() {
  const router = useRouter();
  const [stories, setStories] = useState<FeedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [showGate, setShowGate] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoGenAttempted = useRef(false);

  const openGate = useCallback(() => {
    setShowGate(true);
  }, []);

  const dismissGate = useCallback(() => {
    setShowGate(false);
  }, []);

  useEffect(() => {
    fetch("/api/profiles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setHasProfile(!!p))
      .catch(() => setHasProfile(false));
  }, []);

  const fetchStories = useCallback(async (autoGenerate = false) => {
    setLoading(true);
    const params = new URLSearchParams({ global: "true", per_page: "120" });
    try {
      const res = await fetch(`/api/feed/stories?${params}`);
      const data = await res.json();
      const fetched: FeedStory[] = data.stories || [];

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
      } else {
        setStories(fetched);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStories(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const scrollable = scrollHeight - clientHeight;
      if (scrollable <= 0) return;
      const ratio = scrollTop / scrollable;
      if (ratio >= SCROLL_THRESHOLD_RATIO) {
        setShowGate(true);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading, stories.length]);

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

  const hero = stories[0];
  const secondary = stories.slice(1, 3);
  const sections = groupBySection(stories.slice(3));

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* Header — FiveW style: Get Started | Log In */}
      <header className="topbar" style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <Link href="/" className="topbar-brand" style={{ textDecoration: "none" }}>Mahogany</Link>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {hasProfile === true ? (
            <>
              <Link href="/feed" className="btn btn-ghost btn-sm" style={{ color: "var(--color-fg-muted)" }}>Log in</Link>
              <Link href="/onboarding" className="btn btn-primary btn-sm">Get started</Link>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setShowGate(true); setShowSignIn(true); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-fg-muted)" }}>
                Log in
              </button>
              <Link href="/onboarding" className="btn btn-primary btn-sm">Get started</Link>
            </>
          )}
        </div>
      </header>

      {/* Scrollable content container */}
      <div
        ref={containerRef}
        style={{
          height: "calc(100vh - 56px)",
          overflowY: showGate ? "hidden" : "auto",
          overscrollBehavior: "contain",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "var(--space-5) var(--space-6) var(--space-12)" }}>
          <div style={{ marginBottom: "var(--space-5)" }}>
            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", margin: 0, lineHeight: "var(--leading-tight)" }}>
              Life sciences regulatory intelligence
            </h1>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginTop: 4, fontFamily: "var(--font-sans)" }}>
              Real-time FDA, EMA, and MHRA. Sign up for a personalized briefing and daily digests.
            </p>
          </div>

          <div style={{ height: 1, background: "var(--color-border)", marginBottom: "var(--space-5)" }} />

          {(loading || generating) && (
            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "var(--space-5)" }}>
              <div className="skeleton-card" style={{ height: 280 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div className="skeleton-card" style={{ height: 130 }} />
                <div className="skeleton-card" style={{ height: 130 }} />
              </div>
            </div>
          )}

          {!loading && stories.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📰</div>
              <div className="empty-state-title">No stories yet</div>
              <div className="empty-state-desc">
                Sign up to get your first personalized digest.
              </div>
              <Link href="/onboarding" className="btn btn-primary btn-md">Get started</Link>
            </div>
          )}

          {/* Feed layout: hero + secondary + sections */}
          {!loading && hero && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "var(--space-5)", marginBottom: "var(--space-6)", paddingBottom: "var(--space-6)", borderBottom: "1px solid var(--color-border)" }}>
                <article
                  role="button"
                  tabIndex={0}
                  onClick={openGate}
                  onKeyDown={(e) => e.key === "Enter" && openGate()}
                  className="card-interactive glass"
                  style={{ height: "100%", display: "flex", flexDirection: "column", cursor: "pointer", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", border: "1px solid var(--color-border)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor(hero.section) }}>
                      {hero.section}
                    </span>
                    {hero.regions?.slice(0, 2).map((r) => <span key={r} className="badge badge-default">{r}</span>)}
                    <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-full)", background: "var(--color-surface-raised)", color: "var(--color-fg-muted)" }}>
                      {freshnessLabel(hero.published_at).text}
                    </span>
                  </div>
                  <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", lineHeight: "var(--leading-snug)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", marginBottom: "var(--space-3)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span aria-hidden style={{ color: sectionColor(hero.section), lineHeight: 1 }}>{storyIcon(hero.section)}</span>
                    <span>{hero.headline}</span>
                  </h2>
                  <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-secondary)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-3)", flex: 1 }}>
                    {hero.summary}
                  </p>
                  <SourceBlock labels={hero.source_labels || []} urls={hero.source_urls} max={2} />
                </article>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {secondary.map((s) => (
                    <article
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={openGate}
                      onKeyDown={(e) => e.key === "Enter" && openGate()}
                      className="card-interactive glass"
                      style={{ display: "flex", flexDirection: "column", cursor: "pointer", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", border: "1px solid var(--color-border)" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor(s.section) }}>{s.section}</span>
                        {s.regions?.slice(0, 1).map((r) => <span key={r} className="badge badge-default">{r}</span>)}
                        <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-full)", background: "var(--color-surface-raised)", color: "var(--color-fg-muted)" }}>{freshnessLabel(s.published_at).text}</span>
                      </div>
                      <h3 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <span aria-hidden style={{ color: sectionColor(s.section), lineHeight: 1 }}>{storyIcon(s.section)}</span>
                        <span>{s.headline}</span>
                      </h3>
                      <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", marginBottom: 6 }}>
                        {truncate(s.summary || s.body, 120)}
                      </p>
                      <SourceBlock labels={s.source_labels || []} urls={s.source_urls} max={1} />
                    </article>
                  ))}
                </div>
              </div>

              {sections.map(({ section, stories: sectionStories }) => (
                <div key={section} style={{ marginBottom: "var(--space-8)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-5)" }}>
                    <div style={{ width: 5, height: 20, borderRadius: 2, background: sectionColor(section) }} />
                    <h2 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)", fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor(section), margin: 0 }}>
                      {section}
                    </h2>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>{sectionStories.length}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-6)" }}>
                    {sectionStories.map((s) => (
                      <article
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={openGate}
                        onKeyDown={(e) => e.key === "Enter" && openGate()}
                        className="card-interactive glass"
                        style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", border: "1px solid var(--color-border)" }}
                      >
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                          {s.regions?.slice(0, 2).map((r) => <span key={r} className="badge badge-default">{r}</span>)}
                          <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-full)", background: "var(--color-surface-raised)", color: "var(--color-fg-muted)" }}>{freshnessLabel(s.published_at).text}</span>
                        </div>
                        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", color: sectionColor(s.section), marginBottom: 4, display: "block" }}>{s.section}</span>
                        <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: 6, letterSpacing: "var(--tracking-tight)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <span aria-hidden style={{ color: sectionColor(s.section), lineHeight: 1 }}>{storyIcon(s.section)}</span>
                          <span>{s.headline}</span>
                        </h3>
                        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)", flex: 1, marginBottom: 8 }}>
                          {truncate(s.summary || s.body, 100)}
                        </p>
                        <SourceBlock labels={s.source_labels || []} urls={s.source_urls} max={2} />
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Gate overlay — scroll- or click-triggered */}
      {showGate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(26, 24, 22, 0.6)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-6)",
            animation: "fadeIn 0.25s ease-out",
          }}
          onClick={dismissGate}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "var(--space-8)",
              maxWidth: 400,
              width: "100%",
              boxShadow: "var(--shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: "var(--space-2)", fontFamily: "var(--font-sans)" }}>
              Get your personalized briefing
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: "var(--space-5)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
              Create a profile and we&apos;ll deliver AI-curated regulatory intelligence every morning, tailored to your portfolio and markets.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <Link href="/onboarding" className="btn btn-primary btn-md" style={{ width: "100%", textAlign: "center" }} onClick={dismissGate}>
                Get started
              </Link>

              {!showSignIn ? (
                <button type="button" onClick={() => setShowSignIn(true)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-fg-muted)", textDecoration: "underline" }}>
                  Already have an account? Log in
                </button>
              ) : (
                <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" style={{ flex: 1 }} />
                    <button type="submit" disabled={signingIn || !email.includes("@")} className="btn btn-secondary btn-sm">{signingIn ? "\u2026" : "Log in"}</button>
                  </div>
                  {signInError && <p style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", margin: 0 }}>{signInError}</p>}
                </form>
              )}

              <button type="button" onClick={dismissGate} className="btn btn-ghost btn-sm" style={{ color: "var(--color-fg-muted)" }}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .card-interactive:hover { box-shadow: var(--shadow-md); }
      `}</style>
    </div>
  );
}
