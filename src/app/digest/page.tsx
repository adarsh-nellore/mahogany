"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Breadcrumbs from "@/components/Breadcrumbs";

interface DigestListItem {
  id: string;
  signal_ids: string[];
  sent_at: string;
  preview: string;
}

interface Profile {
  id: string;
  name: string;
  regions: string[];
  domains: string[];
  therapeutic_areas: string[];
  analysis_preferences: string;
  digest_cadence: string;
  digest_send_hour: number;
}

const CADENCE_OPTIONS = [
  { id: "daily", label: "Daily", desc: "Every morning" },
  { id: "twice_weekly", label: "2x/week", desc: "Tue & Fri" },
  { id: "weekly", label: "Weekly", desc: "Monday recap" },
];

const ALL_TAS = [
  "oncology", "cardiology", "neurology", "orthopedics", "endocrinology",
  "immunology", "dermatology", "ophthalmology", "gastroenterology",
  "pulmonology", "hematology", "nephrology", "infectious disease",
  "rare disease", "wound care", "dental", "SaMD", "respiratory",
  "psychiatry", "pediatrics",
];

const REGION_OPTIONS = ["US", "EU", "UK", "Canada", "Australia", "Japan", "Switzerland", "Global"];
const DOMAIN_OPTIONS = [
  { id: "devices", label: "Devices" },
  { id: "pharma", label: "Pharma" },
];
const SEVERITY_OPTIONS = [
  { id: "high", label: "High only" },
  { id: "medium", label: "High + Medium" },
  { id: "low", label: "All severity" },
];

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

export default function DigestPage() {
  const [digests, setDigests] = useState<DigestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [cadence, setCadence] = useState("daily");
  const [sendHour, setSendHour] = useState(7);
  const [digestTAs, setDigestTAs] = useState<string[]>([]);
  const [digestRegions, setDigestRegions] = useState<string[]>([]);
  const [digestDomains, setDigestDomains] = useState<string[]>([]);
  const [digestSeverity, setDigestSeverity] = useState("low");
  const [digestPrompt, setDigestPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
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
      .then((p: Profile | null) => {
        if (!p) return;
        setProfile(p);
        setCadence(p.digest_cadence || "daily");
        setSendHour(p.digest_send_hour ?? 7);
        setDigestTAs(p.therapeutic_areas || []);
        setDigestRegions(p.regions || []);
        setDigestDomains(p.domains || []);
        setDigestPrompt(p.analysis_preferences || "");
      })
      .catch(() => {});
  }, []);

  const toggle = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  const markDirty = () => { if (!configDirty) setConfigDirty(true); };

  const saveConfig = async () => {
    if (!profile) return;
    setSaving(true); setSaved(false);
    try {
      await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digest_cadence: cadence,
          digest_send_hour: sendHour,
          therapeutic_areas: digestTAs,
          regions: digestRegions,
          domains: digestDomains,
          analysis_preferences: digestPrompt,
        }),
      });
      setSaved(true);
      setConfigDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const groups = groupByDate(digests);

  const displayedTAs = ALL_TAS.slice(0, 14);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "var(--space-5) var(--space-6)" }}>
        <Breadcrumbs items={[{ label: "Feed", href: "/feed" }, { label: "Digests" }]} />

        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-5)", marginTop: "var(--space-2)" }}>

          {/* ── Left: Config sidebar ── */}
          <div style={{ width: 300, flexShrink: 0, position: "sticky", top: 72 }}>
            <div className="glass" style={{
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>Digest Configuration</div>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginTop: 2 }}>Controls how your email digest is generated</div>
              </div>

              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Frequency */}
                <div>
                  <SidebarLabel>Frequency</SidebarLabel>
                  <div style={{ display: "flex", gap: 4 }}>
                    {CADENCE_OPTIONS.map((c) => (
                      <button key={c.id} onClick={() => { setCadence(c.id); markDirty(); }}
                        style={{
                          flex: 1, padding: "6px 4px", borderRadius: "var(--radius-md)", cursor: "pointer",
                          fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600,
                          border: cadence === c.id ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                          background: cadence === c.id ? "var(--color-primary-subtle)" : "transparent",
                          color: cadence === c.id ? "var(--color-primary)" : "var(--color-fg-muted)",
                          transition: "all 0.15s ease", textAlign: "center",
                        }}>
                        <div>{c.label}</div>
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, opacity: 0.7 }}>{c.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Send time */}
                <div>
                  <SidebarLabel>Send Time</SidebarLabel>
                  <select value={sendHour} onChange={(e) => { setSendHour(parseInt(e.target.value, 10)); markDirty(); }}
                    style={{
                      width: "100%", padding: "6px 8px", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)", background: "var(--color-bg)",
                      fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", color: "var(--color-fg)",
                      outline: "none",
                    }}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00 UTC</option>
                    ))}
                  </select>
                </div>

                <div style={{ height: 1, background: "var(--color-border)" }} />

                {/* Domains */}
                <div>
                  <SidebarLabel>Domains</SidebarLabel>
                  <div style={{ display: "flex", gap: 4 }}>
                    {DOMAIN_OPTIONS.map((d) => (
                      <ChipButton key={d.id} active={digestDomains.includes(d.id)} label={d.label}
                        onClick={() => { setDigestDomains(toggle(digestDomains, d.id)); markDirty(); }} />
                    ))}
                  </div>
                </div>

                {/* Regions */}
                <div>
                  <SidebarLabel>Regions</SidebarLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {REGION_OPTIONS.map((r) => (
                      <ChipButton key={r} active={digestRegions.includes(r)} label={r}
                        onClick={() => { setDigestRegions(toggle(digestRegions, r)); markDirty(); }} />
                    ))}
                  </div>
                </div>

                {/* Min severity */}
                <div>
                  <SidebarLabel>Minimum Severity</SidebarLabel>
                  <div style={{ display: "flex", gap: 4 }}>
                    {SEVERITY_OPTIONS.map((s) => (
                      <button key={s.id} onClick={() => { setDigestSeverity(s.id); markDirty(); }}
                        style={{
                          flex: 1, padding: "5px 4px", borderRadius: "var(--radius-md)", cursor: "pointer",
                          fontSize: 10, fontFamily: "var(--font-sans)", fontWeight: 500, textAlign: "center",
                          border: digestSeverity === s.id ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                          background: digestSeverity === s.id ? "var(--color-primary-subtle)" : "transparent",
                          color: digestSeverity === s.id ? "var(--color-primary)" : "var(--color-fg-muted)",
                          transition: "all 0.15s ease",
                        }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--color-border)" }} />

                {/* Therapeutic areas */}
                <div>
                  <SidebarLabel>Therapeutic Areas</SidebarLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {displayedTAs.map((ta) => {
                      const active = digestTAs.includes(ta);
                      return (
                        <button key={ta} onClick={() => { setDigestTAs(toggle(digestTAs, ta)); markDirty(); }}
                          style={{
                            padding: "2px 8px", borderRadius: "var(--radius-full)", cursor: "pointer",
                            fontSize: 10, fontFamily: "var(--font-sans)", fontWeight: active ? 600 : 400,
                            border: active ? "1px solid var(--color-primary-muted, rgba(158,59,30,0.25))" : "1px solid var(--color-border)",
                            background: active ? "var(--color-primary-subtle, rgba(158,59,30,0.06))" : "transparent",
                            color: active ? "var(--color-primary)" : "var(--color-fg-muted)",
                            transition: "all 0.12s ease",
                          }}>
                          {active ? "\u2713 " : ""}{ta}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--color-border)" }} />

                {/* AI Prompt */}
                <div>
                  <SidebarLabel>Agent Instructions</SidebarLabel>
                  <p style={{ fontSize: 10, color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)", margin: "0 0 6px", lineHeight: 1.4 }}>
                    Tell the AI how to process and present your digest. It uses this verbatim.
                  </p>
                  <textarea value={digestPrompt} onChange={(e) => { setDigestPrompt(e.target.value); markDirty(); }}
                    rows={5} placeholder={"e.g. Focus on safety signals for cardiac devices. Lead with anything affecting our PMA timeline. Keep the tone executive-level. Flag competitive intelligence from Medtronic and Abbott prominently."}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)", background: "var(--color-bg)",
                      fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", color: "var(--color-fg)",
                      outline: "none", resize: "vertical", minHeight: 80, lineHeight: 1.5,
                      boxSizing: "border-box",
                    }} />
                </div>

                {/* Save */}
                <button onClick={saveConfig} disabled={saving || !configDirty}
                  className="btn btn-primary btn-sm"
                  style={{ width: "100%", opacity: configDirty ? 1 : 0.5 }}>
                  {saving ? "Saving..." : saved ? "\u2713 Saved" : "Save Configuration"}
                </button>

                <div style={{ height: 1, background: "var(--color-border)" }} />

                {/* Send Test Digest */}
                <div>
                  <SidebarLabel>Test Delivery</SidebarLabel>
                  <button
                    onClick={async () => {
                      setSendingTest(true);
                      setTestResult(null);
                      try {
                        const res = await fetch("/api/send-digest-now", { method: "POST" });
                        setTestResult(res.ok ? "sent" : "failed");
                      } catch {
                        setTestResult("failed");
                      }
                      setSendingTest(false);
                      setTimeout(() => setTestResult(null), 5000);
                    }}
                    disabled={sendingTest}
                    className="btn btn-secondary btn-sm"
                    style={{ width: "100%" }}
                  >
                    {sendingTest ? "Sending\u2026" : testResult === "sent" ? "\u2713 Digest Sent" : testResult === "failed" ? "\u2717 Send Failed" : "Send Test Digest Now"}
                  </button>
                  <p style={{ fontSize: 10, color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)", margin: "6px 0 0", lineHeight: 1.4 }}>
                    Bypasses schedule &mdash; sends a digest immediately to your email.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Digest archive ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: "var(--space-5)" }}>
              <h1 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", margin: 0 }}>
                Digest Archive
              </h1>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginTop: "var(--space-1)", fontFamily: "var(--font-sans)" }}>
                {total > 0 ? `${total} digest${total !== 1 ? "s" : ""} generated` : "AI-curated regulatory intelligence, personalized to your portfolio."}
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
                  Your first digest will be generated after onboarding. Configure your preferences on the left.
                </div>
              </div>
            )}

            {!loading && Object.entries(groups).map(([date, items]) => (
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
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-placeholder)" }}>\u203A</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontFamily: "var(--font-sans)", fontWeight: 700, color: "var(--color-fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function ChipButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer",
        fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 500,
        border: active ? "1px solid var(--color-primary-muted, rgba(158,59,30,0.25))" : "1px solid var(--color-border)",
        background: active ? "var(--color-primary-subtle, rgba(158,59,30,0.06))" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-fg-muted)",
        transition: "all 0.12s ease",
      }}>
      {label}
    </button>
  );
}
