"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import Breadcrumbs from "@/components/Breadcrumbs";
import DigestRenderer from "@/components/DigestRenderer";

interface DigestFull {
  id: string;
  markdown: string;
  sent_at: string;
  signal_ids: string[];
  evidence_date_min?: string | null;
  evidence_date_max?: string | null;
}

function formatEvidenceDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DigestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [digest, setDigest] = useState<DigestFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/digests/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setDigest)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
        <Breadcrumbs items={[
          { label: "Feed", href: "/feed" },
          { label: "Digest Archive", href: "/digest" },
          { label: digest ? new Date(digest.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Loading" },
        ]} />

        {loading && <p style={{ color: "var(--color-fg-muted)", padding: "var(--space-8)", textAlign: "center" }}>Loading digest...</p>}
        {error && <p style={{ color: "var(--color-danger)", padding: "var(--space-8)", textAlign: "center" }}>Digest not found.</p>}

        {digest && (
          <>
            <div style={{ marginBottom: "var(--space-5)" }}>
              {(digest.evidence_date_min && digest.evidence_date_max) ? (
                <>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg)", fontWeight: 500, margin: 0 }}>
                    Evidence from {formatEvidenceDate(digest.evidence_date_min)}
                    {digest.evidence_date_min !== digest.evidence_date_max && ` – ${formatEvidenceDate(digest.evidence_date_max)}`}
                  </p>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", margin: "2px 0 0 0" }}>
                    Digest delivered {new Date(digest.sent_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    {" · "}
                    {digest.signal_ids?.length || 0} signals analyzed
                  </p>
                </>
              ) : (
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", margin: 0 }}>
                  {new Date(digest.sent_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  {" · "}
                  {digest.signal_ids?.length || 0} signals analyzed
                </p>
              )}
            </div>
            <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-surface)", padding: "var(--space-6) var(--space-8)" }}>
              <DigestRenderer markdown={digest.markdown} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
