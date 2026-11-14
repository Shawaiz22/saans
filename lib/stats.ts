/**
 * @file stats.ts
 * @description Pure statistical analysis functions for civic air quality datasets.
 * Computes per-location and per-pollutant metrics: count, missing, mean, max,
 * first-half vs second-half mean (trend: rising/falling/steady), and official India NAQI categories
 * for PM2.5 and PM10 based on Central Pollution Control Board (CPCB) standards.
 */

import { Row, LocationStats, NAQICategory, TrendDirection } from "./types";
import { ColumnMapping } from "./parse";

/**
 * Maps a pollutant concentration to India National Air Quality Index (NAQI) category.
 * Reference: Central Pollution Control Board (CPCB) 24-hour National Air Quality Index breakpoints.
 *
 * @param pollutant - Canonical pollutant identifier ("pm25", "pm10", etc.).
 * @param concentration - Numeric concentration in µg/m³.
 * @returns NAQICategory ("Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe" | "N/A").
 */
export function getIndiaNAQICategory(
  pollutant: string,
  concentration: number | null
): NAQICategory {
  if (concentration === null || concentration === undefined || isNaN(concentration)) {
    return "N/A";
  }

  const p = pollutant.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (p === "pm25") {
    if (concentration <= 30) return "Good";
    if (concentration <= 60) return "Satisfactory";
    if (concentration <= 90) return "Moderate";
    if (concentration <= 120) return "Poor";
    if (concentration <= 250) return "Very Poor";
    return "Severe";
  }

  if (p === "pm10") {
    if (concentration <= 50) return "Good";
    if (concentration <= 100) return "Satisfactory";
    if (concentration <= 250) return "Moderate";
    if (concentration <= 350) return "Poor";
    if (concentration <= 430) return "Very Poor";
    return "Severe";
  }

  if (p === "no2") {
    if (concentration <= 40) return "Good";
    if (concentration <= 80) return "Satisfactory";
    if (concentration <= 180) return "Moderate";
    if (concentration <= 280) return "Poor";
    if (concentration <= 400) return "Very Poor";
    return "Severe";
  }

  if (p === "so2") {
    if (concentration <= 40) return "Good";
    if (concentration <= 80) return "Satisfactory";
    if (concentration <= 380) return "Moderate";
    if (concentration <= 800) return "Poor";
    if (concentration <= 1600) return "Very Poor";
    return "Severe";
  }

  return "N/A";
}

/**
 * Evaluates the directional trend between the first chronological half and second half of readings.
 *
 * @param firstHalfMean - Mean concentration of the first temporal half.
 * @param secondHalfMean - Mean concentration of the second temporal half.
 * @param thresholdPct - Minimum percentage shift to trigger rising/falling (default: 5%).
 * @returns TrendDirection ("rising" | "falling" | "steady" | "insufficient_data").
 */
export function calculateTrend(
  firstHalfMean: number | null,
  secondHalfMean: number | null,
  thresholdPct: number = 0.05
): TrendDirection {
  if (firstHalfMean === null || secondHalfMean === null) {
    return "insufficient_data";
  }

  // Handle zero base
  if (firstHalfMean === 0) {
    if (secondHalfMean > 0) return "rising";
    return "steady";
  }

  const ratio = (secondHalfMean - firstHalfMean) / firstHalfMean;

  if (ratio > thresholdPct) {
    return "rising";
  }
  if (ratio < -thresholdPct) {
    return "falling";
  }
  return "steady";
}

/**
 * Computes descriptive statistics and NAQI classifications per location and pollutant.
 *
 * @param cleanedRows - Cleaned dataset rows with normalized µg/m³ values.
 * @param mapping - Detected column mapping.
 * @param missingByLocationPollutant - Pre-calculated missing counts by code.
 * @returns Array of LocationStats objects for each location and pollutant.
 */
export function calculateLocationStats(
  cleanedRows: Row[],
  mapping: ColumnMapping,
  missingByLocationPollutant?: Record<string, Record<string, number>>
): LocationStats[] {
  // Group rows by location in original chronological order
  const rowsByLocation: Record<string, Row[]> = {};
  for (const row of cleanedRows) {
    if (!rowsByLocation[row.location]) {
      rowsByLocation[row.location] = [];
    }
    rowsByLocation[row.location].push(row);
  }

  const statsList: LocationStats[] = [];

  for (const [location, locRows] of Object.entries(rowsByLocation)) {
    for (const polKey of Object.keys(mapping.pollutantColumns)) {
      const validReadings: number[] = [];
      let missingCount = 0;

      for (const row of locRows) {
        const val = row.pollutants[polKey];
        if (val !== null && val !== undefined && !isNaN(val)) {
          validReadings.push(val);
        } else {
          missingCount++;
        }
      }

      // If pre-computed missing count is available, prefer it
      if (missingByLocationPollutant?.[location]?.[polKey] !== undefined) {
        missingCount = missingByLocationPollutant[location][polKey];
      }

      const count = validReadings.length;

      if (count === 0) {
        statsList.push({
          location,
          pollutant: polKey,
          count: 0,
          missing: missingCount,
          mean: null,
          max: null,
          median: null,
          firstHalfMean: null,
          secondHalfMean: null,
          trend: "insufficient_data",
          naqiCategory: "N/A",
        });
        continue;
      }

      // Mean & Max
      const sum = validReadings.reduce((acc, v) => acc + v, 0);
      const mean = Math.round((sum / count) * 10) / 10;
      const max = Math.round(Math.max(...validReadings) * 10) / 10;

      // Median
      const sorted = [...validReadings].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 !== 0
          ? sorted[mid]
          : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;

      // First-half vs Second-half Mean
      // Split the chronological sequence of valid readings
      const halfIndex = Math.floor(validReadings.length / 2);
      let firstHalfMean: number | null = null;
      let secondHalfMean: number | null = null;

      if (validReadings.length >= 2) {
        const firstHalf = validReadings.slice(0, halfIndex);
        const secondHalf = validReadings.slice(halfIndex);

        if (firstHalf.length > 0) {
          const sum1 = firstHalf.reduce((acc, v) => acc + v, 0);
          firstHalfMean = Math.round((sum1 / firstHalf.length) * 10) / 10;
        }

        if (secondHalf.length > 0) {
          const sum2 = secondHalf.reduce((acc, v) => acc + v, 0);
          secondHalfMean = Math.round((sum2 / secondHalf.length) * 10) / 10;
        }
      } else {
        firstHalfMean = mean;
        secondHalfMean = mean;
      }

      const trend =
        validReadings.length >= 2
          ? calculateTrend(firstHalfMean, secondHalfMean)
          : "steady";

      const naqiCategory = getIndiaNAQICategory(polKey, mean);

      statsList.push({
        location,
        pollutant: polKey,
        count,
        missing: missingCount,
        mean,
        max,
        median,
        firstHalfMean,
        secondHalfMean,
        trend,
        naqiCategory,
      });
    }
  }

  return statsList;
}

export const locationStats = calculateLocationStats;

/**
 * Identifies high-risk hotspot locations based on severe NAQI classifications,
 * rising particulate matter concentrations, or extreme maximums.
 *
 * @param stats - Aggregated location statistics.
 * @returns Array of unique location names identified as hotspots.
 */
export function identifyHotspots(stats: LocationStats[]): string[] {
  const hotspotSet = new Set<string>();

  for (const s of stats) {
    // Severe or Very Poor PM2.5/PM10
    if (s.naqiCategory === "Severe" || s.naqiCategory === "Very Poor") {
      hotspotSet.add(s.location);
    }

    // Rising PM2.5 with Poor or worse air
    if (s.pollutant === "pm25" && s.trend === "rising" && (s.mean ?? 0) >= 90) {
      hotspotSet.add(s.location);
    }

    // Extreme single peak
    if (s.pollutant === "pm25" && (s.max ?? 0) >= 250) {
      hotspotSet.add(s.location);
    }
  }

  return Array.from(hotspotSet);
}

