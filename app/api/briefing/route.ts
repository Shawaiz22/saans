/**
 * @file route.ts
 * @description API endpoint for Saans Civic Air Quality Briefing Studio.
 * Ingests raw tabular data, runs deterministic hygiene audits, calculates NAQI statistics,
 * calls Gemini GenAI engine with role-tailored prompt, verifies all cited row findings and actions,
 * and returns the complete verified civic brief.
 */

import { NextRequest, NextResponse } from "next/server";
import { BriefingRequestSchema } from "@/lib/schemas";
import { parseAirQualityData } from "@/lib/parse";
import { auditDataQuality } from "@/lib/quality";
import { calculateLocationStats, identifyHotspots } from "@/lib/stats";
import { generateCivicBriefing } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const validated = BriefingRequestSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload",
          details: validated.error.issues,
        },
        { status: 400 }
      );
    }

    const {
      csvText,
      audienceRole,
      targetLanguages,
      readingLevels,
      previousBrief,
    } = validated.data;

    // Step 1: Parse raw CSV / TSV / pasted text
    const parseResult = parseAirQualityData(csvText);

    if (parseResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No data rows could be extracted from input. Please provide valid tabular data.",
          warnings: parseResult.warnings,
        },
        { status: 400 }
      );
    }

    // Step 2: Deterministic Sensor Audit & Unit Normalization
    const auditResult = auditDataQuality(parseResult.rows, parseResult.mapping);

    // Step 3: Descriptive Statistics & NAQI Classification
    const stats = calculateLocationStats(
      auditResult.cleanedRows,
      parseResult.mapping,
      auditResult.missingByLocationPollutant
    );

    // Step 4: Identify Hotspots
    const hotspots = identifyHotspots(stats);

    // Step 5: GenAI Briefing Generation & Deterministic Verification
    const brief = await generateCivicBriefing({
      audienceRole,
      targetLanguages,
      readingLevels,
      stats,
      hotspots,
      flags: auditResult.flags,
      rows: auditResult.cleanedRows,
      totalMissing: auditResult.totalMissing,
      previousBrief,
    });

    return NextResponse.json({
      success: true,
      brief,
      audit: {
        totalRows: parseResult.rows.length,
        totalMissing: auditResult.totalMissing,
        totalFlags: auditResult.totalFlags,
        flagsByType: auditResult.flagsByType,
        flags: auditResult.flags,
        missingByLocationPollutant: auditResult.missingByLocationPollutant,
      },
      stats,
      hotspots,
      mapping: parseResult.mapping,
      rows: auditResult.cleanedRows,
      warnings: parseResult.warnings,
    });
  } catch (error: unknown) {
    console.error("Error generating civic air quality briefing:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate briefing",
        message,
      },
      { status: 500 }
    );
  }
}

