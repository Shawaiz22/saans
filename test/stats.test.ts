import { describe, it, expect } from "vitest";
import { parseAirQualityData } from "../lib/parse";
import { auditDataQuality } from "../lib/quality";
import {
  calculateLocationStats,
  getIndiaNAQICategory,
  calculateTrend,
  identifyHotspots,
} from "../lib/stats";

describe("stats.ts", () => {
  it("determines India NAQI categories correctly for PM2.5 and PM10", () => {
    // PM2.5 breakpoints: 0-30 Good, 31-60 Satisfactory, 61-90 Moderate, 91-120 Poor, 121-250 Very Poor, >250 Severe
    expect(getIndiaNAQICategory("pm25", 25)).toBe("Good");
    expect(getIndiaNAQICategory("pm25", 55)).toBe("Satisfactory");
    expect(getIndiaNAQICategory("pm25", 85)).toBe("Moderate");
    expect(getIndiaNAQICategory("pm25", 110)).toBe("Poor");
    expect(getIndiaNAQICategory("pm25", 210)).toBe("Very Poor");
    expect(getIndiaNAQICategory("pm25", 350)).toBe("Severe");

    // PM10 breakpoints: 0-50 Good, 51-100 Satisfactory, 101-250 Moderate, 251-350 Poor, 351-430 Very Poor, >430 Severe
    expect(getIndiaNAQICategory("pm10", 40)).toBe("Good");
    expect(getIndiaNAQICategory("pm10", 80)).toBe("Satisfactory");
    expect(getIndiaNAQICategory("pm10", 180)).toBe("Moderate");
    expect(getIndiaNAQICategory("pm10", 300)).toBe("Poor");
    expect(getIndiaNAQICategory("pm10", 400)).toBe("Very Poor");
    expect(getIndiaNAQICategory("pm10", 480)).toBe("Severe");
  });

  it("calculates trend directions accurately", () => {
    expect(calculateTrend(100, 150)).toBe("rising");
    expect(calculateTrend(150, 100)).toBe("falling");
    expect(calculateTrend(100, 102)).toBe("steady");
    expect(calculateTrend(null, 100)).toBe("insufficient_data");
  });

  it("computes count, missing, mean, max, and halves trend per location and pollutant", () => {
    const csv = `Ward,Time,PM2.5
Ward A,08:00,50
Ward A,09:00,60
Ward A,10:00,NA
Ward A,11:00,100
Ward A,12:00,120`;
    const parsed = parseAirQualityData(csv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);
    const stats = calculateLocationStats(audit.cleanedRows, parsed.mapping, audit.missingByLocationPollutant);

    expect(stats.length).toBe(1);
    const s = stats[0];
    expect(s.location).toBe("Ward A");
    expect(s.pollutant).toBe("pm25");
    expect(s.count).toBe(4); // 4 valid readings (50, 60, 100, 120)
    expect(s.missing).toBe(1); // 1 missing (NA)
    expect(s.mean).toBe(82.5); // (50 + 60 + 100 + 120) / 4
    expect(s.max).toBe(120);
    // first half: [50, 60] -> 55, second half: [100, 120] -> 110
    expect(s.firstHalfMean).toBe(55);
    expect(s.secondHalfMean).toBe(110);
    expect(s.trend).toBe("rising");
    expect(s.naqiCategory).toBe("Moderate");
  });

  it("identifies hotspot locations correctly", () => {
    const stats = [
      {
        location: "Ward Clean",
        pollutant: "pm25",
        count: 10,
        missing: 0,
        mean: 35,
        max: 45,
        firstHalfMean: 35,
        secondHalfMean: 35,
        trend: "steady" as const,
        naqiCategory: "Satisfactory" as const,
      },
      {
        location: "Ward Hotspot",
        pollutant: "pm25",
        count: 10,
        missing: 0,
        mean: 280,
        max: 390,
        firstHalfMean: 180,
        secondHalfMean: 380,
        trend: "rising" as const,
        naqiCategory: "Severe" as const,
      },
    ];

    const hotspots = identifyHotspots(stats);
    expect(hotspots).toContain("Ward Hotspot");
    expect(hotspots).not.toContain("Ward Clean");
  });
});

