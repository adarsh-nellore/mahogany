// ─── Enums & Literal Types ───────────────────────────────────────────

export type Region = "US" | "EU" | "UK" | "Canada" | "Australia" | "Japan" | "Switzerland" | "Global";

export type Domain = "devices" | "pharma";

export type ImpactType =
  | "guidance_draft"
  | "guidance_final"
  | "safety_alert"
  | "recall"
  | "approval"
  | "designation"
  | "trial_update"
  | "meeting_minutes"
  | "consultation"
  | "legislation"
  | "enforcement"
  | "advisory_committee"
  | "workshop"
  | "press_release"
  | "podcast"
  | "standard_update"
  | "analysis"
  | "other";

export type ImpactSeverity = "high" | "medium" | "low";

export type LifecycleStage =
  | "pre_submission"
  | "submission"
  | "review"
  | "approval"
  | "post_market"
  | "withdrawal"
  | "other";

export type DigestCadence = "daily" | "twice_weekly" | "weekly";

export type FetcherAccessMethod = "rest_api" | "rss" | "atom" | "firecrawl";
export type EntityType =
  | "product"
  | "company"
  | "regulator"
  | "submission"
  | "standard"
  | "therapeutic_area"
  | "framework";
export type IntakeMentionType =
  | "product_name"
  | "product_code"
  | "company"
  | "ta"
  | "framework";
export type ProfileFocusType = "product" | "ta" | "framework" | "broad";
export type ProfileFocusSource = "explicit" | "inferred" | "behavioral";
export type WatchType = "exact" | "competitor" | "adjacent";
export type MatchReasonCode =
  | "exact_code_match"
  | "same_product_family"
  | "competitor_equivalent"
  | "same_ta_regulatory_pathway";

// ─── Core Data Models ────────────────────────────────────────────────

export interface RawEvent {
  id: string;
  source_id: string;
  fetched_at: string;
  url: string;
  title: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export interface SignalDraft {
  source_id: string;
  url: string;
  title: string;
  summary: string;
  published_at: string;
  authority: string;
  document_id: string | null;
  raw_payload: Record<string, unknown>;
  region_hint: Region | null;
  domain_hint: Domain | null;
}

export interface Signal {
  id: string;
  raw_event_id: string;
  source_id: string;
  url: string;
  title: string;
  summary: string;
  published_at: string;
  authority: string;
  document_id: string | null;
  region: Region;
  domains: Domain[];
  therapeutic_areas: string[];
  product_types: string[];
  product_classes: string[];
  lifecycle_stage: LifecycleStage;
  impact_type: ImpactType;
  impact_severity: ImpactSeverity;
  ai_analysis: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  regions: Region[];
  domains: Domain[];
  therapeutic_areas: string[];
  product_types: string[];
  tracked_products: string[];
  role: string;
  organization: string;
  active_submissions: string[];
  competitors: string[];
  regulatory_frameworks: string[];
  analysis_preferences: string;
  digest_cadence: DigestCadence;
  digest_send_hour: number;
  timezone?: string;
  last_digest_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedStory {
  id: string;
  profile_id: string | null;
  headline: string;
  summary: string;
  body: string;
  section: string;
  severity: ImpactSeverity;
  domains: Domain[];
  regions: Region[];
  therapeutic_areas: string[];
  impact_types: ImpactType[];
  signal_ids: string[];
  source_urls: string[];
  source_labels: string[];
  is_global: boolean;
  published_at: string;
  relevance_reason?: string | null;
  created_at: string;
}

export interface IntakeSession {
  id: string;
  profile_id: string | null;
  raw_text: string;
  parsed_json: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface IntakeMention {
  id: string;
  session_id: string;
  mention_text: string;
  mention_type: IntakeMentionType;
  confidence: number;
  start_pos: number | null;
  end_pos: number | null;
  created_at: string;
}

export interface Entity {
  id: string;
  entity_type: EntityType;
  canonical_name: string;
  normalized_name: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EntityAlias {
  id: string;
  entity_id: string;
  alias_text: string;
  alias_type: string;
  normalized_alias: string;
  source: string;
  created_at: string;
}

export interface ProfileFocus {
  profile_id: string;
  focus_type: ProfileFocusType;
  weight: number;
  derived_from: ProfileFocusSource;
  created_at: string;
  updated_at: string;
}

export interface ProfileWatchItem {
  id: string;
  profile_id: string;
  entity_id: string;
  watch_type: WatchType;
  priority: number;
  created_at: string;
}

export interface ProfileQueryPolicy {
  profile_id: string;
  retrieval_policy_json: Record<string, unknown>;
  updated_at: string;
}

export interface SearchEvidenceBundle {
  signal_id: string;
  title: string;
  summary: string;
  url: string;
  authority: string;
  published_at: string;
  reason_codes: MatchReasonCode[];
  matched_entities: string[];
}

// ─── API Request/Response Shapes ─────────────────────────────────────

export interface ProfileCreateRequest {
  email: string;
  name: string;
  regions: Region[];
  domains: Domain[];
  therapeutic_areas: string[];
  product_types: string[];
  tracked_products: string[];
  role: string;
  organization: string;
  active_submissions: string[];
  competitors: string[];
  regulatory_frameworks: string[];
  analysis_preferences: string;
  digest_cadence: DigestCadence;
  digest_send_hour: number;
  timezone?: string;
  intake_text?: string;
  intake_session_id?: string;
}

export interface IntakeParseRequest {
  text: string;
  profile_id?: string;
}

export interface IntakeConfirmRequest {
  session_id: string;
  profile_id?: string;
  watch_items?: Array<{ mention_text: string; watch_type?: WatchType; priority?: number }>;
}

export interface SignalsQueryParams {
  region?: Region;
  domain?: Domain;
  severity?: ImpactSeverity;
  authority?: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  per_page?: number;
}

export interface IngestionSummary {
  total_raw_events: number;
  total_signals: number;
  by_source: Record<string, number>;
  errors: string[];
}

export interface DigestSendSummary {
  total_sent: number;
  profiles: { id: string; email: string; signal_count: number }[];
  errors: string[];
}

// ─── Product Search ─────────────────────────────────────────────────

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
  is_primary?: boolean;
}

// ─── Fetcher Config ──────────────────────────────────────────────────

export interface FetcherConfig {
  id: string;
  name: string;
  region: Region;
  domain: Domain | "both";
  access_method: FetcherAccessMethod;
  url: string;
}
