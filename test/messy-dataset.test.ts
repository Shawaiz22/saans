import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseAirQualityData } from "../lib/parse";
import { auditDataQuality } from "../lib/quality";
import { calculateLocationStats, identifyHotspots } from "../lib/stats";

describe("ward-aq-messy.csv full pipeline integration test", () => {
  const filePath = path.resolve(process.cwd(), "public/samples/ward-aq-messy.csv");
  const rawCsv = fs.readFileSync(filePath, "utf-8");

  it("parses the 4 wards, 2 days dataset completely", () => {
    const parseResult = parseAirQualityData(rawCsv);
    expect(parseResult.rows.length).toBeGreaterThanOrEqual(40);

    const locations = Array.from(new Set(parseResult.rows.map((r) => r.location)));
    expect(locations).toHaveLength(4);
    expect(locations).toContain("Ward 45 (Industrial)");
    expect(locations).toContain("Ward 12 (Central Indiranagar)");
    expect(locations).toContain("Ward 07 (Lalbagh Green)");
    expect(locations).toContain("Ward 88 (Old Market)");
  });

  it("identifies all data quality defects deterministically by code", () => {
    const parsed = parseAirQualityData(rawCsv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);

    // Missing counts
    expect(audit.totalMissing).toBeGreaterThan(0);
    expect(audit.flagsByType.missing).toBeGreaterThan(0);

    // Negative values
    expect(audit.flagsByType.negative).toBeGreaterThanOrEqual(1);
    const negFlag = audit.flags.find((f) => f.type === "negative");
    expect(negFlag?.location).toContain("Ward 88");

    // Unit mismatch
    expect(audit.flagsByType.unit_mismatch).toBeGreaterThan(0);
    const unitFlag = audit.flags.find((f) => f.type === "unit_mismatch");
    expect(unitFlag?.location).toContain("Ward 88");

    // Spike > 5x median
    expect(audit.flagsByType.spike).toBeGreaterThanOrEqual(1);
    const spikeFlag = audit.flags.find((f) => f.type === "spike");
    expect(spikeFlag?.location).toContain("Ward 12");

    // Stuck sensor 6+ times
    expect(audit.flagsByType.stuck_sensor).toBeGreaterThanOrEqual(6);
    const stuckFlag = audit.flags.find((f) => f.type === "stuck_sensor");
    expect(stuckFlag?.location).toContain("Ward 07");
  });

  it("identifies Ward 45 as a rising severe hotspot", () => {
    const parsed = parseAirQualityData(rawCsv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);
    const stats = calculateLocationStats(audit.cleanedRows, parsed.mapping, audit.missingByLocationPollutant);

    const ward45Stats = stats.find((s) => s.location.includes("Ward 45") && s.pollutant === "pm25");
    expect(ward45Stats).toBeDefined();
    expect(ward45Stats?.trend).toBe("rising");
    expect(ward45Stats?.naqiCategory).toBe("Severe");

    const hotspots = identifyHotspots(stats);
    expect(hotspots).toContain("Ward 45 (Industrial)");
  });
});

