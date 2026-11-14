import { describe, it, expect } from "vitest";
import { parseAirQualityData } from "../lib/parse";
import { auditDataQuality, isMissingValue, computeMedian } from "../lib/quality";

describe("quality.ts", () => {
  it("identifies missing tokens accurately", () => {
    expect(isMissingValue("")).toBe(true);
    expect(isMissingValue("NA")).toBe(true);
    expect(isMissingValue("N/A")).toBe(true);
    expect(isMissingValue("-")).toBe(true);
    expect(isMissingValue("null")).toBe(true);
    expect(isMissingValue("nan")).toBe(true);
    expect(isMissingValue("45.2")).toBe(false);
  });

  it("computes medians accurately", () => {
    expect(computeMedian([10, 20, 30])).toBe(20);
    expect(computeMedian([10, 20, 30, 40])).toBe(25);
    expect(computeMedian([])).toBeNull();
  });

  it("detects missing values and counts them by code", () => {
    const csv = `Ward,Time,PM2.5
Ward 1,10:00,50
Ward 1,11:00,NA
Ward 1,12:00,-
Ward 1,13:00,
Ward 1,14:00,null`;
    const parsed = parseAirQualityData(csv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);

    expect(audit.totalMissing).toBe(4);
    expect(audit.flagsByType.missing).toBe(4);
    const missingFlags = audit.flags.filter((f) => f.type === "missing");
    expect(missingFlags.map((f) => f.rowNumber)).toEqual([2, 3, 4, 5]);
  });

  it("detects negative values and flags them with row numbers", () => {
    const csv = `Ward,Time,PM2.5
Ward 2,10:00,45
Ward 2,11:00,-15
Ward 2,12:00,50`;
    const parsed = parseAirQualityData(csv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);

    expect(audit.flagsByType.negative).toBe(1);
    const negFlag = audit.flags.find((f) => f.type === "negative");
    expect(negFlag).toBeDefined();
    expect(negFlag?.rowNumber).toBe(2);
    expect(negFlag?.value).toBe(-15);
    // Negative value should be set to null in cleaned rows to prevent skewing stats
    expect(audit.cleanedRows[1].pollutants.pm25).toBeNull();
  });

  it("detects unit mismatch (mg/m3 vs ug/m3) and converts mg/m3 to ug/m3", () => {
    const csv = `Ward,Time,PM2.5
Ward 3,10:00,0.045 mg/m3
Ward 3,11:00,55`;
    const parsed = parseAirQualityData(csv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);

    expect(audit.flagsByType.unit_mismatch).toBe(1);
    const unitFlag = audit.flags.find((f) => f.type === "unit_mismatch");
    expect(unitFlag).toBeDefined();
    expect(unitFlag?.rowNumber).toBe(1);
    // Converted 0.045 mg/m3 to 45 ug/m3
    expect(audit.cleanedRows[0].pollutants.pm25).toBe(45);
    expect(audit.cleanedRows[1].pollutants.pm25).toBe(55);
  });

  it("detects severe spikes where reading is > 5x the location median", () => {
    const csv = `Ward,Time,PM2.5
Ward 4,10:00,30
Ward 4,11:00,32
Ward 4,12:00,35
Ward 4,13:00,34
Ward 4,14:00,200`; // median ~ 33.5, 200 > 5 * 33.5 (167.5)
    const parsed = parseAirQualityData(csv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);

    expect(audit.flagsByType.spike).toBe(1);
    const spikeFlag = audit.flags.find((f) => f.type === "spike");
    expect(spikeFlag?.rowNumber).toBe(5);
    expect(spikeFlag?.value).toBe(200);
  });

  it("detects stuck sensor when the same value repeats 6+ consecutive times for a location", () => {
    const csv = `Ward,Time,PM2.5
Ward 5,01:00,28.4
Ward 5,02:00,28.4
Ward 5,03:00,28.4
Ward 5,04:00,28.4
Ward 5,05:00,28.4
Ward 5,06:00,28.4
Ward 5,07:00,28.4
Ward 5,08:00,35.0`;
    const parsed = parseAirQualityData(csv);
    const audit = auditDataQuality(parsed.rows, parsed.mapping);

    expect(audit.flagsByType.stuck_sensor).toBeGreaterThanOrEqual(6);
    const stuckFlags = audit.flags.filter((f) => f.type === "stuck_sensor");
    expect(stuckFlags.map((f) => f.rowNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

