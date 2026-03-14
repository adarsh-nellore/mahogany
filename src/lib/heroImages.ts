/**
 * Curated illustration library for the regulatory intelligence platform.
 * Cartoon-style SVGs mapped to content categories; no external image dependencies.
 * Uses section/content mapping for relevant imagery and id+headline hash for uniqueness.
 */

export interface HeroImage {
  url: string;
  alt: string;
  category: string;
}

/** Story-like input for image selection. At minimum: section and a unique seed (id or headline). */
export interface StoryImageContext {
  id?: string;
  headline: string;
  section: string;
  summary?: string;
  domains?: string[];
  therapeutic_areas?: string[];
}

/** Base path for illustration assets (SVG, cartoon-style). */
const ILLUSTRATION_BASE = "/illustrations";
/** Cache-bust when changing illustrations. Bump to invalidate cached images. */
const ILLUSTRATION_VERSION = "2";

const img = (path: string) => `${ILLUSTRATION_BASE}/${path}?v=${ILLUSTRATION_VERSION}`;

const HERO_IMAGES: HeroImage[] = [
  { url: img("laboratory.svg"), alt: "Laboratory research with glassware", category: "laboratory" },
  { url: img("microscopy.svg"), alt: "Microscope lens in a research laboratory", category: "microscopy" },
  { url: img("medical-devices.svg"), alt: "Medical devices and diagnostic equipment", category: "medical-devices" },
  { url: img("pharmaceutical.svg"), alt: "Pharmaceutical pills and production", category: "pharmaceutical" },
  { url: img("lab-work.svg"), alt: "Scientist performing laboratory work", category: "lab-work" },
  { url: img("data-analytics.svg"), alt: "Data visualization and analytics", category: "data-analytics" },
  { url: img("biotech.svg"), alt: "Molecular biology and biotech research", category: "biotech" },
  { url: img("healthcare.svg"), alt: "Healthcare professional in clinical setting", category: "healthcare" },
  { url: img("compliance.svg"), alt: "Regulatory documents and compliance", category: "compliance" },
  { url: img("surgery.svg"), alt: "Hospital surgery and medical equipment", category: "surgery" },
  { url: img("genomics.svg"), alt: "DNA and genomics research", category: "genomics" },
  { url: img("manufacturing.svg"), alt: "Pharmaceutical manufacturing", category: "manufacturing" },
  { url: img("ai-analytics.svg"), alt: "AI and analytics dashboard", category: "ai-analytics" },
  { url: img("supply-chain.svg"), alt: "Supply chain and logistics", category: "supply-chain" },
  { url: img("regulatory.svg"), alt: "Regulatory and policy", category: "regulatory" },
  { url: img("clinical-trials.svg"), alt: "Clinical trial research", category: "clinical-trials" },
  { url: img("vaccines.svg"), alt: "Vaccine and immunization research", category: "vaccines" },
  { url: img("corporate.svg"), alt: "Business and corporate", category: "corporate" },
  { url: img("chemistry.svg"), alt: "Chemical analysis and research", category: "chemistry" },
  { url: img("hospital.svg"), alt: "Hospital and medical facility", category: "hospital" },
  { url: img("medical-devices.svg"), alt: "Medical equipment and quality control", category: "medical-devices" },
  { url: img("data-analytics.svg"), alt: "Analytics and business intelligence", category: "data-analytics" },
  { url: img("corporate.svg"), alt: "Professional collaboration", category: "corporate" },
  { url: img("laboratory.svg"), alt: "Research and development lab", category: "laboratory" },
  { url: img("clinical-trials.svg"), alt: "Clinical research and medical science", category: "clinical-trials" },
  { url: img("compliance.svg"), alt: "Business documents and analysis", category: "compliance" },
];

export default HERO_IMAGES;

/**
 * Section → image categories. Maps content sections to semantically relevant imagery
 * to reduce unrelated or ridiculous image choices.
 */
const SECTION_CATEGORIES: Record<string, string[]> = {
  "Safety & Recalls": ["medical-devices", "compliance", "laboratory", "healthcare"],
  "Approvals & Designations": ["pharmaceutical", "regulatory", "manufacturing"],
  "Clinical Trials": ["clinical-trials", "hospital", "healthcare", "genomics"],
  "Guidance & Policy": ["compliance", "regulatory", "data-analytics"],
  "EU & International": ["regulatory", "supply-chain", "corporate"],
  "Standards & Compliance": ["compliance", "data-analytics", "ai-analytics"],
  "Industry & Analysis": ["corporate", "ai-analytics", "data-analytics", "manufacturing"],
  "Regulatory Updates": ["regulatory", "compliance", "pharmaceutical"],
};

const CATEGORY_TO_INDICES: Map<string, number[]> = (() => {
  const m = new Map<string, number[]>();
  HERO_IMAGES.forEach((img, i) => {
    const list = m.get(img.category) ?? [];
    list.push(i);
    m.set(img.category, list);
  });
  return m;
})();

function djb2Hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick a hero image for a story. Uses section to narrow to relevant categories,
 * then id+headline hash for unique, deterministic selection within that pool.
 * Reduces repeated and unrelated images.
 */
export function getHeroImageForStory(story: StoryImageContext): HeroImage {
  const section = (story.section || "Regulatory Updates").trim();
  const categories =
    SECTION_CATEGORIES[section] ??
    SECTION_CATEGORIES["Regulatory Updates"] ??
    ["regulatory", "compliance"];

  // Build pool: all images whose category matches any of the section's categories
  const poolIndices = new Set<number>();
  for (const cat of categories) {
    const indices = CATEGORY_TO_INDICES.get(cat);
    if (indices) indices.forEach((i) => poolIndices.add(i));
  }

  let indices = [...poolIndices];
  if (indices.length === 0) indices = [0];

  const seed = `${story.id ?? ""}|${story.headline}`.trim() || story.headline;
  const hash = djb2Hash(seed);
  const index = indices[hash % indices.length];
  return HERO_IMAGES[index];
}

/**
 * Convenience: URL only for story context.
 */
export function getHeroImageUrlForStory(story: StoryImageContext): string {
  return getHeroImageForStory(story).url;
}

/**
 * Landing page hero — regulatory illustration for the platform banner.
 */
export const LANDING_HERO_IMAGE = img("regulatory.svg");

/**
 * Deterministically pick a hero image from a string seed.
 * @deprecated Prefer getHeroImageForStory for feed/story imagery.
 */
export function getHeroImage(seed: string): HeroImage {
  const index = djb2Hash(seed) % HERO_IMAGES.length;
  return HERO_IMAGES[index];
}

/**
 * Convenience: returns just the URL string for a given seed.
 */
export function getHeroImageUrl(seed: string): string {
  return getHeroImage(seed).url;
}

/**
 * Get a hero image by category name.
 * Falls back to the first image if the category is not found.
 */
export function getHeroImageByCategory(category: string): HeroImage {
  return (
    HERO_IMAGES.find((img) => img.category === category) ?? HERO_IMAGES[0]
  );
}
