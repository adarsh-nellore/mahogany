/**
 * Auto-generates NamedFetcher[] from the REGISTRY for non-custom sources.
 *
 * - tier "rss"       → calls fetchRSS()
 * - tier "firecrawl" → calls fetchPageSignals()
 * - tier "api" with customFetcher → skipped (handled in index.ts)
 */

import type { SignalDraft } from "../types";
import { DISABLE_US_SOURCES } from "../experimentFlags";
import { REGISTRY } from "./sourceRegistry";
import { fetchRSS, fetchPageSignals } from "./helpers";

interface NamedFetcher {
  name: string;
  fn: () => Promise<SignalDraft[]>;
}

/** Generate NamedFetcher[] for all RSS-tier registry entries (no custom files). */
export function registryRSSFetchers(): NamedFetcher[] {
  return REGISTRY
    .filter((s) => s.tier === "rss" && !s.customFetcher && (!DISABLE_US_SOURCES || s.region_hint !== "US"))
    .map((s) => ({
      name: s.source_id,
      fn: () =>
        fetchRSS({
          source_id: s.source_id,
          url: s.url,
          authority: s.authority,
          region_hint: s.region_hint,
          domain_hint: s.domain_hint,
          maxAgeHours: s.maxAgeHours,
        }),
    }));
}

/** Generate NamedFetcher[] for all Firecrawl-tier registry entries (no custom files). */
export function registryFirecrawlFetchers(): NamedFetcher[] {
  return REGISTRY
    .filter((s) => s.tier === "firecrawl" && !s.customFetcher && (!DISABLE_US_SOURCES || s.region_hint !== "US"))
    .map((s) => ({
      name: s.source_id,
      fn: () =>
        fetchPageSignals(s.url, s.source_id, {
          authority: s.authority,
          region_hint: s.region_hint,
          domain_hint: s.domain_hint,
          maxItems: s.maxItems,
          extractPrompt: s.extractPrompt,
        }),
    }));
}
