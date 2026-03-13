"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zipValidSourceLinks } from "@/lib/sourceUrl";
import { getHeroImage } from "@/lib/heroImages";

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

const SECTION_PALETTE = ["#862b00", "#4ade80", "#60a5fa", "#f0a83a", "#a78bfa", "#aca8a3", "#c27f67", "#22d3ee"];
function sectionColor(section: string): string {
  let hash = 0;
  for (let i = 0; i < section.length; i++) hash = ((hash << 5) - hash + section.charCodeAt(i)) | 0;
  return SECTION_PALETTE[Math.abs(hash) % SECTION_PALETTE.length];
}

function addedAgoLabel(dateStr: string): { text: string; isNew: boolean } {
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

function contentDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  const plain = (text || "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
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

const SCROLL_THRESHOLD_RATIO = 0.15;

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
  const dismissedByUserRef = useRef(false);

  const openGate = useCallback(() => {
    dismissedByUserRef.current = false;
    setShowGate(true);
  }, []);

  const dismissGate = useCallback(() => {
    dismissedByUserRef.current = true;
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
        if (!dismissedByUserRef.current) setShowGate(true);
      } else {
        dismissedByUserRef.current = false;
        setShowGate(false);
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

  const [heroOffset, setHeroOffset] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setHeroOffset(Math.min(el.scrollTop * 0.3, 80));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const sections = groupBySection(stories);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* ── Header ── */}
      <header className="topbar" style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <Link href="/" className="topbar-brand" style={{ textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-mark.png" alt="" aria-hidden="true" width={32} height={32} style={{ flexShrink: 0, objectFit: "contain" }} />
          Mahogany
        </Link>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {hasProfile === true ? (
            <Link href="/feed" className="btn btn-ghost btn-md" style={{ color: "var(--color-fg-muted)" }}>Log in</Link>
          ) : (
            <button type="button" onClick={() => { setShowGate(true); setShowSignIn(true); }} className="btn btn-ghost btn-md" style={{ color: "var(--color-fg-muted)" }}>
              Log in
            </button>
          )}
          <Link href="/signup" className="btn btn-primary btn-md">Get started</Link>
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <div
        ref={containerRef}
        style={{
          height: "calc(100vh - var(--topbar-height, 56px))",
          overflowY: showGate ? "hidden" : "auto",
          overscrollBehavior: "contain",
        }}
      >
        {/* ── Hero ── */}
        <div style={{
          position: "relative",
          minHeight: "calc(82vh - var(--topbar-height, 56px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-20) var(--space-6) var(--space-24)",
          textAlign: "center",
          overflow: "hidden",
        }}>
          {/* Hero content with parallax */}
          <div style={{ transform: `translateY(${heroOffset}px)`, transition: "transform 0.05s linear", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>

            {/* Main headline */}
            <h1 style={{
              fontSize: "clamp(3rem, 5.5vw, 5.5rem)",
              fontWeight: "var(--weight-bold)",
              fontFamily: "var(--font-heading)",
              letterSpacing: "var(--tracking-tight)",
              lineHeight: 1.08,
              color: "var(--color-fg)",
              margin: "0 0 var(--space-10)",
              maxWidth: "88vw",
            }}>
              Your global regulatory landscape,<br />personalized in five minutes. Daily.
            </h1>

            {/* Animated query input */}
            <TypewriterInput />

            {/* Source ticker — tight spacing below input */}
            <SourceTicker />

            {/* CTAs — more breathing room below ticker */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginTop: "var(--space-8)" }}>
              <Link href="/signup" className="btn btn-primary btn-md">
                Get started
              </Link>
              {hasProfile === true ? (
                <Link href="/feed" className="btn btn-ghost btn-md">
                  Log in
                </Link>
              ) : (
                <button type="button" onClick={() => { setShowGate(true); setShowSignIn(true); }} className="btn btn-ghost btn-md">
                  Log in
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ── Feed ── */}
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 var(--space-6) var(--space-12)", position: "relative" }}>
          {/* Hard fade-out after ~1 card — gate covers the rest */}
          <div style={{
            position: "absolute",
            top: 260, left: 0, right: 0, bottom: 0,
            background: "linear-gradient(to bottom, transparent 0%, var(--color-bg) 20%, var(--color-bg) 100%)",
            pointerEvents: "none",
            zIndex: 5,
          }} />

          {(loading || generating) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
              <div className="skeleton-card" style={{ height: 280 }} />
              <div className="skeleton-card" style={{ height: 180 }} />
              <div className="skeleton-card" style={{ height: 180 }} />
            </div>
          )}

          {!loading && stories.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📰</div>
              <div className="empty-state-title">No stories yet</div>
              <div className="empty-state-desc">Sign up to get your first personalized digest.</div>
              <Link href="/signup" className="btn btn-primary btn-md">Get started</Link>
            </div>
          )}

          {!loading && sections.map(({ section, stories: sectionStories }) => {
            const lead = sectionStories[0];
            const featured = sectionStories.slice(1, 3);
            const rest = sectionStories.slice(3);
            const color = sectionColor(section);
            return (
              <div key={section} style={{ marginBottom: "var(--space-10)" }}>
                {/* Section header */}
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
                  <div style={{ width: 4, height: 20, borderRadius: "var(--radius-full)", background: color }} />
                  <h2 style={{
                    fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-sans)",
                    letterSpacing: "var(--tracking-wider)", textTransform: "uppercase",
                    color: color, margin: 0,
                  }}>
                    {section}
                  </h2>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
                    {sectionStories.length}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
                  {/* Lead story — full image */}
                  {lead && (
                    <article
                      className="news-card card-interactive"
                      style={{ "--news-card-accent": color, display: "flex", flexDirection: "column", cursor: "pointer", padding: 0, overflow: "hidden" } as React.CSSProperties}
                      onClick={openGate}
                    >
                      <StoryImage story={lead} size="lead" />
                      <div style={{ padding: "var(--space-5)" }}>
                        <div className="news-card-meta">
                          <span style={{ color, fontWeight: 600, textTransform: "uppercase" }}>{lead.section}</span>
                          <FreshnessBadge createdAt={lead.created_at} publishedAt={lead.published_at} />
                          <span className={`badge ${lead.severity === "high" ? "badge-danger" : lead.severity === "medium" ? "badge-warning" : "badge-info"}`} style={{ fontSize: "var(--text-2xs)" }}>{lead.severity}</span>
                        </div>
                        <h2 className="news-card-title" style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)", lineHeight: 1.25 }}>
                          {lead.headline}
                        </h2>
                        <p className="news-card-summary" style={{ marginBottom: "var(--space-4)", fontSize: "var(--text-base)" }}>{lead.summary}</p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                          <SourceBlock labels={lead.source_labels || []} urls={lead.source_urls} max={2} />
                          <TrustIndicator sourceCount={lead.source_urls.length} severity={lead.severity} />
                        </div>
                      </div>
                    </article>
                  )}

                  {/* Featured stories — medium image */}
                  {featured.map((s) => (
                    <article
                      key={s.id}
                      className="news-card card-interactive"
                      style={{ "--news-card-accent": sectionColor(s.section), display: "flex", flexDirection: "column", cursor: "pointer", padding: 0, overflow: "hidden" } as React.CSSProperties}
                      onClick={openGate}
                    >
                      <StoryImage story={s} size="medium" />
                      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column" }}>
                        <div className="news-card-meta">
                          <span style={{ color: sectionColor(s.section), fontWeight: 600, textTransform: "uppercase" }}>{s.section}</span>
                          <FreshnessBadge createdAt={s.created_at} publishedAt={s.published_at} />
                        </div>
                        <h3 className="news-card-title" style={{ fontSize: "var(--text-md)", marginBottom: "var(--space-2)" }}>
                          {s.headline}
                        </h3>
                        <p className="news-card-summary">{truncate(s.summary, 160)}</p>
                        <SourceBlock labels={s.source_labels || []} urls={s.source_urls} max={2} />
                      </div>
                    </article>
                  ))}

                  {/* Rest — compact rows, no image */}
                  {rest.map((s) => (
                    <article
                      key={s.id}
                      className="news-card card-interactive"
                      style={{ "--news-card-accent": sectionColor(s.section), display: "flex", flexDirection: "row", cursor: "pointer", padding: "var(--space-4)", gap: "var(--space-4)", alignItems: "center" } as React.CSSProperties}
                      onClick={openGate}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="news-card-meta" style={{ marginBottom: 4 }}>
                          <span style={{ color: sectionColor(s.section), fontWeight: 600, textTransform: "uppercase", fontSize: "var(--text-2xs)" }}>{s.section}</span>
                          <FreshnessBadge createdAt={s.created_at} publishedAt={s.published_at} />
                        </div>
                        <h3 className="news-card-title" style={{ fontSize: "var(--text-md)", marginBottom: 4 }}>
                          {s.headline}
                        </h3>
                        <p className="news-card-summary" style={{ fontSize: "var(--text-xs)", marginBottom: 0 }}>{truncate(s.summary || s.body, 100)}</p>
                        <div style={{ marginTop: "var(--space-2)" }}>
                          <SourceBlock labels={s.source_labels || []} urls={s.source_urls} max={1} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Gate overlay ── */}
      {showGate && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "var(--space-6)", animation: "fadeIn 0.25s ease-out",
          }}
          onClick={dismissGate}
        >
          <div
            style={{
              background: "var(--color-surface)", borderRadius: "var(--radius-xl)",
              padding: "var(--space-8)", maxWidth: 400, width: "100%",
              boxShadow: "var(--shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: "var(--space-3)" }}>
              Get your personalized briefing
            </h2>
            <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", marginBottom: "var(--space-6)", fontFamily: "var(--font-sans)", lineHeight: "var(--leading-relaxed)" }}>
              Create a profile and we&apos;ll deliver AI-curated regulatory intelligence every morning, tailored to your portfolio and markets.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <Link href="/signup" className="btn btn-primary btn-md" style={{ width: "100%", textAlign: "center" }} onClick={dismissGate}>
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
        @keyframes blink { 0%, 100% { opacity: 0.6; } 50% { opacity: 0; } }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .card-interactive:hover { box-shadow: var(--shadow-md); }
      `}</style>
    </div>
  );
}

/* ─── Typewriter animated input ─── */
const QUERIES = [
  "What did FDA Commissioner Makary say this week?",
  "New 510(k) clearances for oncology imaging — 7 days?",
  "Senate HELP Committee pharma hearings this week?",
  "ICH Q13 continuous manufacturing — any new guidance?",
  "WHO prequalification decisions in the last 7 days?",
  "EU AI Act implications for SaMD — any updates?",
  "CMS drug price negotiation list — any changes?",
  "CDER director statements on biosimilar interchangeability?",
];

function TypewriterInput() {
  const [displayText, setDisplayText] = useState("");
  const [queryIdx, setQueryIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const target = QUERIES[queryIdx];
    const delay = deleting ? 18 : 42;
    const timer = setTimeout(() => {
      if (!deleting) {
        if (charIdx < target.length) {
          setDisplayText(target.slice(0, charIdx + 1));
          setCharIdx((c) => c + 1);
        } else {
          setTimeout(() => setDeleting(true), 2200);
        }
      } else {
        if (charIdx > 0) {
          setDisplayText(target.slice(0, charIdx - 1));
          setCharIdx((c) => c - 1);
        } else {
          setDeleting(false);
          setQueryIdx((i) => (i + 1) % QUERIES.length);
        }
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [charIdx, deleting, queryIdx]);

  return (
    <div style={{
      maxWidth: 720, width: "100%",
      background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-xl)", padding: "16px 24px",
      display: "flex", alignItems: "center", gap: 12,
      marginBottom: "var(--space-2)",
      opacity: 0.9,
      boxShadow: "0 2px 16px rgba(0,0,0,0.18)",
    }}>
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5" stroke="var(--color-fg-muted)" strokeWidth="1.5"/>
        <path d="M11 11l3 3" stroke="var(--color-fg-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span style={{
        fontSize: "var(--text-base)", fontFamily: "var(--font-sans)",
        color: "var(--color-fg-muted)", flex: 1, textAlign: "left",
        minHeight: "1.4em", whiteSpace: "nowrap", overflow: "hidden",
      }}>
        {displayText}<span style={{ opacity: 0.6, animation: "blink 1s step-end infinite" }}>|</span>
      </span>
      <span style={{
        fontSize: "var(--text-xs)", color: "var(--color-fg-subtle)",
        fontFamily: "var(--font-sans)", opacity: 0.5, whiteSpace: "nowrap",
        borderLeft: "1px solid var(--color-border)", paddingLeft: 12,
      }}>Ask Mahogany</span>
    </div>
  );
}

/* ─── Scrolling source ticker ─── */
const TICKER_ITEMS = [
  { label: "FDA MedWatch",        dot: "#e05c2a" },
  { label: "EMA CHMP",            dot: "#3b82f6" },
  { label: "MHRA Safety Alerts",  dot: "#8b5cf6" },
  { label: "Health Canada",       dot: "#10b981" },
  { label: "TGA Australia",       dot: "#f59e0b" },
  { label: "WHO Drug Info",       dot: "#ec4899" },
  { label: "Federal Register",    dot: "#6366f1" },
  { label: "DailyMed NDC",        dot: "#14b8a6" },
  { label: "ClinicalTrials.gov",  dot: "#f97316" },
  { label: "FDA 510(k)",          dot: "#e05c2a" },
  { label: "FDA PMA",             dot: "#e05c2a" },
  { label: "OpenFDA",             dot: "#e05c2a" },
  { label: "STAT News",           dot: "#64748b" },
  { label: "Endpoints News",      dot: "#64748b" },
  { label: "BioPharma Dive",      dot: "#64748b" },
  { label: "MedTech Dive",        dot: "#64748b" },
  { label: "FiercePharma",        dot: "#64748b" },
  { label: "GlobeNewswire",       dot: "#94a3b8" },
  { label: "BusinessWire",        dot: "#94a3b8" },
  { label: "PRNewswire Health",   dot: "#94a3b8" },
];

function SourceTicker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{
      maxWidth: 720, width: "100%",
      overflow: "hidden",
      position: "relative",
      marginTop: "var(--space-3)",
      WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 16%, black 84%, transparent 100%)",
      maskImage: "linear-gradient(to right, transparent 0%, black 16%, black 84%, transparent 100%)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        animation: "ticker 38s linear infinite",
        width: "max-content",
      }}>
        {doubled.map((item, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 18px",
            fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)",
            color: "var(--color-fg-subtle)", whiteSpace: "nowrap",
            borderRight: "1px solid var(--color-border)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: item.dot, display: "inline-block", flexShrink: 0 }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Story image with real Unsplash photos ─── */
function StoryImage({ story, size = "medium" }: { story: FeedStory; size?: "lead" | "medium" }) {
  const heroImage = getHeroImage(story.headline + story.section);
  const base = sectionColor(story.section);
  const height = size === "lead" ? 200 : 140;
  const [imgError, setImgError] = useState(false);
  return (
    <div
      style={{
        height, minHeight: height,
        borderRadius: 0,
        position: "relative", overflow: "hidden",
        background: `linear-gradient(135deg, ${base}30 0%, ${base}10 50%, var(--surface-850) 100%)`,
      }}
      aria-hidden
    >
      {!imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImage.url}
          alt={heroImage.alt}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg, ${base}33 0%, transparent 60%)`,
      }} />
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
        background: isNew ? "var(--color-primary-solid)" : "var(--color-surface-raised)",
        color: isNew ? "#fff" : "var(--color-fg-muted)",
      }}>
        {isNew ? "\u26A1 " : ""}{text}
      </span>
      <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 500, color: "var(--color-fg-muted)" }}>
        {contentDate}
      </span>
    </span>
  );
}

/* ─── Trust indicator ─── */
function TrustIndicator({ sourceCount, severity }: { sourceCount: number; severity: string }) {
  if (sourceCount < 1) return null;
  const s = severity.toLowerCase();
  const color = s === "high" ? "var(--color-danger)" : s === "medium" ? "var(--color-warning)" : "var(--color-info)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
        {sourceCount} {sourceCount === 1 ? "source" : "sources"}
      </span>
      <span style={{
        fontSize: "var(--text-2xs)", fontWeight: 700, fontFamily: "var(--font-sans)",
        padding: "2px 8px", borderRadius: "var(--radius-full)",
        background: `${color}22`, color, border: `1px solid ${color}44`,
        textTransform: "capitalize",
      }}>
        {severity}
      </span>
    </div>
  );
}

/* ─── Source block ─── */
function SourceBlock({ labels, urls, max }: { labels: string[]; urls?: string[]; max: number }) {
  const pairs = zipValidSourceLinks(urls || [], labels).slice(0, max);
  if (pairs.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {pairs.map(({ label, url }, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-2xs)", color: "var(--color-primary)", fontFamily: "var(--font-sans)", fontWeight: 500, textDecoration: "none" }}>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--color-border-strong)", flexShrink: 0, display: "inline-block" }} />
          {label}
        </a>
      ))}
    </div>
  );
}
