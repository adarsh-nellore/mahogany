/**
 * Curated Unsplash hero images for the regulatory intelligence platform.
 * Uses stable Unsplash photo URLs that resolve to real photographs.
 */

export interface HeroImage {
  url: string;
  alt: string;
  category: string;
}

const HERO_IMAGES: HeroImage[] = [
  {
    url: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Laboratory research with glassware and blue lighting",
    category: "laboratory",
  },
  {
    url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Microscope lens in a research laboratory",
    category: "microscopy",
  },
  {
    url: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Medical devices and diagnostic equipment",
    category: "medical-devices",
  },
  {
    url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Pharmaceutical pills and capsules in production",
    category: "pharmaceutical",
  },
  {
    url: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Scientist performing laboratory work with pipette",
    category: "lab-work",
  },
  {
    url: "https://images.unsplash.com/photo-1581093458791-9f3c3900df4b?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Abstract data visualization and scientific analysis",
    category: "data-analytics",
  },
  {
    url: "https://images.unsplash.com/photo-1631549916768-4e9be593fe55?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Molecular biology and biotech research",
    category: "biotech",
  },
  {
    url: "https://images.unsplash.com/photo-1585435557343-3b092031a831?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Healthcare professional in clinical setting",
    category: "healthcare",
  },
  {
    url: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Regulatory documents and compliance paperwork",
    category: "compliance",
  },
  {
    url: "https://images.unsplash.com/photo-1504813184591-01572f98c85f?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Hospital surgery room with medical equipment",
    category: "surgery",
  },
  {
    url: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "DNA double helix and genomics research",
    category: "genomics",
  },
  {
    url: "https://images.unsplash.com/photo-1563213126-a4273aed2016?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Pharmaceutical manufacturing production line",
    category: "manufacturing",
  },
  {
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Data dashboard and analytics screen",
    category: "ai-analytics",
  },
  {
    url: "https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Global shipping containers and trade logistics",
    category: "supply-chain",
  },
  {
    url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Modern government building exterior",
    category: "regulatory",
  },
  {
    url: "https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Clinical trial patient consultation",
    category: "clinical-trials",
  },
  {
    url: "https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Vaccine vials and immunization research",
    category: "vaccines",
  },
  {
    url: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Business meeting in modern conference room",
    category: "corporate",
  },
  {
    url: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Scientific research with test tubes and chemical analysis",
    category: "chemistry",
  },
  {
    url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&h=400&fit=crop&auto=format&q=80",
    alt: "Modern hospital corridor and medical facility",
    category: "hospital",
  },
];

export default HERO_IMAGES;

/**
 * Landing page hero — the lab research image works well as a
 * wide banner on dark backgrounds with its cool blue tones.
 */
export const LANDING_HERO_IMAGE =
  "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1920&h=600&fit=crop&auto=format&q=80";

/**
 * Deterministically pick a hero image from a string seed.
 * Uses a simple djb2 hash so the same seed always returns
 * the same image (useful for consistent per-card imagery).
 */
export function getHeroImage(seed: string): HeroImage {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % HERO_IMAGES.length;
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
