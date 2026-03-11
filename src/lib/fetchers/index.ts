import { Profile, SignalDraft } from "../types";

// ─── US sources ──────────────────────────────────────────────────────
import { fetchFederalRegister } from "./us_federal_register";
import { fetchGovInfoRSS } from "./us_govinfo_rss";
import { fetchFDAGuidanceRSS } from "./us_fda_guidance_rss";
import { fetchFDAPressRSS } from "./us_fda_press_rss";
import { fetchFDAMedWatchRSS } from "./us_fda_medwatch_rss";
import { fetchFDADeviceSafetyRSS } from "./us_fda_device_safety_rss";
import { fetchFDAAdvisoryCalendar } from "./us_fda_advisory_calendar";
import { fetchFDAWorkshops } from "./us_fda_workshops";
import { fetchOpenFDADrugEnforcement } from "./us_openfda_drug_enforcement";
import { fetchOpenFDADeviceRecall } from "./us_openfda_device_recall";
import { fetchOpenFDADrugsFDA } from "./us_openfda_drugsfda";
import { fetchOpenFDA510k } from "./us_openfda_510k";
import { fetchOpenFDAPMA } from "./us_openfda_pma";
import { fetchOpenFDAMAUDE } from "./us_openfda_maude";
import { fetchOpenFDADeviceClassification } from "./us_openfda_classification";
import { fetchOrangeBook } from "./us_fda_orange_book";
import { fetchFDANDC } from "./us_fda_ndc";
import { fetchDailyMedRSS } from "./us_dailymed_rss";
import { fetchFDAOrphanDesignations } from "./us_fda_orphan_designations";
import { fetchFDAPMCPMR } from "./us_fda_pmcpmr";

// ─── EU sources ──────────────────────────────────────────────────────
import { fetchEMAGuidelinesRSS } from "./eu_ema_guidelines_rss";
import { fetchEMANewMedicinesRSS } from "./eu_ema_new_medicines_rss";
import { fetchEMAConsultationsRSS } from "./eu_ema_consultations_rss";
import { fetchEMAOrphanRSS } from "./eu_ema_orphan_rss";
import { fetchEMANewsRSS } from "./eu_ema_news_rss";
import { fetchCHMPHighlights } from "./eu_chmp_highlights";
import { fetchPRACHighlights } from "./eu_prac_highlights";
import { fetchEUUnionRegisterRSS } from "./eu_union_register_rss";
import { fetchMDCGDocuments } from "./eu_mdcg_documents";
import { fetchMDCGMinutes } from "./eu_mdcg_minutes";
import { fetchHMACMDh } from "./eu_hma_cmdh";
import { fetchEMAPrime } from "./eu_ema_prime";
import { fetchEMAClinicalData } from "./eu_ema_clinical_data";
import { fetchEMAMedicinesUnderEval } from "./eu_ema_medicines_eval";
import { fetchEMARWDCatalog } from "./eu_ema_rwd_catalog";
import { fetchEUCTISTrials } from "./eu_ctis_trials";

// ─── UK sources ──────────────────────────────────────────────────────
import { fetchMHRAAlerts } from "./uk_mhra_alerts";
import { fetchMHRAApprovals } from "./uk_mhra_approvals";
import { fetchMHRADevices } from "./uk_mhra_devices";

// ─── Health Canada ───────────────────────────────────────────────────
import { fetchHCDrugProduct } from "./ca_hc_drug_product";
import { fetchHCNoticeOfCompliance } from "./ca_hc_noc";
import { fetchHCMedicalDevices } from "./ca_hc_medical_devices";
import { fetchHCSafetyReviews } from "./ca_hc_safety_reviews";
import { fetchHCRecalls } from "./ca_hc_recalls";

// ─── TGA Australia ───────────────────────────────────────────────────
import { fetchTGAAlerts } from "./au_tga_alerts";
import { fetchTGAAusPAR } from "./au_tga_auspar";
import { fetchTGARxUnderEvaluation } from "./au_tga_prescriptions_eval";
import { fetchTGADeviceRecalls } from "./au_tga_device_recalls";

// ─── PMDA Japan ──────────────────────────────────────────────────────
import { fetchPMDAApprovals } from "./jp_pmda_approvals";
import { fetchPMDASafety } from "./jp_pmda_safety";
import { fetchPMDADevices } from "./jp_pmda_devices";

// ─── Clinical trials ─────────────────────────────────────────────────
import { fetchClinicalTrials } from "./clinicaltrials";

// ─── Global / International ──────────────────────────────────────────
import { fetchIMDRFDocuments } from "./global_imdrf_documents";
import { fetchIMDRFConsultations } from "./global_imdrf_consultations";
import { fetchIMDRFNews } from "./global_imdrf_news";
import { fetchEURLexRSS } from "./global_eurlex_rss";
import { fetchWHONewsRSS } from "./global_who_news_rss";

// ─── Industry analysis ──────────────────────────────────────────────
import { fetchRAPSRSS } from "./industry_raps_rss";
import { fetchEmergoRadar } from "./industry_emergo_radar";
import { fetchCovington } from "./industry_covington";
import { fetchSteptoe } from "./industry_steptoe";

// ─── Standards ───────────────────────────────────────────────────────
import { fetchIntertekStandards } from "./standards_intertek";
import { fetchULStandards } from "./standards_ul";
import { fetchTUVSudStandards } from "./standards_tuv_sud";
import { fetchBSIStandards } from "./standards_bsi";
import { fetchDEKRAStandards } from "./standards_dekra";
import { fetchSGSStandards } from "./standards_sgs";
import { fetchIECISOStandards } from "./standards_iec_iso";
import { fetchEUHarmonisedStandards } from "./standards_eu_harmonised";

// ─── Podcasts ────────────────────────────────────────────────────────
import { fetchFDAVoicesPodcast } from "./podcast_fda_voices";
import { fetchRAPSPodcast } from "./podcast_raps";
import { fetchEmergoPodcast } from "./podcast_emergo";

// ─── Profile gating helpers ──────────────────────────────────────────

function wantsUS(profile: Profile): boolean {
  return profile.regions.includes("US");
}

function wantsEU(profile: Profile): boolean {
  return profile.regions.includes("EU");
}

function wantsUK(profile: Profile): boolean {
  return profile.regions.includes("UK");
}

function wantsGlobal(profile: Profile): boolean {
  return profile.regions.includes("Global");
}

function wantsDevices(profile: Profile): boolean {
  return profile.domains.includes("devices");
}

function wantsPharma(profile: Profile): boolean {
  return profile.domains.includes("pharma");
}

// ─── Orchestrator ────────────────────────────────────────────────────

export async function fetchSignalsForProfile(
  profile: Profile
): Promise<SignalDraft[]> {
  const fetchers: Promise<SignalDraft[]>[] = [];

  // ── US sources ─────────────────────────────────────────────────────
  if (wantsUS(profile)) {
    fetchers.push(fetchFederalRegister());
    fetchers.push(fetchGovInfoRSS());
    fetchers.push(fetchFDAGuidanceRSS());
    fetchers.push(fetchFDAPressRSS());
    fetchers.push(fetchFDAMedWatchRSS());
    fetchers.push(fetchFDAAdvisoryCalendar());
    fetchers.push(fetchFDAWorkshops());
    fetchers.push(fetchFDAPMCPMR());

    if (wantsPharma(profile)) {
      fetchers.push(fetchOpenFDADrugEnforcement());
      fetchers.push(fetchOpenFDADrugsFDA());
      fetchers.push(fetchOrangeBook());
      fetchers.push(fetchFDANDC());
      fetchers.push(fetchDailyMedRSS());
      fetchers.push(fetchFDAOrphanDesignations());
    }
    if (wantsDevices(profile)) {
      fetchers.push(fetchFDADeviceSafetyRSS());
      fetchers.push(fetchOpenFDADeviceRecall());
      fetchers.push(fetchOpenFDA510k());
      fetchers.push(fetchOpenFDAPMA());
      fetchers.push(fetchOpenFDAMAUDE());
      fetchers.push(fetchOpenFDADeviceClassification());
    }
  }

  // ── Clinical trials (relevant across regions) ──────────────────────
  if (wantsUS(profile) || wantsEU(profile) || wantsGlobal(profile)) {
    fetchers.push(fetchClinicalTrials());
  }

  // ── EU sources ─────────────────────────────────────────────────────
  if (wantsEU(profile)) {
    fetchers.push(fetchEMANewsRSS());
    fetchers.push(fetchEMAPrime());
    fetchers.push(fetchEMAMedicinesUnderEval());
    fetchers.push(fetchEUCTISTrials());

    if (wantsPharma(profile)) {
      fetchers.push(fetchEMAGuidelinesRSS());
      fetchers.push(fetchEMANewMedicinesRSS());
      fetchers.push(fetchEMAConsultationsRSS());
      fetchers.push(fetchEMAOrphanRSS());
      fetchers.push(fetchCHMPHighlights());
      fetchers.push(fetchPRACHighlights());
      fetchers.push(fetchEUUnionRegisterRSS());
      fetchers.push(fetchHMACMDh());
      fetchers.push(fetchEMAClinicalData());
      fetchers.push(fetchEMARWDCatalog());
    }
    if (wantsDevices(profile)) {
      fetchers.push(fetchMDCGDocuments());
      fetchers.push(fetchMDCGMinutes());
    }
  }

  // ── UK sources ─────────────────────────────────────────────────────
  if (wantsUK(profile)) {
    fetchers.push(fetchMHRAAlerts());
    fetchers.push(fetchMHRAApprovals());
    fetchers.push(fetchMHRADevices());
  }

  // ── Global / International sources ─────────────────────────────────
  if (wantsGlobal(profile) || wantsEU(profile)) {
    fetchers.push(fetchIMDRFDocuments());
    fetchers.push(fetchIMDRFConsultations());
    fetchers.push(fetchIMDRFNews());
    fetchers.push(fetchEURLexRSS());
    fetchers.push(fetchWHONewsRSS());
  }

  // ── Health Canada (Project Orbis partner — relevant for Global) ────
  if (wantsGlobal(profile)) {
    fetchers.push(fetchHCSafetyReviews());
    fetchers.push(fetchHCRecalls());
    if (wantsPharma(profile)) {
      fetchers.push(fetchHCDrugProduct());
      fetchers.push(fetchHCNoticeOfCompliance());
    }
    if (wantsDevices(profile)) {
      fetchers.push(fetchHCMedicalDevices());
    }
  }

  // ── TGA Australia (Project Orbis partner — relevant for Global) ────
  if (wantsGlobal(profile)) {
    fetchers.push(fetchTGAAlerts());
    fetchers.push(fetchTGAAusPAR());
    if (wantsPharma(profile)) {
      fetchers.push(fetchTGARxUnderEvaluation());
    }
    if (wantsDevices(profile)) {
      fetchers.push(fetchTGADeviceRecalls());
    }
  }

  // ── PMDA Japan (Project Orbis partner — relevant for Global) ───────
  if (wantsGlobal(profile)) {
    fetchers.push(fetchPMDAApprovals());
    fetchers.push(fetchPMDASafety());
    if (wantsDevices(profile)) {
      fetchers.push(fetchPMDADevices());
    }
  }

  // ── Industry analysis (always included) ────────────────────────────
  fetchers.push(fetchRAPSRSS());
  fetchers.push(fetchEmergoRadar());
  fetchers.push(fetchCovington());
  fetchers.push(fetchSteptoe());

  // ── Standards (device-focused) ─────────────────────────────────────
  if (wantsDevices(profile)) {
    fetchers.push(fetchIntertekStandards());
    fetchers.push(fetchULStandards());
    fetchers.push(fetchTUVSudStandards());
    fetchers.push(fetchBSIStandards());
    fetchers.push(fetchDEKRAStandards());
    fetchers.push(fetchSGSStandards());
    fetchers.push(fetchIECISOStandards());
    fetchers.push(fetchEUHarmonisedStandards());
  }

  // ── Podcasts (always included) ─────────────────────────────────────
  fetchers.push(fetchFDAVoicesPodcast());
  fetchers.push(fetchRAPSPodcast());
  fetchers.push(fetchEmergoPodcast());

  // Wrap each fetcher with a 60-second timeout so slow Firecrawl calls
  // don't hold up the entire poll indefinitely.
  const FETCHER_TIMEOUT_MS = 60_000;
  const timedFetchers = fetchers.map((p) =>
    Promise.race([
      p,
      new Promise<SignalDraft[]>((_, reject) =>
        setTimeout(() => reject(new Error("fetcher timeout")), FETCHER_TIMEOUT_MS)
      ),
    ])
  );

  const results = await Promise.allSettled(timedFetchers);
  const drafts: SignalDraft[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      drafts.push(...result.value);
    } else {
      const reason = (result as PromiseRejectedResult).reason;
      if (String(reason).includes("timeout")) {
        console.warn("[fetcher-orchestrator] fetcher timed out (>60s), skipped");
      } else {
        console.error("[fetcher-orchestrator] fetcher failed:", reason);
      }
    }
  }

  console.log(
    `[fetcher-orchestrator] ${drafts.length} total drafts from ${fetchers.length} fetchers for profile ${profile.id}`
  );

  return drafts;
}
