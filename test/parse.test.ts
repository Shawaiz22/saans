import { describe, it, expect } from "vitest";
import { parseAirQualityData, detectColumns, detectHeaderUnit, detectPollutantKey } from "../lib/parse";
import fs from "node:fs";
import path from "node:path";

describe("parse.ts", () => {
  it("detects header units correctly", () => {
    expect(detectHeaderUnit("PM 2.5 (mg/m3)")).toBe("mg/m3");
    expect(detectHeaderUnit("PM10 (ug/m3)")).toBe("ug/m3");
    expect(detectHeaderUnit("PM2.5 (µg/m³)")).toBe("ug/m3");
    expect(detectHeaderUnit("NO2")).toBe("unknown");
  });

  it("detects pollutant keys correctly (case-insensitive)", () => {
    expect(detectPollutantKey("pm2.5")).toBe("pm25");
    expect(detectPollutantKey("PM 2.5 (mg/m3)")).toBe("pm25");
    expect(detectPollutantKey("PM10")).toBe("pm10");
    expect(detectPollutantKey("NO2 (ug/m3)")).toBe("no2");
    expect(detectPollutantKey("SO2")).toBe("so2");
    expect(detectPollutantKey("CO")).toBe("co");
  });

  it("detects location and timestamp columns by header name", () => {
    const headers = ["Station", "Recorded_At", "PM2.5", "PM10"];
    const mapping = detectColumns(headers);
    expect(mapping.locationColumn).toBe("Station");
    expect(mapping.timestampColumn).toBe("Recorded_At");
    expect(mapping.pollutantColumns.pm25).toBeDefined();
    expect(mapping.pollutantColumns.pm10).toBeDefined();
  });

  it("assigns sequential 1-based row numbers (1..n) to data rows", () => {
    const csv = `Ward,Time,PM2.5\nWard A,10:00,45\nWard B,11:00,55\nWard C,12:00,65`;
    const result = parseAirQualityData(csv);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].rowNumber).toBe(1);
    expect(result.rows[1].rowNumber).toBe(2);
    expect(result.rows[2].rowNumber).toBe(3);
    expect(result.rows[0].location).toBe("Ward A");
    expect(result.rows[0].pollutants.pm25).toBe(45);
  });

  it("handles TSV and pasted tab-separated data", () => {
    const tsv = `Ward\tTimestamp\tPM2.5\nWard 1\t2026-11-12 08:00\t80\nWard 2\t2026-11-12 09:00\t120`;
    const result = parseAirQualityData(tsv);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].location).toBe("Ward 1");
    expect(result.rows[0].pollutants.pm25).toBe(80);
    expect(result.rows[1].pollutants.pm25).toBe(120);
  });

  it("parses the test input public/samples/ward-aq-messy.csv successfully", () => {
    const filePath = path.resolve(process.cwd(), "public/samples/ward-aq-messy.csv");
    const content = fs.readFileSync(filePath, "utf-8");
    const result = parseAirQualityData(content);

    expect(result.rows.length).toBeGreaterThan(40);
    expect(result.mapping.locationColumn).toBe("Ward");
    expect(result.mapping.timestampColumn).toBe("Timestamp");
    expect(result.rows[0].rowNumber).toBe(1);
  });
});

