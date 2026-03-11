/**
 * Validates source URLs so we never render or store broken links.
 * Only absolute http/https URLs are considered valid.
 */
export function isValidSourceUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const u = url.trim();
  return u.length > 0 && (u.startsWith("http://") || u.startsWith("https://"));
}

/**
 * Returns valid source URL or null. Use when normalizing a single URL.
 */
export function normalizeSourceUrl(url: unknown): string | null {
  if (!isValidSourceUrl(url)) return null;
  return (url as string).trim();
}

/**
 * Zips source_urls and source_labels, returning only pairs where the URL is valid.
 * Use when building or displaying source links so we never emit broken links.
 */
export function zipValidSourceLinks(
  sourceUrls: string[] | undefined,
  sourceLabels: string[] | undefined
): { url: string; label: string }[] {
  const urls = sourceUrls ?? [];
  const labels = sourceLabels ?? [];
  const out: { url: string; label: string }[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = (urls[i] ?? "").trim();
    if (!isValidSourceUrl(url)) continue;
    let label = (labels[i] ?? "").trim();
    if (!label) {
      try {
        label = new URL(url).hostname.replace(/^www\./, "") || "Source";
      } catch {
        label = "Source";
      }
    }
    out.push({ url, label: label || "Source" });
  }
  return out;
}
