import Anthropic from "@anthropic-ai/sdk";
import {
  SignalDraft,
  Signal,
  Region,
  Domain,
  ImpactType,
  ImpactSeverity,
  LifecycleStage,
} from "./types";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const VALID_REGIONS: Region[] = ["US", "EU", "UK", "Canada", "Australia", "Japan", "Switzerland", "Global"];
const VALID_DOMAINS: Domain[] = ["devices", "pharma"];
const VALID_IMPACT_TYPES: ImpactType[] = [
  "guidance_draft", "guidance_final", "safety_alert", "recall", "approval",
  "designation", "trial_update", "meeting_minutes", "consultation", "legislation",
  "enforcement", "advisory_committee", "workshop", "press_release", "podcast",
  "standard_update", "analysis", "other",
];
const VALID_SEVERITIES: ImpactSeverity[] = ["high", "medium", "low"];
const VALID_LIFECYCLE: LifecycleStage[] = [
  "pre_submission", "submission", "review", "approval", "post_market", "withdrawal", "other",
];

const SYSTEM_PROMPT = `You are a regulatory intelligence analyst for the pharmaceutical and medical device industry.

Given a raw regulatory signal (title, summary, source, authority), do TWO things:

1. CLASSIFY it into structured fields.
2. Write a 3-5 sentence ANALYSIS paragraph that explains:
   - What happened and why it matters
   - Who is affected (which companies, product types, therapeutic areas)
   - What regulatory professionals should do about it
   - Any broader pattern or trend this fits into

Write the analysis in the voice of an experienced regulatory affairs professional briefing their team. Be specific and analytical, not generic.

Return ONLY valid JSON with exactly these fields:
{
  "region": one of ${JSON.stringify(VALID_REGIONS)},
  "domains": array of ${JSON.stringify(VALID_DOMAINS)},
  "therapeutic_areas": array of strings — use these standard labels when applicable: "oncology", "cardiology", "neurology", "orthopedics", "endocrinology", "immunology", "dermatology", "ophthalmology", "gastroenterology", "pulmonology", "hematology", "nephrology", "infectious disease", "rare disease", "wound care", "dental", "SaMD", "respiratory", "psychiatry", "pediatrics". Tag ALL that could be relevant, even indirectly (e.g. a cardiac device recall → "cardiology"; a diabetes drug approval → "endocrinology"; a general oncology safety alert → "oncology").
  "product_types": array of strings from ["SaMD", "IVD", "implant", "drug", "biologic", "combo_product", "generic", "biosimilar", "OTC", "vaccine", "gene_therapy", "cell_therapy", "AI_ML"],
  "product_classes": array of strings from ["Class I", "Class II", "Class IIa", "Class IIb", "Class III"],
  "lifecycle_stage": one of ${JSON.stringify(VALID_LIFECYCLE)},
  "impact_type": one of ${JSON.stringify(VALID_IMPACT_TYPES)},
  "impact_severity": one of ${JSON.stringify(VALID_SEVERITIES)},
  "ai_analysis": string (3-5 sentence analytical paragraph)
}

Rules:
- "domains" can include both "devices" and "pharma" if the signal is relevant to both.
- "therapeutic_areas" should include ALL therapeutic areas that the signal could be relevant to. Be generous — if a drug treats heart failure, tag it "cardiology". If a device is used in orthopedic surgery, tag it "orthopedics". If a safety alert involves a chemotherapy drug, tag it "oncology" and "hematology". Only use empty [] for purely administrative signals with no clinical relevance (e.g. fee schedule changes, general cGMP guidance).
- "product_types" should be empty [] if the signal is not specific to any product type.
- "product_classes" should be empty [] if no device classification is mentioned.
- For impact_severity: "high" = guidance (draft or final), final rules, safety alerts, recalls, major approvals, legislation; "medium" = consultations, meeting highlights, routine approvals; "low" = general news, podcasts, workshops. Guidance changes have the highest regulatory implications — always use "high" for guidance_draft and guidance_final.
- If the source authority is a test house (Intertek, UL, TÜV, BSI, DEKRA, SGS) or mentions IEC/ISO standards, set impact_type to "standard_update".
- Region mapping by authority: Health Canada → "Canada", TGA → "Australia", PMDA → "Japan", Swissmedic → "Switzerland", IMDRF/WHO/ICH → "Global". Do NOT use "Global" for country-specific authorities.
- The ai_analysis should be substantive and specific, NOT generic filler. Name companies, products, regulations, and implications.
- Return ONLY the JSON object, no markdown fences, no explanation.`;

interface ClassificationResult {
  region: Region;
  domains: Domain[];
  therapeutic_areas: string[];
  product_types: string[];
  product_classes: string[];
  lifecycle_stage: LifecycleStage;
  impact_type: ImpactType;
  impact_severity: ImpactSeverity;
  ai_analysis: string;
}

export async function classifySignal(
  draft: SignalDraft,
  rawEventId: string
): Promise<Signal> {
  const userMessage = `Title: ${draft.title}
Summary: ${draft.summary}
Source: ${draft.source_id}
Authority: ${draft.authority}
URL: ${draft.url}
Published: ${draft.published_at}
Region hint: ${draft.region_hint || "unknown"}
Domain hint: ${draft.domain_hint || "unknown"}`;

  try {
    const response = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    let text =
      response.content[0].type === "text" ? response.content[0].text : "";
    // Strip markdown JSON fences if present (Claude sometimes wraps output)
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed: ClassificationResult = JSON.parse(text);

    return {
      id: "",
      raw_event_id: rawEventId,
      source_id: draft.source_id,
      url: draft.url,
      title: draft.title,
      summary: draft.summary,
      published_at: draft.published_at,
      authority: draft.authority,
      document_id: draft.document_id,
      region: VALID_REGIONS.includes(parsed.region) ? parsed.region : (draft.region_hint ?? "US"),
      domains: parsed.domains?.filter((d) => VALID_DOMAINS.includes(d)) || (draft.domain_hint ? [draft.domain_hint] : ["pharma"]),
      therapeutic_areas: parsed.therapeutic_areas || [],
      product_types: parsed.product_types || [],
      product_classes: parsed.product_classes || [],
      lifecycle_stage: VALID_LIFECYCLE.includes(parsed.lifecycle_stage) ? parsed.lifecycle_stage : "other",
      impact_type: VALID_IMPACT_TYPES.includes(parsed.impact_type) ? parsed.impact_type : "other",
      impact_severity: VALID_SEVERITIES.includes(parsed.impact_severity) ? parsed.impact_severity : "medium",
      ai_analysis: parsed.ai_analysis || "",
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[classifier] failed for "${draft.title}":`, err);
    return {
      id: "",
      raw_event_id: rawEventId,
      source_id: draft.source_id,
      url: draft.url,
      title: draft.title,
      summary: draft.summary,
      published_at: draft.published_at,
      authority: draft.authority,
      document_id: draft.document_id,
      region: draft.region_hint ?? "US",
      domains: draft.domain_hint ? [draft.domain_hint] : ["pharma"],
      therapeutic_areas: [],
      product_types: [],
      product_classes: [],
      lifecycle_stage: "other",
      impact_type: "other",
      impact_severity: "medium",
      ai_analysis: "",
      created_at: new Date().toISOString(),
    };
  }
}
