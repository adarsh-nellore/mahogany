# Mahogany Data Sources

Regulatory intelligence signals are fetched from **60+ sources** across regions and domains. The `fetchSignalsForProfile` orchestrator in `src/lib/fetchers/index.ts` selects sources based on the user profile.

## Source Selection by Profile

| Profile Setting | Sources Included |
|-----------------|------------------|
| **regions: US** | Federal Register, GovInfo RSS, FDA (Guidance, Press, MedWatch, Device Safety, Advisory Calendar, Workshops, PMC/PMR), openFDA (Drug Enforcement, Device Recall, DrugsFDA, 510(k), PMA, MAUDE, Classification), Orange Book, NDC, DailyMed, Orphan Designations |
| **regions: EU** | EMA (News, PRIME, Medicines Under Eval), EU CTIS Trials; if pharma: EMA Guidelines, New Medicines, Consultations, Orphan RSS, CHMP/PRAC Highlights, Union Register, HMA CMDh, Clinical Data, RWD Catalog; if devices: MDCG Documents, MDCG Minutes |
| **regions: UK** | MHRA Alerts, Approvals, Devices |
| **regions: Global** | IMDRF (Documents, Consultations, News), EUR-Lex, WHO News; Health Canada (Safety Reviews, Recalls; pharma: Drug Product, NOC; devices: Medical Devices); TGA Australia (Alerts, AusPAR, Rx Eval, Device Recalls); PMDA Japan (Approvals, Safety, Devices) |
| **domains: pharma** | FDA drug sources, EMA pharma, Health Canada drug, TGA pharma |
| **domains: devices** | FDA device sources, MDCG, Health Canada devices, TGA/PMDA devices |
| **Always** | ClinicalTrials.gov (US/EU/Global), RAPS RSS, Emergo Radar, Covington, Steptoe, FDA Voices, RAPS Podcast, Emergo Podcast |
| **devices + standards** | Intertek, UL, TÜV SÜD, BSI, DEKRA, SGS, IEC/ISO, EU Harmonised Standards |

## Default Profile (Jane Park)

- **Regions:** US, EU
- **Domains:** devices, pharma
- **Therapeutic areas:** cardiology, SaMD
- **Product types:** SaMD, IVD, Implant
- **Tracked products:** CardioSense Pro, PMA P200123
- **Competitors:** Medtronic LINQ, Abbott
- **Frameworks:** 510(k), PMA, MDR 2017/745, ISO 13485

This profile receives **~40 fetchers** including FDA device and pharma, EMA, MDCG, ClinicalTrials, industry analysis, and standards updates.
