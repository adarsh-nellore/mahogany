/**
 * Generates inline SVG data-URI placeholder images for stories.
 *
 * Instead of abstract gradients + random shapes, this produces clean
 * illustrations with a large recognizable icon based on the story's
 * domain, therapeutic area, and section.
 */

// ─── Color palettes keyed by section ─────────────────────────────────

const SECTION_COLORS: Record<string, [string, string]> = {
  "Safety & Recalls":        ["#B8352A", "#E06B5E"],
  "Approvals & Designations":["#1E7A4D", "#4CB87A"],
  "Clinical Trials":         ["#1D5C99", "#5199D6"],
  "Guidance & Policy":       ["#9B7B1E", "#CFAB3A"],
  "EU & International":      ["#5B4B8A", "#8B7AB8"],
  "Standards & Compliance":  ["#4A5568", "#718096"],
  "Industry & Analysis":     ["#2B6CB0", "#63A4E8"],
};
const DEFAULT_COLORS: [string, string] = ["#5A524E", "#8A8580"];

// ─── Domain + TA icon map ────────────────────────────────────────────
// Each is a 24x24 viewBox SVG path that gets scaled up in the final image.

const PHARMA_ICON = `<path d="M10.5 3C8.01 3 6 5.01 6 7.5V12h9V7.5C15 5.01 12.99 3 10.5 3zM6 12v4.5C6 18.99 8.01 21 10.5 21S15 18.99 15 16.5V12H6z" fill="#fff" opacity="0.9"/><line x1="6" y1="12" x2="15" y2="12" stroke="#fff" stroke-width="0.8" opacity="0.5"/>`;

const DEVICE_ICON = `<rect x="7" y="4" width="10" height="16" rx="2" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><circle cx="12" cy="12" r="3" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.8"/><line x1="12" y1="9" x2="12" y2="4" stroke="#fff" stroke-width="1" opacity="0.6"/><line x1="12" y1="15" x2="12" y2="20" stroke="#fff" stroke-width="1" opacity="0.6"/><rect x="9" y="6" width="6" height="1" rx="0.5" fill="#fff" opacity="0.3"/>`;

const TA_ICONS: Record<string, string> = {
  cardiology: `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#fff" opacity="0.9"/>`,
  oncology: `<circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><circle cx="12" cy="12" r="2" fill="#fff" opacity="0.7"/><line x1="12" y1="3" x2="12" y2="7" stroke="#fff" stroke-width="1.2" opacity="0.6"/><line x1="12" y1="17" x2="12" y2="21" stroke="#fff" stroke-width="1.2" opacity="0.6"/><line x1="3" y1="12" x2="7" y2="12" stroke="#fff" stroke-width="1.2" opacity="0.6"/><line x1="17" y1="12" x2="21" y2="12" stroke="#fff" stroke-width="1.2" opacity="0.6"/>`,
  neurology: `<path d="M12 2C9 2 6.5 4 6 7c-.5 3 0 5 2 7s2 4 2 6h4c0-2 0-4 2-6s2.5-4 2-7c-.5-3-3-5-6-5z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><path d="M9 18h6M10 21h4" stroke="#fff" stroke-width="1.2" opacity="0.7"/>`,
  orthopedics: `<path d="M8 2v7l-3 3v2l3-1v5l2 4h4l2-4v-5l3 1v-2l-3-3V2" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9" stroke-linejoin="round"/>`,
  ophthalmology: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><circle cx="12" cy="12" r="3.5" fill="#fff" opacity="0.7"/>`,
  dermatology: `<path d="M12 2a10 10 0 100 20 10 10 0 000-20z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.8"/><path d="M12 2c-3 4-3 8 0 10s3 6 0 10" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>`,
  endocrinology: `<path d="M12 4v4m0 0c-2 0-4 2-4 4v4c0 2 2 4 4 4s4-2 4-4v-4c0-2-2-4-4-4z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><circle cx="12" cy="4" r="2" fill="#fff" opacity="0.6"/>`,
  immunology: `<path d="M12 2L9 9l-7 1 5 4.5L5.5 22 12 18l6.5 4-1.5-7.5L22 10l-7-1z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`,
  gastroenterology: `<path d="M7 8c0-2 2-4 5-4s5 2 5 4c0 3-2 4-3 6s0 4-2 6-3 0-3-2 0-4-1-6S7 11 7 8z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`,
  pulmonology: `<path d="M12 4v8m0 0c-3 0-6 2-7 5s0 5 3 5 4-2 4-4v-6zm0 0c3 0 6 2 7 5s0 5-3 5-4-2-4-4v-6z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`,
  hematology: `<ellipse cx="12" cy="12" rx="6" ry="4" fill="#fff" opacity="0.6" transform="rotate(-20 12 12)"/><ellipse cx="12" cy="12" rx="6" ry="4" fill="none" stroke="#fff" stroke-width="1" opacity="0.4" transform="rotate(20 12 12)"/>`,
  nephrology: `<path d="M8 6c-3 1-4 4-3 7s3 5 5 5c1 0 2-1 2-2s1-2 2-2c2 0 4-2 5-5s0-5-3-7-5 0-5 2-1 3-3 2z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`,
  "infectious disease": `<circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><line x1="12" y1="2" x2="12" y2="7" stroke="#fff" stroke-width="1.2" opacity="0.6"/><line x1="12" y1="17" x2="12" y2="22" stroke="#fff" stroke-width="1.2" opacity="0.6"/><line x1="2" y1="12" x2="7" y2="12" stroke="#fff" stroke-width="1.2" opacity="0.6"/><line x1="17" y1="12" x2="22" y2="12" stroke="#fff" stroke-width="1.2" opacity="0.6"/><line x1="5" y1="5" x2="8.5" y2="8.5" stroke="#fff" stroke-width="1" opacity="0.4"/><line x1="15.5" y1="15.5" x2="19" y2="19" stroke="#fff" stroke-width="1" opacity="0.4"/>`,
  "rare disease": `<path d="M12 2l2.5 7H22l-6 4.5 2.5 7L12 16l-6.5 4.5 2.5-7L2 9h7.5z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`,
  "wound care": `<path d="M4 12h5l1-3 2 6 2-6 1 3h5" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9" stroke-linecap="round" stroke-linejoin="round"/><rect x="3" y="8" width="18" height="8" rx="2" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>`,
  dental: `<path d="M12 2c-2 0-3 1-4 3s-2 5-1 8 2 5 3 7c.5 1 1.5 1 2 0 1-2 2-4 3-7s0-6-1-8-2-3-4-3z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`,
  SaMD: `<rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><path d="M8 9h8M8 12h5M8 15h6" stroke="#fff" stroke-width="1" opacity="0.5" stroke-linecap="round"/><circle cx="16" cy="15" r="2" fill="#fff" opacity="0.6"/>`,
  respiratory: `<path d="M12 4v8m0 0c-3 0-6 2-7 5s0 5 3 5 4-2 4-4v-6zm0 0c3 0 6 2 7 5s0 5-3 5-4-2-4-4v-6z" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`,
  psychiatry: `<circle cx="12" cy="8" r="5" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><path d="M7 18c0-3 2-5 5-5s5 2 5 5" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.7"/><path d="M10 7h4" stroke="#fff" stroke-width="1" opacity="0.5" stroke-linecap="round"/>`,
  pediatrics: `<circle cx="12" cy="7" r="4" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><path d="M8 14c0-2 2-3 4-3s4 1 4 3v4H8v-4z" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.7"/>`,
};

// ─── Section-level icons (fallback when no TA match) ─────────────────

const SECTION_ICONS: Record<string, string> = {
  "Safety & Recalls": `<path d="M12 9v4m0 4h.01M12 2L2 22h20L12 2z" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  "Approvals & Designations": `<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  "Clinical Trials": `<path d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m14 0h2M3 15h2m14 0h2m-9-6v6m-3-3h6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  "Guidance & Policy": `<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  "EU & International": `<circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="1.8" fill="none"/><path d="M3 12h18M12 3a15 15 0 014 9 15 15 0 01-4 9 15 15 0 01-4-9 15 15 0 014-9z" stroke="#fff" stroke-width="1.5" fill="none"/>`,
  "Standards & Compliance": `<path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm4 3h8m-8 4h5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  "Industry & Analysis": `<path d="M3 3v18h18M7 16l4-4 4 4 5-5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};

const GENERIC_ICON = `<circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="1.5" fill="none"/>`;

// ─── Public API ──────────────────────────────────────────────────────

export interface StoryImageHints {
  domains?: string[];
  therapeutic_areas?: string[];
}

export function storyImageSvg(
  section: string,
  seed: string,
  width = 400,
  height = 200,
  hints?: StoryImageHints,
): string {
  const colors = SECTION_COLORS[section] || DEFAULT_COLORS;
  const hash = simpleHash(seed);
  const angle = hash % 360;

  const icon = pickIcon(section, hints);

  const iconScale = 2.8;
  const iconSize = 24 * iconScale;
  const tx = (width - iconSize) / 2;
  const ty = (height - iconSize) / 2;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle} 0.5 0.5)">` +
    `<stop offset="0%" stop-color="${colors[0]}"/>` +
    `<stop offset="100%" stop-color="${colors[1]}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
    `<rect width="${width}" height="${height}" fill="url(#g)" opacity="0.3"/>` +
    `<g transform="translate(${tx},${ty}) scale(${iconScale})">${icon}</g>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ─── Internals ───────────────────────────────────────────────────────

function pickIcon(section: string, hints?: StoryImageHints): string {
  if (hints?.therapeutic_areas?.length) {
    for (const ta of hints.therapeutic_areas) {
      const key = ta.toLowerCase();
      if (TA_ICONS[key]) return TA_ICONS[key];
    }
  }

  if (hints?.domains?.length) {
    if (hints.domains.includes("pharma")) return PHARMA_ICON;
    if (hints.domains.includes("devices")) return DEVICE_ICON;
  }

  if (SECTION_ICONS[section]) return SECTION_ICONS[section];

  return GENERIC_ICON;
}

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
