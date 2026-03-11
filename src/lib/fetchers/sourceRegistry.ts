/**
 * Single source of truth for connectivity check URLs.
 * Used by /api/health-sources?test=all to verify every source is reachable.
 * Keep in sync with actual fetcher URLs in this directory.
 */

export interface SourceCheckEntry {
  source_id: string;
  /** URL to GET/HEAD for connectivity; 2xx = accessible */
  check_url: string;
  /** "api" | "rss" | "scrape" — scrape means page may need Firecrawl to yield items */
  tier: "api" | "rss" | "scrape";
}

export const SOURCE_CHECK_URLS: SourceCheckEntry[] = [
  // ── APIs ─────────────────────────────────────────────────────────────
  { source_id: "us_openfda_device_recall", check_url: "https://api.fda.gov/device/recall.json?limit=1", tier: "api" },
  { source_id: "us_openfda_drug_enforcement", check_url: "https://api.fda.gov/drug/enforcement.json?limit=1", tier: "api" },
  { source_id: "us_openfda_drugsfda", check_url: "https://api.fda.gov/drug/drugsfda.json?limit=1", tier: "api" },
  { source_id: "us_openfda_510k", check_url: "https://api.fda.gov/device/510k.json?limit=1", tier: "api" },
  { source_id: "us_openfda_pma", check_url: "https://api.fda.gov/device/pma.json?limit=1", tier: "api" },
  { source_id: "us_openfda_maude", check_url: "https://api.fda.gov/device/event.json?limit=1", tier: "api" },
  { source_id: "us_openfda_classification", check_url: "https://api.fda.gov/device/classification.json?limit=1", tier: "api" },
  { source_id: "us_fda_orange_book", check_url: "https://api.fda.gov/drug/drugsfda.json?limit=1", tier: "api" },
  { source_id: "us_fda_ndc", check_url: "https://api.fda.gov/drug/ndc.json?limit=1", tier: "api" },
  { source_id: "clinicaltrials", check_url: "https://clinicaltrials.gov/api/v2/studies?pageSize=1&format=json", tier: "api" },
  { source_id: "ca_hc_drug_product", check_url: "https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json&status=1", tier: "api" },

  // ── Federal Register (API) ─────────────────────────────────────────────
  { source_id: "us_federal_register", check_url: "https://www.federalregister.gov/api/v1/articles.json?per_page=1", tier: "rss" },

  // ── RSS / Atom feeds ───────────────────────────────────────────────────
  { source_id: "us_fda_medwatch_rss", check_url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml", tier: "rss" },
  { source_id: "us_fda_press_rss", check_url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", tier: "rss" },
  { source_id: "us_fda_device_safety_rss", check_url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medical-devices/rss.xml", tier: "rss" },
  { source_id: "us_govinfo_rss", check_url: "https://www.govinfo.gov/rss/bills", tier: "rss" },
  { source_id: "us_dailymed_rss", check_url: "https://dailymed.nlm.nih.gov/dailymed/rss.cfm", tier: "rss" },
  { source_id: "eu_ema_news_rss", check_url: "https://www.ema.europa.eu/en/news.xml", tier: "rss" },
  { source_id: "uk_mhra_alerts", check_url: "https://www.gov.uk/drug-device-alerts.atom", tier: "rss" },
  { source_id: "uk_mhra_approvals", check_url: "https://www.gov.uk/search/all.atom?keywords=mhra+approval&order=updated-newest", tier: "rss" },
  { source_id: "uk_mhra_publications", check_url: "https://www.gov.uk/government/publications.atom?departments%5B%5D=medicines-and-healthcare-products-regulatory-agency", tier: "rss" },
  { source_id: "ca_hc_recalls", check_url: "https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls", tier: "rss" },
  { source_id: "ca_hc_safety_reviews", check_url: "https://www.canada.ca/en/health-canada/services/drugs-health-products/medeffect-canada/safety-reviews.atom", tier: "rss" },
  { source_id: "au_tga_alerts", check_url: "https://www.tga.gov.au/safety/safety-alerts-medicine/feed", tier: "rss" },
  { source_id: "au_tga_device_recalls", check_url: "https://www.tga.gov.au/safety/shortages-and-recalls/recall-actions/feed", tier: "rss" },
  { source_id: "global_imdrf_documents", check_url: "https://www.imdrf.org/documents.xml", tier: "rss" },
  { source_id: "global_imdrf_consultations", check_url: "https://www.imdrf.org/consultations.xml", tier: "rss" },
  { source_id: "global_imdrf_news", check_url: "https://www.imdrf.org/news-events/news.xml", tier: "rss" },
  { source_id: "global_who_news_rss", check_url: "https://www.who.int/rss-feeds/news-english.xml", tier: "rss" },
  { source_id: "global_eurlex_rss", check_url: "https://eur-lex.europa.eu/oj/direct-access.html?locale=en&ojId=OJ_L_rss.xml", tier: "rss" },
  { source_id: "industry_raps_rss", check_url: "https://www.raps.org/rss/news", tier: "rss" },
  { source_id: "podcast_fda_voices", check_url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", tier: "rss" },
  { source_id: "podcast_raps", check_url: "https://www.raps.org/rss/podcast", tier: "rss" },
  { source_id: "podcast_emergo", check_url: "https://feeds.buzzsprout.com/1791064.rss", tier: "rss" },

  // ── Scrape (page URL; 200 = page reachable, content may still need Firecrawl) ──
  { source_id: "us_fda_guidance_rss", check_url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents", tier: "scrape" },
  { source_id: "eu_ema_guidelines_rss", check_url: "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/scientific-guidelines", tier: "scrape" },
  { source_id: "eu_ema_new_medicines_rss", check_url: "https://www.ema.europa.eu/en/medicines/recently-authorised-medicines", tier: "scrape" },
  { source_id: "eu_ema_consultations_rss", check_url: "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/scientific-advice-and-protocol-assistance/scientific-advice", tier: "scrape" },
  { source_id: "eu_ema_orphan_rss", check_url: "https://www.ema.europa.eu/en/human-regulatory-overview/marketing-authorisation/orphan-medicines", tier: "scrape" },
  { source_id: "eu_ema_medicines_eval", check_url: "https://www.ema.europa.eu/en/medicines/medicines-human-use-under-evaluation", tier: "scrape" },
  { source_id: "eu_ema_prime", check_url: "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/prime-priority-medicines", tier: "scrape" },
  { source_id: "eu_ema_rwd", check_url: "https://www.ema.europa.eu/en/about-us/how-we-work/big-data/real-world-evidence", tier: "scrape" },
  { source_id: "eu_ema_clinical_data", check_url: "https://clinicaldata.ema.europa.eu/web/cdp/home", tier: "scrape" },
  { source_id: "eu_chmp_highlights", check_url: "https://www.ema.europa.eu/en/committees/chmp/chmp-agendas-minutes-highlights", tier: "scrape" },
  { source_id: "eu_prac_highlights", check_url: "https://www.ema.europa.eu/en/committees/prac/prac-agendas-minutes-highlights", tier: "scrape" },
  { source_id: "eu_mdcg_documents", check_url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en", tier: "scrape" },
  { source_id: "eu_mdcg_minutes", check_url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en", tier: "scrape" },
  { source_id: "eu_hma_cmdh", check_url: "https://www.hma.eu/human-medicines/cmdh.html", tier: "scrape" },
  { source_id: "eu_ctis_trials", check_url: "https://euclinicaltrials.eu/ctis-public/search", tier: "scrape" },
  { source_id: "eu_union_register_rss", check_url: "https://ec.europa.eu/health/documents/community-register/html/index_en.htm", tier: "scrape" },
  { source_id: "ca_hc_noc", check_url: "https://health-products.canada.ca/noc-ac/index-eng.jsp", tier: "scrape" },
  { source_id: "ca_hc_medical_devices", check_url: "https://health-products.canada.ca/mdall-limh/index-eng.jsp", tier: "scrape" },
  { source_id: "au_tga_auspar", check_url: "https://www.tga.gov.au/resources/auspar", tier: "scrape" },
  { source_id: "au_tga_prescriptions_eval", check_url: "https://www.tga.gov.au/prescription-medicines-applications-under-evaluation", tier: "scrape" },
  { source_id: "jp_pmda_approvals", check_url: "https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0002.html", tier: "scrape" },
  { source_id: "jp_pmda_safety", check_url: "https://www.pmda.go.jp/english/safety/info-services/drugs/esc-rsc/0001.html", tier: "scrape" },
  { source_id: "jp_pmda_devices", check_url: "https://www.pmda.go.jp/english/review-services/reviews/approved-information/devices/0001.html", tier: "scrape" },
  { source_id: "us_fda_advisory_calendar", check_url: "https://www.fda.gov/advisory-committees/advisory-committee-calendar", tier: "scrape" },
  { source_id: "us_fda_workshops", check_url: "https://www.fda.gov/science-research/fda-meetings-conferences-and-workshops", tier: "scrape" },
  { source_id: "us_fda_pmcpmr", check_url: "https://www.accessdata.fda.gov/scripts/cder/pmc/index.cfm", tier: "scrape" },
  { source_id: "us_fda_orphan_designations", check_url: "https://www.accessdata.fda.gov/scripts/opdlisting/oopd/", tier: "scrape" },
  { source_id: "standards_eu_harmonised", check_url: "https://ec.europa.eu/growth/single-market/european-standards/harmonised-standards/medical-devices_en", tier: "scrape" },
  { source_id: "standards_iec_iso", check_url: "https://www.iec.ch/dyn/www/f?p=103:22:0::::FSP_ORG_ID:1248", tier: "scrape" },
  { source_id: "standards_bsi", check_url: "https://www.bsigroup.com/en-GB/insights-and-media/insights/medical-devices/", tier: "scrape" },
  { source_id: "standards_tuv_sud", check_url: "https://www.tuvsud.com/en/industries/healthcare-and-medical-devices/medical-devices-and-ivd", tier: "scrape" },
  { source_id: "standards_dekra", check_url: "https://www.dekra.com/en/medical-devices/", tier: "scrape" },
  { source_id: "standards_sgs", check_url: "https://www.sgs.com/en/our-services/life-sciences/medical-devices", tier: "scrape" },
  { source_id: "standards_ul", check_url: "https://www.ul.com/insights?topics=medical-devices", tier: "scrape" },
  { source_id: "standards_intertek", check_url: "https://www.intertek.com/medical/regulatory-updates/", tier: "scrape" },
  { source_id: "industry_emergo_radar", check_url: "https://www.emergobyul.com/news/newsletters/radar-market-access-newsletter", tier: "scrape" },
  { source_id: "industry_covington", check_url: "https://www.cov.com/en/news-and-insights/topics/fda-and-life-sciences", tier: "scrape" },
  { source_id: "industry_steptoe", check_url: "https://www.steptoe.com/en/news-publications/regulatory-pulse-pharma-and-medical-devices-newsletter.html", tier: "scrape" },
];
