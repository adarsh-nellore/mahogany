"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { isValidSourceUrl } from "@/lib/sourceUrl";

interface Signal {
  id: string;
  title: string;
  summary: string;
  ai_analysis: string;
  region: string;
  domains: string[];
  therapeutic_areas: string[];
  product_types: string[];
  product_classes: string[];
  lifecycle_stage: string;
  impact_type: string;
  impact_severity: string;
  authority: string;
  document_id: string | null;
  url: string;
  published_at: string;
  source_id: string;
}

function severityBadge(s: string) {
  if (s === "high") return "badge badge-danger";
  if (s === "medium") return "badge badge-warning";
  return "badge badge-success";
}

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SignalDetailPage() {
  const { id } = useParams();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/signals/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Signal not found");
        return r.json();
      })
      .then(setSignal)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <Header />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--space-6)" }}>
        <Link href="/feed" style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", marginBottom: "var(--space-4)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          Back to feed
        </Link>

        {loading && <p style={{ color: "var(--color-fg-muted)" }}>Loading signal...</p>}
        {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

        {signal && (
          <div className="card" style={{ padding: "var(--space-6) var(--space-8)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
              <span className="badge badge-info">{signal.region}</span>
              <span className={severityBadge(signal.impact_severity)}>{signal.impact_severity}</span>
              <span className="badge badge-default">{label(signal.impact_type)}</span>
              <span className="badge badge-default">{label(signal.lifecycle_stage)}</span>
            </div>

            <h1 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-tight)", lineHeight: "var(--leading-snug)", color: "var(--color-fg)", marginBottom: "var(--space-4)" }}>
              {signal.title}
            </h1>

            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-muted)", marginBottom: "var(--space-6)" }}>
              {signal.authority}
              {signal.document_id && ` \u2014 ${signal.document_id}`}
              {" \u2014 "}
              {new Date(signal.published_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>

            {signal.ai_analysis && (
              <div style={{ fontSize: "var(--text-base)", color: "var(--color-fg)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-4)", padding: "var(--space-4) var(--space-5)", background: "var(--color-surface-raised)", borderRadius: "var(--radius-md)", borderLeft: "3px solid var(--color-primary)" }}>
                {signal.ai_analysis}
              </div>
            )}

            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-secondary)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--space-6)" }}>
              {signal.summary}
            </div>

            {isValidSourceUrl(signal.url) ? (
              <a href={signal.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-md">
                View Source
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
              </a>
            ) : (
              <span className="btn btn-primary btn-md" style={{ opacity: 0.7, cursor: "default" }}>Source link not available</span>
            )}

            {/* Metadata table */}
            <div style={{ marginTop: "var(--space-8)", borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-6)" }}>
              <div className="section-label" style={{ marginBottom: "var(--space-4)" }}>Metadata</div>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "var(--space-3)", fontSize: "var(--text-sm)" }}>
                {signal.domains.length > 0 && (
                  <>
                    <span style={{ color: "var(--color-fg-muted)" }}>Domains</span>
                    <span style={{ color: "var(--color-fg-secondary)" }}>{signal.domains.join(", ")}</span>
                  </>
                )}
                {signal.therapeutic_areas.length > 0 && (
                  <>
                    <span style={{ color: "var(--color-fg-muted)" }}>Therapeutic Areas</span>
                    <span style={{ color: "var(--color-fg-secondary)" }}>{signal.therapeutic_areas.join(", ")}</span>
                  </>
                )}
                {signal.product_types.length > 0 && (
                  <>
                    <span style={{ color: "var(--color-fg-muted)" }}>Product Types</span>
                    <span style={{ color: "var(--color-fg-secondary)" }}>{signal.product_types.join(", ")}</span>
                  </>
                )}
                {signal.product_classes.length > 0 && (
                  <>
                    <span style={{ color: "var(--color-fg-muted)" }}>Product Classes</span>
                    <span style={{ color: "var(--color-fg-secondary)" }}>{signal.product_classes.join(", ")}</span>
                  </>
                )}
                <span style={{ color: "var(--color-fg-muted)" }}>Source</span>
                <span style={{ color: "var(--color-fg-secondary)" }}>{signal.source_id}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
