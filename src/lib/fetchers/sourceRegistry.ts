/**
 * Data-driven source registry.
 *
 * Adding a new source = 1 line of config in the REGISTRY array.
 * Sources with `customFetcher: true` have dedicated .ts files with custom logic.
 * All others are auto-wired by registryFetcher.ts via fetchRSS / fetchPageSignals.
 */

import type { Region, Domain } from "../types";

// ─── SourceDef ───────────────────────────────────────────────────────────────

export interface SourceDef {
  source_id: string;
  /** Human-readable label (health dashboard, UI) */
  label: string;
  /** Fetch target: RSS URL or scrape page URL */
  url: string;
  /** Health-check URL (defaults to url) */
  check_url?: string;
  authority: string;
  region_hint: Region | null;
  domain_hint: Domain | null;
  /** "rss" = RSS/Atom feed, "api" = custom REST, "firecrawl" = page scrape */
  tier: "rss" | "api" | "firecrawl";
  /** 1=critical, 2=important, 3=supplementary */
  priority: 1 | 2 | 3;
  /** true = has a dedicated .ts file with custom fetch logic */
  customFetcher?: boolean;
  /** RSS: max age in hours for filtering items. Defaults to 168 (7 days). */
  maxAgeHours?: number;
  /** Firecrawl: max items to extract. Defaults to 30. */
  maxItems?: number;
  /** Firecrawl: custom AI extraction prompt. */
  extractPrompt?: string;
  /** false = skip fetching (chronically broken). Default true. */
  enabled?: boolean;
}

// ─── REGISTRY ────────────────────────────────────────────────────────────────

export const REGISTRY: SourceDef[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // API TIER — custom fetchers (all have dedicated .ts files)
  // ══════════════════════════════════════════════════════════════════════════

  // openFDA APIs
  { source_id: "us_openfda_device_recall",    label: "openFDA Device Recalls",          url: "https://api.fda.gov/device/recall.json",          check_url: "https://api.fda.gov/device/recall.json?limit=1",          authority: "FDA / openFDA", region_hint: "US", domain_hint: "devices",  tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_openfda_drug_enforcement", label: "openFDA Drug Enforcement",        url: "https://api.fda.gov/drug/enforcement.json",        check_url: "https://api.fda.gov/drug/enforcement.json?limit=1",        authority: "FDA / openFDA", region_hint: "US", domain_hint: "pharma",   tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_openfda_drugsfda",         label: "openFDA Drugs@FDA",               url: "https://api.fda.gov/drug/drugsfda.json",           check_url: "https://api.fda.gov/drug/drugsfda.json?limit=1",           authority: "FDA / openFDA", region_hint: "US", domain_hint: "pharma",   tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_openfda_510k",             label: "openFDA 510(k)",                  url: "https://api.fda.gov/device/510k.json",             check_url: "https://api.fda.gov/device/510k.json?limit=1",             authority: "FDA / openFDA", region_hint: "US", domain_hint: "devices",  tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_openfda_pma",              label: "openFDA PMA",                     url: "https://api.fda.gov/device/pma.json",              check_url: "https://api.fda.gov/device/pma.json?limit=1",              authority: "FDA / openFDA", region_hint: "US", domain_hint: "devices",  tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_openfda_maude",            label: "openFDA MAUDE",                   url: "https://api.fda.gov/device/event.json",            check_url: "https://api.fda.gov/device/event.json?limit=1",            authority: "FDA / openFDA", region_hint: "US", domain_hint: "devices",  tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_openfda_classification",   label: "openFDA Device Classification",   url: "https://api.fda.gov/device/classification.json",   check_url: "https://api.fda.gov/device/classification.json?limit=1",   authority: "FDA / openFDA", region_hint: "US", domain_hint: "devices",  tier: "api", priority: 2, customFetcher: true },
  // New openFDA APIs
  { source_id: "us_openfda_drug_events",      label: "openFDA Drug Adverse Events",     url: "https://api.fda.gov/drug/event.json",              check_url: "https://api.fda.gov/drug/event.json?limit=1",              authority: "FDA / openFDA", region_hint: "US", domain_hint: "pharma",   tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_openfda_drug_labels",      label: "openFDA Drug Labels",             url: "https://api.fda.gov/drug/label.json",              check_url: "https://api.fda.gov/drug/label.json?limit=1",              authority: "FDA / openFDA", region_hint: "US", domain_hint: "pharma",   tier: "api", priority: 2, customFetcher: true },
  { source_id: "us_openfda_drug_submissions", label: "openFDA Drug Submissions/CRLs",   url: "https://api.fda.gov/drug/drugsfda.json",           check_url: "https://api.fda.gov/drug/drugsfda.json?limit=1",           authority: "FDA / openFDA", region_hint: "US", domain_hint: "pharma",   tier: "api", priority: 1, customFetcher: true },

  // Other custom API fetchers
  { source_id: "us_fda_orange_book",          label: "FDA Orange Book (API)",            url: "https://api.fda.gov/drug/drugsfda.json",           check_url: "https://api.fda.gov/drug/drugsfda.json?limit=1",           authority: "FDA / openFDA", region_hint: "US", domain_hint: "pharma",   tier: "api", priority: 2, customFetcher: true },
  { source_id: "us_fda_ndc",                  label: "FDA NDC Directory (API)",          url: "https://api.fda.gov/drug/ndc.json",                check_url: "https://api.fda.gov/drug/ndc.json?limit=1",                authority: "FDA / openFDA", region_hint: "US", domain_hint: "pharma",   tier: "api", priority: 2, customFetcher: true },
  { source_id: "us_federal_register",         label: "Federal Register API",             url: "https://www.federalregister.gov/api/v1/articles.json", check_url: "https://www.federalregister.gov/api/v1/articles.json?per_page=1", authority: "Federal Register", region_hint: "US", domain_hint: null, tier: "api", priority: 1, customFetcher: true },
  { source_id: "clinicaltrials",              label: "ClinicalTrials.gov API",           url: "https://clinicaltrials.gov/api/v2/studies",        check_url: "https://clinicaltrials.gov/api/v2/studies?pageSize=1&format=json", authority: "ClinicalTrials.gov", region_hint: "US", domain_hint: "pharma", tier: "api", priority: 1, customFetcher: true },
  { source_id: "us_congress_gov",             label: "Congress.gov Bills API",           url: "https://api.congress.gov/v3/bill",                 check_url: "https://api.congress.gov/v3/bill?limit=1",                 authority: "Congress.gov", region_hint: "US", domain_hint: null,        tier: "api", priority: 2, customFetcher: true },
  { source_id: "ca_hc_drug_product",          label: "Health Canada Drug Product API",   url: "https://health-products.canada.ca/api/drug/drugproduct/", check_url: "https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json&status=1", authority: "Health Canada", region_hint: "Canada", domain_hint: "pharma", tier: "api", priority: 2, customFetcher: true },

  // ══════════════════════════════════════════════════════════════════════════
  // RSS TIER — auto-wired by registryFetcher.ts (no dedicated files needed)
  // ══════════════════════════════════════════════════════════════════════════

  // ── US FDA RSS ──────────────────────────────────────────────────────────
  { source_id: "us_fda_press_rss",            label: "FDA Press Releases RSS",           url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml",       authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 1 },
  { source_id: "us_fda_medwatch_rss",         label: "FDA MedWatch RSS",                 url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml",              authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 1 },
  { source_id: "us_fda_device_safety_rss",    label: "FDA MedWatch Safety Alerts RSS",   url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml",            authority: "FDA",          region_hint: "US", domain_hint: "devices",  tier: "rss", priority: 1 },
  { source_id: "us_fda_recalls_rss",          label: "FDA Recalls RSS",                  url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml",               authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 1 },
  { source_id: "us_fda_cder_rss",             label: "FDA CDER (Drugs) RSS",             url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/drugs/rss.xml",                 authority: "FDA CDER",     region_hint: "US", domain_hint: "pharma",   tier: "rss", priority: 1 },
  { source_id: "us_fda_cber_rss",             label: "FDA CBER (Biologics) RSS",         url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/biologics/rss.xml",             authority: "FDA CBER",     region_hint: "US", domain_hint: "pharma",   tier: "rss", priority: 1 },
  { source_id: "us_fda_warning_letters_rss",  label: "FDA Consumer Updates RSS",         url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/consumers/rss.xml",             authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 1 },
  { source_id: "us_fda_guidance_doc_rss",     label: "FDA Health Fraud RSS",             url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/health-fraud/rss.xml",          authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 2 },
  { source_id: "us_fda_ora_foia_rss",         label: "FDA ORA/FOIA RSS",                 url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/ora-foia-electronic-reading-room/rss.xml", authority: "FDA ORA", region_hint: "US", domain_hint: null, tier: "rss", priority: 2 },
  { source_id: "us_fda_outbreaks_rss",        label: "FDA Outbreaks RSS",                url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/fda-outbreaks/rss.xml",         authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 1 },
  { source_id: "us_fda_food_safety_rss",      label: "FDA Food Safety Recalls RSS",      url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/food-safety-recalls/rss.xml",   authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 1 },
  { source_id: "us_fda_insight_rss",          label: "FDA Insight RSS",                  url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/fda-insight/rss.xml",           authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "rss", priority: 2 },
  { source_id: "us_federal_register_rss",     label: "Federal Register FDA RSS",         url: "https://www.federalregister.gov/documents/search.rss?conditions%5Bagencies%5D%5B%5D=food-and-drug-administration", authority: "Federal Register", region_hint: "US", domain_hint: null, tier: "rss", priority: 2 },
  { source_id: "us_govinfo_rss",              label: "GovInfo Bills RSS",                url: "https://www.govinfo.gov/rss/bills",                                                              authority: "GovInfo",      region_hint: "US", domain_hint: null,       tier: "rss", priority: 2 },
  { source_id: "us_dailymed_rss",             label: "DailyMed RSS",                     url: "https://dailymed.nlm.nih.gov/dailymed/rss.cfm",                                                  authority: "NLM / DailyMed", region_hint: "US", domain_hint: "pharma", tier: "rss", priority: 3, maxAgeHours: 48 },

  // ── EMA RSS ─────────────────────────────────────────────────────────────
  // Note: EMA retired most /feed endpoints (404/429). Only news.xml works reliably.
  // The custom eu_ema_api fetcher covers the rest (CHMP, referrals, recent medicines).
  { source_id: "eu_ema_news_rss",             label: "EMA News RSS",                     url: "https://www.ema.europa.eu/en/news.xml",                                                          authority: "EMA",          region_hint: "EU", domain_hint: null,       tier: "rss", priority: 1, maxAgeHours: 720 },

  // ── UK / MHRA RSS ───────────────────────────────────────────────────────
  { source_id: "uk_mhra_alerts",              label: "MHRA Drug & Device Alerts",        url: "https://www.gov.uk/drug-device-alerts.atom",                                                     authority: "MHRA",         region_hint: "UK", domain_hint: null,       tier: "rss", priority: 1, maxAgeHours: 336 },
  { source_id: "uk_mhra_devices",             label: "MHRA All Publications",            url: "https://www.gov.uk/search/all.atom?organisations%5B%5D=medicines-and-healthcare-products-regulatory-agency&order=updated-newest", authority: "MHRA", region_hint: "UK", domain_hint: null, tier: "rss", priority: 1, maxAgeHours: 336 },
  { source_id: "uk_mhra_guidance_rss",        label: "MHRA Guidance & Regulation",       url: "https://www.gov.uk/search/guidance-and-regulation.atom?organisations%5B%5D=medicines-and-healthcare-products-regulatory-agency", authority: "MHRA", region_hint: "UK", domain_hint: null, tier: "rss", priority: 1, maxAgeHours: 336 },
  { source_id: "uk_mhra_drug_safety_rss",     label: "MHRA Drug Safety Update",          url: "https://www.gov.uk/drug-safety-update.atom",                                                     authority: "MHRA",         region_hint: "UK", domain_hint: "pharma",   tier: "rss", priority: 1, maxAgeHours: 336 },
  { source_id: "uk_legislation_rss",          label: "UK Legislation (SI)",              url: "https://www.legislation.gov.uk/uksi/new/data.feed",                                              authority: "UK Parliament", region_hint: "UK", domain_hint: null,      tier: "rss", priority: 3, maxAgeHours: 720 },

  // ── Health Canada RSS ───────────────────────────────────────────────────
  // Only the recalls feed parses correctly. The .atom feeds from canada.ca serve
  // HTML with Atom headers that rss-parser can't handle. Those are covered by
  // the ca_hc_drug_product custom API fetcher and firecrawl entries below.
  { source_id: "ca_hc_recalls",               label: "Health Canada Recalls RSS",        url: "https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls",                       authority: "Health Canada", region_hint: "Canada", domain_hint: null,  tier: "rss", priority: 1, maxAgeHours: 336 },

  // ── TGA Australia RSS ───────────────────────────────────────────────────
  // Note: TGA feeds timeout from US-based servers. They work from AU/APAC.
  // The au_tga_api custom fetcher is the primary path; these are kept for
  // deployments running closer to Australia.
  { source_id: "au_tga_alerts",               label: "TGA Safety Alerts RSS",            url: "https://www.tga.gov.au/safety/safety-alerts-medicine/feed",                                      authority: "TGA",          region_hint: "Australia", domain_hint: null, tier: "rss", priority: 1, maxAgeHours: 720 },
  { source_id: "au_tga_news_rss",             label: "TGA News RSS",                     url: "https://www.tga.gov.au/news/feed",                                                               authority: "TGA",          region_hint: "Australia", domain_hint: null, tier: "rss", priority: 1, maxAgeHours: 720 },

  // ── International / Global RSS ──────────────────────────────────────────
  { source_id: "global_imdrf_documents",      label: "IMDRF Documents RSS",              url: "https://www.imdrf.org/documents.xml",                                                            authority: "IMDRF",        region_hint: "Global", domain_hint: null,   tier: "rss", priority: 2, maxAgeHours: 720 },
  { source_id: "global_imdrf_consultations",  label: "IMDRF Consultations RSS",          url: "https://www.imdrf.org/consultations.xml",                                                        authority: "IMDRF",        region_hint: "Global", domain_hint: null,   tier: "rss", priority: 2, maxAgeHours: 720 },
  { source_id: "global_imdrf_news",           label: "IMDRF News RSS",                   url: "https://www.imdrf.org/news-events/news.xml",                                                     authority: "IMDRF",        region_hint: "Global", domain_hint: null,   tier: "rss", priority: 2, maxAgeHours: 720 },
  { source_id: "global_who_news_rss",         label: "WHO News RSS",                     url: "https://www.who.int/rss-feeds/news-english.xml",                                                  authority: "WHO",          region_hint: "Global", domain_hint: null,   tier: "rss", priority: 2, maxAgeHours: 720 },
  // Note: WHO medical-product-alerts.xml and disease-outbreak-news.xml return 404 as of Mar 2026.
  // The custom global_who_api fetcher covers outbreaks and press releases via HTML scraping.

  // ── Press / Industry RSS ────────────────────────────────────────────────
  { source_id: "press_globenewswire",         label: "GlobeNewsWire Health RSS",         url: "https://www.globenewswire.com/RssFeed/subjectcode/14-Health/feedTitle/GlobeNewswire+-+Health",   authority: "GlobeNewsWire", region_hint: "Global", domain_hint: null,  tier: "rss", priority: 3 },
  { source_id: "press_businesswire",          label: "BusinessWire Health RSS",          url: "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGVtSWg%3D%3D",                           authority: "BusinessWire",  region_hint: "Global", domain_hint: null,  tier: "rss", priority: 3 },
  { source_id: "press_prnewswire",            label: "PR Newswire Health RSS",           url: "https://www.prnewswire.com/rss/health-latest-news/health-latest-news-list.rss",                   authority: "PR Newswire",   region_hint: "Global", domain_hint: null,  tier: "rss", priority: 3 },
  { source_id: "press_biopharma_dive",        label: "BioPharma Dive RSS",              url: "https://www.biopharmadive.com/feeds/news/",                                                       authority: "BioPharma Dive", region_hint: "Global", domain_hint: "pharma", tier: "rss", priority: 2 },
  { source_id: "press_medtech_dive",          label: "MedTech Dive RSS",                url: "https://www.medtechdive.com/feeds/news/",                                                         authority: "MedTech Dive",  region_hint: "Global", domain_hint: "devices", tier: "rss", priority: 2 },
  { source_id: "press_fierce_pharma",         label: "Fierce Pharma RSS",               url: "https://www.fiercepharma.com/rss/xml",                                                            authority: "Fierce Pharma", region_hint: "Global", domain_hint: "pharma", tier: "rss", priority: 2 },
  { source_id: "press_fierce_biotech",        label: "Fierce Biotech RSS",              url: "https://www.fiercebiotech.com/rss/xml",                                                           authority: "Fierce Biotech", region_hint: "Global", domain_hint: "pharma", tier: "rss", priority: 2 },
  { source_id: "press_fierce_medtech",        label: "Fierce MedTech RSS",              url: "https://www.fiercemedtech.com/rss/xml",                                                           authority: "Fierce MedTech", region_hint: "Global", domain_hint: "devices", tier: "rss", priority: 2 },
  { source_id: "press_stat_news",             label: "STAT News RSS",                   url: "https://www.statnews.com/feed/",                                                                   authority: "STAT News",    region_hint: "Global", domain_hint: null,   tier: "rss", priority: 2 },
  { source_id: "press_endpoints",             label: "Endpoints News RSS",              url: "https://endpts.com/feed/",                                                                         authority: "Endpoints News", region_hint: "Global", domain_hint: "pharma", tier: "rss", priority: 2 },
  // Disabled: FDANews RSS is serving website navigation pages, not articles (verified Mar 2026)
  // { source_id: "press_fdanews",               label: "FDANews RSS",                     url: "https://www.fdanews.com/rss",                                                                      authority: "FDANews",      region_hint: "US", domain_hint: null,       tier: "rss", priority: 2 },

  // ── US Industry / Health News RSS (new) ───────────────────────────────
  { source_id: "us_stat_news_rss",            label: "STAT News",                       url: "https://www.statnews.com/feed/",                                                                     authority: "STAT News",    region_hint: "US", domain_hint: null,       tier: "rss", priority: 2 },
  { source_id: "us_endpoints_rss",            label: "Endpoints News",                  url: "https://endpts.com/feed/",                                                                           authority: "Endpoints News", region_hint: "US", domain_hint: "pharma", tier: "rss", priority: 2 },
  { source_id: "us_fierce_pharma_rss",        label: "FiercePharma",                    url: "https://www.fiercepharma.com/rss/xml",                                                               authority: "FiercePharma", region_hint: "US", domain_hint: "pharma",   tier: "rss", priority: 2 },
  { source_id: "us_fierce_biotech_rss",       label: "FierceBiotech",                   url: "https://www.fiercebiotech.com/rss/xml",                                                              authority: "FierceBiotech", region_hint: "US", domain_hint: "pharma",  tier: "rss", priority: 2 },
  // Removed: us_nyt_health_rss — consumer health news, not regulatory; diluted front-page quality

  // ── Wire Service / Company Press Release RSS (new) ────────────────────
  { source_id: "wire_globenewswire_pharma",   label: "GlobeNewswire Pharma",            url: "https://www.globenewswire.com/RssFeed/subjectcode/14-Medical%20Pharmaceuticals/feedTitle/GlobeNewswire%20-%20Medical%20Pharmaceuticals", authority: "GlobeNewswire", region_hint: "Global", domain_hint: "pharma", tier: "rss", priority: 3 },
  { source_id: "wire_prnewswire_health",      label: "PRNewswire Healthcare",           url: "https://www.prnewswire.com/rss/health-care-and-hospitals-latest-news/health-care-and-hospitals-latest-news-list.rss", authority: "PRNewswire", region_hint: "Global", domain_hint: null, tier: "rss", priority: 3 },
  { source_id: "company_lilly",               label: "Eli Lilly Press",                 url: "https://investor.lilly.com/rss/news-releases.xml",                                                   authority: "Eli Lilly",    region_hint: "US", domain_hint: "pharma",   tier: "rss", priority: 2 },
  { source_id: "company_regeneron",           label: "Regeneron Press",                 url: "https://newsroom.regeneron.com/rss/news-releases.xml",                                                authority: "Regeneron",    region_hint: "US", domain_hint: "pharma",   tier: "rss", priority: 2 },
  { source_id: "company_biontech",            label: "BioNTech Press",                  url: "https://investors.biontech.de/rss/news-releases.xml",                                                 authority: "BioNTech",     region_hint: "EU", domain_hint: "pharma",   tier: "rss", priority: 2 },

  // Note: RegLink (404), RAInfo (timeout), PharmaReg.in (SSL), Emergo RSS (404),
  // all podcasts (404), and YouTube feeds (404) removed — verified broken Mar 2026.

  // ── Swiss / ICH (reclassified to Firecrawl — RSS feeds are 404) ─────────
  { source_id: "ch_swissmedic",               label: "Swissmedic News",                 url: "https://www.swissmedic.ch/swissmedic/en/home/news.html",                                          authority: "Swissmedic",   region_hint: "Switzerland", domain_hint: null, tier: "firecrawl", priority: 2, check_url: "https://www.swissmedic.ch/swissmedic/en/home.html" },
  { source_id: "global_ich_news",             label: "ICH News",                        url: "https://www.ich.org/page/articles-press-releases",                                                 authority: "ICH",          region_hint: "Global", domain_hint: "pharma", tier: "firecrawl", priority: 2 },

  // ══════════════════════════════════════════════════════════════════════════
  // FIRECRAWL TIER — auto-wired by registryFetcher.ts
  // ══════════════════════════════════════════════════════════════════════════

  // ── US FDA Firecrawl ────────────────────────────────────────────────────
  { source_id: "us_fda_guidance_rss",         label: "FDA Guidance Documents",           url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents",                       authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 1, extractPrompt: "Extract all FDA guidance documents listed on this page. For each guidance document return: title (guidance document name), url (direct link to the guidance on fda.gov), date (issue or revision date), summary (brief scope description if available). Focus on actual guidance documents, not navigation or header elements." },
  { source_id: "us_fda_advisory_calendar",    label: "FDA Advisory Calendar",            url: "https://www.fda.gov/advisory-committees/advisory-committee-calendar",                            authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 1, extractPrompt: "Extract all upcoming FDA advisory committee meetings from this page. For each meeting return: title (committee name and topic), url (link to meeting details), date (meeting date), summary (brief description). Skip navigation and page chrome." },
  { source_id: "us_fda_workshops",            label: "FDA Workshops & Conferences",      url: "https://www.fda.gov/science-research/fda-meetings-conferences-and-workshops",                   authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 2, extractPrompt: "Extract all FDA workshops, conferences, and meetings listed. For each: title, url, date, summary. Skip navigation." },
  { source_id: "us_fda_orphan_designations",  label: "FDA Orphan Designations",          url: "https://www.accessdata.fda.gov/scripts/opdlisting/oopd/",                                       authority: "FDA",          region_hint: "US", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "us_fda_pmcpmr",              label: "FDA PMC/PMR Database",             url: "https://www.accessdata.fda.gov/scripts/cder/pmc/index.cfm",                                      authority: "FDA",          region_hint: "US", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "us_fda_warning_letters",      label: "FDA Warning Letters",              url: "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters", authority: "FDA Enforcement", region_hint: "US", domain_hint: null, tier: "firecrawl", priority: 1, extractPrompt: "Extract all warning letters listed on this page. For each: title (company name and subject), url (link to the warning letter), date (issue date), summary (brief description of the violation). Skip navigation and page chrome." },
  { source_id: "us_fda_import_alerts",        label: "FDA Import Alerts",                url: "https://www.accessdata.fda.gov/cms_ia/ialist.html",                                              authority: "FDA",          region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 2 },
  // New US Firecrawl
  { source_id: "us_fda_drugs_at_fda",         label: "FDA Drugs@FDA Search",             url: "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm",                                     authority: "FDA",          region_hint: "US", domain_hint: "pharma",   tier: "firecrawl", priority: 2, extractPrompt: "Extract recently approved drug applications from this page. For each: title (drug name and NDA/BLA number), url, date (approval date), summary (indication)." },
  { source_id: "us_fda_drug_safety_labeling", label: "FDA Drug Safety Labeling Changes", url: "https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program/safety-related-drug-labeling-changes", authority: "FDA", region_hint: "US", domain_hint: "pharma", tier: "firecrawl", priority: 1 },
  { source_id: "us_fda_purple_book",          label: "FDA Purple Book",                  url: "https://purplebooksearch.fda.gov/search",                                                        authority: "FDA",          region_hint: "US", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "us_fda_rems",                 label: "FDA REMS Database",                url: "https://www.accessdata.fda.gov/scripts/cder/rems/index.cfm",                                    authority: "FDA",          region_hint: "US", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "us_fda_de_novo",              label: "FDA De Novo Decisions",            url: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/denovo.cfm",                            authority: "FDA",          region_hint: "US", domain_hint: "devices",  tier: "firecrawl", priority: 1 },
  { source_id: "us_fda_novel_drug",           label: "FDA Novel Drug Approvals",         url: "https://www.fda.gov/drugs/new-drugs-fda-cders-new-molecular-entities-and-new-therapeutic-biological-products/novel-drug-approvals-fda", authority: "FDA", region_hint: "US", domain_hint: "pharma", tier: "firecrawl", priority: 1 },
  { source_id: "us_fda_accelerated",          label: "FDA Accelerated Approvals",        url: "https://www.fda.gov/drugs/nda-and-bla-approvals/accelerated-approvals",                          authority: "FDA",          region_hint: "US", domain_hint: "pharma",   tier: "firecrawl", priority: 1 },
  { source_id: "us_ecfr_title21",             label: "eCFR Title 21",                    url: "https://www.ecfr.gov/current/title-21",                                                          authority: "eCFR",         region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 3, extractPrompt: "Extract recently updated sections or parts from Title 21 CFR displayed on this page. For each: title (part name), url (link to the part), date (last amended date), summary (scope). Focus on amended sections." },
  { source_id: "us_oira_agenda",              label: "OIRA Regulatory Agenda",           url: "https://www.reginfo.gov/public/do/eAgendaMain",                                                  authority: "OIRA / OMB",   region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 2 },
  { source_id: "us_regulations_gov",          label: "Regulations.gov FDA Dockets",      url: "https://www.regulations.gov/search?agencyIds=FDA",                                               authority: "Regulations.gov", region_hint: "US", domain_hint: null,    tier: "firecrawl", priority: 2 },
  { source_id: "us_cdc_media_releases",       label: "CDC Media Releases",               url: "https://www.cdc.gov/media/releases/",                                                            authority: "CDC",          region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 1, extractPrompt: "Extract all CDC media releases and press statements. For each: title, url, date, summary. Focus on health advisories, disease outbreaks, and regulatory actions." },
  { source_id: "us_cms_newsroom",             label: "CMS Newsroom",                     url: "https://www.cms.gov/newsroom/press-releases",                                                    authority: "CMS",          region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 1, extractPrompt: "Extract all CMS press releases and fact sheets. For each: title, url, date, summary. Focus on coverage decisions, reimbursement changes, and regulatory updates." },

  // ── EU — EMA custom API fetcher ─────────────────────────────────────────
  { source_id: "eu_ema_api",                  label: "EMA Medicines & Referrals (API)",  url: "https://www.ema.europa.eu/en/medicines",                                                         authority: "EMA",          region_hint: "EU", domain_hint: null,       tier: "api", priority: 1, customFetcher: true },
  // ── EU Firecrawl (remaining pages without API coverage) ────────────────
  { source_id: "eu_ema_guidelines_rss",       label: "EMA Scientific Guidelines",        url: "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/scientific-guidelines", authority: "EMA",       region_hint: "EU", domain_hint: null,       tier: "firecrawl", priority: 1 },
  { source_id: "eu_ema_consultations_rss",    label: "EMA Scientific Advice",            url: "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/scientific-advice-and-protocol-assistance/scientific-advice", authority: "EMA", region_hint: "EU", domain_hint: null, tier: "firecrawl", priority: 1 },
  { source_id: "eu_ema_orphan_rss",           label: "EMA Orphan Medicines",             url: "https://www.ema.europa.eu/en/human-regulatory-overview/marketing-authorisation/orphan-medicines", authority: "EMA",          region_hint: "EU", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "eu_chmp_highlights",          label: "EMA CHMP Highlights",              url: "https://www.ema.europa.eu/en/committees/chmp/chmp-agendas-minutes-highlights",                   authority: "EMA CHMP",     region_hint: "EU", domain_hint: null,       tier: "firecrawl", priority: 1 },
  { source_id: "eu_prac_highlights",          label: "EMA PRAC Highlights",              url: "https://www.ema.europa.eu/en/committees/prac/prac-agendas-minutes-highlights",                   authority: "EMA PRAC",     region_hint: "EU", domain_hint: null,       tier: "firecrawl", priority: 1 },
  { source_id: "eu_union_register_rss",       label: "EU Community Register",            url: "https://ec.europa.eu/health/documents/community-register/html/index_en.htm",                     authority: "EU Commission", region_hint: "EU", domain_hint: null,      tier: "firecrawl", priority: 2 },
  { source_id: "eu_mdcg_documents",           label: "MDCG Documents",                   url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en", authority: "EU Commission / MDCG", region_hint: "EU", domain_hint: "devices", tier: "firecrawl", priority: 1 },
  { source_id: "eu_mdcg_minutes",             label: "MDCG Minutes",                     url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en", authority: "EU Commission / MDCG", region_hint: "EU", domain_hint: "devices", tier: "firecrawl", priority: 2 },
  { source_id: "eu_hma_cmdh",                 label: "HMA CMDh",                         url: "https://www.hma.eu/human-medicines/cmdh.html",                                                  authority: "HMA CMDh",     region_hint: "EU", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "eu_ema_prime",                label: "EMA PRIME Designations",           url: "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/prime-priority-medicines", authority: "EMA", region_hint: "EU", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "eu_ema_clinical_data",        label: "EMA Clinical Data Portal",         url: "https://clinicaldata.ema.europa.eu/web/cdp/home",                                                authority: "EMA",          region_hint: "EU", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "eu_ema_medicines_eval",       label: "EMA Medicines Under Evaluation",   url: "https://www.ema.europa.eu/en/medicines/medicines-human-use-under-evaluation",                    authority: "EMA",          region_hint: "EU", domain_hint: null,       tier: "firecrawl", priority: 1 },
  { source_id: "eu_ema_rwd_catalog",          label: "EMA Real World Data",              url: "https://www.ema.europa.eu/en/about-us/how-we-work/big-data/real-world-evidence",                 authority: "EMA",          region_hint: "EU", domain_hint: null,       tier: "firecrawl", priority: 3 },
  { source_id: "eu_ctis_trials",              label: "EU CTIS Trials",                   url: "https://euclinicaltrials.eu/ctis-public/search",                                                  authority: "EU CTIS",      region_hint: "EU", domain_hint: "pharma",   tier: "firecrawl", priority: 2 },
  { source_id: "global_eurlex_rss",           label: "EUR-Lex Official Journal",         url: "https://eur-lex.europa.eu/oj/direct-access.html",                                                authority: "EUR-Lex",      region_hint: "EU", domain_hint: null,       tier: "firecrawl", priority: 2, check_url: "https://eur-lex.europa.eu/oj/direct-access.html?locale=en&ojId=OJ_L_rss.xml" },
  // New EU Firecrawl
  { source_id: "eu_ema_additional_monitoring", label: "EMA Additional Monitoring",       url: "https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance/medicines-under-additional-monitoring", authority: "EMA", region_hint: "EU", domain_hint: "pharma", tier: "firecrawl", priority: 2 },
  { source_id: "eu_orphan_register",          label: "EU Orphan Designation Register",   url: "https://ec.europa.eu/health/documents/community-register/html/reg_od_act.htm",                  authority: "EU Commission", region_hint: "EU", domain_hint: "pharma",  tier: "firecrawl", priority: 2 },

  // ── UK — MHRA custom API fetcher ────────────────────────────────────────
  { source_id: "uk_mhra_api",                 label: "MHRA Alerts & Guidance (API)",     url: "https://www.gov.uk/api/search.json?filter_organisations=medicines-and-healthcare-products-regulatory-agency", authority: "MHRA", region_hint: "UK", domain_hint: null, tier: "api", priority: 1, customFetcher: true },

  // ── Canada Firecrawl ────────────────────────────────────────────────────
  { source_id: "ca_hc_noc",                   label: "Health Canada NOC",                url: "https://health-products.canada.ca/noc-ac/index-eng.jsp",                                        authority: "Health Canada", region_hint: "Canada", domain_hint: "pharma", tier: "firecrawl", priority: 1 },
  { source_id: "ca_hc_medical_devices",       label: "Health Canada MDALL",              url: "https://health-products.canada.ca/mdall-limh/index-eng.jsp",                                     authority: "Health Canada", region_hint: "Canada", domain_hint: "devices", tier: "firecrawl", priority: 1 },
  { source_id: "ca_hc_guidance_docs",         label: "Health Canada Guidance Docs",      url: "https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents.html", authority: "Health Canada", region_hint: "Canada", domain_hint: null, tier: "firecrawl", priority: 2 },

  // ── Australia — TGA custom API fetcher ──────────────────────────────────
  { source_id: "au_tga_api",                  label: "TGA Alerts & Recalls (API)",       url: "https://www.tga.gov.au/safety",                                                                  authority: "TGA",          region_hint: "Australia", domain_hint: null, tier: "api", priority: 1, customFetcher: true },
  // Remaining firecrawl pages
  { source_id: "au_tga_auspar",               label: "TGA AusPAR",                       url: "https://www.tga.gov.au/resources/auspar",                                                       authority: "TGA",          region_hint: "Australia", domain_hint: null, tier: "firecrawl", priority: 2 },
  { source_id: "au_tga_prescriptions_eval",   label: "TGA Rx Under Evaluation",          url: "https://www.tga.gov.au/prescription-medicines-applications-under-evaluation",                   authority: "TGA",          region_hint: "Australia", domain_hint: "pharma", tier: "firecrawl", priority: 2 },

  // ── Japan — custom API fetcher ──────────────────────────────────────────
  { source_id: "jp_pmda_api",                 label: "PMDA Approvals & Safety (API)",    url: "https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0002.html",   authority: "PMDA",         region_hint: "Japan", domain_hint: null,     tier: "api", priority: 1, customFetcher: true },
  // Keep firecrawl entries for pages the API fetcher doesn't cover
  { source_id: "jp_pmda_guidance",            label: "PMDA Guidance Documents",          url: "https://www.pmda.go.jp/english/review-services/reviews/guidance-documents.html",                 authority: "PMDA",         region_hint: "Japan", domain_hint: null,     tier: "firecrawl", priority: 2 },

  // ── Global — WHO custom API fetcher ─────────────────────────────────────
  { source_id: "global_who_api",              label: "WHO News & Outbreaks (API)",       url: "https://www.who.int/api/news",                                                                   authority: "WHO",          region_hint: "Global", domain_hint: null,   tier: "api", priority: 1, customFetcher: true },
  // ── Global / International Firecrawl ────────────────────────────────────
  { source_id: "global_icmra",                label: "ICMRA News",                       url: "https://www.icmra.info/drupal/en/news",                                                         authority: "ICMRA",        region_hint: "Global", domain_hint: null,   tier: "firecrawl", priority: 2 },
  { source_id: "global_pics",                 label: "PIC/S Publications",               url: "https://picscheme.org/en/publications",                                                          authority: "PIC/S",        region_hint: "Global", domain_hint: null,   tier: "firecrawl", priority: 2 },
  { source_id: "global_who_prequalification", label: "WHO Prequalification",             url: "https://extranet.who.int/prequal/content/prequalified-lists/medicines",                          authority: "WHO",          region_hint: "Global", domain_hint: "pharma", tier: "firecrawl", priority: 2 },

  // ── Regional Firecrawl (new) ────────────────────────────────────────────
  { source_id: "sg_hsa",                      label: "HSA Singapore",                    url: "https://www.hsa.gov.sg/announcements",                                                           authority: "HSA Singapore", region_hint: "Global", domain_hint: null,  tier: "firecrawl", priority: 3, extractPrompt: "Extract all health product announcements and regulatory updates. For each: title, url, date, summary." },
  { source_id: "nz_medsafe",                  label: "Medsafe New Zealand",              url: "https://www.medsafe.govt.nz/hot/alerts.asp",                                                    authority: "Medsafe NZ",   region_hint: "Global", domain_hint: null,   tier: "firecrawl", priority: 3 },
  { source_id: "br_anvisa",                   label: "ANVISA Brazil",                    url: "https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa",                                      authority: "ANVISA Brazil", region_hint: "Global", domain_hint: null,  tier: "firecrawl", priority: 3, extractPrompt: "Extract all recent ANVISA regulatory news, safety alerts, and guidance updates. For each: title, url, date, summary. Content may be in Portuguese — extract titles as-is." },
  { source_id: "kr_mfds",                     label: "MFDS South Korea",                 url: "https://www.mfds.go.kr/eng/brd/m_65/list.do",                                                  authority: "MFDS Korea",   region_hint: "Global", domain_hint: null,   tier: "firecrawl", priority: 3, extractPrompt: "Extract all MFDS news and regulatory updates. For each: title, url, date, summary." },

  // ── Industry / Standards Firecrawl ──────────────────────────────────────
  { source_id: "industry_raps_rss",           label: "RAPS Regulatory Focus",            url: "https://www.raps.org/news",                                                                      authority: "RAPS",         region_hint: "Global", domain_hint: null,   tier: "firecrawl", priority: 2, check_url: "https://www.raps.org/rss/news" },
  { source_id: "industry_emergo_radar",       label: "Emergo Radar Newsletter",          url: "https://www.emergobyul.com/news/newsletters/radar-market-access-newsletter",                    authority: "Emergo by UL", region_hint: "Global", domain_hint: "devices", tier: "firecrawl", priority: 2 },
  { source_id: "industry_covington",          label: "Covington FDA Blog",               url: "https://www.cov.com/en/news-and-insights/topics/fda-and-life-sciences",                         authority: "Covington",    region_hint: "US", domain_hint: null,       tier: "firecrawl", priority: 3 },
  { source_id: "industry_steptoe",            label: "Steptoe Regulatory Pulse",         url: "https://www.steptoe.com/en/news-publications/regulatory-pulse-pharma-and-medical-devices-newsletter.html", authority: "Steptoe", region_hint: "US", domain_hint: null, tier: "firecrawl", priority: 3 },
  { source_id: "standards_eu_harmonised",     label: "EU Harmonised Standards",          url: "https://ec.europa.eu/growth/single-market/european-standards/harmonised-standards/medical-devices_en", authority: "EU Commission", region_hint: "EU", domain_hint: "devices", tier: "firecrawl", priority: 2 },
  { source_id: "standards_iec_iso",           label: "IEC/ISO TC Standards",             url: "https://www.iec.ch/dyn/www/f?p=103:22:0::::FSP_ORG_ID:1248",                                    authority: "IEC / ISO",    region_hint: "Global", domain_hint: null,   tier: "firecrawl", priority: 2 },
  { source_id: "standards_bsi",               label: "BSI Medical Devices",              url: "https://www.bsigroup.com/en-GB/insights-and-media/insights/medical-devices/",                   authority: "BSI Group",    region_hint: "UK", domain_hint: "devices",  tier: "firecrawl", priority: 3, maxItems: 15 },
  { source_id: "standards_tuv_sud",           label: "TUV SUD Medical Devices",          url: "https://www.tuvsud.com/en/industries/healthcare-and-medical-devices/medical-devices-and-ivd",   authority: "TUV SUD",      region_hint: "EU", domain_hint: "devices",  tier: "firecrawl", priority: 3 },
  { source_id: "standards_dekra",             label: "DEKRA Medical Devices",            url: "https://www.dekra.com/en/medical-devices/",                                                      authority: "DEKRA",        region_hint: "EU", domain_hint: "devices",  tier: "firecrawl", priority: 3 },
  { source_id: "standards_sgs",               label: "SGS Medical Devices",              url: "https://www.sgs.com/en/our-services/life-sciences/medical-devices",                             authority: "SGS",          region_hint: "Global", domain_hint: "devices", tier: "firecrawl", priority: 3 },
  { source_id: "standards_ul",                label: "UL Solutions Insights",            url: "https://www.ul.com/insights?topics=medical-devices",                                             authority: "UL Solutions", region_hint: "Global", domain_hint: "devices", tier: "firecrawl", priority: 3 },
  { source_id: "standards_intertek",          label: "Intertek Regulatory Updates",      url: "https://www.intertek.com/medical/regulatory-updates/",                                           authority: "Intertek",     region_hint: "Global", domain_hint: "devices", tier: "firecrawl", priority: 3 },
];

// ─── Source priority for signal selection ───────────────────────────────────
// 1 = critical (health authorities), 2 = important, 3 = supplementary
export const SOURCE_PRIORITY: Record<string, 1 | 2 | 3> = Object.fromEntries(
  REGISTRY.map((s) => [s.source_id, s.priority])
);

/** SQL ORDER BY fragment: CASE WHEN source_id = 'x' THEN priority ... ELSE 3 END */
export const SOURCE_PRIORITY_ORDER_SQL =
  `CASE ${Object.entries(SOURCE_PRIORITY)
    .map(([id, p]) => `WHEN source_id = '${String(id).replace(/'/g, "''")}' THEN ${p}`)
    .join(" ")} ELSE 3 END`;

/** Source IDs and label patterns excluded from feed (e.g. removed sources). */
export const BLOCKED_SOURCE_IDS = ["us_nyt_health_rss"] as const;
export const BLOCKED_SOURCE_LABEL_PATTERNS = [/nyt/i, /new york times/i] as const;
export const BLOCKED_SOURCE_URL_PATTERNS = [/nytimes\.com/i] as const;

export function isBlockedSource(story: { source_labels?: string[]; source_urls?: string[] }): boolean {
  if (story.source_labels?.some((l) => BLOCKED_SOURCE_LABEL_PATTERNS.some((p) => p.test(l)))) return true;
  if (story.source_urls?.some((u) => BLOCKED_SOURCE_URL_PATTERNS.some((p) => p.test(u)))) return true;
  return false;
}

// ─── Backward-compat: SOURCE_CHECK_URLS ──────────────────────────────────────
// Computed view from REGISTRY for health-check consumers.

export interface SourceCheckEntry {
  source_id: string;
  check_url: string;
  tier: "api" | "rss" | "scrape";
}

export const SOURCE_CHECK_URLS: SourceCheckEntry[] = REGISTRY.map((s) => ({
  source_id: s.source_id,
  check_url: s.check_url || s.url,
  tier: s.tier === "firecrawl" ? "scrape" as const : s.tier,
}));
