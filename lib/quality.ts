/**
 * @file quality.ts
 * @description Pure functions for deterministic air quality data hygiene and sensor fault detection.
 * Identifies missing values ("", "NA", "N/A", "-", "null"), negative readings, unit mismatches
 * (mg/m3 vs ug/m3), spikes (> 5x location median), and stuck sensor runs (identical value 6+ consecutive times).
 * Handles unit normalization from mg/m3 to ug/m3.
 * All missing counts and defect totals are calculated deterministically by code, never by AI.
 */

import { Row, QualityFlag } from "./types";
import { ColumnMapping } from "./parse";

/**
 * Summary of data hygiene audit results for a dataset.
 */
export interface QualityAuditResult {
  /** All quality flags detected across all rows. */
  flags: QualityFlag[];
  /** Normalized rows with converted units and validated pollutant values. */
  cleanedRows: Row[];
  /** Total count of missing values computed by code. */
  totalMissing: number;
  /** Total count of flags across all defect categories. */
  totalFlags: number;
  /** Counts of flags broken down by defect type. */
  flagsByType: Record<string, number>;
  /** Missing value count broken down by location and pollutant. */
  missingByLocationPollutant: Record<string, Record<string, number>>;
  /** Calculated medians per location and pollutant used for spike detection. */
  medians: Record<string, Record<string, number>>;
}

/**
 * Set of string representations treated as missing/null observations.
 */
const MISSING_TOKENS = new Set([
  "",
  "na",
  "n/a",
  "-",
  "null",
  "nan",
  "none",
  "nil",
  "nd",
  "#n/a",
  "missing",
]);

/**
 * Checks whether a given raw cell string represents a missing or null observation.
 *
 * @param cell - Raw cell string.
 * @returns True if value is considered missing.
 */
export function isMissingValue(cell: unknown): boolean {
  if (cell === null || cell === undefined) return true;
  const str = String(cell).trim().toLowerCase();
  return MISSING_TOKENS.has(str);
}

/**
 * Computes the statistical median of a numeric array.
 *
 * @param values - Array of numbers.
 * @returns Median value or null if empty.
 */
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Performs comprehensive deterministic data quality analysis and unit normalization on parsed rows.
 *
 * @param rows - Normalized rows from parseAirQualityData.
 * @param mapping - Detected column mapping.
 * @returns QualityAuditResult containing all flags, cleaned rows, and defect statistics.
 */
export function auditDataQuality(rows: Row[], mapping: ColumnMapping): QualityAuditResult {
  const flags: QualityFlag[] = [];
  const flagsByType: Record<string, number> = {
    missing: 0,
    negative: 0,
    unit_mismatch: 0,
    spike: 0,
    stuck_sensor: 0,
  };

  const missingByLocationPollutant: Record<string, Record<string, number>> = {};
  let totalMissing = 0;

  // Step 1: Deep clone rows to avoid mutating inputs and initialize cleanedRows
  const cleanedRows: Row[] = rows.map((r) => ({
    ...r,
    pollutants: { ...r.pollutants },
    rawValues: { ...r.rawValues },
    unitNotes: { ...r.unitNotes },
  }));

  // Step 2: Detect missing, negative, and unit mismatches; convert mg/m3 to ug/m3
  for (const row of cleanedRows) {
    const loc = row.location;
    if (!missingByLocationPollutant[loc]) {
      missingByLocationPollutant[loc] = {};
    }

    for (const [polKey, colMeta] of Object.entries(mapping.pollutantColumns)) {
      if (!missingByLocationPollutant[loc][polKey]) {
        missingByLocationPollutant[loc][polKey] = 0;
      }

      // Determine active column name for this pollutant in this row
      let activeHeader = colMeta.headerName;
      let activeUnit = colMeta.unit;
      let rawCell = row.rawValues[activeHeader];
      let rawStr = rawCell !== undefined ? String(rawCell).trim() : "";

      // If primary column is blank, check if another column for this pollutant has data
      if (isMissingValue(rawStr) && mapping.pollutantHeaders) {
        const altCol = mapping.pollutantHeaders.find(
          (ph) =>
            ph.pollutantKey === polKey &&
            ph.headerName !== colMeta.headerName &&
            !isMissingValue(row.rawValues[ph.headerName])
        );
        if (altCol) {
          activeHeader = altCol.headerName;
          activeUnit = altCol.unit;
          rawCell = row.rawValues[activeHeader];
          rawStr = rawCell !== undefined ? String(rawCell).trim() : "";
        }
      }

      // Check Missing
      if (isMissingValue(rawStr)) {
        totalMissing++;
        missingByLocationPollutant[loc][polKey]++;
        flagsByType.missing++;
        flags.push({
          rowNumber: row.rowNumber,
          location: loc,
          pollutant: polKey,
          column: activeHeader,
          type: "missing",
          message: `Missing value ("${rawStr}") at row ${row.rowNumber} for ${loc} [${polKey}].`,
          value: rawStr,
        });
        row.pollutants[polKey] = null;
        continue;
      }

      // Check Unit Mismatch in cell or header
      const lowerCell = rawStr.toLowerCase().replace(/³/g, "3");
      const cellHasMgM3 =
        lowerCell.includes("mg/m3") ||
        lowerCell.includes("mg/m^3") ||
        lowerCell.includes("mg / m3");
      const headerHasMgM3 =
        activeUnit === "mg/m3" ||
        (row.unitNotes?.[polKey]?.includes("header:mg/m3") ?? false);

      const numMatch = rawStr.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/);
      const parsedNum = numMatch ? parseFloat(numMatch[0]) : NaN;

      if (isNaN(parsedNum)) {
        totalMissing++;
        missingByLocationPollutant[loc][polKey]++;
        flagsByType.missing++;
        flags.push({
          rowNumber: row.rowNumber,
          location: loc,
          pollutant: polKey,
          column: activeHeader,
          type: "missing",
          message: `Non-numeric reading ("${rawStr}") at row ${row.rowNumber} for ${loc} [${polKey}].`,
          value: rawStr,
        });
        row.pollutants[polKey] = null;
        continue;
      }

      // If unit is mg/m3, flag unit mismatch and convert to ug/m3 (1 mg/m3 = 1000 ug/m3)
      let convertedValue = parsedNum;
      if (cellHasMgM3 || headerHasMgM3) {
        flagsByType.unit_mismatch++;
        flags.push({
          rowNumber: row.rowNumber,
          location: loc,
          pollutant: polKey,
          column: colMeta.headerName,
          type: "unit_mismatch",
          message: `Unit mismatch: reading reported in mg/m³ (${parsedNum} mg/m³) at row ${row.rowNumber} for ${loc} [${polKey}]. Converted to standard µg/m³.`,
          value: parsedNum,
        });

        convertedValue = Math.round(parsedNum * 1000 * 100) / 100;
        row.unitNotes = {
          ...row.unitNotes,
          [polKey]: `converted from ${parsedNum} mg/m3 to ${convertedValue} ug/m3`,
        };
      }

      // Check Negative Values
      if (convertedValue < 0) {
        flagsByType.negative++;
        flags.push({
          rowNumber: row.rowNumber,
          location: loc,
          pollutant: polKey,
          column: colMeta.headerName,
          type: "negative",
          message: `Negative reading (${convertedValue}) at row ${row.rowNumber} for ${loc} [${polKey}]. Air pollutant concentration cannot be negative.`,
          value: convertedValue,
        });
        // We set to null so negative values don't contaminate statistical calculations
        row.pollutants[polKey] = null;
      } else {
        row.pollutants[polKey] = convertedValue;
      }
    }
  }

  // Step 3: Compute medians per location and pollutant for spike detection
  // Collect all valid positive readings
  const valuesByLocPol: Record<string, Record<string, number[]>> = {};
  for (const row of cleanedRows) {
    const loc = row.location;
    if (!valuesByLocPol[loc]) valuesByLocPol[loc] = {};

    for (const [polKey, val] of Object.entries(row.pollutants)) {
      if (val !== null && val >= 0) {
        if (!valuesByLocPol[loc][polKey]) valuesByLocPol[loc][polKey] = [];
        valuesByLocPol[loc][polKey].push(val);
      }
    }
  }

  const medians: Record<string, Record<string, number>> = {};
  for (const [loc, polMap] of Object.entries(valuesByLocPol)) {
    medians[loc] = {};
    for (const [polKey, arr] of Object.entries(polMap)) {
      const med = computeMedian(arr);
      if (med !== null) {
        medians[loc][polKey] = med;
      }
    }
  }

  // Step 4: Detect Spikes (> 5x location median)
  for (const row of cleanedRows) {
    const loc = row.location;
    for (const [polKey, val] of Object.entries(row.pollutants)) {
      if (val === null) continue;
      const median = medians[loc]?.[polKey];
      if (median !== undefined && median > 0) {
        if (val > 5 * median) {
          flagsByType.spike++;
          flags.push({
            rowNumber: row.rowNumber,
            location: loc,
            pollutant: polKey,
            type: "spike",
            message: `Severe spike: reading ${val} µg/m³ is > 5x the location median (${median} µg/m³) at row ${row.rowNumber} for ${loc} [${polKey}].`,
            value: val,
          });
        }
      }
    }
  }

  // Step 5: Detect Stuck Sensors (identical value 6+ times in a row for a location)
  // Group rows by location preserving sequential order
  const rowsByLoc: Record<string, Row[]> = {};
  for (const row of cleanedRows) {
    if (!rowsByLoc[row.location]) rowsByLoc[row.location] = [];
    rowsByLoc[row.location].push(row);
  }

  for (const [loc, locRows] of Object.entries(rowsByLoc)) {
    for (const polKey of Object.keys(mapping.pollutantColumns)) {
      let currentVal: number | null = null;
      let currentRun: Row[] = [];

      const flushRun = () => {
        if (currentRun.length >= 6 && currentVal !== null) {
          // Flag all rows in this stuck run
          for (const stuckRow of currentRun) {
            flagsByType.stuck_sensor++;
            flags.push({
              rowNumber: stuckRow.rowNumber,
              location: loc,
              pollutant: polKey,
              type: "stuck_sensor",
              message: `Stuck sensor: value ${currentVal} µg/m³ repeated for ${currentRun.length} consecutive readings at row ${stuckRow.rowNumber} for ${loc} [${polKey}].`,
              value: currentVal,
            });
          }
        }
        currentRun = [];
      };

      for (const row of locRows) {
        const val = row.pollutants[polKey];
        if (val === null) {
          flushRun();
          currentVal = null;
          continue;
        }

        if (currentVal !== null && Math.abs(val - currentVal) < 1e-5) {
          currentRun.push(row);
        } else {
          flushRun();
          currentVal = val;
          currentRun = [row];
        }
      }
      flushRun();
    }
  }

  // Sort flags by rowNumber
  flags.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    flags,
    cleanedRows,
    totalMissing,
    totalFlags: flags.length,
    flagsByType,
    missingByLocationPollutant,
    medians,
  };
}

export const qualityFlags = auditDataQuality;
