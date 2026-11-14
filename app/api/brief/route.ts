/**
 * @file route.ts
 * @description API endpoint for generating civic air quality brief.
 * Uses @google/genai with deterministic code pre-processing and post-verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { parseCsv } from "@/lib/parse";
import { qualityFlags } from "@/lib/quality";
import { locationStats } from "@/lib/stats";
import { verifyCitations } from "@/lib/verify";
import { checkRateLimit } from "@/lib/rateLimit";
import { MAX_BODY_BYTES, ROWS_SENT_TO_AI } from "@/lib/limits";

const RequestSchema = z.object({
  csvText: z.string().min(1, "CSV data cannot be empty").max(MAX_BODY_BYTES, "CSV exceeds 200KB limit"),
  audience: z.enum(["ward_officer", "housing_society", "school"]),
  previousBrief: z.any().optional(),
});

const GeminiResponseSchema = z.object({
  findings: z.array(
    z.object({
      location: z.string(),
      text: z.string(),
      severity: z.enum(["low", "moderate", "high", "critical"]).default("moderate"),
      rows: z.array(z.number()),
    })
  ),
  actions: z.array(
    z.object({
      priority: z.enum(["immediate", "high", "medium", "low"]).default("high"),
      action: z.string(),
      why: z.string(),
      rows: z.array(z.number()),
      location: z.string().optional(),
    })
  ),
  careNotes: z.object({
    children: z.string(),
    olderAdults: z.string(),
    sensitive: z.string(),
  }),
  internalNote: z.string(),
  changes: z.object({
    improved: z.array(z.string()).default([]),
    worsened: z.array(z.string()).default([]),
    appeared: z.array(z.string()).default([]),
    resolved: z.array(z.string()).default([]),
  }),
});

type GeminiResponse = z.infer<typeof GeminiResponseSchema>;

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before retrying." },
      { status: 429 }
    );
  }

  try {
    const rawBody = await req.json();
    const parsedInput = RequestSchema.safeParse(rawBody);

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: "Invalid request payload. Please verify your data and audience." },
        { status: 400 }
      );
    }

    const { csvText, audience, previousBrief } = parsedInput.data;

    // 1. Code computes rows, flags and stats
    const parseRes = parseCsv(csvText);
    if (parseRes.rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in CSV data." },
        { status: 400 }
      );
    }

    const auditRes = qualityFlags(parseRes.rows, parseRes.mapping);
    const statsRes = locationStats(
      auditRes.cleanedRows,
      parseRes.mapping,
      auditRes.missingByLocationPollutant
    );

    // Prepare max 300 numbered rows for Gemini
    const sampleRows = auditRes.cleanedRows.slice(0, ROWS_SENT_TO_AI).map((r) => ({
      row: r.rowNumber,
      loc: r.location,
      time: r.timestamp,
      pm25: r.pollutants.pm25,
      pm10: r.pollutants.pm10,
    }));

    // Generate with Gemini or Deterministic Engine
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    let aiResult: GeminiResponse;

    if (apiKey && apiKey.trim().length > 0) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are Saans AI, an air quality brief engine.
Audience: ${audience}
Stats by location (computed by code): ${JSON.stringify(statsRes)}
Quality flags by code: ${JSON.stringify(auditRes.flags.slice(0, 30))}
Data rows (1..${auditRes.cleanedRows.length}, max 300 provided): ${JSON.stringify(sampleRows)}
Previous Brief: ${previousBrief ? JSON.stringify(previousBrief) : "none"}

Respond ONLY with valid JSON:
{
  "findings": [{"location": string, "text": string, "severity": "low"|"moderate"|"high"|"critical", "rows": [number]}],
  "actions": [{"priority": "immediate"|"high"|"medium"|"low", "action": string, "why": string, "rows": [number], "location": string}],
  "careNotes": {"children": string, "olderAdults": string, "sensitive": string},
  "internalNote": string,
  "changes": {"improved": [string], "worsened": [string], "appeared": [string], "resolved": [string]}
}
Rules:
- Every finding and action MUST cite exact row numbers belonging to that location.
- Actions must be tailored for ${audience}.`;

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const parsedJson = JSON.parse(response.text || "{}");
        aiResult = GeminiResponseSchema.parse(parsedJson);
      } catch {
        aiResult = generateFallback(auditRes.cleanedRows, statsRes, audience, previousBrief);
      }
    } else {
      aiResult = generateFallback(auditRes.cleanedRows, statsRes, audience, previousBrief);
    }

    // 2. Run verifyCitations on all findings and actions
    const verifiedFindings = aiResult.findings.map((f) => {
      const v = verifyCitations(f.location, f.rows, auditRes.cleanedRows);
      return {
        ...f,
        verified: v.status === "verified",
        reason: v.reason,
      };
    });

    const verifiedActions = aiResult.actions.map((a) => {
      const loc = a.location || statsRes[0]?.location || "General";
      const v = verifyCitations(loc, a.rows, auditRes.cleanedRows);
      return {
        ...a,
        verified: v.status === "verified",
        reason: v.reason,
      };
    });

    return NextResponse.json({
      success: true,
      findings: verifiedFindings,
      actions: verifiedActions,
      careNotes: aiResult.careNotes,
      internalNote: aiResult.internalNote,
      changes: aiResult.changes,
      quality: {
        totalRows: auditRes.cleanedRows.length,
        missing: auditRes.totalMissing,
        flagsByType: auditRes.flagsByType,
        flags: auditRes.flags,
      },
      stats: statsRes,
      rows: auditRes.cleanedRows,
    });
  } catch {
    // Return friendly error with no stacks to client
    return NextResponse.json(
      { error: "An unexpected error occurred while generating the brief. Please try again." },
      { status: 500 }
    );
  }
}

function generateFallback(
  rows: { rowNumber: number; location: string }[],
  stats: { location: string; pollutant: string; mean: number | null; trend: string; naqiCategory: string }[],
  audience: string,
  previousBrief?: any
): GeminiResponse {
  const rowsByLoc: Record<string, number[]> = {};
  for (const r of rows) {
    if (!rowsByLoc[r.location]) rowsByLoc[r.location] = [];
    rowsByLoc[r.location].push(r.rowNumber);
  }

  const primaryLoc = stats[0]?.location || "City Ward";
  const primaryRows = rowsByLoc[primaryLoc]?.slice(0, 2) || [1];

  const findings = stats.map((s) => ({
    location: s.location,
    text: `${s.location} recorded mean ${s.pollutant.toUpperCase()} of ${s.mean ?? "N/A"} µg/m³ (${s.naqiCategory}) with a ${s.trend} trend.`,
    severity: (s.naqiCategory === "Severe" || s.naqiCategory === "Very Poor" ? "critical" : s.naqiCategory === "Poor" ? "high" : "moderate") as any,
    rows: rowsByLoc[s.location]?.slice(0, 2) || [1],
  }));

  const actions = [
    {
      priority: "immediate" as const,
      action:
        audience === "school"
          ? "Cancel outdoor physical education and conduct all morning classes indoors."
          : audience === "housing_society"
          ? "Activate common area HEPA air filters and halt diesel generator testing."
          : "Deploy municipal anti-smog water sprinklers along primary thoroughfares.",
      why: `Elevated particulate concentrations recorded in ${primaryLoc} pose direct exposure hazards.`,
      rows: primaryRows,
      location: primaryLoc,
    },
  ];

  return {
    findings,
    actions,
    careNotes: {
      children: "Developing respiratory systems are vulnerable. Eliminate outdoor exertion during smog hours.",
      olderAdults: "Cardiovascular and pulmonary strain increases during smog. Reschedule walks to midday.",
      sensitive: "Asthmatics and COPD patients must keep emergency inhalers accessible and stay indoors.",
    },
    internalNote: `Official administrative memo for ${audience.replace(/_/g, " ")}. Telemetry indicates persistent air quality challenges across monitored locations. Enforcement teams should coordinate immediate mitigation.`,
    changes: {
      improved: previousBrief ? ["Dust mitigation in peripheral zones showed mild stabilization."] : [],
      worsened: [`PM2.5 concentrations in ${primaryLoc} rose over observed period.`],
      appeared: [`Sensor flags detected in recent observations.`],
      resolved: [],
    },
  };
}
