/**
 * @file gemini.ts
 * @description Google Gemini GenAI integration using the official @google/genai SDK.
 * Summarizes air quality trends and hotspots in plain language, produces prioritized actions
 * tailored to the requesting role (ward officer, housing society, school), drafts internal
 * briefing notes, and generates multi-lingual, accessible citizen advisories.
 */

import { GoogleGenAI } from "@google/genai";
import { Row, LocationStats, QualityFlag, TargetRole, Brief } from "./types";
import { GeminiResponse, GeminiResponseSchema } from "./schemas";
import { ROWS_SENT_TO_AI } from "./limits";
import { verifyFindings, verifyActions } from "./verify";

/**
 * Builds a prompt for Gemini containing deterministic stats, flags, and sampled rows.
 */
function buildGeminiPrompt(params: {
  audienceRole: TargetRole;
  targetLanguages: string[];
  readingLevels: string[];
  stats: LocationStats[];
  hotspots: string[];
  flags: QualityFlag[];
  rows: Row[];
  totalMissing: number;
  previousBrief?: {
    id?: string;
    summary?: string;
    hotspots?: string[];
  } | null;
}): string {
  const {
    audienceRole,
    targetLanguages,
    readingLevels,
    stats,
    hotspots,
    flags,
    rows,
    totalMissing,
    previousBrief,
  } = params;

  // Take a representative sample of rows up to ROWS_SENT_TO_AI
  const sampleRows = rows.slice(0, ROWS_SENT_TO_AI).map((r) => ({
    rowNumber: r.rowNumber,
    location: r.location,
    timestamp: r.timestamp,
    pollutants: r.pollutants,
  }));

  const sampleFlags = flags.slice(0, 50).map((f) => ({
    rowNumber: f.rowNumber,
    location: f.location,
    pollutant: f.pollutant,
    type: f.type,
    message: f.message,
    value: f.value,
  }));

  return `You are Saans AI, an expert Civic Air Quality Analyst and Public Health Communicator.
Generate a comprehensive, data-grounded civic air quality briefing.

REQUESTING STAKEHOLDER ROLE: "${audienceRole}"
TARGET LANGUAGES: ${targetLanguages.join(", ")}
TARGET READING LEVELS: ${readingLevels.join(", ")}

DETERMINISTIC FACTS CALCULATED BY CODE (DO NOT HALLUCINATE OR RE-COUNT MISSING NUMBERS):
- Identified Hotspots: ${hotspots.length > 0 ? hotspots.join(", ") : "None detected"}
- Total Rows: ${rows.length}
- Total Missing Values (computed by code): ${totalMissing}
- Location & Pollutant Statistics:
${JSON.stringify(stats, null, 2)}

DATA QUALITY DEFECT FLAGS DETECTED BY SENSOR AUDIT:
${JSON.stringify(sampleFlags, null, 2)}

REPRESENTATIVE DATA ROWS (1..${rows.length}) FOR CITATION GROUNDING:
${JSON.stringify(sampleRows, null, 2)}

${
  previousBrief
    ? `PREVIOUS BRIEF TO COMPARE AGAINST:
ID: ${previousBrief.id ?? "N/A"}
Summary: ${previousBrief.summary ?? "N/A"}
Previous Hotspots: ${(previousBrief.hotspots ?? []).join(", ")}`
    : "No previous brief provided (first run for this location)."
}

CRITICAL INSTRUCTIONS:
1. TRACEABILITY & CITATIONS:
   - Every single Finding and Action MUST cite the exact row numbers (1..${rows.length}) from the dataset that provide evidence.
   - Cited row numbers MUST belong to the location named in the finding/action. Do not cite rows from another ward.
2. ROLE-PRIORITIZED ACTIONS:
   - For "ward_officer": prioritize municipal road dust washing, traffic diversions, construction stoppage, anti-smog guns, industrial inspections.
   - For "housing_society": prioritize sealing indoor community spaces, HEPA purifiers, DG set restrictions, alerts for morning walkers.
   - For "school": prioritize cancelling outdoor physical education, moving morning assemblies indoors, advising children with asthma, mask advisories.
3. DATA GAPS & SENSOR INTEGRITY:
   - Flag data gaps, missing readings, negative sensor drift, stuck sensors, and unit anomalies explicitly in the briefing note.
4. CITIZEN ADVISORIES:
   - Generate advisories in the requested languages (${targetLanguages.join(", ")}) and reading levels (${readingLevels.join(", ")}).
   - "simple" level: Grade 5 language, short sentences, friendly, free of technical jargon.
   - "standard" level: Informative, civic-grade advisory.
   - Provide dedicated guidance for:
     a) Children (delicate developing lungs, play precautions)
     b) Older Adults (cardiovascular and pulmonary vulnerability)
     c) Sensitive People (asthma, COPD, chronic conditions, inhaler readiness)
     d) General Citizens
   - Each advisory MUST include concrete DOs and DON'Ts.
5. PREVIOUS BRIEF COMPARISON:
   - If previous brief is available, explain what worsened or improved; otherwise provide a concise baseline observation.

OUTPUT FORMAT: Return STRICT valid JSON conforming to this schema without markdown codeblocks or commentary:
{
  "title": string,
  "summary": string,
  "hotspots": string[],
  "findings": [
    {
      "id": string,
      "location": string,
      "pollutant": string,
      "headline": string,
      "description": string,
      "citedRowNumbers": number[],
      "severity": "low" | "moderate" | "high" | "critical"
    }
  ],
  "actions": [
    {
      "id": string,
      "priority": "immediate" | "high" | "medium" | "low",
      "targetRole": "ward_officer" | "housing_society" | "school" | "all",
      "location": string,
      "title": string,
      "action": string,
      "rationale": string,
      "citedRowNumbers": number[]
    }
  ],
  "internalBriefingNote": {
    "title": string,
    "executiveSummary": string,
    "wardBreakdown": string,
    "operationsChecklist": string[]
  },
  "citizenAdvisories": [
    {
      "language": string,
      "readingLevel": "simple" | "standard" | "expert",
      "targetAudience": "general" | "children" | "older_adults" | "sensitive_groups",
      "title": string,
      "content": string,
      "dos": string[],
      "donts": string[]
    }
  ],
  "previousBriefComparison": {
    "trendSummary": string,
    "changes": string[]
  } | null
}`;
}

/**
 * Fallback generator when GEMINI_API_KEY is not configured.
 * Generates grounded, fully traceable civic briefs deterministically.
 */
function generateDeterministicFallbackBrief(params: {
  audienceRole: TargetRole;
  targetLanguages: string[];
  readingLevels: string[];
  stats: LocationStats[];
  hotspots: string[];
  flags: QualityFlag[];
  rows: Row[];
  totalMissing: number;
  previousBrief?: {
    id?: string;
    summary?: string;
    hotspots?: string[];
  } | null;
}): GeminiResponse {
  const { audienceRole, targetLanguages, readingLevels, stats, hotspots, flags, rows, previousBrief } = params;

  // Find rows by location to cite
  const rowsByLoc: Record<string, number[]> = {};
  for (const r of rows) {
    if (!rowsByLoc[r.location]) rowsByLoc[r.location] = [];
    rowsByLoc[r.location].push(r.rowNumber);
  }

  const primaryHotspot = hotspots[0] || stats[0]?.location || "General Wards";
  const hotspotRows = rowsByLoc[primaryHotspot] || [1];

  const findings = stats.map((s, idx) => {
    const locRows = rowsByLoc[s.location] || [1];
    const cited = locRows.slice(0, Math.min(3, locRows.length));
    const isHotspot = hotspots.includes(s.location);

    return {
      id: `finding-${idx + 1}`,
      location: s.location,
      pollutant: s.pollutant.toUpperCase(),
      headline: `${s.location}: ${s.trend.toUpperCase()} ${s.pollutant.toUpperCase()} (NAQI: ${s.naqiCategory})`,
      description: `Mean ${s.pollutant.toUpperCase()} is ${s.mean ?? "N/A"} µg/m³ with a peak of ${s.max ?? "N/A"} µg/m³. First-half mean was ${s.firstHalfMean ?? "N/A"} µg/m³ shifting to ${s.secondHalfMean ?? "N/A"} µg/m³ in the second half, showing a ${s.trend} trajectory.`,
      citedRowNumbers: cited,
      severity: isHotspot ? ("critical" as const) : s.naqiCategory === "Poor" ? ("high" as const) : ("moderate" as const),
    };
  });

  const actions = [
    {
      id: "act-1",
      priority: "immediate" as const,
      targetRole: audienceRole,
      location: primaryHotspot,
      title:
        audienceRole === "school"
          ? "Suspend Outdoor Sports & Morning Assemblies"
          : audienceRole === "housing_society"
          ? "Seal Common Hall & Activate Purifier Hub"
          : "Deploy Anti-Smog Water Misting Cannons",
      action:
        audienceRole === "school"
          ? "Move all physical education and recess activities indoors immediately. Restrict open-air exposure for kindergarten and primary classes."
          : audienceRole === "housing_society"
          ? "Enforce strict ban on open garbage burning, restrict diesel generator usage, and operationalize high-efficiency filters in community clubhouses."
          : "Direct municipal water tankers to mist major arterial roads and halt non-compliant construction activities in hotspot zones.",
      rationale: `Air quality in ${primaryHotspot} has escalated with severe PM2.5 concentrations exceeding safe health thresholds.`,
      citedRowNumbers: hotspotRows.slice(0, 2),
    },
    {
      id: "act-2",
      priority: "high" as const,
      targetRole: audienceRole,
      location: primaryHotspot,
      title: "Establish Vulnerable Citizen Support Protocols",
      action: "Broadcast SMS/WhatsApp advisories advising high-risk individuals, asthmatics, and seniors to remain indoors with windows closed.",
      rationale: "Particulate matter causes acute exacerbations of respiratory conditions among vulnerable demographics.",
      citedRowNumbers: hotspotRows.slice(0, 1),
    },
  ];

  // Citizen advisories
  const citizenAdvisories = [];

  for (const lang of targetLanguages) {
    const isHindi = lang.toLowerCase() === "hi";

    for (const lvl of readingLevels) {
      // General citizen
      citizenAdvisories.push({
        language: lang,
        readingLevel: lvl as "simple" | "standard" | "expert",
        targetAudience: "general" as const,
        title: isHindi
          ? "नागरिक वायु गुणवत्ता सलाह (जनरल)"
          : `Public Air Quality Advisory (${lvl === "simple" ? "Plain Language" : "Standard"})`,
        content: isHindi
          ? `वर्तमान में वायु गुणवत्ता चिंताजनक स्थिति में है। कृपया सुबह की सैर से बचें और आवश्यकता पड़ने पर मास्क का उपयोग करें।`
          : `Current particulate levels in ${primaryHotspot} are hazardous. Limit prolonged outdoor exposure, especially during early morning and late evening peaks.`,
        dos: isHindi
          ? ["घर के दरवाजे और खिड़कियां बंद रखें", "बाहर निकलते समय N95 मास्क पहनें", "खूब पानी पिएं"]
          : [
              "Keep doors and windows closed during peak pollution hours",
              "Wear N95/FFP2 masks when stepping outside",
              "Stay well-hydrated and wash eyes with clean water",
            ],
        donts: isHindi
          ? ["कूड़ा या पत्तियां न जलाएं", "प्रदूषित समय में खुली हवा में दौड़ने से बचें"]
          : [
              "Do not burn garbage, leaves, or biomass",
              "Avoid strenuous outdoor workouts and jogging during smog hours",
              "Do not idle vehicle engines unnecessarily",
            ],
      });

      // Children
      citizenAdvisories.push({
        language: lang,
        readingLevel: lvl as "simple" | "standard" | "expert",
        targetAudience: "children" as const,
        title: isHindi
          ? "बच्चों और स्कूलों के लिए सुरक्षा निर्देश"
          : "Children & Schools Protection Notice",
        content: isHindi
          ? `बच्चों के फेफड़े नाजुक होते हैं। खेलकूद घर के अंदर ही करवाएं और बच्चों को धूल-धुएं से दूर रखें।`
          : `Children breathe faster and take in more air per body weight. Keep recess and playtime indoors until particulate levels subside.`,
        dos: isHindi
          ? ["खेलकूद और प्रार्थना सभा हॉल के भीतर करें", "खांसी या सांस फूलने पर तुरंत डॉक्टर से मिलें"]
          : [
              "Conduct assemblies and physical education classes indoors",
              "Ensure children carry water bottles and stay hydrated",
              "Equip school buses with closed windows during transit",
            ],
        donts: isHindi
          ? ["धुंध के समय बच्चों को बाहर न खेलने दें"]
          : [
              "Do not permit intense outdoor physical exertion in smog",
              "Avoid bus queues near high-traffic traffic junctions",
            ],
      });

      // Older Adults
      citizenAdvisories.push({
        language: lang,
        readingLevel: lvl as "simple" | "standard" | "expert",
        targetAudience: "older_adults" as const,
        title: isHindi
          ? "वरिष्ठ नागरिकों के लिए विशेष स्वास्थ्य परामर्श"
          : "Seniors & Older Adults Health Alert",
        content: isHindi
          ? `बुजुर्गों को सुबह की ठंड और धुंध में बाहर टहलने से बचना चाहिए। घर के भीतर हल्का व्यायाम करें।`
          : `Cold morning air traps toxic particulate matter close to the ground. Older adults should shift walking routines to sunny midday hours indoors.`,
        dos: isHindi
          ? ["नियमित दवाएं समय पर लें", "सुबह की सैर की जगह इनडोर योग करें"]
          : [
              "Take prescribed cardiac and pulmonary medications regularly",
              "Reschedule morning walks to late afternoon or exercise indoors",
              "Monitor blood pressure and pulse regularly",
            ],
        donts: isHindi
          ? ["सुबह 5 से 8 बजे के बीच बाहर न जाएं", "अगरबत्ती या मच्छर कॉइल न जलाएं"]
          : [
              "Do not venture out during early morning temperature inversion hours",
              "Avoid burning incense sticks or mosquito coils in closed rooms",
            ],
      });

      // Sensitive People
      citizenAdvisories.push({
        language: lang,
        readingLevel: lvl as "simple" | "standard" | "expert",
        targetAudience: "sensitive_groups" as const,
        title: isHindi
          ? "अस्थमा एवं सांस के मरीजों के लिए चेतावनी"
          : "Sensitive Groups & Asthma Action Notice",
        content: isHindi
          ? `अस्थमा, ब्रोंकाइटिस और हृदय रोगी विशेष सावधानी बरतें। इनहेलर हमेशा साथ रखें।`
          : `High PM2.5 triggers immediate bronchospasms and airway inflammation. Keep emergency inhalers within reach and avoid all pollution triggers.`,
        dos: isHindi
          ? ["इनहेलर हमेशा साथ रखें", "घर में एयर प्यूरीफायर चालू रखें"]
          : [
              "Keep fast-acting rescue inhalers accessible at all times",
              "Run air purifiers in sleep areas on continuous mode",
              "Consult physician promptly if chest tightness or wheezing occurs",
            ],
        donts: isHindi
          ? ["धुएं वाले इलाकों में जाने से बचें"]
          : [
              "Do not skip preventative inhaler doses",
              "Avoid poorly ventilated spaces with cooking fumes or tobacco smoke",
            ],
      });
    }
  }

  return {
    title: `Saans Civic Air Quality Brief: ${primaryHotspot}`,
    summary: `Analysis of ${rows.length} readings across ${stats.length} ward/pollutant series identifies ${
      hotspots.length > 0 ? hotspots.join(", ") : "localized areas"
    } as urgent air quality hotspots requiring immediate ${audienceRole.replace(/_/g, " ")} countermeasures. Deterministic hygiene audit flagged ${flags.length} sensor anomalies and ${params.totalMissing} missing readings.`,
    hotspots,
    findings,
    actions,
    internalBriefingNote: {
      title: "Administrative Air Quality Operations Record",
      executiveSummary: `Ward-level telemetry indicates critical PM2.5 concentrations in ${primaryHotspot}. Immediate interventions are mandated to protect public health and enforce civic emission limits.`,
      wardBreakdown: stats
        .map(
          (s) =>
            `${s.location}: Mean ${s.pollutant.toUpperCase()} = ${s.mean ?? "N/A"} µg/m³ (${s.naqiCategory}), Trend: ${s.trend}`
        )
        .join("; "),
      operationsChecklist: [
        "Issue municipal compliance notices to construction sites in hotspot wards",
        "Activate high-pressure misting tankers along major ring roads",
        "Dispatch emergency health advisories to school district administrators",
        "Coordinate with traffic police for heavy commercial vehicle diversions",
      ],
    },
    citizenAdvisories,
    previousBriefComparison: previousBrief
      ? {
          trendSummary: `Compared to previous briefing note (${previousBrief.id ?? "earlier"}), air quality in ${primaryHotspot} has shown heightened urgency.`,
          changes: [
            `Active hotspots shifted from [${(previousBrief.hotspots ?? []).join(", ")}] to [${hotspots.join(", ")}]`,
            `Sensor data hygiene audit logged ${flags.length} total quality flags.`,
          ],
        }
      : null,
  };
}

/**
 * Generates an end-to-end civic air quality briefing using Gemini (with deterministic fallback).
 * All findings and actions are deterministically verified against dataset rows.
 */
export async function generateCivicBriefing(params: {
  audienceRole: TargetRole;
  targetLanguages: string[];
  readingLevels: string[];
  stats: LocationStats[];
  hotspots: string[];
  flags: QualityFlag[];
  rows: Row[];
  totalMissing: number;
  previousBrief?: {
    id?: string;
    summary?: string;
    hotspots?: string[];
  } | null;
}): Promise<Brief> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  let rawAiResponse: GeminiResponse;

  if (apiKey && apiKey.trim().length > 0) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = buildGeminiPrompt(params);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2, // low temperature for grounded, factual consistency
        },
      });

      const text = response.text ?? "";
      const json = JSON.parse(text);
      rawAiResponse = GeminiResponseSchema.parse(json);
    } catch (err) {
      console.warn("Gemini API call failed or schema mismatch, falling back to deterministic engine:", err);
      rawAiResponse = generateDeterministicFallbackBrief(params);
    }
  } else {
    rawAiResponse = generateDeterministicFallbackBrief(params);
  }

  // Pure Code Verification of every Finding and Action
  const verifiedFindings = verifyFindings(
    rawAiResponse.findings.map((f, i) => ({
      ...f,
      id: f.id || `finding-${i + 1}`,
    })),
    params.rows
  );

  const verifiedActions = verifyActions(
    rawAiResponse.actions.map((a, i) => ({
      ...a,
      id: a.id || `action-${i + 1}`,
    })),
    params.rows
  );

  const briefId = `brief-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const validRows = params.rows.filter((r) =>
    Object.values(r.pollutants).some((v) => v !== null)
  ).length;

  const flagsByType: Record<string, number> = {};
  for (const f of params.flags) {
    flagsByType[f.type] = (flagsByType[f.type] || 0) + 1;
  }

  let reliabilityAssessment = "High";
  if (params.flags.length > params.rows.length * 0.3 || params.totalMissing > params.rows.length * 0.2) {
    reliabilityAssessment = "Poor - Significant Sensor Faults";
  } else if (params.flags.length > 5 || params.totalMissing > 5) {
    reliabilityAssessment = "Moderate - Gaps and Outliers Detected";
  }

  return {
    id: briefId,
    createdAt: new Date().toISOString(),
    audienceRole: (params.audienceRole === "all" ? "ward_officer" : params.audienceRole) as "ward_officer" | "housing_society" | "school",
    title: rawAiResponse.title || `Civic Air Quality Briefing (${params.audienceRole})`,
    summary: rawAiResponse.summary,
    hotspots: rawAiResponse.hotspots,
    dataQualitySummary: {
      totalRows: params.rows.length,
      validRows,
      missingCount: params.totalMissing,
      flagCount: params.flags.length,
      reliabilityAssessment,
      flagsByType,
    },
    findings: verifiedFindings,
    actions: verifiedActions,
    internalBriefingNote: rawAiResponse.internalBriefingNote,
    citizenAdvisories: rawAiResponse.citizenAdvisories,
    previousBriefComparison: rawAiResponse.previousBriefComparison,
  };
}

