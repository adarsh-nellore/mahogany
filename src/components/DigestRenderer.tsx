"use client";

import { useState } from "react";

interface DigestRendererProps {
  markdown: string;
}

interface Section {
  title: string;
  severity: "high" | "medium" | "low" | "unknown";
  items: string[];
}

function parseSections(markdown: string): { summary: string; sections: Section[] } {
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) i++;

  const summaryLines: string[] = [];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (isSectionHeader(trimmed)) break;
    if (trimmed) summaryLines.push(trimmed);
    i++;
  }

  const sections: Section[] = [];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    if (isSectionHeader(trimmed)) {
      const severity = trimmed.includes("\u{1F534}") ? "high" as const
        : trimmed.includes("\u{1F7E1}") ? "medium" as const
          : trimmed.includes("\u{1F7E2}") ? "low" as const
            : "unknown" as const;
      sections.push({ title: trimmed, severity, items: [] });
      i++;
      continue;
    }

    if (sections.length > 0) {
      sections[sections.length - 1].items.push(trimmed);
    }
    i++;
  }

  return { summary: summaryLines.join(" "), sections };
}

function isSectionHeader(line: string): boolean {
  if (!line.includes("\u{1F534}") && !line.includes("\u{1F7E1}") && !line.includes("\u{1F7E2}")) return false;
  const beforeBadge = line.split("\u2014")[0]?.trim() || "";
  return beforeBadge.length > 5 && beforeBadge === beforeBadge.toUpperCase();
}

function severityColor(s: string): string {
  if (s === "high") return "var(--color-danger)";
  if (s === "medium") return "var(--color-warning)";
  if (s === "low") return "var(--color-success)";
  return "var(--color-primary)";
}

function severityBadge(s: string): string {
  if (s === "high") return "badge-danger";
  if (s === "medium") return "badge-warning";
  if (s === "low") return "badge-success";
  return "badge-default";
}

function formatText(text: string): string {
  let result = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/_(.+?)_/g, "<em>$1</em>");
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--color-primary);text-decoration:underline;">$1</a>'
  );
  return result;
}

function isSourceLine(line: string): boolean {
  const parts = line.split("\u00B7");
  if (parts.length < 3) return false;
  if (line.startsWith("**")) return false;
  const hasLink = /\[.+?\]\(https?:\/\/.+?\)/.test(line);
  return hasLink || (parts.length >= 3 && /^[A-Z]/.test(line.trim()));
}

function SectionBlock({ section }: { section: Section }) {
  const [expanded, setExpanded] = useState(true);

  const groups: { headline: string; body: string[]; source: string | null }[] = [];
  for (const item of section.items) {
    if (item.startsWith("**")) {
      groups.push({ headline: item, body: [], source: null });
    } else if (groups.length > 0) {
      if (isSourceLine(item)) {
        groups[groups.length - 1].source = item;
      } else {
        groups[groups.length - 1].body.push(item);
      }
    }
  }

  return (
    <div style={{ marginBottom: "var(--space-8)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          width: "100%",
          background: "none",
          border: "none",
          borderBottom: `2px solid ${severityColor(section.severity)}`,
          padding: "var(--space-3) 0",
          cursor: "pointer",
          fontFamily: "var(--font-serif)",
          textAlign: "left",
        }}
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{
            transition: "transform var(--duration-base) var(--ease-default)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            color: severityColor(section.severity),
            flexShrink: 0,
          }}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span
          className="section-label"
          style={{ color: severityColor(section.severity), fontSize: "var(--text-xs)" }}
        >
          {section.title}
        </span>
      </button>

      {expanded && (
        <div style={{ paddingTop: "var(--space-4)" }}>
          {groups.map((g, idx) => (
            <div
              key={idx}
              className="card"
              style={{
                padding: "var(--space-4) var(--space-5)",
                marginBottom: "var(--space-3)",
              }}
            >
              <div
                style={{ fontSize: "var(--text-base)", lineHeight: "var(--leading-normal)", color: "var(--color-fg)" }}
                dangerouslySetInnerHTML={{ __html: formatText(g.headline) }}
              />
              {g.body.length > 0 && (
                <div
                  style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-secondary)", marginTop: "var(--space-2)", lineHeight: "var(--leading-normal)" }}
                  dangerouslySetInnerHTML={{ __html: g.body.map(formatText).join("<br/>") }}
                />
              )}
              {g.source && (
                <div
                  style={{ fontSize: "var(--text-xs)", color: "var(--color-fg-muted)", marginTop: "var(--space-2)" }}
                  dangerouslySetInnerHTML={{ __html: formatText(g.source) }}
                />
              )}
            </div>
          ))}
          {groups.length === 0 && section.items.length > 0 && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-secondary)", lineHeight: "var(--leading-relaxed)" }}>
              {section.items.map((item, idx) => (
                <p key={idx} style={{ marginBottom: "var(--space-2)" }} dangerouslySetInnerHTML={{ __html: formatText(item) }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DigestRenderer({ markdown }: DigestRendererProps) {
  const { summary, sections } = parseSections(markdown);

  if (!markdown || !markdown.trim()) {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-12)", color: "var(--color-fg-muted)" }}>
        <p style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>No digest yet</p>
        <p style={{ fontSize: "var(--text-sm)" }}>Your first digest is being generated. Check back soon.</p>
      </div>
    );
  }

  return (
    <div>
      {summary && (
        <p style={{
          fontSize: "var(--text-base)",
          color: "var(--color-fg-secondary)",
          lineHeight: "var(--leading-relaxed)",
          marginBottom: "var(--space-8)",
        }}
          dangerouslySetInnerHTML={{ __html: formatText(summary) }}
        />
      )}

      {sections.map((section, idx) => (
        <SectionBlock key={idx} section={section} />
      ))}

      {sections.length === 0 && (
        <div
          style={{ fontSize: "var(--text-sm)", color: "var(--color-fg-secondary)", lineHeight: "var(--leading-relaxed)" }}
          dangerouslySetInnerHTML={{ __html: formatText(markdown) }}
        />
      )}
    </div>
  );
}

export { severityBadge as severityBadgeClass };
