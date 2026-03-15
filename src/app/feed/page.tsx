"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { THERAPEUTIC_AREAS } from "@/lib/therapeuticAreas";
import { REGION_OPTIONS, PRODUCT_CODE_OPTIONS } from "@/lib/feedFilters";
import Header from "@/components/Header";
import { getHeroImageForStory } from "@/lib/heroImages";

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
  relevance_reason?: string | null;
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
  regulatory_frameworks?: string[];
}

interface WatchItem {
  id: string;
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  watch_type: string;
  status: string;
}

interface ProductSearchResult {
  entity_id?: string;
  name: string;
  generic_name?: string;
  company?: string;
  product_type: string;
  domain: string;
  region: string;
  regulatory_id?: string;
  source: string;
}

function severityAccentColor(severity: string): string {
  const s = (severity || "low").toLowerCase();
  if (s === "high") return "var(--color-danger)";
  if (s === "medium") return "var(--color-warning)";
  return "var(--color-info)";
}

// Deterministic color assignment for dynamic AI-generated sections
const SECTION_PALETTE = [
  "#862b00", "#4ade80", "#60a5fa", "#f0a83a",
  "#a78bfa", "#aca8a3", "#c27f67", "#22d3ee",
  "#c084fc", "#eab308", "#2dd4bf", "#38bdf8",
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

function storyMatchesProfile(story: FeedStory, profile: Profile | null, extraProducts?: WatchItem[]): string[] {
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
  // Also check watched product entity names
  if (extraProducts) {
    for (const wp of extraProducts) {
      const name = wp.canonical_name.toLowerCase();
      if (story.headline.toLowerCase().includes(name) || story.summary.toLowerCase().includes(name)) {
        if (!matches.some((m) => m.toLowerCase() === name)) {
          matches.push(wp.canonical_name);
        }
      }
    }
  }
  return [...new Set(matches)].slice(0, 3);
}

function storyIcon(_section: string): string {
  return "•";
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Hero image for news cards: section-relevant Unsplash images with gradient overlay. */
function StoryImage({ story, size = "medium" }: { story: FeedStory; size?: "lead" | "medium" }) {
  const heroImage = getHeroImageForStory(story);
  const base = sectionColor(story.section);
  const height = size === "lead" ? 200 : 140;
  const [imgError, setImgError] = useState(false);
  return (
    <div
      style={{
        height,
        minHeight: height,
        borderRadius: "var(--radius-md)",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${base}30 0%, ${base}10 50%, var(--surface-850) 100%)`,
      }}
      aria-hidden
    >
      {!imgError && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={heroImage.url}
          alt={heroImage.alt}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "var(--radius-md)",
            display: "block",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${base}33 0%, transparent 60%)`,
          borderRadius: "var(--radius-md)",
        }}
      />
    </div>
  );
}

function FilterChipRow({
  label,
  items,
  labels,
  active,
  onToggle,
  toKey,
}: {
  label: string;
  items: string[];
  labels?: Record<string, string>;
  active: Set<string>;
  onToggle: (key: string) => void;
  toKey: (x: string) => string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {label && <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginRight: 2, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>}
      {items.map((item) => {
        const key = toKey(item);
        const isActive = active.has(key);
        const display = labels?.[item] ?? item;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(key)}
            style={{
              padding: "4px 12px", borderRadius: "var(--radius-full)",
              fontSize: "var(--text-xs)", fontWeight: 500, cursor: "pointer",
              background: isActive ? "var(--color-primary-subtle)" : "transparent",
              color: isActive ? "var(--color-primary)" : "var(--color-fg-secondary)",
              border: isActive ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
              fontFamily: "var(--font-sans)",
              transition: "all 0.15s ease",
            }}
          >
            {display}
          </button>
        );
      })}
    </div>
  );
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

  // Filter chips: use chip state only when fetching — no profile fallback.
  // Initialized from profile on load; deselecting all = broad feed for that dimension.
  const [activeTAs, setActiveTAs] = useState<Set<string>>(new Set());
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const [activeDomains, setActiveDomains] = useState<Set<string>>(new Set());
  const [activeProductCodes, setActiveProductCodes] = useState<Set<string>>(new Set());

  // Time period filter: "7" | "14" | "30" | "90" | "all"
  const [timePeriod, setTimePeriod] = useState<string>("30");

  // Product filter state
  const [watchedProducts, setWatchedProducts] = useState<WatchItem[]>([]);
  const [activeProductFilters, setActiveProductFilters] = useState<Set<string>>(new Set());
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<ProductSearchResult[]>([]);
  const [searchingNewProduct, setSearchingNewProduct] = useState(false);
  const productSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();
  useEffect(() => {
    fetch("/api/profiles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) {
          router.replace("/onboarding");
          return;
        }
        const regions = p.regions || [];
        const domains = p.domains || [];
        if (regions.length === 0 || domains.length === 0) {
          router.replace("/onboarding");
          return;
        }
        setProfile(p);
        // Pre-populate filters from profile so user sees relevant content by default.
        const profileTAs = (p.therapeutic_areas || []).map((t: string) => {
          const low = t.toLowerCase().trim();
          const match = THERAPEUTIC_AREAS.find((ta) => ta.toLowerCase() === low);
          return match ? match.toLowerCase() : low;
        });
        setActiveTAs(new Set(profileTAs));
        setActiveRegions(new Set(p.regions || []));
        setActiveDomains(new Set(p.domains || []));
        // Load product watch items
        fetch(`/api/profiles/${p.id}/watch-items`)
          .then((r) => r.json())
          .then((data) => {
            setWatchedProducts((data.items || []).filter((i: WatchItem) => i.entity_type === "product"));
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

  const expandTA = useCallback((t: string): string[] => {
    const low = t.toLowerCase().trim();
    const out: string[] = [low];
    if (low.includes("wound") || low.includes("dressing")) out.push("wound care");
    if (low === "hematoma") out.push("hematology");
    return out;
  }, []);

  const fetchStories = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ per_page: "60" });
    // Use chip state only — no profile fallback. Empty = no filter (broad).
    if (activeRegions.size > 0) params.set("regions", [...activeRegions].join(","));
    if (activeDomains.size > 0) params.set("domains", [...activeDomains].join(","));
    if (activeTAs.size > 0) {
      const tas = [...new Set([...activeTAs].flatMap(expandTA))];
      params.set("therapeutic_areas", tas.join(","));
    }
    if (activeProductCodes.size > 0) params.set("product_codes", [...activeProductCodes].join(","));
    if (timePeriod !== "all") params.set("since_days", timePeriod);
    try {
      const res = await fetch(`/api/feed/stories?${params}`);
      const data = await res.json();
      setStories(data.stories || []);
      setTotal(data.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [activeRegions, activeDomains, activeTAs, activeProductCodes, timePeriod, expandTA]);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  // Fade-in scroll animation + active section tracking
  useEffect(() => {
    if (loading || stories.length === 0) return;

    // Fade-in observer for articles
    const fadeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("article-visible");
            fadeObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    setTimeout(() => {
      document.querySelectorAll(".feed-article").forEach((el) => fadeObserver.observe(el));
    }, 0);

    // Section tracking observer for active pill highlight
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionName = entry.target.getAttribute("data-section");
            if (sectionName) setActiveSectionInView(sectionName);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -60% 0px" }
    );
    document.querySelectorAll("[data-section]").forEach((el) => sectionObserver.observe(el));

    return () => {
      fadeObserver.disconnect();
      sectionObserver.disconnect();
    };
  }, [loading, stories.length]);

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
      const tas = activeTAs.size > 0 ? [...new Set([...activeTAs].flatMap(expandTA))] : [];
      const res = await fetch("/api/feed/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: q.trim(),
          therapeutic_areas: tas,
          regions: activeRegions.size > 0 ? [...activeRegions] : undefined,
          domains: activeDomains.size > 0 ? [...activeDomains] : undefined,
          product_codes: activeProductCodes.size > 0 ? [...activeProductCodes] : undefined,
        }),
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
  }, [fetchStories, activeTAs, activeRegions, activeDomains, activeProductCodes, expandTA]);

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

  // Product filter handlers
  const toggleProductFilter = (entityId: string) => {
    setActiveProductFilters((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const clearProductFilters = () => setActiveProductFilters(new Set());

  const handleProductSearchForFeed = async (q: string) => {
    if (!q || q.trim().length < 2) {
      setProductSearchResults([]);
      return;
    }
    const domain = profile?.domains?.length === 1 ? profile.domains[0] : "both";
    setSearchingNewProduct(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}&domain=${domain}`);
      const data = await res.json();
      setProductSearchResults(data.results || []);
    } catch {
      setProductSearchResults([]);
    }
    setSearchingNewProduct(false);
  };

  const handleProductSearchInputChange = (val: string) => {
    setProductSearchInput(val);
    if (productSearchTimerRef.current) clearTimeout(productSearchTimerRef.current);
    if (!val.trim()) {
      setProductSearchResults([]);
      return;
    }
    productSearchTimerRef.current = setTimeout(() => handleProductSearchForFeed(val), 400);
  };

  const addProductFromFeed = async (p: ProductSearchResult, watchType: "exact" | "competitor") => {
    if (!profile) return;
    try {
      const res = await fetch("/api/products/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profile.id, product: p, watch_type: watchType }),
      });
      const data = await res.json();
      if (data.item) {
        setWatchedProducts((prev) => [...prev, data.item]);
      }
    } catch { /* ignore */ }
    setShowProductSearch(false);
    setProductSearchInput("");
    setProductSearchResults([]);
  };

  const clearAllWatchItems = async () => {
    if (!profile) return;
    try {
      await fetch(`/api/profiles/${profile.id}/watch-items`, { method: "DELETE" });
      setWatchedProducts([]);
      setActiveProductFilters(new Set());
    } catch { /* ignore */ }
  };

  const removeProductFromFeed = async (item: WatchItem) => {
    if (!profile) return;
    try {
      await fetch(`/api/profiles/${profile.id}/watch-items/${item.id}`, { method: "DELETE" });
      setWatchedProducts((prev) => prev.filter((p) => p.id !== item.id));
      setActiveProductFilters((prev) => {
        const next = new Set(prev);
        next.delete(item.entity_id);
        return next;
      });
    } catch { /* ignore */ }
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

  // Derive insights from stories
  const insights = !loading && stories.length > 0 ? (() => {
    const bySeverity = { high: 0, medium: 0, low: 0 };
    const byRegion = new Map<string, number>();
    for (const s of stories) {
      const sev = (s.severity || "low").toLowerCase();
      bySeverity[sev === "high" ? "high" : sev === "medium" ? "medium" : "low"]++;
      for (const r of s.regions || []) {
        byRegion.set(r, (byRegion.get(r) || 0) + 1);
      }
    }
    return { bySeverity, byRegion: Array.from(byRegion.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4) };
  })() : null;

  // Filter stories by active product pills
  const filteredStories = activeProductFilters.size > 0
    ? stories.filter((s) => {
        const text = (s.headline + " " + s.summary).toLowerCase();
        return watchedProducts
          .filter((wp) => activeProductFilters.has(wp.entity_id))
          .some((wp) => text.includes(wp.canonical_name.toLowerCase()));
      })
    : stories;

  // Snapshot view filter: "all" | "high" | section name
  const [snapshotView, setSnapshotView] = useState<"all" | "high" | string>("all");

  // Active section in viewport (for pill highlight)
  const [activeSectionInView, setActiveSectionInView] = useState<string | null>(null);
  const sectionCounts = (() => {
    const m = new Map<string, number>();
    for (const s of filteredStories) {
      const sec = s.section || "Regulatory Updates";
      m.set(sec, (m.get(sec) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  })();
  const displayStories = (() => {
    if (snapshotView === "all") return filteredStories;
    if (snapshotView === "high") return filteredStories.filter((s) => (s.severity || "").toLowerCase() === "high");
    if (snapshotView === "medium-sev") return filteredStories.filter((s) => (s.severity || "").toLowerCase() === "medium");
    if (snapshotView === "low-sev") return filteredStories.filter((s) => (s.severity || "").toLowerCase() === "low");
    if (snapshotView.startsWith("region-")) {
      const region = snapshotView.slice(7);
      return filteredStories.filter((s) => s.regions.some((r) => r === region));
    }
    return filteredStories.filter((s) => (s.section || "Regulatory Updates") === snapshotView);
  })();

  // Date range string for snapshot tags — derived from selected time period (accurate)
  const dateRangeStr = (() => {
    if (timePeriod === "all") return "All time";
    const days = parseInt(timePeriod, 10);
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(from)} – ${fmt(now)}`;
  })();

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />

      {/* ── LAYOUT: Sidebar + Main (2-col desktop, stacked mobile: filters + search at top, feed below) ── */}
      <div className="feed-layout" style={{ display: "grid", gridTemplateColumns: "280px 1fr", padding: "var(--space-6) var(--space-6) var(--space-16)", paddingRight: "calc(var(--copilot-width, 360px) + var(--space-6))", gap: "var(--space-6)", transition: "padding-right 0.25s ease" }}>

        {/* ── SIDEBAR: Filters + Watched Products (top on mobile) ── */}
        <aside className="feed-sidebar hide-scrollbar" style={{ position: "sticky", top: "calc(var(--topbar-height) + var(--space-6))", alignSelf: "start", maxHeight: "calc(100vh - var(--topbar-height) - var(--space-12))", overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Time period filter — always visible */}
          <div className="container-block" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-fg)", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Time Period</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[{ key: "7", label: "7 days" }, { key: "14", label: "14 days" }, { key: "30", label: "30 days" }, { key: "90", label: "90 days" }, { key: "all", label: "All time" }].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setTimePeriod(key); setTimeout(() => fetchStories(), 0); }}
                  style={{
                    padding: "4px 12px", borderRadius: "var(--radius-full)",
                    fontSize: "var(--text-xs)", fontWeight: 500, cursor: "pointer",
                    background: timePeriod === key ? "var(--color-primary-subtle)" : "transparent",
                    color: timePeriod === key ? "var(--color-primary)" : "var(--color-fg-secondary)",
                    border: timePeriod === key ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                    fontFamily: "var(--font-sans)", transition: "all 0.15s ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Filter blocks — each category in its own container */}
          {profile && (
            <>
              <div className="container-block" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-fg)", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Therapeutic Areas</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => {
                      setActiveTAs(new Set()); setActiveRegions(new Set()); setActiveDomains(new Set()); setActiveProductCodes(new Set());
                      setTimeout(() => fetchStories(), 0);
                    }} style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-sans)" }}>Clear filters</button>
                    <button type="button" onClick={() => {
                      const pt = (profile.therapeutic_areas || []).map((t: string) => { const l = t.toLowerCase().trim(); const m = THERAPEUTIC_AREAS.find((a) => a.toLowerCase() === l); return m ? m.toLowerCase() : l; });
                      setActiveTAs(new Set(pt)); setActiveRegions(new Set(profile.regions || [])); setActiveDomains(new Set(profile.domains || [])); setActiveProductCodes(new Set());
                      setTimeout(() => fetchStories(), 0);
                    }} style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-sans)" }}>Match my profile</button>
                  </div>
                </div>
                <FilterChipRow label="" items={[...THERAPEUTIC_AREAS]} active={activeTAs} onToggle={(key) => { setActiveTAs((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); setTimeout(() => fetchStories(), 0); }} toKey={(x) => x.toLowerCase().trim()} />
              </div>
              <div className="container-block" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-fg)", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Markets</span>
                <FilterChipRow label="" items={REGION_OPTIONS.map((r) => r.id)} labels={Object.fromEntries(REGION_OPTIONS.map((r) => [r.id, r.label]))} active={activeRegions} onToggle={(key) => { setActiveRegions((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); setTimeout(() => fetchStories(), 0); }} toKey={(x) => x} />
              </div>
              <div className="container-block" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-fg)", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Domains</span>
                <FilterChipRow label="" items={["devices", "pharma"]} labels={{ devices: "Medical Devices", pharma: "Pharma & Biologics" }} active={activeDomains} onToggle={(key) => { setActiveDomains((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); setTimeout(() => fetchStories(), 0); }} toKey={(x) => x} />
              </div>
              <div className="container-block" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-fg)", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Product Codes</span>
                <FilterChipRow label="" items={[...PRODUCT_CODE_OPTIONS]} active={activeProductCodes} onToggle={(key) => { setActiveProductCodes((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); setTimeout(() => fetchStories(), 0); }} toKey={(x) => x} />
              </div>
            </>
          )}

          {/* Watched products block */}
          <div className="container-block" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-fg)", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Watched Products</span>
            {watchedProducts.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {watchedProducts.map((wp) => (
                  <span key={wp.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <button type="button" onClick={() => toggleProductFilter(wp.entity_id)} style={{
                      padding: "3px 8px", borderRadius: "var(--radius-full)",
                      fontSize: "var(--text-2xs)", fontWeight: 500, cursor: "pointer",
                      background: activeProductFilters.has(wp.entity_id) ? "var(--color-primary-subtle)" : "transparent",
                      color: activeProductFilters.has(wp.entity_id) ? "var(--color-primary)" : "var(--color-fg-muted)",
                      border: activeProductFilters.has(wp.entity_id) ? "1px solid var(--color-primary-muted)" : "1px solid var(--color-border)",
                      fontFamily: "var(--font-sans)",
                    }}>{wp.canonical_name}</button>
                    <button type="button" onClick={() => removeProductFromFeed(wp)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-fg-placeholder)", fontSize: 10, padding: 0 }}>&times;</button>
                  </span>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setShowProductSearch((v) => !v)} style={{
              fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
              padding: "4px 10px", borderRadius: "var(--radius-full)",
              background: "transparent", color: "var(--color-fg-muted)",
              border: "1px solid var(--color-border)", alignSelf: "flex-start",
            }}>+ Add product</button>
            {showProductSearch && (
              <div style={{ position: "relative", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 8 }}>
                <input className="input" value={productSearchInput} onChange={(e) => handleProductSearchInputChange(e.target.value)} placeholder="Search products..." autoFocus style={{ width: "100%", padding: 8, fontSize: "var(--text-sm)", marginBottom: 4 }} />
                {searchingNewProduct && <div style={{ padding: 8, fontSize: "var(--text-xs)", color: "var(--color-fg-muted)" }}>Searching…</div>}
                {productSearchResults.map((p, i) => (
                  <div key={`${p.name}-${i}`} style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "var(--text-xs)", flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.name}</div>{p.company && <div style={{ color: "var(--color-fg-muted)" }}>{p.company}</div>}</div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button type="button" onClick={() => addProductFromFeed(p, "exact")} style={{ fontSize: "var(--text-2xs)", padding: "2px 6px", borderRadius: "var(--radius-sm)", background: "var(--color-primary-subtle)", color: "var(--color-primary)", border: "1px solid var(--color-primary-muted)", cursor: "pointer" }}>Mine</button>
                      <button type="button" onClick={() => addProductFromFeed(p, "competitor")} style={{ fontSize: "var(--text-2xs)", padding: "2px 6px", borderRadius: "var(--radius-sm)", background: "var(--color-surface-raised)", color: "var(--color-fg-muted)", border: "1px solid var(--color-border)", cursor: "pointer" }}>Comp</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN CONTENT: Search + Feed (below filters on mobile) ── */}
        <main className="feed-main" style={{ maxWidth: 960, margin: "0 auto", width: "100%" }}>
          {/* Heading */}
          <div style={{ marginBottom: "var(--space-6)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)" }}>
              <div>
                <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", margin: 0, lineHeight: "var(--leading-tight)" }}>
                  {profile ? `${profile.name.split(" ")[0]}\u2019s Briefing` : "Regulatory Briefing"}
                </h1>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginTop: 6, fontFamily: "var(--font-sans)" }}>
                  {dateRangeStr}
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || loading}
                title="Regenerate feed with latest signals and current filters"
                style={{
                  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                  padding: "8px 14px", borderRadius: "var(--radius-full)",
                  fontSize: "var(--text-xs)", fontWeight: 600, cursor: generating || loading ? "not-allowed" : "pointer",
                  background: "var(--color-surface-raised)", color: generating || loading ? "var(--color-fg-muted)" : "var(--color-fg)",
                  border: "1px solid var(--color-border)", fontFamily: "var(--font-sans)",
                  transition: "all 0.15s ease", opacity: generating || loading ? 0.6 : 1,
                }}
              >
                <svg
                  width="13" height="13" viewBox="0 0 16 16" fill="none"
                  style={{ animation: generating ? "spin 1s linear infinite" : "none" }}
                >
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M8 1l2.5 2L8 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {generating ? "Regenerating…" : "Deep refresh"}
              </button>
            </div>
          </div>

          {/* Search bar — bigger */}
          <form onSubmit={(e) => { e.preventDefault(); handleSemanticSearch(searchInput); }} style={{ marginBottom: "var(--space-6)" }}>
            <div style={{ position: "relative" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", opacity: 0.5, pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input value={searchInput} onChange={(e) => handleSearchInputChange(e.target.value)}
                placeholder="Ask about today's stories..."
                style={{
                  width: "100%", fontSize: "var(--text-md)", padding: "16px 56px 16px 52px",
                  fontFamily: "var(--font-sans)", color: "var(--color-fg)",
                  border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)",
                  background: "var(--surface-800)", outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.2s ease",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              />
              <button type="submit"
                style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 36, height: 36, borderRadius: "50%",
                  background: searchInput.trim() ? "var(--color-primary-solid)" : "transparent",
                  color: searchInput.trim() ? "#fff" : "var(--color-fg-muted)",
                  border: "none", cursor: searchInput.trim() ? "pointer" : "default",
                  transition: "background 0.15s ease",
                }}
                aria-label="Search">
                {searchMode === "searching" ? (
                  <span style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "searchSpin 0.6s linear infinite" }} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </form>

          {/* Snapshot tags row — inline, no wrapper card */}
          {(insights || stories.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--space-6)", alignItems: "center" }}>
              {dateRangeStr && (
                <button type="button" onClick={() => setSnapshotView("all")} style={{
                  fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
                  padding: "3px 10px", borderRadius: "var(--radius-full)",
                  background: snapshotView === "all" ? "var(--color-primary-subtle)" : "var(--surface-800)",
                  color: snapshotView === "all" ? "var(--color-primary)" : "var(--color-fg-muted)",
                  border: snapshotView === "all" ? "1px solid var(--color-primary-muted)" : "1px solid var(--color-border)",
                  fontWeight: snapshotView === "all" ? 600 : 400,
                }}>
                  {dateRangeStr}
                </button>
              )}
              {insights && (
                <>
                  <button type="button" onClick={() => setSnapshotView(snapshotView === "high" ? "all" : "high")} style={{
                    fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
                    padding: "3px 10px", borderRadius: "var(--radius-full)", border: "none",
                    background: snapshotView === "high" ? "rgba(224,84,84,0.2)" : "rgba(224,84,84,0.1)",
                    color: "var(--color-danger)", fontWeight: snapshotView === "high" ? 600 : 400,
                  }}>
                    {insights.bySeverity.high} high
                  </button>
                  <button type="button" onClick={() => setSnapshotView(snapshotView === "medium-sev" ? "all" : "medium-sev")} style={{
                    fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
                    padding: "3px 10px", borderRadius: "var(--radius-full)", border: "none",
                    background: "rgba(240,168,58,0.1)", color: "var(--color-warning)",
                  }}>
                    {insights.bySeverity.medium} med
                  </button>
                  <button type="button" onClick={() => setSnapshotView(snapshotView === "low-sev" ? "all" : "low-sev")} style={{
                    fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
                    padding: "3px 10px", borderRadius: "var(--radius-full)", border: "none",
                    background: "rgba(90,156,245,0.08)", color: "var(--color-info)",
                  }}>
                    {insights.bySeverity.low} low
                  </button>
                  {insights.byRegion.slice(0, 3).map(([r, n]) => (
                    <button key={r} type="button" onClick={() => setSnapshotView(snapshotView === `region-${r}` ? "all" : `region-${r}`)} style={{
                      fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
                      padding: "3px 10px", borderRadius: "var(--radius-full)",
                      background: snapshotView === `region-${r}` ? "var(--color-primary-subtle)" : "var(--surface-800)",
                      color: snapshotView === `region-${r}` ? "var(--color-primary)" : "var(--color-fg-muted)",
                      border: snapshotView === `region-${r}` ? "1px solid var(--color-primary-muted)" : "1px solid var(--color-border)",
                      fontWeight: snapshotView === `region-${r}` ? 600 : 400,
                    }}>
                      {r}: {n}
                    </button>
                  ))}
                </>
              )}
              {sectionCounts.map(([sec, n]) => (
                <button key={sec} type="button" onClick={() => {
                  document.getElementById(slugify(sec))?.scrollIntoView({ behavior: "smooth", block: "start" });
                }} style={{
                  fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
                  padding: "3px 10px", borderRadius: "var(--radius-full)",
                  background: activeSectionInView === sec ? "var(--color-primary-subtle)" : "var(--surface-800)",
                  color: activeSectionInView === sec ? "var(--color-primary)" : "var(--color-fg-muted)",
                  border: activeSectionInView === sec ? "1px solid var(--color-primary-muted)" : "1px solid var(--color-border)",
                  fontWeight: activeSectionInView === sec ? 600 : 400,
                }}>
                  {sec} ({n})
                </button>
              ))}
              {snapshotView !== "all" && (
                <button type="button" onClick={() => setSnapshotView("all")} style={{
                  fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", cursor: "pointer",
                  padding: "3px 10px", borderRadius: "var(--radius-full)",
                  background: "transparent", color: "var(--color-fg-muted)",
                  border: "1px solid var(--color-border)", fontWeight: 500,
                }}>
                  Clear filter
                </button>
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ borderBottom: "1px solid var(--color-border)", marginBottom: "var(--space-8)" }} />

        {loading && (
          <div style={{ padding: "var(--space-4) 0" }}>
            {searchMode === "searching" ? (
              <p style={{ color: "var(--color-fg-muted)", padding: "var(--space-8)", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
                Searching with AI&hellip;
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                <div className="skeleton-card" style={{ height: 360 }} />
                <div className="skeleton-card" style={{ height: 200 }} />
                <div className="skeleton-card" style={{ height: 200 }} />
                <div className="skeleton-card" style={{ height: 140 }} />
              </div>
            )}
          </div>
        )}

        {/* Semantic search answer banner */}
        {searchMode === "results" && searchAnswer && !loading && (
          <div style={{
            padding: "12px 16px", marginBottom: "var(--space-8)",
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

        {/* ── STORY FEED grouped by AI category ── */}
        {!loading && displayStories.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-12)" }}>
            {groupBySection(displayStories).map(({ section, stories: sectionStories }) => {
              const lead = sectionStories[0];
              return (
                <div key={section} id={slugify(section)} data-section={section}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}>
                    <span style={{
                      fontSize: "var(--text-2xs)", fontWeight: 700, fontFamily: "var(--font-sans)",
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      padding: "3px 10px", borderRadius: "var(--radius-full)",
                      background: `${sectionColor(section)}18`,
                      color: sectionColor(section),
                      border: `1px solid ${sectionColor(section)}40`,
                    }}>
                      {section}
                    </span>
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
                      {sectionStories.length}
                    </span>
                  </div>
                  <div className="news-section-articles" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                    {lead && (
                      <Link href={`/stories/${lead.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <article className="news-card card-interactive feed-article" style={{ "--news-card-accent": severityAccentColor(lead.severity), cursor: "pointer", padding: "var(--space-6)", borderBottom: "1px solid var(--color-border)" } as React.CSSProperties}>
                          <h2 className="news-card-title" style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)", lineHeight: 1.25 }}>
                            {lead.headline}
                          </h2>
                          <p className="news-card-summary" style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-base)" }}>{truncate(lead.summary, 320)}</p>
                          <ProfileMatchTags story={lead} profile={profile} extraProducts={watchedProducts} />
                          <RelevanceReason reason={lead.relevance_reason} />
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-3)" }}>
                            <div className="news-card-meta" style={{ margin: 0 }}>
                              <FreshnessBadge createdAt={lead.created_at} publishedAt={lead.published_at} />
                              <TrustIndicator sourceCount={lead.source_urls.length} severity={lead.severity} sourceLabels={lead.source_labels} sourceUrls={lead.source_urls} />
                            </div>
                            <FeedbackButtons storyId={lead.id} />
                          </div>
                        </article>
                      </Link>
                    )}
                    {sectionStories.slice(1).map((s) => (
                      <Link key={s.id} href={`/stories/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <article className="news-card card-interactive feed-article" style={{ "--news-card-accent": severityAccentColor(s.severity), cursor: "pointer", padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border)" } as React.CSSProperties}>
                          <h3 className="news-card-title" style={{ fontSize: "var(--text-md)", marginBottom: "var(--space-2)" }}>
                            {s.headline}
                          </h3>
                          <p className="news-card-summary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>{truncate(s.summary || s.body, 220)}</p>
                          <ProfileMatchTags story={s} profile={profile} extraProducts={watchedProducts} />
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-2)" }}>
                            <div className="news-card-meta" style={{ margin: 0 }}>
                              <FreshnessBadge createdAt={s.created_at} publishedAt={s.published_at} />
                              <TrustIndicator sourceCount={s.source_urls.length} severity={s.severity} sourceLabels={s.source_labels} sourceUrls={s.source_urls} />
                            </div>
                            <FeedbackButtons storyId={s.id} />
                          </div>
                        </article>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && displayStories.length === 0 && filteredStories.length > 0 && (
          <p style={{ color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
            No stories match the current view. Try clearing the filter.
          </p>
        )}
        </main>
      </div>

      <style>{`
        @keyframes searchSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .feed-article {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .feed-article.article-visible {
          opacity: 1;
          transform: translateY(0);
        }
        @media (max-width: 767px) {
          .feed-layout {
            display: flex !important;
            flex-direction: column !important;
            grid-template-columns: none !important;
            padding: var(--space-4) !important;
            gap: var(--space-4) !important;
          }
          .feed-sidebar {
            order: 1 !important;
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
            flex-shrink: 0;
          }
          .feed-sidebar .container-block {
            padding: var(--space-3) !important;
          }
          .feed-main {
            order: 2 !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ─── Relevance reason ─── */
function RelevanceReason({ reason }: { reason?: string | null }) {
  if (!reason) return null;
  return (
    <p style={{
      fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontStyle: "italic",
      color: "var(--color-fg-muted)", lineHeight: "var(--leading-normal)",
      margin: 0, marginBottom: 6,
    }}>
      Why this matters: {reason}
    </p>
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
function ProfileMatchTags({ story, profile, extraProducts }: { story: FeedStory; profile: Profile | null; extraProducts?: WatchItem[] }) {
  const matches = storyMatchesProfile(story, profile, extraProducts);
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
          background: signal === "down" ? "var(--color-danger-bg)" : "transparent",
          color: signal === "down" ? "var(--color-danger)" : "var(--color-fg-muted)",
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
function TrustIndicator({ sourceCount, severity, sourceLabels, sourceUrls }: { sourceCount: number; severity: string; sourceLabels?: string[]; sourceUrls?: string[] }) {
  const severityClass = severity === "high" ? "badge-danger" : severity === "medium" ? "badge-warning" : "badge-info";
  // Dedupe labels, take first 2
  const seen = new Set<string>();
  const displaySources: { label: string; url?: string }[] = [];
  for (let i = 0; i < (sourceLabels?.length ?? 0) && displaySources.length < 2; i++) {
    const label = sourceLabels![i];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    displaySources.push({ label, url: sourceUrls?.[i] });
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span className={`badge ${severityClass}`} style={{ fontSize: "var(--text-2xs)", padding: "1px 6px" }}>
        {severity}
      </span>
      {displaySources.length > 0 ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {displaySources.map((src, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              {i > 0 && <span style={{ color: "var(--color-border-strong)", fontSize: 10 }}>·</span>}
              {src.url ? (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: "var(--text-2xs)", color: "var(--color-primary)", fontFamily: "var(--font-sans)", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  {src.label.length > 28 ? src.label.slice(0, 28) + "…" : src.label}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, verticalAlign: "middle", opacity: 0.6 }}>
                    <path d="M7 17 17 7" /><path d="M7 7h10v10" />
                  </svg>
                </a>
              ) : (
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-secondary)", fontFamily: "var(--font-sans)", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {src.label.length > 28 ? src.label.slice(0, 28) + "…" : src.label}
                </span>
              )}
            </span>
          ))}
          {sourceCount > 2 && (
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)" }}>
              +{sourceCount - 2} more
            </span>
          )}
        </span>
      ) : sourceCount > 0 ? (
        <span className="trust-badge">{sourceCount} {sourceCount === 1 ? "source" : "sources"}</span>
      ) : null}
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
