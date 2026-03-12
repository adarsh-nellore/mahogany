/**
 * Canonical list of therapeutic areas.
 * Used in onboarding, feed filters, and classifier/API.
 */

export const THERAPEUTIC_AREAS = [
  "Cardiology",
  "Dental",
  "Dermatology",
  "Endocrinology",
  "Gastroenterology",
  "Hematology",
  "Immunology",
  "Infectious Disease",
  "Mental Health",
  "Nephrology",
  "Neurology",
  "Oncology",
  "Ophthalmology",
  "Orthopedics",
  "Pediatrics",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Rare Disease",
  "Respiratory",
  "SaMD",
  "Sleep",
  "Urology",
  "Women's Health",
  "Wound Care",
] as const;

export type TherapeuticArea = (typeof THERAPEUTIC_AREAS)[number];
