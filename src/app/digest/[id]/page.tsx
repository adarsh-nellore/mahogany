"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
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
  const router = useRouter();
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
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)", fontWeight: 500,
            color: "var(--color-fg-muted)", padding: 0, marginBottom: "var(--space-5)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-fg-muted)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to digests
        </button>

        {loading && (
          <div style={{ padding: "var(--space-4) 0" }}>
            <div className="skeleton-text" style={{ width: "50%", height: 14, marginBottom: "var(--space-3)" }} />
            <div className="skeleton-text" style={{ width: "35%", height: 12, marginBottom: "var(--space-5)" }} />
            <div className="skeleton-card" style={{ height: 400 }} />
          </div>
        )}
        {error && (
          <div className="error-boundary">
            <div className="error-boundary-title">Digest not found</div>
            <div className="error-boundary-desc">This digest may have been removed or the link is invalid.</div>
            <a href="/digest" className="btn btn-secondary btn-sm">Back to Digest Archive</a>
          </div>
        )}

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
            <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: "var(--space-6) var(--space-8)" }}>
              <DigestRenderer markdown={digest.markdown} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
