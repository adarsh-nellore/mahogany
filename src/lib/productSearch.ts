/**
 * Federated product search across local DB + external regulatory APIs.
 *
 * Searches: local entities table, openFDA drugs, openFDA 510(k), openFDA PMA,
 * and Health Canada drug products.
 */

import { query } from "./db";

export interface ProductSearchResult {
  entity_id?: string;
  name: string;
  generic_name?: string;
  company?: string;
  product_type: "drug" | "biologic" | "device" | "combination";
  domain: "pharma" | "devices";
  region: string;
  regulatory_id?: string;
  product_code?: string;
  advisory_committee?: string;
  device_class?: string;
  source: "openfda_drug" | "openfda_510k" | "openfda_pma" | "health_canada" | "local";
  /** True for the exact regulatory ID match; related devices from landscape expansion are false/undefined */
  is_primary?: boolean;
}

const SEARCH_TIMEOUT = 5000;

function normalizeForDedup(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function detectRegulatoryId(q: string): { type: "510k" | "pma" | "drug_app"; value: string } | null {
  const t = q.trim().toUpperCase();
  if (/^K\d{6}$/.test(t)) return { type: "510k", value: t };
  if (/^P\d{6}$/.test(t)) return { type: "pma", value: t };
  if (/^(NDA|ANDA|BLA)\d{5,6}$/.test(t)) return { type: "drug_app", value: t };
  return null;
}

async function searchLocal(q: string): Promise<ProductSearchResult[]> {
  try {
    const rows = await query<{
      id: string;
      canonical_name: string;
      normalized_name: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT id, canonical_name, normalized_name, metadata_json
       FROM entities
       WHERE entity_type = 'product'
         AND (canonical_name ILIKE $1 OR normalized_name ILIKE $1 OR metadata_json->>'regulatory_id' ILIKE $1)
       LIMIT 10`,
      [`%${q}%`]
    );
    return rows.map((r) => ({
      entity_id: r.id,
      name: r.canonical_name,
      generic_name: (r.metadata_json?.generic_name as string) || undefined,
      company: (r.metadata_json?.company as string) || undefined,
      product_type: ((r.metadata_json?.product_type as string) || "drug") as ProductSearchResult["product_type"],
      domain: ((r.metadata_json?.domain as string) || "pharma") as ProductSearchResult["domain"],
      region: (r.metadata_json?.region as string) || "US",
      regulatory_id: (r.metadata_json?.regulatory_id as string) || undefined,
      source: "local" as const,
    }));
  } catch {
    return [];
  }
}

async function searchOpenFDADrugs(q: string): Promise<ProductSearchResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
    const encoded = encodeURIComponent(q);
    const res = await fetch(
      `https://api.fda.gov/drug/drugsfda.json?search=(openfda.brand_name:"${encoded}"+openfda.generic_name:"${encoded}")&limit=10`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    const results: ProductSearchResult[] = [];
    const seen = new Set<string>();
    for (const r of data.results || []) {
      const brandNames: string[] = r.openfda?.brand_name || [];
      const genericNames: string[] = r.openfda?.generic_name || [];
      const manufacturer: string[] = r.openfda?.manufacturer_name || [];
      const appNumber: string = r.application_number || "";
      const productType = r.openfda?.product_type?.[0]?.toLowerCase()?.includes("biologic") ? "biologic" : "drug";
      for (const brand of brandNames) {
        const key = normalizeForDedup(brand);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          name: brand,
          generic_name: genericNames[0] || undefined,
          company: manufacturer[0] || undefined,
          product_type: productType as "drug" | "biologic",
          domain: "pharma",
          region: "US",
          regulatory_id: appNumber || undefined,
          source: "openfda_drug",
        });
      }
    }
    return results.slice(0, 10);
  } catch {
    return [];
  }
}

async function searchOpenFDA510k(q: string): Promise<ProductSearchResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
    const encoded = encodeURIComponent(q);
    const regId = detectRegulatoryId(q);
    const searchField = regId?.type === "510k" ? `k_number:"${encoded}"` : `device_name:"${encoded}"`;
    const res = await fetch(
      `https://api.fda.gov/device/510k.json?search=${searchField}&limit=10`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    const results: ProductSearchResult[] = [];
    const seen = new Set<string>();
    for (const r of data.results || []) {
      const name = r.device_name || "";
      const key = normalizeForDedup(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      results.push({
        name,
        company: r.applicant || undefined,
        product_type: "device",
        domain: "devices",
        region: "US",
        regulatory_id: r.k_number || undefined,
        product_code: r.product_code || undefined,
        advisory_committee: r.advisory_committee_description || undefined,
        device_class: r.openfda?.device_class || undefined,
        source: "openfda_510k",
      });
    }
    return results.slice(0, 10);
  } catch {
    return [];
  }
}

async function searchOpenFDAPMA(q: string): Promise<ProductSearchResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
    const encoded = encodeURIComponent(q);
    const regId = detectRegulatoryId(q);
    const searchField = regId?.type === "pma" ? `pma_number:"${encoded}"` : `trade_name:"${encoded}"`;
    const res = await fetch(
      `https://api.fda.gov/device/pma.json?search=${searchField}&limit=10`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    const results: ProductSearchResult[] = [];
    const seen = new Set<string>();
    for (const r of data.results || []) {
      const name = r.trade_name || "";
      const key = normalizeForDedup(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      results.push({
        name,
        company: r.applicant || undefined,
        product_type: "device",
        domain: "devices",
        region: "US",
        regulatory_id: r.pma_number || undefined,
        product_code: r.product_code || undefined,
        advisory_committee: r.advisory_committee_description || undefined,
        source: "openfda_pma",
      });
    }
    return results.slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * When a regulatory ID returns a single exact hit, fan out using the
 * product metadata to find related devices in the same product class.
 * This builds the "landscape" around the user's product.
 */
async function expandDeviceLandscape(
  primary: ProductSearchResult,
  apiType: "510k" | "pma",
  limit: number = 10
): Promise<ProductSearchResult[]> {
  if (!primary.product_code) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

    const endpoint = apiType === "510k" ? "510k" : "pma";
    const nameField = apiType === "510k" ? "device_name" : "trade_name";
    const numberField = apiType === "510k" ? "k_number" : "pma_number";
    const encoded = encodeURIComponent(primary.product_code);

    const res = await fetch(
      `https://api.fda.gov/device/${endpoint}.json?search=product_code:"${encoded}"&limit=${limit}&sort=decision_date:desc`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();

    const results: ProductSearchResult[] = [];
    const seen = new Set<string>();
    // Skip the primary device itself
    if (primary.regulatory_id) seen.add(primary.regulatory_id);

    for (const r of data.results || []) {
      const name = r[nameField] || "";
      const regId = r[numberField] || "";
      if (!name || seen.has(regId)) continue;
      seen.add(regId);
      results.push({
        name,
        company: r.applicant || undefined,
        product_type: "device",
        domain: "devices",
        region: "US",
        regulatory_id: regId || undefined,
        product_code: r.product_code || undefined,
        advisory_committee: r.advisory_committee_description || undefined,
        source: apiType === "510k" ? "openfda_510k" : "openfda_pma",
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Extract landscape search terms from a primary product result.
 * These are used downstream by fetchProductSignals to broaden signal matching.
 */
export function extractProductKeywords(product: ProductSearchResult): string[] {
  const keywords: string[] = [];

  // Extract meaningful terms from device name (skip generic words)
  const stopWords = new Set(["and", "the", "for", "with", "from", "device", "system", "model", "type", "kit"]);
  if (product.name) {
    const words = product.name
      .replace(/[^a-zA-Z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
    // Take multi-word phrases that describe the device category
    if (words.length >= 2) {
      keywords.push(words.slice(0, 4).join(" "));
    }
  }

  if (product.advisory_committee) {
    keywords.push(product.advisory_committee);
  }

  if (product.product_code) {
    keywords.push(product.product_code);
  }

  return keywords.filter(Boolean);
}

/**
 * Federated search across local + external APIs.
 * domain: "pharma" | "devices" | "both"
 */
export async function searchProducts(
  q: string,
  domain: "pharma" | "devices" | "both" = "both"
): Promise<ProductSearchResult[]> {
  if (!q || q.trim().length < 2) return [];

  const regId = detectRegulatoryId(q);
  const searches: Promise<ProductSearchResult[]>[] = [searchLocal(q)];

  if (regId) {
    // Route to the specific API for the detected regulatory ID type
    if (regId.type === "510k") {
      searches.push(searchOpenFDA510k(q));
    } else if (regId.type === "pma") {
      searches.push(searchOpenFDAPMA(q));
    } else if (regId.type === "drug_app") {
      searches.push(searchOpenFDADrugs(q));
    }
  } else {
    if (domain === "pharma" || domain === "both") {
      searches.push(searchOpenFDADrugs(q));
    }
    if (domain === "devices" || domain === "both") {
      searches.push(searchOpenFDA510k(q));
      searches.push(searchOpenFDAPMA(q));
    }
  }

  const settled = await Promise.allSettled(searches);
  const all: ProductSearchResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }

  // Deduplicate by normalized name
  const seen = new Set<string>();
  const deduped: ProductSearchResult[] = [];
  for (const item of all) {
    const key = normalizeForDedup(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  // Landscape expansion: when a regulatory ID returns results,
  // find the best candidate with device metadata and fan out by product class
  if (regId && deduped.length > 0) {
    // Find the result with the richest metadata (product_code) for expansion
    const primary = deduped.find(d => d.product_code) || deduped[0];
    primary.is_primary = true;

    if (primary.product_code && (regId.type === "510k" || regId.type === "pma")) {
      const related = await expandDeviceLandscape(primary, regId.type, 10);
      for (const item of related) {
        const key = normalizeForDedup(item.name);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
    }
  }

  return deduped.slice(0, 20);
}
