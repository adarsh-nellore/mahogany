"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Breadcrumbs from "@/components/Breadcrumbs";
import { THERAPEUTIC_AREAS } from "@/lib/therapeuticAreas";
import { REGION_OPTIONS } from "@/lib/feedFilters";

const DEVICE_PRODUCT_TYPES = ["SaMD", "IVD", "Implant", "AI/ML Device", "Wearable", "Imaging", "Surgical Instrument", "Combo Product"];
const PHARMA_PRODUCT_TYPES = ["Drug", "Biologic", "Biosimilar", "Generic", "OTC", "Vaccine", "Gene Therapy", "Cell Therapy"];

interface DigestListItem {
  id: string;
  signal_ids: string[];
  sent_at: string;
  preview: string;
}

interface Profile {
  id: string;
  therapeutic_areas: string[];
  regions: string[];
  domains: string[];
  product_types: string[];
  tracked_products: string[];
  active_submissions: string[];
  competitors: string[];
  digest_cadence: string;
  digest_send_hour: number;
  timezone?: string;
  analysis_preferences: string;
}

const CADENCE_OPTIONS = [
  { id: "daily", label: "Every morning" },
  { id: "twice_weekly", label: "Twice a week" },
  { id: "weekly", label: "Once a week" },
];
const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern (US)" },
  { value: "America/Chicago", label: "Central (US)" },
  { value: "America/Los_Angeles", label: "Pacific (US)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const DEBOUNCE_MS = 500;

function groupByDate(items: DigestListItem[]): Record<string, DigestListItem[]> {
  const groups: Record<string, DigestListItem[]> = {};
  for (const d of items) {
    const key = new Date(d.sent_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    (groups[key] ||= []).push(d);
  }
  return groups;
}

function extractTitle(preview: string): string {
  const lines = preview.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return "Digest";
  let first = lines[0].replace(/^#+\s*/, "").trim();
  if (first.length > 100) first = first.slice(0, 97) + "...";
  return first;
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--space-5)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>{title}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-fg-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--space-2)", fontFamily: "var(--font-sans)" }}>{label}</label>
      {children}
    </div>
  );
}

export default function DigestPage() {
  const [digests, setDigests] = useState<DigestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<"sent" | "failed" | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/digests?per_page=50")
      .then((r) => r.json())
      .then((data) => { setDigests(data.digests || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/profiles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p) {
          setProfile(p);
          initialLoadRef.current = true;
          setTimeout(() => { initialLoadRef.current = false; }, 400);
        }
      })
      .catch(() => {});
  }, []);

  const save = useCallback(async (p: Profile) => {
    try {
      const res = await fetch(`/api/profiles/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regions: p.regions,
          domains: p.domains,
          therapeutic_areas: p.therapeutic_areas,
          product_types: p.product_types,
          tracked_products: p.tracked_products,
          active_submissions: p.active_submissions,
          competitors: p.competitors,
          digest_cadence: p.digest_cadence,
          digest_send_hour: p.digest_send_hour,
          timezone: p.timezone || "UTC",
          analysis_preferences: p.analysis_preferences,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (!profile || initialLoadRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      save(profile);
    }, DEBOUNCE_MS);
  }, [profile, save]);

  useEffect(() => {
    if (profile && !initialLoadRef.current) scheduleSave();
    if (profile) initialLoadRef.current = false;
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [profile, scheduleSave]);

  const update = useCallback(<K extends keyof Profile>(fields: Pick<Profile, K>) => {
    setProfile((p) => (p ? { ...p, ...fields } : null));
  }, []);

  const toggle = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  const groups = groupByDate(digests);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--space-5) var(--space-6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <Breadcrumbs items={[{ label: "Feed", href: "/feed" }, { label: "Digests" }]} />
          {saveStatus === "saved" && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)", fontWeight: 600 }}>Saved</span>}
          {saveStatus === "error" && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>Save failed</span>}
        </div>

        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", margin: "0 0 var(--space-2)", fontFamily: "var(--font-sans)" }}>
          Digest
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", margin: "0 0 var(--space-5)", fontFamily: "var(--font-sans)" }}>
          Configure your feed scope, portfolio, and email digest. All changes are saved automatically.
        </p>

        {/* Regulatory Scope */}
        {profile && (
          <Section title="Regulatory Scope" desc="Markets, domains, therapeutic areas, and product types — drives feed and digest">
            <FieldGroup label="Regions">
              <ChipSelector
                options={REGION_OPTIONS.map((r) => r.id)}
                labels={Object.fromEntries(REGION_OPTIONS.map((r) => [r.id, r.label]))}
                selected={profile.regions || []}
                onToggle={(r) => update({ regions: toggle(profile.regions || [], r) })}
              />
            </FieldGroup>
            <FieldGroup label="Domains">
              <ChipSelector options={["devices", "pharma"]} labels={{ devices: "Medical Devices", pharma: "Pharma & Biologics" }} selected={profile.domains || []} onToggle={(d) => update({ domains: toggle(profile.domains || [], d) })} />
            </FieldGroup>
            <FieldGroup label="Therapeutic Areas">
              <ChipSelector options={[...THERAPEUTIC_AREAS]} selected={profile.therapeutic_areas || []} onToggle={(t) => update({ therapeutic_areas: toggle(profile.therapeutic_areas || [], t.toLowerCase()) })} />
            </FieldGroup>
            <FieldGroup label="Product Types">
              {(() => {
                const opts = [
                  ...(profile.domains?.includes("devices") ? DEVICE_PRODUCT_TYPES : []),
                  ...(profile.domains?.includes("pharma") ? PHARMA_PRODUCT_TYPES : []),
                ];
                return opts.length > 0 ? (
                  <ChipSelector options={opts} selected={profile.product_types || []} onToggle={(p) => update({ product_types: toggle(profile.product_types || [], p) })} />
                ) : (
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)" }}>Select domains first.</p>
                );
              })()}
            </FieldGroup>
          </Section>
        )}

        {/* Portfolio */}
        {profile && (
          <Section title="Portfolio" desc="Tracked products, key numbers (active submissions), and competitors">
            <FieldGroup label="Tracked Products">
              <TagEditor tags={profile.tracked_products || []} setTags={(t) => update({ tracked_products: t })} placeholder="Add a product..." />
            </FieldGroup>
            <FieldGroup label="Key Numbers / Active Submissions">
              <TagEditor tags={profile.active_submissions || []} setTags={(t) => update({ active_submissions: t })} placeholder="Add submission numbers..." />
            </FieldGroup>
            <FieldGroup label="Competitors">
              <TagEditor tags={profile.competitors || []} setTags={(t) => update({ competitors: t })} placeholder="Add a competitor..." />
            </FieldGroup>
          </Section>
        )}

        {/* Tracked Items */}
        {profile && <TrackedItemsSection profileId={profile.id} />}

        {/* Digest configuration */}
        {profile && (
          <Section title="Digest Settings" desc="Email frequency, send time, and AI instructions — auto-saved">
            <FieldGroup label="Frequency">
              <div style={{ display: "flex", gap: 8 }}>
                {CADENCE_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => update({ digest_cadence: c.id })}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      border: profile.digest_cadence === c.id ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                      background: profile.digest_cadence === c.id ? "var(--color-primary-subtle)" : "var(--color-surface)",
                      color: profile.digest_cadence === c.id ? "var(--color-primary)" : "var(--color-fg-muted)",
                      cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </FieldGroup>
            <FieldGroup label="Send Time">
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={profile.digest_send_hour}
                  onChange={(e) => update({ digest_send_hour: parseInt(e.target.value, 10) })}
                  style={{ padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)" }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                  ))}
                </select>
                <select
                  value={profile.timezone || "UTC"}
                  onChange={(e) => update({ timezone: e.target.value })}
                  style={{ padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)" }}
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </FieldGroup>
            <FieldGroup label="Analysis Priorities">
              <textarea
                className="input"
                value={profile.analysis_preferences}
                onChange={(e) => update({ analysis_preferences: e.target.value })}
                rows={4}
                placeholder="e.g. Focus on Class III device approvals. Flag competitive intelligence from Medtronic and Abbott."
                style={{ resize: "vertical", minHeight: 80 }}
              />
            </FieldGroup>
            <FieldGroup label="Send Test Digest">
              <input
                type="email"
                placeholder="Override email (optional)"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                style={{ width: "100%", maxWidth: 280, padding: "6px 10px", fontSize: "var(--text-sm)", marginBottom: 8, fontFamily: "var(--font-sans)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}
              />
              <button
                type="button"
                onClick={async () => {
                  setSendingTest(true);
                  setTestResult(null);
                  try {
                    const payload: Record<string, unknown> = { therapeutic_areas: profile.therapeutic_areas || [], regions: profile.regions || [], domains: profile.domains || [] };
                    if (testEmail.includes("@")) payload.to = testEmail;
                    const res = await fetch("/api/send-digest-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                    setTestResult(res.ok ? "sent" : "failed");
                  } catch {
                    setTestResult("failed");
                  }
                  setSendingTest(false);
                  setTimeout(() => setTestResult(null), 5000);
                }}
                disabled={sendingTest}
                className="btn btn-secondary btn-sm"
              >
                {sendingTest ? "Sending…" : testResult === "sent" ? "✓ Sent" : testResult === "failed" ? "Failed" : "Send Test Now"}
              </button>
            </FieldGroup>
          </Section>
        )}

        {/* Digest archive */}
        <div style={{ marginBottom: "var(--space-3)" }}>
          <h2 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-semibold)", color: "var(--color-fg)", margin: 0, fontFamily: "var(--font-sans)" }}>
            Digest Archive
          </h2>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginTop: "var(--space-1)", fontFamily: "var(--font-sans)" }}>
            {total > 0 ? `${total} digest${total !== 1 ? "s" : ""} generated` : "Your past digests will appear here."}
          </p>
        </div>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="skeleton-card" style={{ height: 64 }} />
            <div className="skeleton-card" style={{ height: 64 }} />
            <div className="skeleton-card" style={{ height: 64 }} />
          </div>
        )}

        {!loading && digests.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📧</div>
            <div className="empty-state-title">No digests yet</div>
            <div className="empty-state-desc">
              Configure your digest settings above. Your first digest will arrive based on your selected frequency.
            </div>
          </div>
        )}

        {!loading && digests.length > 0 && Object.entries(groups).map(([date, items]) => (
          <div key={date} style={{ marginBottom: "var(--space-5)" }}>
            <div style={{
              fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-fg-muted)",
              textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "var(--font-sans)",
              marginBottom: "var(--space-3)", paddingBottom: "var(--space-2)",
              borderBottom: "1px solid var(--color-border)",
            }}>
              {date}
            </div>

            <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-surface)", overflow: "hidden" }}>
              {items.map((d, i) => {
                const title = extractTitle(d.preview);
                const time = new Date(d.sent_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                const isLast = i === items.length - 1;
                return (
                  <Link key={d.id} href={`/digest/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: "var(--space-3)",
                      padding: "var(--space-4)",
                      borderBottom: isLast ? "none" : "1px solid var(--color-border)",
                      cursor: "pointer",
                      transition: "background 0.1s ease",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface-raised)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "var(--radius-md)",
                        background: "var(--color-primary-subtle)", color: "var(--color-primary)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "var(--text-sm)", flexShrink: 0,
                      }}>
                        {"\u{1F4E7}"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--color-fg)", margin: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-sans)",
                        }}>
                          {title}
                        </p>
                        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", margin: 0, marginTop: 2, fontFamily: "var(--font-sans)" }}>
                          {d.signal_ids?.length || 0} signals analyzed
                        </p>
                      </div>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "var(--font-sans)" }}>
                        {time}
                      </span>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-placeholder)" }}>›</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChipSelector({ options, selected, onToggle, labels }: { options: string[]; selected: string[]; onToggle: (s: string) => void; labels?: Record<string, string> }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      {options.map((o) => {
        const active = selected.includes(o) || selected.includes(o.toLowerCase());
        return (
          <button key={o} type="button" onClick={() => onToggle(o)} style={{
            padding: "4px 12px", borderRadius: "var(--radius-full)", fontSize: "var(--text-xs)",
            border: active ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
            background: active ? "var(--color-primary-subtle)" : "var(--color-surface)",
            color: active ? "var(--color-primary)" : "var(--color-fg-secondary)",
            cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.15s ease",
          }}>
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

function TagEditor({ tags, setTags, placeholder }: { tags: string[]; setTags: (t: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setInput("");
  };
  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: tags.length > 0 ? "var(--space-2)" : 0 }}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} style={{ flex: 1 }} />
        <button type="button" onClick={add} disabled={!input.trim()} className="btn btn-primary btn-sm">Add</button>
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {tags.map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: "var(--radius-full)", fontSize: "var(--text-xs)", background: "var(--color-primary-subtle)", color: "var(--color-primary)", border: "1px solid var(--color-primary-muted)", fontFamily: "var(--font-sans)" }}>
              {t.length > 50 ? t.slice(0, 47) + "…" : t}
              <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} style={{ background: "none", border: "none", color: "var(--color-primary-muted)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface WatchItem {
  id: string;
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  watch_type: string;
  status: string;
  alert_threshold: string;
  frequency: string;
}

function TrackedItemsSection({ profileId }: { profileId: string }) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ entity_id: string; canonical_name: string; entity_type: string }[]>([]);

  useEffect(() => {
    fetch(`/api/profiles/${profileId}/watch-items`)
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((data) => setItems(data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  const toggleStatus = async (itemId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    try {
      await fetch(`/api/profiles/${profileId}/watch-items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i)));
    } catch { /* ignore */ }
  };

  const updateItem = async (itemId: string, field: string, value: string) => {
    try {
      await fetch(`/api/profiles/${profileId}/watch-items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)));
    } catch { /* ignore */ }
  };

  const searchEntities = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/profiles/${profileId}/watch-items/search?q=${encodeURIComponent(q)}`);
      if (res.ok) { const data = await res.json(); setSearchResults(data.results || []); }
    } catch { /* ignore */ }
  };

  const addWatchItem = async (entityId: string) => {
    try {
      const res = await fetch(`/api/profiles/${profileId}/watch-items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_id: entityId, watch_type: "exact" }) });
      if (res.ok) { const data = await res.json(); setItems((prev) => [...prev, data.item]); setSearchQuery(""); setSearchResults([]); }
    } catch { /* ignore */ }
  };

  return (
    <div style={{ marginBottom: "var(--space-5)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>Tracked Items</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginTop: 2 }}>Products, companies, and topics you&apos;re monitoring</div>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <input className="input" value={searchQuery} onChange={(e) => searchEntities(e.target.value)} placeholder="Search entities to track..." style={{ width: "100%", marginBottom: 8 }} />
        {searchResults.length > 0 && (
          <div style={{ marginBottom: 12, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {searchResults.map((r) => (
              <button key={r.entity_id} onClick={() => addWatchItem(r.entity_id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
                <span className="badge badge-default">{r.entity_type}</span>
                {r.canonical_name}
              </button>
            ))}
          </div>
        )}
        {loading ? <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)" }}>Loading…</p> : items.length === 0 ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)" }}>No items tracked. Search above to add.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", opacity: item.status === "paused" ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>{item.canonical_name}</span>
                    <span className="badge badge-default" style={{ fontSize: 9 }}>{item.entity_type}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select value={item.alert_threshold} onChange={(e) => updateItem(item.id, "alert_threshold", e.target.value)} style={{ fontSize: "var(--text-2xs)", padding: "2px 6px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)" }}>
                      {["high", "medium", "low"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={item.frequency} onChange={(e) => updateItem(item.id, "frequency", e.target.value)} style={{ fontSize: "var(--text-2xs)", padding: "2px 6px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)" }}>
                      {["immediate", "daily", "weekly"].map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={() => toggleStatus(item.id, item.status)} style={{ fontSize: "var(--text-2xs)", padding: "2px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", cursor: "pointer", background: item.status === "active" ? "var(--color-primary-subtle)" : "var(--color-surface)", color: item.status === "active" ? "var(--color-primary)" : "var(--color-fg-muted)", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
                  {item.status === "active" ? "Active" : "Paused"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
