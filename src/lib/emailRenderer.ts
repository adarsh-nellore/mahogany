/**
 * Converts a structured digest text into a Substack-style HTML email.
 *
 * Expected input format from the summarizer:
 * - Line 1: AI-generated digest title (used for masthead and email subject)
 * - Line 3+: 2-3 sentence executive summary explaining what's below
 * - Sections: ALL CAPS HEADLINE — 🔴 HIGH / 🟡 MEDIUM / 🟢 LOW
 * - Signal entries: **bold headline** — analysis text
 * - Optional: "Why this surfaced: reason codes"
 * - Source lines: YYYY-MM-DD (evidence date) · Authority · Source · Doc ID · [Link](URL)
 */

import { isValidSourceUrl } from "./sourceUrl";

/** Extract the digest title (first line) for use as email subject. */
export function getDigestSubjectFromMarkdown(markdown: string): string {
  const firstLine = markdown.split("\n").find((l) => l.trim());
  return (
    firstLine?.trim() ||
    `RI Digest — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  );
}

export function renderDigestEmail(markdown: string): string {
  const lines = markdown.split("\n");
  const htmlParts: string[] = [];

  let title = "";
  let i = 0;

  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) {
    title = lines[i].trim();
    i++;
  }

  const summaryLines: string[] = [];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (isSectionHeader(trimmed)) break;
    if (trimmed) summaryLines.push(trimmed);
    i++;
  }

  if (summaryLines.length > 0) {
    htmlParts.push(
      `<p style="${font(16)}color:#374151;margin:0 0 36px 0;line-height:1.8;">${formatInline(summaryLines.join(" "))}</p>`
    );
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (isSectionHeader(trimmed)) {
      const { title, severity } = parseSectionHeader(trimmed);
      const accentColor =
        severity === "high" ? "#9E3B1E"
          : severity === "medium" ? "#A36A1E"
            : severity === "low" ? "#2D6A4F"
              : "#9E3B1E";

      htmlParts.push(
        `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:48px 0 20px 0;">
          <tr><td style="padding:16px 0 12px 0;border-bottom:2px solid ${accentColor};">
            <span style="${font(13)}font-weight:700;color:${accentColor};letter-spacing:0.5px;text-transform:uppercase;">${esc(title)}</span>
          </td></tr>
        </table>`
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("**")) {
      htmlParts.push(
        `<p style="${font(16)}font-weight:600;color:#111827;margin:28px 0 10px 0;line-height:1.6;">${formatInline(trimmed)}</p>`
      );
      i++;
      continue;
    }

    if (isWhyThisSurfacedLine(trimmed)) {
      const reason = trimmed.replace(/^Why this surfaced:\s*/i, "").trim();
      htmlParts.push(
        `<p style="${font(12)}color:#6b7280;margin:4px 0 12px 0;line-height:1.5;padding-left:12px;border-left:3px solid #e5e7eb;"><span style="font-weight:600;">Why this surfaced:</span> ${esc(reason)}</p>`
      );
      i++;
      continue;
    }

    if (isSourceLine(trimmed)) {
      htmlParts.push(
        `<p style="${font(12)}color:#9ca3af;margin:4px 0 32px 0;line-height:1.5;">${formatSourceLine(trimmed)}</p>`
      );
      i++;
      continue;
    }

    htmlParts.push(
      `<p style="${font(15)}color:#374151;margin:12px 0;line-height:1.75;">${formatInline(trimmed)}</p>`
    );
    i++;
  }

  const bodyHtml = htmlParts.join("\n");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mahogany.app";
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(title || "Regulatory Intelligence Digest")}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f9fafb;">
<tr><td align="center" style="padding:32px 16px;">

<table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;width:100%;background:#ffffff;overflow:hidden;">

<!-- Masthead -->
<tr><td style="padding:40px 40px 0 40px;">
  <p style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#111827;letter-spacing:-0.5px;line-height:1.3;">${esc(title || "Regulatory Intelligence Digest")}</p>
  <p style="${font(13)}color:#6b7280;margin:0;">${esc(dateStr)}</p>
</td></tr>

<!-- Divider -->
<tr><td style="padding:16px 40px 0 40px;">
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 40px 40px 40px;line-height:1.6;">
${bodyHtml}
</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
  <p style="${font(13)}color:#6b7280;margin:0 0 8px 0;line-height:1.5;">
    Powered by <a href="${appUrl}" style="color:#9E3B1E;text-decoration:none;font-weight:600;">Mahogany</a>
  </p>
  <p style="${font(12)}color:#9ca3af;margin:0;line-height:1.5;">
    <a href="${appUrl}/feed" style="color:#6b7280;text-decoration:underline;">View full feed</a> &nbsp;·&nbsp;
    <a href="${appUrl}/profile" style="color:#6b7280;text-decoration:underline;">Update preferences</a> &nbsp;·&nbsp;
    <a href="${appUrl}/unsubscribe" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function font(size: number): string {
  return `font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,sans-serif;font-size:${size}px;`;
}

function isSectionHeader(line: string): boolean {
  if (!(line.includes("🔴") || line.includes("🟡") || line.includes("🟢"))) return false;
  const beforeBadge = line.split("—")[0]?.trim() || "";
  return beforeBadge.length > 2;
}

function parseSectionHeader(line: string): {
  title: string;
  severity: "high" | "medium" | "low" | "unknown";
} {
  const severity = line.includes("🔴") ? "high" as const
    : line.includes("🟡") ? "medium" as const
      : line.includes("🟢") ? "low" as const
        : "unknown" as const;
  const title = line.replace(/\s*—\s*🔴\s+HIGH\s*$/i, "")
    .replace(/\s*—\s*🟡\s+MEDIUM\s*$/i, "")
    .replace(/\s*—\s*🟢\s+LOW\s*$/i, "").trim();
  return { title: title || line, severity };
}

function isWhyThisSurfacedLine(line: string): boolean {
  return /^Why this surfaced:\s*.+/i.test(line.trim());
}

function isSourceLine(line: string): boolean {
  if (line.startsWith("**") || line.startsWith("#")) return false;
  const hasLink = /\[.+?\]\(https?:\/\/.+?\)/.test(line);
  const hasDots = line.includes("·");
  const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(line.trim());
  return (hasLink && hasDots) || (looksLikeDate && hasDots) || (hasLink && line.trim().length > 20);
}

function formatSourceLine(line: string): string {
  const parts = line.split("·").map((p) => p.trim());
  return parts
    .map((part) => {
      const linkMatch = part.match(/\[(.+?)\]\((https?:\/\/.+?)\)/);
      if (linkMatch && isValidSourceUrl(linkMatch[2])) {
        return `<a href="${esc(linkMatch[2])}" style="color:#6b7280;text-decoration:underline;">${esc(linkMatch[1])}</a>`;
      }
      if (isValidSourceUrl(part)) {
        return `<a href="${esc(part)}" style="color:#6b7280;text-decoration:underline;">${esc(shortenUrl(part))}</a>`;
      }
      return esc(part);
    })
    .join(` <span style="color:#d1d5db;">&middot;</span> `);
}

function shortenUrl(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url.length > 40 ? url.slice(0, 37) + "..." : url;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(s: string): string {
  let result = esc(s);
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/_(.+?)_/g, "<em>$1</em>");
  // Markdown links — only render <a> for valid http(s) URLs so we never emit broken links
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_, text, url) => {
      const cleanUrl = url.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
      return isValidSourceUrl(cleanUrl)
        ? `<a href="${cleanUrl}" style="color:#9E3B1E;text-decoration:underline;">${text}</a>`
        : esc(text);
    }
  );
  return result;
}
