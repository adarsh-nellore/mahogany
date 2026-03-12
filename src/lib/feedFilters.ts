/**
 * Shared filter options for feed, profile, and onboarding.
 * Used as chip options: user selections override profile when fetching.
 */

export const REGION_OPTIONS = [
  { id: "US", label: "United States" },
  { id: "EU", label: "European Union" },
  { id: "UK", label: "United Kingdom" },
  { id: "Canada", label: "Canada" },
  { id: "Australia", label: "Australia" },
  { id: "Japan", label: "Japan" },
  { id: "Switzerland", label: "Switzerland" },
  { id: "Global", label: "Global / ICH" },
] as const;

export const REGION_IDS = REGION_OPTIONS.map((r) => r.id);

/** Regulatory pathways / product codes — filter by submission type mentioned in content */
export const PRODUCT_CODE_OPTIONS = [
  "510(k)",
  "PMA",
  "De Novo",
  "HDE",
  "NDA",
  "BLA",
  "ANDA",
  "IND",
  "MDR",
  "IVDR",
  "CE Marking",
  "Breakthrough",
  "Orphan",
] as const;

export type ProductCode = (typeof PRODUCT_CODE_OPTIONS)[number];
