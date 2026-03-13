"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────

interface ProductInfo {
  name: string;
  generic_name?: string;
  company?: string;
  product_type: string;
  domain: string;
  region?: string;
  regulatory_id?: string;
  source?: string;
}

interface ProductSearchResult {
  name: string;
  generic_name?: string;
  company?: string;
  product_type: string;
  domain: string;
  region?: string;
  regulatory_id?: string;
  source: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const REGIONS = ["US", "EU", "UK", "Canada", "Australia", "Japan", "Switzerland", "Global"];

const DOMAINS = [
  { value: "pharma", label: "Pharma & Biologics" },
  { value: "devices", label: "Medical Devices" },
];

import { THERAPEUTIC_AREAS } from "@/lib/therapeuticAreas";

const DIGEST_CADENCE_OPTIONS = [
  { id: "daily" as const, label: "Daily", desc: "Every morning" },
  { id: "twice_weekly" as const, label: "2x per week", desc: "Tue & Fri" },
  { id: "weekly" as const, label: "Weekly", desc: "Monday recap" },
];

const DIGEST_HOUR_OPTIONS = [6, 7, 8, 9];

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (US)" },
  { value: "America/Chicago", label: "Central (US)" },
  { value: "America/Denver", label: "Mountain (US)" },
  { value: "America/Los_Angeles", label: "Pacific (US)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "UTC", label: "UTC" },
];

// ─── Step type ──────────────────────────────────────────────────────

type Step = "identity" | "focus" | "products" | "confirm";
const STEPS: Step[] = ["identity", "focus", "products", "confirm"];

// ─── Component ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identity");

  // Identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [organization, setOrganization] = useState("");

  // Focus
  const [regions, setRegions] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [therapeuticAreas, setTherapeuticAreas] = useState<string[]>([]);

  // Digest schedule
  const [digestCadence, setDigestCadence] = useState<"daily" | "twice_weekly" | "weekly">("daily");
  const [digestSendHour, setDigestSendHour] = useState(7);
  const [timezone, setTimezone] = useState("America/New_York");

  // Products
  const [ownProducts, setOwnProducts] = useState<ProductInfo[]>([]);
  const [competitorProducts, setCompetitorProducts] = useState<ProductInfo[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [notes, setNotes] = useState("");

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [error, setError] = useState("");
  const [showEmailError, setShowEmailError] = useState(false);

  // Detect browser timezone on mount; use if in our list, else keep default
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TIMEZONE_OPTIONS.some((t) => t.value === tz)) setTimezone(tz);
    } catch {
      /* ignore */
    }
  }, []);

  // Step navigation
  const stepIdx = STEPS.indexOf(step);
  const goNext = () => { if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1]); };
  const goBack = () => { if (stepIdx > 0) setStep(STEPS[stepIdx - 1]); };

  // Validation
  const canProceedFromIdentity = name.trim().length > 0 && email.includes("@");
  const canProceedFromFocus = regions.length > 0 && domains.length > 0;

  // ─── Profile creation ─────────────────────────────────────────────

  async function finalizeProfile() {
    setError("");
    setSubmitting(true);
    try {
      const profileRes = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          role: role || "",
          regions: regions.length ? regions : ["US"],
          domains: domains.length ? domains : ["devices", "pharma"],
          therapeutic_areas: therapeuticAreas,
          product_types: [],
          tracked_products: ownProducts.map((p) => p.name),
          organization: organization || "",
          active_submissions: [],
          competitors: [
            ...competitors,
            ...competitorProducts.map((p) => p.company || p.name),
          ],
          regulatory_frameworks: [],
          analysis_preferences: notes ? `Notes: ${notes}` : "",
          digest_cadence: digestCadence,
          digest_send_hour: digestSendHour,
          timezone,
          intake_text: [
            role && `Role: ${role}`,
            organization && `Org: ${organization}`,
            ownProducts.length && `Products: ${ownProducts.map(p => p.name).join(", ")}`,
            competitorProducts.length && `Competitor products: ${competitorProducts.map(p => p.name).join(", ")}`,
            notes && `Notes: ${notes}`,
          ].filter(Boolean).join(". "),
        }),
      });
      const profileResult = await profileRes.json();
      if (!profileRes.ok) {
        setError(profileResult.error || "Failed to create profile");
        return;
      }

      // Register products as watch items
      const allProducts = [
        ...ownProducts.map((p) => ({ product: p, watch_type: "exact" as const })),
        ...competitorProducts.map((p) => ({ product: p, watch_type: "competitor" as const })),
      ];
      for (const sel of allProducts) {
        try {
          await fetch("/api/products/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile_id: profileResult.id,
              product: sel.product,
              watch_type: sel.watch_type,
            }),
          });
        } catch {
          // Non-blocking
        }
      }

      setSubmitting(false);
      setSendingDigest(true);

      let emailFailed: string | null = null;
      try {
        const digestRes = await fetch("/api/send-digest-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile_id: profileResult.id }),
        });
        const digestData = await digestRes.json().catch(() => ({}));
        if (!digestRes.ok) {
          emailFailed = digestData.error || "Could not send digest";
        } else if (digestData.email_error) {
          emailFailed = digestData.email_error;
        }
      } catch (e) {
        emailFailed = String(e);
      } finally {
        setSendingDigest(false);
      }

      if (emailFailed) {
        setError(`Profile created, but welcome email failed: ${emailFailed}. You can still use your feed.`);
        setShowEmailError(true);
        return;
      }
      router.push("/feed");
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <main style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: "var(--color-surface-raised)", flexShrink: 0 }}>
        <div style={{
          height: "100%",
          width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
          background: "var(--color-primary)",
          transition: "width 0.3s ease",
        }} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "var(--space-8) var(--space-6)" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>

          {/* ─── Step: Identity ─── */}
          {step === "identity" && (
            <>
              <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: "var(--space-3)", lineHeight: "var(--leading-tight)" }}>
                Set up your intelligence profile
              </h1>
              <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-8)" }}>
                Tell us about yourself so we can personalize your regulatory feed and alerts.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: "var(--space-8)" }}>
                <FormField label="Name" required>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Park" autoFocus />
                </FormField>
                <FormField label="Work email" required>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
                </FormField>
                <FormField label="Role">
                  <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. VP Regulatory Affairs" />
                </FormField>
                <FormField label="Organization">
                  <input className="input" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="e.g. Acme Pharma" />
                </FormField>
              </div>

              <button type="button" className="btn btn-primary btn-lg" onClick={goNext} disabled={!canProceedFromIdentity} style={{ width: "100%" }}>
                Continue
              </button>
              <BackLink />
            </>
          )}

          {/* ─── Step: Focus ─── */}
          {step === "focus" && (
            <>
              <StepHeader title="Your focus areas" subtitle="Select the markets, domains, and therapeutic areas you follow." onBack={goBack} />

              <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: "var(--space-8)" }}>
                <FormField label="Markets" required>
                  <ToggleChips items={REGIONS} selected={regions} onToggle={(item) => toggleArray(regions, setRegions, item)} />
                </FormField>

                <FormField label="Domain" required>
                  <ToggleChips items={DOMAINS.map(d => d.value)} labels={DOMAINS.reduce((a, d) => ({ ...a, [d.value]: d.label }), {} as Record<string, string>)} selected={domains} onToggle={(item) => toggleArray(domains, setDomains, item)} />
                </FormField>

                <FormField label="Therapeutic areas">
                  <ToggleChips items={[...THERAPEUTIC_AREAS]} selected={therapeuticAreas} onToggle={(item) => toggleArray(therapeuticAreas, setTherapeuticAreas, item)} />
                </FormField>
              </div>

              <button type="button" className="btn btn-primary btn-lg" onClick={goNext} disabled={!canProceedFromFocus} style={{ width: "100%" }}>
                Continue
              </button>
            </>
          )}

          {/* ─── Step: Products ─── */}
          {step === "products" && (
            <>
              <StepHeader title="Products & competitors" subtitle="Add specific products you want to track. You can always update these later." onBack={goBack} />

              <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: "var(--space-8)" }}>
                <FormField label="Your products" hint="Search for products you're responsible for">
                  <ProductSearch
                    domain={domains.length === 1 ? domains[0] as "pharma" | "devices" : "both"}
                    selected={ownProducts}
                    onAdd={(p) => setOwnProducts((prev) => [...prev, p])}
                    onRemove={(name) => setOwnProducts((prev) => prev.filter((p) => p.name !== name))}
                  />
                </FormField>

                <FormField label="Competitor products" hint="Products from competitors you want to monitor">
                  <ProductSearch
                    domain={domains.length === 1 ? domains[0] as "pharma" | "devices" : "both"}
                    selected={competitorProducts}
                    onAdd={(p) => setCompetitorProducts((prev) => [...prev, p])}
                    onRemove={(name) => setCompetitorProducts((prev) => prev.filter((p) => p.name !== name))}
                  />
                </FormField>

                <FormField label="Competitor companies" hint="Company names to track broadly">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="input"
                      value={competitorInput}
                      onChange={(e) => setCompetitorInput(e.target.value)}
                      placeholder="e.g. Medtronic"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && competitorInput.trim()) {
                          e.preventDefault();
                          if (!competitors.includes(competitorInput.trim())) {
                            setCompetitors((prev) => [...prev, competitorInput.trim()]);
                          }
                          setCompetitorInput("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-md"
                      disabled={!competitorInput.trim()}
                      onClick={() => {
                        if (competitorInput.trim() && !competitors.includes(competitorInput.trim())) {
                          setCompetitors((prev) => [...prev, competitorInput.trim()]);
                        }
                        setCompetitorInput("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {competitors.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {competitors.map((c) => (
                        <RemovablePill key={c} label={c} onRemove={() => setCompetitors((prev) => prev.filter((x) => x !== c))} />
                      ))}
                    </div>
                  )}
                </FormField>

                <FormField label="Anything else?" hint="Optional notes about what you need">
                  <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I'm focused on upcoming 510(k) submissions for our new cardiac device line..." rows={3} style={{ resize: "vertical", minHeight: 80 }} />
                </FormField>
              </div>

              <button type="button" className="btn btn-primary btn-lg" onClick={goNext} style={{ width: "100%" }}>
                Review profile
              </button>
            </>
          )}

          {/* ─── Step: Confirm ─── */}
          {step === "confirm" && (
            <>
              <StepHeader title="Your profile" subtitle="Confirm the details below, then we'll create your personalized feed and send your first digest." onBack={goBack} />

              <div style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xl)", padding: "var(--space-6)", marginBottom: "var(--space-6)", fontSize: "var(--text-sm)",
              }}>
                <ProfileSection label="You">
                  <div style={{ color: "var(--color-fg)" }}><strong>{name}</strong></div>
                  <div style={{ color: "var(--color-fg-secondary)" }}>{email}</div>
                  {role && <div style={{ color: "var(--color-fg-muted)", marginTop: 4 }}>{role}{organization ? ` at ${organization}` : ""}</div>}
                </ProfileSection>

                {regions.length > 0 && (
                  <ProfileSection label="Markets">
                    <PillList items={regions} />
                  </ProfileSection>
                )}

                {domains.length > 0 && (
                  <ProfileSection label="Focus">
                    <PillList items={domains.map((d) => d === "pharma" ? "Pharma & Biologics" : d === "devices" ? "Medical Devices" : d)} />
                  </ProfileSection>
                )}

                {therapeuticAreas.length > 0 && (
                  <ProfileSection label="Therapeutic areas">
                    <PillList items={therapeuticAreas} />
                  </ProfileSection>
                )}

                {ownProducts.length > 0 && (
                  <ProfileSection label="Your products">
                    {ownProducts.map((p) => (
                      <div key={p.name} style={{ marginBottom: 4 }}>
                        <strong style={{ color: "var(--color-fg)" }}>{p.name}</strong>
                        {p.company && <span style={{ color: "var(--color-fg-muted)" }}> — {p.company}</span>}
                        {p.regulatory_id && <span style={{ color: "var(--color-fg-muted)" }}> ({p.regulatory_id})</span>}
                      </div>
                    ))}
                  </ProfileSection>
                )}

                {competitorProducts.length > 0 && (
                  <ProfileSection label="Competitor products">
                    {competitorProducts.map((p) => (
                      <div key={p.name} style={{ marginBottom: 4 }}>
                        <strong style={{ color: "var(--color-fg)" }}>{p.name}</strong>
                        {p.company && <span style={{ color: "var(--color-fg-muted)" }}> — {p.company}</span>}
                      </div>
                    ))}
                  </ProfileSection>
                )}

                {competitors.length > 0 && (
                  <ProfileSection label="Competitor companies">
                    <PillList items={competitors} />
                  </ProfileSection>
                )}

                <ProfileSection label="Digest email">
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginBottom: 6 }}>Frequency</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {DIGEST_CADENCE_OPTIONS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setDigestCadence(c.id)}
                            style={{
                              padding: "8px 14px",
                              borderRadius: "var(--radius-md)",
                              border: `1px solid ${digestCadence === c.id ? "var(--color-primary)" : "var(--color-border)"}`,
                              background: digestCadence === c.id ? "var(--color-primary-subtle)" : "var(--color-surface-raised)",
                              color: digestCadence === c.id ? "var(--color-primary)" : "var(--color-fg-secondary)",
                              fontSize: "var(--text-sm)",
                              fontFamily: "var(--font-sans)",
                              cursor: "pointer",
                              fontWeight: digestCadence === c.id ? 600 : 400,
                              textAlign: "left",
                            }}
                          >
                            <div>{c.label}</div>
                            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 1 }}>{c.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginBottom: 6 }}>Send at</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {DIGEST_HOUR_OPTIONS.map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => setDigestSendHour(h)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "var(--radius-md)",
                              border: `1px solid ${digestSendHour === h ? "var(--color-primary)" : "var(--color-border)"}`,
                              background: digestSendHour === h ? "var(--color-primary-subtle)" : "var(--color-surface-raised)",
                              color: digestSendHour === h ? "var(--color-primary)" : "var(--color-fg-secondary)",
                              fontSize: "var(--text-sm)",
                              fontFamily: "var(--font-sans)",
                              cursor: "pointer",
                            }}
                          >
                            {h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`}
                          </button>
                        ))}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginBottom: 4 }}>Timezone</div>
                        <select
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface-raised)",
                            color: "var(--color-fg)",
                            fontSize: "var(--text-sm)",
                            fontFamily: "var(--font-sans)",
                            minWidth: 160,
                          }}
                        >
                          {TIMEZONE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </ProfileSection>
              </div>

              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginBottom: 16 }}>
                We&apos;ll send your first digest to <strong>{email}</strong> and open your personalized feed.
              </p>

              {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginBottom: 12 }}>{error}</p>}
              {showEmailError && (
                <p style={{ marginBottom: 12 }}>
                  <button type="button" className="btn btn-primary btn-md" onClick={() => router.push("/feed")}>
                    Continue to my feed
                  </button>
                </p>
              )}

              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={submitting || sendingDigest || showEmailError}
                onClick={finalizeProfile}
                style={{ width: "100%" }}
              >
                {submitting ? "Creating profile\u2026" : sendingDigest ? "Sending first digest\u2026" : "Create my profile"}
              </button>
            </>
          )}

          {step === "identity" && null}
          {step !== "identity" && step !== "confirm" && (
            <p style={{ marginTop: 24, fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", textAlign: "center" }}>
              <Link href="/" style={{ color: "var(--color-fg-muted)", textDecoration: "underline" }}>Back to home</Link>
            </p>
          )}
          {step === "confirm" && (
            <p style={{ marginTop: 24, fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", textAlign: "center" }}>
              <Link href="/" style={{ color: "var(--color-fg-muted)", textDecoration: "underline" }}>Back to home</Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Helper components ──────────────────────────────────────────────

function BackLink() {
  return (
    <p style={{ marginTop: 24, fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", textAlign: "center" }}>
      <Link href="/" style={{ color: "var(--color-fg-muted)", textDecoration: "underline" }}>Back to home</Link>
    </p>
  );
}

function StepHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <>
      <button type="button" onClick={onBack} style={{
        background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16,
        display: "flex", alignItems: "center", gap: 6, color: "var(--color-fg-muted)", fontSize: "var(--text-sm)",
        fontFamily: "var(--font-sans)",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back
      </button>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: "var(--space-3)", lineHeight: "var(--leading-tight)" }}>
        {title}
      </h2>
      <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-6)" }}>
        {subtitle}
      </p>
    </>
  );
}

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
        {label}{required && <span style={{ color: "var(--color-danger)" }}> *</span>}
      </label>
      {hint && <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginBottom: 6, opacity: 0.7 }}>{hint}</p>}
      {children}
    </div>
  );
}

function ToggleChips({ items, labels, selected, onToggle }: { items: string[]; labels?: Record<string, string>; selected: string[]; onToggle: (item: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item) => {
        const isSelected = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${isSelected ? "var(--color-primary)" : "var(--color-border)"}`,
              background: isSelected ? "var(--color-primary-subtle)" : "var(--color-surface)",
              color: isSelected ? "var(--color-primary)" : "var(--color-fg-secondary)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-sans)",
              cursor: "pointer",
              fontWeight: isSelected ? 600 : 400,
              transition: "all 0.15s ease",
            }}
          >
            {labels?.[item] || item}
          </button>
        );
      })}
    </div>
  );
}

function ProfileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function PillList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item) => (
        <span key={item} style={{ padding: "4px 10px", background: "var(--color-surface-raised)", borderRadius: "var(--radius-md)", color: "var(--color-fg)", fontSize: "var(--text-sm)" }}>
          {item}
        </span>
      ))}
    </div>
  );
}

function RemovablePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      padding: "4px 8px 4px 10px", background: "var(--color-surface-raised)", borderRadius: "var(--radius-md)",
      color: "var(--color-fg)", fontSize: "var(--text-sm)", display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      {label}
      <button type="button" onClick={onRemove} style={{
        background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-fg-muted)",
        display: "flex", alignItems: "center",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
}

// ─── Product search component ───────────────────────────────────────

function ProductSearch({
  domain,
  selected,
  onAdd,
  onRemove,
}: {
  domain: "pharma" | "devices" | "both";
  selected: ProductInfo[];
  onAdd: (product: ProductInfo) => void;
  onRemove: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&domain=${domain}`);
      const data = await res.json();
      setResults(data.results || []);
      setShowResults(true);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, [domain]);

  function handleInput(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  }

  function addCustomProduct() {
    if (!query.trim()) return;
    const product: ProductInfo = {
      name: query.trim(),
      product_type: "unknown",
      domain: domain === "both" ? "pharma" : domain,
    };
    onAdd(product);
    setQuery("");
    setResults([]);
    setShowResults(false);
  }

  const selectedNames = new Set(selected.map((p) => p.name));

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search by product name..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (results.length > 0) {
                const first = results.find((r) => !selectedNames.has(r.name));
                if (first) {
                  onAdd({
                    name: first.name,
                    generic_name: first.generic_name,
                    company: first.company,
                    product_type: first.product_type,
                    domain: first.domain,
                    region: first.region,
                    regulatory_id: first.regulatory_id,
                    source: first.source,
                  });
                  setQuery("");
                  setResults([]);
                  setShowResults(false);
                }
              } else {
                addCustomProduct();
              }
            }
          }}
        />
        <button type="button" className="btn btn-secondary btn-md" disabled={!query.trim()} onClick={addCustomProduct}>
          Add
        </button>
      </div>

      {searching && <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginTop: 4 }}>Searching...</div>}

      {showResults && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 50,
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          maxHeight: 240, overflowY: "auto",
        }}>
          {results.slice(0, 8).map((r) => {
            const alreadySelected = selectedNames.has(r.name);
            return (
              <button
                key={`${r.name}-${r.regulatory_id || r.source}`}
                type="button"
                disabled={alreadySelected}
                onClick={() => {
                  onAdd({
                    name: r.name,
                    generic_name: r.generic_name,
                    company: r.company,
                    product_type: r.product_type,
                    domain: r.domain,
                    region: r.region,
                    regulatory_id: r.regulatory_id,
                    source: r.source,
                  });
                  setQuery("");
                  setResults([]);
                  setShowResults(false);
                }}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                  background: "none", border: "none", borderBottom: "1px solid var(--color-border)",
                  cursor: alreadySelected ? "default" : "pointer", fontFamily: "var(--font-sans)",
                  opacity: alreadySelected ? 0.4 : 1,
                }}
              >
                <div style={{ fontSize: "var(--text-sm)", color: "var(--color-fg)", fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginTop: 2 }}>
                  {[r.company, r.product_type, r.regulatory_id].filter(Boolean).join(" \u00B7 ")}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {selected.map((p) => (
            <RemovablePill key={p.name} label={p.name} onRemove={() => onRemove(p.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────

function toggleArray(arr: string[], setter: (fn: (prev: string[]) => string[]) => void, item: string) {
  setter((prev) => prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]);
}
