"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Breadcrumbs from "@/components/Breadcrumbs";

const REGION_OPTIONS = [
  { id: "US", label: "United States" },
  { id: "EU", label: "European Union" },
  { id: "UK", label: "United Kingdom" },
  { id: "Canada", label: "Canada" },
  { id: "Australia", label: "Australia" },
  { id: "Japan", label: "Japan" },
  { id: "Switzerland", label: "Switzerland" },
  { id: "Global", label: "Global / ICH" },
];
const DEVICE_PRODUCT_TYPES = ["SaMD", "IVD", "Implant", "AI/ML Device", "Wearable", "Imaging", "Surgical Instrument", "Combo Product"];
const PHARMA_PRODUCT_TYPES = ["Drug", "Biologic", "Biosimilar", "Generic", "OTC", "Vaccine", "Gene Therapy", "Cell Therapy"];
const TA_OPTIONS = [
  "Oncology", "Cardiology", "Neurology", "Rare Disease", "Infectious Disease", "Orthopedics",
  "Ophthalmology", "Dermatology", "Endocrinology", "Immunology", "Hematology", "Respiratory",
  "Gastroenterology", "Urology", "Women's Health", "Pediatrics", "Psychiatry", "Renal",
];
const FRAMEWORK_DEVICES = ["21 CFR 820 (FDA QSR)", "MDR 2017/745", "IVDR 2017/746", "ISO 13485", "ISO 14971", "IEC 62304", "IEC 62366", "FDA AI/ML Guidance", "EU AI Act (medical devices)", "MDSAP", "510(k)", "De Novo", "PMA"];
const FRAMEWORK_PHARMA = ["21 CFR 210/211 (cGMP)", "ICH Q1-Q14", "ICH E6 (GCP)", "ICH E2D/E2E (Pharmacovigilance)", "ICH M14 (RWE/RWD)", "NDA/BLA/ANDA Pathways", "505(b)(2)", "EU CTR 536/2014", "EMA PRIME/Accelerated Assessment", "Orphan Drug Designation", "REMS"];
const CADENCE_OPTIONS = [
  { id: "daily", label: "Every morning" },
  { id: "twice_weekly", label: "Twice a week" },
  { id: "weekly", label: "Once a week" },
];

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  regions: string[];
  domains: string[];
  therapeutic_areas: string[];
  product_types: string[];
  tracked_products: string[];
  active_submissions: string[];
  competitors: string[];
  regulatory_frameworks: string[];
  analysis_preferences: string;
  digest_cadence: string;
  digest_send_hour: number;
  last_digest_at: string | null;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editSection, setEditSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profiles/me").then((r) => (r.ok ? r.json() : null)).then(setProfile).catch(() => {});
  }, []);

  const toggle = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  const save = async (fields: Record<string, unknown>) => {
    if (!profile) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Save failed"); }
      setProfile({ ...profile, ...fields } as Profile);
      setSaved(true);
      setEditSection(null);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(String(e)); }
    setSaving(false);
  };

  if (!profile) return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--space-12)", textAlign: "center", color: "var(--color-fg-muted)" }}>Loading profile...</div>
    </div>
  );

  const productTypeOptions = [
    ...(profile.domains.includes("devices") ? DEVICE_PRODUCT_TYPES : []),
    ...(profile.domains.includes("pharma") ? PHARMA_PRODUCT_TYPES : []),
  ];
  const frameworkOptions = [
    ...(profile.domains.includes("devices") ? FRAMEWORK_DEVICES : []),
    ...(profile.domains.includes("pharma") ? FRAMEWORK_PHARMA : []),
  ];
  const initials = profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const memberSince = new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const totalTracked = profile.tracked_products.length + profile.active_submissions.length + profile.competitors.length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--space-5) var(--space-4) var(--space-10)" }}>
        <Breadcrumbs items={[{ label: "Feed", href: "/feed" }, { label: "Profile & Settings" }]} />

        {/* ── Profile header card ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--space-5)",
          padding: "var(--space-5)", marginBottom: "var(--space-5)",
          border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
          background: "var(--color-surface)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "var(--radius-full)",
            background: "var(--color-primary)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "var(--text-xl)", fontWeight: 700, flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", color: "var(--color-fg)", margin: 0 }}>
              {profile.name}
            </h1>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", margin: 0, marginTop: 2, fontFamily: "var(--font-sans)" }}>
              {profile.role}{profile.organization ? ` at ${profile.organization}` : ""}
            </p>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-placeholder)", margin: 0, marginTop: 2, fontFamily: "var(--font-sans)" }}>
              {profile.email} &middot; Member since {memberSince}
            </p>
          </div>
          <button onClick={() => setEditSection(editSection === "personal" ? null : "personal")}
            style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
            Edit
          </button>
        </div>

        {/* Edit personal info inline */}
        {editSection === "personal" && (
          <EditCard title="Personal Info" onSave={() => save({ name: profile.name, role: profile.role, organization: profile.organization })} saving={saving}>
            <FieldGroup label="Name"><input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></FieldGroup>
            <FieldGroup label="Email"><input className="input" value={profile.email} disabled style={{ opacity: 0.5 }} /></FieldGroup>
            <FieldGroup label="Role"><input className="input" value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })} /></FieldGroup>
            <FieldGroup label="Organization"><input className="input" value={profile.organization} onChange={(e) => setProfile({ ...profile, organization: e.target.value })} /></FieldGroup>
          </EditCard>
        )}

        {/* ── Stats row ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
          marginBottom: "var(--space-5)",
        }}>
          {[
            { label: "Regions", value: profile.regions.length, detail: profile.regions.join(", ") || "None" },
            { label: "Domains", value: profile.domains.length, detail: profile.domains.map((d) => d === "devices" ? "Devices" : "Pharma").join(", ") || "None" },
            { label: "Therapeutic", value: profile.therapeutic_areas.length, detail: "areas tracked" },
            { label: "Portfolio", value: totalTracked, detail: "items tracked" },
          ].map((s) => (
            <div key={s.label} style={{
              padding: "14px 16px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)", background: "var(--color-surface)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>{s.value}</div>
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{s.label}</div>
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)", marginTop: 2 }}>{s.detail}</div>
            </div>
          ))}
        </div>

        {/* Status toast */}
        {(saved || error) && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            {saved && <span className="alert alert-success" style={{ padding: "var(--space-2) var(--space-4)", display: "inline-block" }}>Saved</span>}
            {error && <span className="alert alert-danger" style={{ padding: "var(--space-2) var(--space-4)", display: "inline-block" }}>{error}</span>}
          </div>
        )}

        {/* ── Section: Regulatory Scope ── */}
        <SectionCard
          title="Regulatory Scope" description="Markets, domains, and therapeutic areas you track"
          editing={editSection === "scope"} onEdit={() => setEditSection(editSection === "scope" ? null : "scope")}>
          {editSection === "scope" ? (
            <EditCard title="" onSave={() => save({ regions: profile.regions, domains: profile.domains, therapeutic_areas: profile.therapeutic_areas, product_types: profile.product_types })} saving={saving} inline>
              <FieldGroup label="Regions">
                <ChipSelector options={REGION_OPTIONS.map((r) => r.id)} labels={REGION_OPTIONS.reduce((m, r) => ({ ...m, [r.id]: r.label }), {} as Record<string, string>)} selected={profile.regions} onToggle={(r) => setProfile({ ...profile, regions: toggle(profile.regions, r) })} />
              </FieldGroup>
              <FieldGroup label="Domains">
                <ChipSelector options={["devices", "pharma"]} labels={{ devices: "Medical Devices", pharma: "Pharma & Biologics" }} selected={profile.domains} onToggle={(d) => setProfile({ ...profile, domains: toggle(profile.domains, d) })} />
              </FieldGroup>
              <FieldGroup label="Therapeutic Areas">
                <ChipSelector options={TA_OPTIONS} selected={profile.therapeutic_areas} onToggle={(t) => setProfile({ ...profile, therapeutic_areas: toggle(profile.therapeutic_areas, t.toLowerCase()) })} />
              </FieldGroup>
              <FieldGroup label="Product Types">
                {productTypeOptions.length > 0
                  ? <ChipSelector options={productTypeOptions} selected={profile.product_types} onToggle={(p) => setProfile({ ...profile, product_types: toggle(profile.product_types, p) })} />
                  : <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)" }}>Select a domain first.</p>}
              </FieldGroup>
            </EditCard>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ReadRow label="Regions" items={profile.regions.map((r) => REGION_OPTIONS.find((o) => o.id === r)?.label || r)} />
              <ReadRow label="Domains" items={profile.domains.map((d) => d === "devices" ? "Medical Devices" : "Pharma & Biologics")} />
              <ReadRow label="Therapeutic Areas" items={profile.therapeutic_areas} />
              <ReadRow label="Product Types" items={profile.product_types} />
            </div>
          )}
        </SectionCard>

        {/* ── Section: Portfolio & Intelligence ── */}
        <SectionCard
          title="Portfolio & Intelligence" description="Products, submissions, and competitors you're monitoring"
          editing={editSection === "products"} onEdit={() => setEditSection(editSection === "products" ? null : "products")}>
          {editSection === "products" ? (
            <EditCard title="" onSave={() => save({ tracked_products: profile.tracked_products, active_submissions: profile.active_submissions, competitors: profile.competitors })} saving={saving} inline>
              <FieldGroup label="Tracked Products">
                <TagEditor tags={profile.tracked_products} setTags={(t) => setProfile({ ...profile, tracked_products: t })} placeholder="Add a product..." />
              </FieldGroup>
              <FieldGroup label="Active Submissions">
                <TagEditor tags={profile.active_submissions} setTags={(t) => setProfile({ ...profile, active_submissions: t })} placeholder="Add a submission..." />
              </FieldGroup>
              <FieldGroup label="Competitors">
                <TagEditor tags={profile.competitors} setTags={(t) => setProfile({ ...profile, competitors: t })} placeholder="Add a competitor..." />
              </FieldGroup>
            </EditCard>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <ReadList label="Tracked Products" items={profile.tracked_products} emptyText="No products tracked" />
              <ReadList label="Active Submissions" items={profile.active_submissions} emptyText="No active submissions" />
              <ReadList label="Competitors" items={profile.competitors} emptyText="No competitors tracked" />
            </div>
          )}
        </SectionCard>

        {/* ── Section: Frameworks & Priorities ── */}
        <SectionCard
          title="Frameworks & Priorities" description="Regulatory standards and analysis preferences"
          editing={editSection === "frameworks"} onEdit={() => setEditSection(editSection === "frameworks" ? null : "frameworks")}>
          {editSection === "frameworks" ? (
            <EditCard title="" onSave={() => save({ regulatory_frameworks: profile.regulatory_frameworks, analysis_preferences: profile.analysis_preferences })} saving={saving} inline>
              <FieldGroup label="Regulatory Frameworks">
                {frameworkOptions.length > 0
                  ? <ChipSelector options={frameworkOptions} selected={profile.regulatory_frameworks} onToggle={(f) => setProfile({ ...profile, regulatory_frameworks: toggle(profile.regulatory_frameworks, f) })} />
                  : <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)" }}>Select a domain first.</p>}
              </FieldGroup>
              <FieldGroup label="Analysis Priorities">
                <textarea className="input" value={profile.analysis_preferences} onChange={(e) => setProfile({ ...profile, analysis_preferences: e.target.value })} rows={6} style={{ resize: "vertical", minHeight: 120 }} />
              </FieldGroup>
            </EditCard>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <ReadRow label="Frameworks" items={profile.regulatory_frameworks} />
              {profile.analysis_preferences && (
                <div>
                  <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600, color: "var(--color-fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Analysis Priorities</div>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-secondary)", fontFamily: "var(--font-sans)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                    {profile.analysis_preferences.length > 200 ? profile.analysis_preferences.slice(0, 200) + "..." : profile.analysis_preferences}
                  </p>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ── Section: Tracked Items (watch items) ── */}
        <TrackedItemsSection profileId={profile.id} />

        {/* ── Section: Digest Settings (link to digest page) ── */}
        <Link href="/digest" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div style={{
            marginBottom: "var(--space-4)",
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
            background: "var(--color-surface)", overflow: "hidden",
            cursor: "pointer", transition: "border-color 0.15s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>Digest Settings</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginTop: 1 }}>
                  {CADENCE_OPTIONS.find((c) => c.id === profile.digest_cadence)?.label || profile.digest_cadence} at {String(profile.digest_send_hour).padStart(2, "0")}:00 UTC
                  {profile.last_digest_at ? ` \u00B7 Last sent ${new Date(profile.last_digest_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </div>
              </div>
              <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", color: "var(--color-primary)", fontWeight: 500 }}>
                Configure \u203A
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

/* ─── Section card ─── */
function SectionCard({ title, description, editing, onEdit, children }: {
  title: string; description: string; editing: boolean; onEdit: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      marginBottom: "var(--space-4)",
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
      background: "var(--color-surface)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", padding: "14px 18px",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>{title}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginTop: 1 }}>{description}</div>
        </div>
        <button onClick={onEdit}
          style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)", color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      <div style={{ padding: "16px 18px" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Edit card wrapper ─── */
function EditCard({ title, onSave, saving, children, inline }: {
  title: string; onSave: () => void; saving: boolean; children: React.ReactNode; inline?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {title && <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-fg)", margin: 0 }}>{title}</h3>}
      {children}
      <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start", marginTop: "var(--space-2)" }} disabled={saving} onClick={onSave}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

/* ─── Read-only displays ─── */
function ReadRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600, color: "var(--color-fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
      {items.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {items.map((item) => (
            <span key={item} style={{
              fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 500,
              padding: "2px 8px", borderRadius: "var(--radius-full)",
              background: "var(--color-surface-raised)", color: "var(--color-fg-secondary)",
              border: "1px solid var(--color-border)",
            }}>{item}</span>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)" }}>Not configured</span>
      )}
    </div>
  );
}

function ReadList({ label, items, emptyText }: { label: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-sans)", fontWeight: 600, color: "var(--color-fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
      {items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--color-border-strong)", flexShrink: 0, marginTop: 7 }} />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-secondary)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                {item.length > 120 ? item.slice(0, 117) + "..." : item}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-placeholder)", fontFamily: "var(--font-sans)" }}>{emptyText}</span>
      )}
    </div>
  );
}

/* ─── Reusable primitives ─── */
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-fg-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--space-2)", fontFamily: "var(--font-sans)" }}>
        {label}
      </label>
      {children}
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
            padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-full)", fontSize: "var(--text-xs)",
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

/* ─── Tracked Items section ─── */
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
      await fetch(`/api/profiles/${profileId}/watch-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, status: newStatus } : i));
    } catch { /* ignore */ }
  };

  const updateItem = async (itemId: string, field: string, value: string) => {
    try {
      await fetch(`/api/profiles/${profileId}/watch-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, [field]: value } : i));
    } catch { /* ignore */ }
  };

  const searchEntities = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/profiles/${profileId}/watch-items/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch { /* ignore */ }
  };

  const addWatchItem = async (entityId: string) => {
    try {
      const res = await fetch(`/api/profiles/${profileId}/watch-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: entityId, watch_type: "exact" }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems((prev) => [...prev, data.item]);
        setSearchQuery("");
        setSearchResults([]);
      }
    } catch { /* ignore */ }
  };

  const THRESHOLD_OPTIONS = ["high", "medium", "low"];
  const FREQUENCY_OPTIONS = ["immediate", "daily", "weekly"];

  return (
    <div style={{
      marginBottom: "var(--space-4)",
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
      background: "var(--color-surface)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", padding: "14px 18px",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>
            Tracked Items
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginTop: 1 }}>
            Products, companies, and topics you're monitoring
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 18px" }}>
        {/* Search to add new items */}
        <div style={{ marginBottom: "var(--space-4)" }}>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              value={searchQuery}
              onChange={(e) => searchEntities(e.target.value)}
              placeholder="Search entities to track..."
              style={{ width: "100%" }}
            />
            {searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)", marginTop: 4, maxHeight: 200, overflowY: "auto",
              }}>
                {searchResults.map((r) => (
                  <button
                    key={r.entity_id}
                    onClick={() => addWatchItem(r.entity_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "8px 12px", border: "none", background: "none",
                      cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-sm)", color: "var(--color-fg)",
                    }}
                  >
                    <span className="badge badge-default">{r.entity_type}</span>
                    {r.canonical_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)" }}>Loading tracked items...</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)" }}>
            No items tracked yet. Search above to add products, companies, or topics.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                opacity: item.status === "paused" ? 0.6 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>
                      {item.canonical_name}
                    </span>
                    <span className="badge badge-default" style={{ fontSize: "9px" }}>{item.entity_type}</span>
                    <span className="badge badge-default" style={{ fontSize: "9px" }}>{item.watch_type}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={item.alert_threshold}
                      onChange={(e) => updateItem(item.id, "alert_threshold", e.target.value)}
                      style={{ fontSize: "var(--text-2xs)", padding: "1px 4px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", fontFamily: "var(--font-sans)" }}
                    >
                      {THRESHOLD_OPTIONS.map((t) => <option key={t} value={t}>{t} alerts</option>)}
                    </select>
                    <select
                      value={item.frequency}
                      onChange={(e) => updateItem(item.id, "frequency", e.target.value)}
                      style={{ fontSize: "var(--text-2xs)", padding: "1px 4px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", fontFamily: "var(--font-sans)" }}
                    >
                      {FREQUENCY_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => toggleStatus(item.id, item.status)}
                  style={{
                    fontSize: "var(--text-2xs)", padding: "2px 8px", borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)", cursor: "pointer",
                    background: item.status === "active" ? "var(--color-primary-subtle)" : "var(--color-surface)",
                    color: item.status === "active" ? "var(--color-primary)" : "var(--color-fg-muted)",
                    fontFamily: "var(--font-sans)", fontWeight: 500,
                  }}
                >
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

function TagEditor({ tags, setTags, placeholder }: { tags: string[]; setTags: (t: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setInput("");
    ref.current?.focus();
  };
  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: tags.length > 0 ? "var(--space-2)" : 0 }}>
        <input ref={ref} className="input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} style={{ flex: 1 }} />
        <button type="button" onClick={add} disabled={!input.trim()} className="btn btn-primary btn-sm">Add</button>
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {tags.map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-full)", fontSize: "var(--text-xs)", background: "var(--color-primary-subtle)", color: "var(--color-primary)", border: "1px solid var(--color-primary-muted)", fontFamily: "var(--font-sans)" }}>
              {t.length > 60 ? t.slice(0, 57) + "..." : t}
              <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} style={{ background: "none", border: "none", color: "var(--color-primary-muted)", cursor: "pointer", fontSize: "var(--text-sm)", lineHeight: 1, padding: 0 }}>&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
