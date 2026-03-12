"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ParsedMention = {
  mention_text: string;
  mention_type: "product_name" | "product_code" | "company" | "ta" | "framework";
  confidence: number;
};

type ResolvedMention = ParsedMention & {
  entity_id: string;
  canonical_name: string;
  resolution: "exact" | "alias" | "created";
};

const REGION_OPTIONS = ["US", "EU", "UK", "Canada", "Australia", "Japan", "Switzerland", "Global"] as const;
const DOMAIN_OPTIONS = [
  { id: "devices", label: "Medical Devices" },
  { id: "pharma", label: "Pharma & Biologics" },
] as const;
const THERAPEUTIC_AREA_OPTIONS = [
  "oncology", "cardiology", "neurology", "orthopedics", "endocrinology", "immunology",
  "dermatology", "ophthalmology", "gastroenterology", "pulmonology", "hematology", "nephrology",
  "infectious disease", "rare disease", "wound care", "dental", "SaMD", "respiratory", "psychiatry", "pediatrics",
];

const STEP_KEYS = ["welcome", "name", "email", "role", "regions", "domains", "therapeutic_areas", "intake", "confirm", "finish"] as const;
type StepKey = (typeof STEP_KEYS)[number];

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [regions, setRegions] = useState<string[]>(["US"]);
  const [domains, setDomains] = useState<string[]>(["devices", "pharma"]);
  const [therapeuticAreas, setTherapeuticAreas] = useState<string[]>([]);
  const [intakeText, setIntakeText] = useState("");
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedMention[]>([]);
  const [followups, setFollowups] = useState<string[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<Record<string, boolean>>({});
  const [showEmailError, setShowEmailError] = useState(false);

  const canParse = role.trim().length > 0 && regions.length > 0 && intakeText.trim().length > 2;
  const canCreateProfile = name.trim().length > 0 && email.includes("@") && domains.length > 0;

  const toggleRegion = (r: string) => {
    setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };
  const toggleDomain = (id: string) => {
    setDomains((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]
    );
  };
  const toggleTherapeuticArea = (ta: string) => {
    setTherapeuticAreas((prev) => (prev.includes(ta) ? prev.filter((x) => x !== ta) : [...prev, ta]));
  };

  const selectedWatchItems = useMemo(
    () =>
      resolved
        .filter((r) => selectedMentions[r.entity_id] !== false)
        .map((r) => ({
          mention_text: r.mention_text,
          watch_type: r.mention_type === "company" ? "competitor" : "exact",
          priority: r.mention_type === "product_code" ? 95 : 80,
        })),
    [resolved, selectedMentions]
  );

  const steps = useMemo(() => {
    const base: StepKey[] = ["welcome", "name", "email", "role", "regions", "domains", "therapeutic_areas", "intake"];
    if (resolved.length > 0) base.push("confirm");
    base.push("finish");
    return base;
  }, [resolved.length]);

  const currentStepKey = steps[stepIndex];
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;

  async function parseIntake() {
    if (!canParse) return;
    setError("");
    setLoadingParse(true);
    try {
      const res = await fetch("/api/intake/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: intakeText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to parse");
        return;
      }
      setSessionId(data.session_id);
      setResolved(data.resolved || []);
      setFollowups(data.parsed?.suggested_followups || []);
      const initial: Record<string, boolean> = {};
      for (const r of data.resolved || []) initial[r.entity_id] = true;
      setSelectedMentions(initial);
      setStepIndex((i) => Math.min(i + 1, steps.length));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingParse(false);
    }
  }

  function goNext() {
    if (currentStepKey === "intake" && intakeText.trim().length > 2 && canParse) {
      parseIntake();
      return;
    }
    if (currentStepKey === "intake" && !intakeText.trim()) {
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1));
    setError("");
  }

  async function finalizeProfile() {
    if (!canCreateProfile) return;
    setError("");
    setLoadingSubmit(true);
    try {
      const profileRes = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          role,
          regions,
          domains,
          therapeutic_areas: [
            ...new Set([
              ...therapeuticAreas,
              ...resolved.filter((r) => r.mention_type === "ta").map((r) => r.canonical_name.toLowerCase()),
            ]),
          ],
          product_types: [],
          tracked_products: resolved.filter((r) => r.mention_type === "product_name" || r.mention_type === "product_code").map((r) => r.canonical_name),
          organization: "",
          active_submissions: [],
          competitors: resolved.filter((r) => r.mention_type === "company").map((r) => r.canonical_name),
          regulatory_frameworks: resolved.filter((r) => r.mention_type === "framework").map((r) => r.canonical_name),
          analysis_preferences: `Role: ${role}. Intake: ${intakeText}`,
          digest_cadence: "daily",
          digest_send_hour: 7,
          intake_text: intakeText,
        }),
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok) {
        setError(profileData.error || "Failed to create profile");
        return;
      }
      if (sessionId) {
        await fetch("/api/intake/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, profile_id: profileData.id, watch_items: selectedWatchItems }),
        });
      }
      setLoadingSubmit(false);
      setSendingDigest(true);
      let emailFailed: string | null = null;
      try {
        const digestRes = await fetch("/api/send-digest-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile_id: profileData.id }),
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
        setError(`Profile created, but the welcome email could not be sent: ${emailFailed}. You can still use your feed below.`);
        setSendingDigest(false);
        setShowEmailError(true);
        return;
      }
      router.push("/feed");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingSubmit(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "var(--color-bg)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 20px",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
  };

  const progressBarStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    height: 4,
    background: "var(--color-surface-raised)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 32,
  };

  return (
    <main style={containerStyle}>
      {totalSteps > 0 && (
        <div style={progressBarStyle}>
          <div style={{ width: `${progress}%`, height: "100%", background: "var(--color-primary)", transition: "width 0.3s ease" }} />
        </div>
      )}

      <div style={cardStyle}>
        {/* Welcome */}
        {currentStepKey === "welcome" && (
          <>
            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 12 }}>
              Set up your intelligence profile
            </h1>
            <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", lineHeight: 1.6, marginBottom: 32 }}>
              A few questions and you&apos;ll get a personalized feed and daily digest tailored to your portfolio and markets.
            </p>
            <button type="button" className="btn btn-primary btn-lg" onClick={goNext}>
              Get started
            </button>
          </>
        )}

        {/* Name */}
        {currentStepKey === "name" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              What&apos;s your name?
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              We&apos;ll use this to personalize your briefing.
            </p>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Park"
              autoFocus
              style={{ width: "100%", padding: 12, fontSize: "var(--text-base)", marginBottom: 24 }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext} disabled={!name.trim()}>Next</button>
            </div>
          </>
        )}

        {/* Email */}
        {currentStepKey === "email" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              What&apos;s your work email?
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              We&apos;ll send your daily digest here.
            </p>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              autoFocus
              style={{ width: "100%", padding: 12, fontSize: "var(--text-base)", marginBottom: 24 }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext} disabled={!email.includes("@")}>Next</button>
            </div>
          </>
        )}

        {/* Role */}
        {currentStepKey === "role" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              What&apos;s your role?
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              e.g. VP Regulatory Affairs, Director of Quality
            </p>
            <input
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="VP Regulatory Affairs"
              autoFocus
              style={{ width: "100%", padding: 12, fontSize: "var(--text-base)", marginBottom: 24 }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext} disabled={!role.trim()}>Next</button>
            </div>
          </>
        )}

        {/* Regions */}
        {currentStepKey === "regions" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              Which markets do you follow?
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              Select all that apply.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              {REGION_OPTIONS.map((r) => {
                const active = regions.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    className="btn btn-md"
                    onClick={() => toggleRegion(r)}
                    style={{
                      border: active ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                      background: active ? "var(--color-primary-subtle)" : "var(--color-surface)",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext} disabled={regions.length === 0}>Next</button>
            </div>
          </>
        )}

        {/* Domains */}
        {currentStepKey === "domains" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              What&apos;s your focus?
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              Pick at least one.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              {DOMAIN_OPTIONS.map((d) => {
                const active = domains.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="btn btn-md"
                    onClick={() => toggleDomain(d.id)}
                    style={{
                      border: active ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                      background: active ? "var(--color-primary-subtle)" : "var(--color-surface)",
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext} disabled={domains.length === 0}>Next</button>
            </div>
          </>
        )}

        {/* Therapeutic areas */}
        {currentStepKey === "therapeutic_areas" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              Therapeutic areas (optional)
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              We&apos;ll prioritize stories in these areas. You can skip.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
              {THERAPEUTIC_AREA_OPTIONS.map((ta) => {
                const active = therapeuticAreas.includes(ta);
                return (
                  <button
                    key={ta}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => toggleTherapeuticArea(ta)}
                    style={{
                      border: active ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                      background: active ? "var(--color-primary-subtle)" : "var(--color-surface)",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    {ta}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-ghost btn-md" onClick={goNext}>Skip</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext}>Next</button>
            </div>
          </>
        )}

        {/* Intake */}
        {currentStepKey === "intake" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              Products or submissions (optional)
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              In one sentence, e.g. &quot;We are preparing PMA P200123 for CardioSense Pro and track competitor K123456.&quot; We&apos;ll parse and watch these. You can skip.
            </p>
            <textarea
              className="input"
              rows={4}
              value={intakeText}
              onChange={(e) => setIntakeText(e.target.value)}
              placeholder='Example: "We are preparing PMA P200123 for CardioSense Pro and track competitor K123456 in cardiology."'
              style={{ width: "100%", padding: 12, fontSize: "var(--text-base)", marginBottom: 24, resize: "vertical" }}
            />
            {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-ghost btn-md" onClick={goNext}>Skip</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext} disabled={loadingParse}>
                {loadingParse ? "Parsing…" : intakeText.trim().length > 2 ? "Parse & next" : "Next"}
              </button>
            </div>
          </>
        )}

        {/* Confirm (only when we have resolved items) */}
        {currentStepKey === "confirm" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              Confirm what we found
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              Uncheck any you don&apos;t want to watch.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {resolved.map((r) => {
                const checked = selectedMentions[r.entity_id] !== false;
                return (
                  <label key={r.entity_id} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={checked} onChange={() => setSelectedMentions((prev) => ({ ...prev, [r.entity_id]: !checked }))} />
                    <span><strong>{r.canonical_name}</strong> ({r.mention_type})</span>
                  </label>
                );
              })}
            </div>
            {followups.length > 0 && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginBottom: 16 }}>{followups.join(" ")}</p>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack}>Back</button>
              <button type="button" className="btn btn-primary btn-md" onClick={goNext}>Next</button>
            </div>
          </>
        )}

        {/* Finish — Profile summary: "Is this your profile?" */}
        {currentStepKey === "finish" && (
          <>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", marginBottom: 8 }}>
              Is this your profile?
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              We&apos;ll use this as your knowledge graph to personalize your feed, digests, and search. Confirm or go back to edit.
            </p>

            <div
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "20px 20px 24px",
                marginBottom: 24,
                fontSize: "var(--text-sm)",
              }}
            >
              {/* Identity */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>You</div>
                <div style={{ color: "var(--color-fg)" }}><strong>{name || "—"}</strong></div>
                <div style={{ color: "var(--color-fg-secondary)" }}>{email || "—"}</div>
                {role.trim() && <div style={{ color: "var(--color-fg-muted)", marginTop: 4 }}>{role}</div>}
              </div>

              {/* Markets & focus */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Markets & focus</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {regions.map((r) => (
                    <span key={r} style={{ padding: "4px 10px", background: "var(--color-surface-raised)", borderRadius: "var(--radius-md)", color: "var(--color-fg)" }}>{r}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {domains.map((d) => (
                    <span key={d} style={{ padding: "4px 10px", background: "var(--color-primary-subtle)", borderRadius: "var(--radius-md)", color: "var(--color-primary)" }}>
                      {DOMAIN_OPTIONS.find((o) => o.id === d)?.label ?? d}
                    </span>
                  ))}
                </div>
              </div>

              {/* Therapeutic areas */}
              {(therapeuticAreas.length > 0 || resolved.some((r) => r.mention_type === "ta")) && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Therapeutic areas</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[...new Set([...therapeuticAreas, ...resolved.filter((r) => r.mention_type === "ta").map((r) => r.canonical_name)])].map((ta) => (
                      <span key={ta} style={{ padding: "4px 10px", background: "var(--color-surface-raised)", borderRadius: "var(--radius-md)", color: "var(--color-fg)" }}>{ta}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Parsed from your description (products, codes, companies, frameworks) */}
              {resolved.length > 0 && (
                <div>
                  <div style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>From your description</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(["product_name", "product_code", "company", "framework"] as const).map((mention_type) => {
                      const items = resolved.filter((r) => r.mention_type === mention_type && selectedMentions[r.entity_id] !== false);
                      if (items.length === 0) return null;
                      const labels: Record<string, string> = { product_name: "Products / devices", product_code: "Codes & submissions", company: "Companies", framework: "Regulatory frameworks" };
                      return (
                        <div key={mention_type}>
                          <span style={{ color: "var(--color-fg-muted)", marginRight: 8 }}>{labels[mention_type]}:</span>
                          <span style={{ color: "var(--color-fg)" }}>{items.map((r) => r.canonical_name).join(", ")}</span>
                        </div>
                      );
                    })}
                  </div>
                  {intakeText.trim() && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
                      <div style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", marginBottom: 4 }}>Your words</div>
                      <div style={{ color: "var(--color-fg-secondary)", fontStyle: "italic", lineHeight: 1.4 }}>&quot;{intakeText.trim().slice(0, 200)}{intakeText.trim().length > 200 ? "…" : ""}&quot;</div>
                    </div>
                  )}
                </div>
              )}

              {resolved.length === 0 && intakeText.trim() && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", marginBottom: 4 }}>Your description</div>
                  <div style={{ color: "var(--color-fg-secondary)", fontStyle: "italic", lineHeight: 1.4 }}>&quot;{intakeText.trim().slice(0, 200)}{intakeText.trim().length > 200 ? "…" : ""}&quot;</div>
                  <p style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-xs)", marginTop: 8 }}>We&apos;ll still use this text to improve relevance in your feed and digests.</p>
                </div>
              )}
            </div>

            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginBottom: 20 }}>
              Next: we&apos;ll create your profile, send your first digest to <strong>{email}</strong>, and open your personalized feed.
            </p>
            {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginBottom: 12 }}>{error}</p>}
            {showEmailError && (
              <p style={{ marginBottom: 12 }}>
                <button type="button" className="btn btn-primary btn-md" onClick={() => router.push("/feed")}>
                  Continue to my feed
                </button>
              </p>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={goBack} disabled={showEmailError}>Back to edit</button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={!canCreateProfile || loadingSubmit || sendingDigest || showEmailError}
                onClick={finalizeProfile}
              >
                {loadingSubmit ? "Creating profile…" : sendingDigest ? "Sending your first digest…" : "Yes, this is my profile"}
              </button>
            </div>
          </>
        )}

        <p style={{ marginTop: 32, fontSize: "var(--text-xs)", color: "var(--color-fg-muted)" }}>
          <Link href="/" style={{ color: "var(--color-fg-muted)", textDecoration: "underline" }}>Back to home</Link>
        </p>
      </div>
    </main>
  );
}
