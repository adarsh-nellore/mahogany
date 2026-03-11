"use client";

import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)",
      color: "var(--color-fg-muted)", marginBottom: "var(--space-5)",
      flexWrap: "wrap",
    }}>
      {items.map((crumb, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {crumb.href && !isLast ? (
              <Link href={crumb.href} style={{ color: "var(--color-fg-muted)", textDecoration: "none", transition: "color 0.1s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-fg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-fg-muted)"; }}>
                {crumb.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? "var(--color-fg-secondary)" : "var(--color-fg-muted)", fontWeight: isLast ? 500 : 400 }}>
                {crumb.label}
              </span>
            )}
            {!isLast && <span style={{ color: "var(--color-fg-placeholder)" }}>/</span>}
          </span>
        );
      })}
    </nav>
  );
}
