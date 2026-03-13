"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Breadcrumbs from "@/components/Breadcrumbs";

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
}

const DEBOUNCE_MS = 500;

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--space-6)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", background: "var(--color-surface)", overflow: "hidden" }}>
      <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--color-fg)", fontFamily: "var(--font-sans)" }}>{title}</div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", fontFamily: "var(--font-sans)", marginTop: 4, lineHeight: "var(--leading-relaxed)" }}>{desc}</div>
      </div>
      <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20 }}>{children}</div>
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

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
          name: p.name,
          role: p.role,
          organization: p.organization,
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

  if (!profile) return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--space-12)", textAlign: "center", color: "var(--color-fg-muted)" }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--space-8) var(--space-6) var(--space-12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-5)" }}>
          <Breadcrumbs items={[{ label: "Feed", href: "/feed" }, { label: "Profile" }]} />
          {saveStatus === "saved" && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)", fontWeight: 600 }}>Saved</span>}
          {saveStatus === "error" && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>Save failed</span>}
        </div>

        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", color: "var(--color-fg)", margin: "0 0 var(--space-3)" }}>
          Profile
        </h1>
        <p style={{ fontSize: "var(--text-base)", color: "var(--color-fg-muted)", margin: "0 0 var(--space-6)", fontFamily: "var(--font-sans)", lineHeight: "var(--leading-relaxed)" }}>
          Your account information. All changes are saved automatically.
        </p>

        <Section title="Personal" desc="Name, email, role, and organization">
          <FieldGroup label="Name">
            <input className="input" value={profile.name} onChange={(e) => update({ name: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Email">
            <input className="input" value={profile.email} readOnly disabled style={{ opacity: 0.8, cursor: "not-allowed" }} />
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginTop: 4 }}>Contact support to change your email.</p>
          </FieldGroup>
          <FieldGroup label="Role">
            <input className="input" value={profile.role} onChange={(e) => update({ role: e.target.value })} placeholder="e.g. Regulatory Affairs Director" />
          </FieldGroup>
          <FieldGroup label="Organization">
            <input className="input" value={profile.organization} onChange={(e) => update({ organization: e.target.value })} placeholder="e.g. Acme Pharma" />
          </FieldGroup>
        </Section>
      </div>
    </div>
  );
}
