/**
 * @file parse.ts
 * @description Pure functions for parsing raw CSV, TSV, or pasted text tables of air quality data.
 * Leverages PapaParse to parse tabular structures, identifies columns via case-insensitive heuristics,
 * assigns 1-based sequential row identifiers (1..n), and maps raw measurements.
 */

import Papa from "papaparse";
import { Row } from "./types";
import { MAX_ROWS } from "./limits";

/**
 * Detailed representation of a detected pollutant header column.
 */
export interface DetectedPollutantColumn {
  headerName: string;
  pollutantKey: string;
  unit: "ug/m3" | "mg/m3" | "unknown";
}

/**
 * Metadata regarding detected column mappings from CSV/TSV headers.
 */
export interface ColumnMapping {
  /** Column name representing ward or station location. */
  locationColumn: string | null;
  /** Column name representing observation timestamp or date. */
  timestampColumn: string | null;
  /** Primary map of canonical pollutant key (e.g. "pm25") to header column name and detected unit. */
  pollutantColumns: Record<
    string,
    {
      headerName: string;
      unit: "ug/m3" | "mg/m3" | "unknown";
    }
  >;
  /** Complete list of all detected pollutant headers, allowing multiple columns per pollutant. */
  pollutantHeaders: DetectedPollutantColumn[];
  /** All raw headers detected in dataset. */
  allHeaders: string[];
}

/**
 * Result of the parsing operation including normalized rows and column mappings.
 */
export interface ParseResult {
  /** Array of normalized rows with 1-based row numbers (1..n). */
  rows: Row[];
  /** Column mappings detected from table headers. */
  mapping: ColumnMapping;
  /** Any parsing warning messages encountered during parsing. */
  warnings: string[];
}

/**
 * Detects unit specification from header string (e.g., "PM 2.5 (mg/m3)" or "PM10 (ug/m3)").
 *
 * @param header - Raw header text string.
 * @returns Detected unit ("mg/m3", "ug/m3", or "unknown").
 */
export function detectHeaderUnit(header: string): "ug/m3" | "mg/m3" | "unknown" {
  const lower = header.toLowerCase().replace(/³/g, "3");
  if (lower.includes("mg/m3") || lower.includes("mg/m^3") || lower.includes("mg / m3")) {
    return "mg/m3";
  }
  if (
    lower.includes("ug/m3") ||
    lower.includes("µg/m3") ||
    lower.includes("ug/m^3") ||
    lower.includes("µg/m^3") ||
    lower.includes("ug / m3")
  ) {
    return "ug/m3";
  }
  return "unknown";
}

/**
 * Maps a header string to a canonical pollutant key (e.g., "pm25", "pm10", "no2").
 *
 * @param header - Raw header text string.
 * @returns Canonical pollutant name or null if not a recognized pollutant column.
 */
export function detectPollutantKey(header: string): string | null {
  const clean = header.toLowerCase().replace(/[\s\-_]/g, "");

  if (clean.includes("pm2.5") || clean.includes("pm25")) {
    return "pm25";
  }
  if (clean.includes("pm10") || clean.includes("pm1.0")) {
    return "pm10";
  }
  if (clean.includes("no2") || clean.includes("nitrogendioxide")) {
    return "no2";
  }
  if (clean.includes("so2") || clean.includes("sulfurdioxide") || clean.includes("sulphurdioxide")) {
    return "so2";
  }
  if (clean.includes("co2")) {
    return "co2";
  }
  if (clean.includes("co") && !clean.includes("color") && !clean.includes("count")) {
    return "co";
  }
  if (clean.includes("o3") || clean.includes("ozone")) {
    return "o3";
  }
  if (clean.includes("aqi") || clean.includes("naqi")) {
    return "aqi";
  }

  return null;
}

/**
 * Inspects header row to identify location, timestamp, and pollutant columns.
 *
 * @param headers - Array of header strings from parsed CSV/TSV.
 * @returns Complete ColumnMapping object.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  let locationColumn: string | null = null;
  let timestampColumn: string | null = null;
  const pollutantColumns: Record<
    string,
    {
      headerName: string;
      unit: "ug/m3" | "mg/m3" | "unknown";
    }
  > = {};
  const pollutantHeaders: DetectedPollutantColumn[] = [];

  const locationKeywords = [
    "ward",
    "station",
    "location",
    "site",
    "area",
    "zone",
    "place",
    "monitoring_station",
    "city",
  ];

  const timestampKeywords = [
    "timestamp",
    "time",
    "date",
    "datetime",
    "date_time",
    "hour",
    "recorded_at",
    "reading_time",
  ];

  for (const h of headers) {
    const trimmed = h.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    // Check location
    if (!locationColumn && locationKeywords.some((kw) => lower.includes(kw))) {
      locationColumn = trimmed;
      continue;
    }

    // Check timestamp
    if (!timestampColumn && timestampKeywords.some((kw) => lower.includes(kw))) {
      timestampColumn = trimmed;
      continue;
    }

    // Check pollutants
    const pollutantKey = detectPollutantKey(trimmed);
    if (pollutantKey) {
      const unit = detectHeaderUnit(trimmed);
      pollutantHeaders.push({
        headerName: trimmed,
        pollutantKey,
        unit,
      });

      if (!pollutantColumns[pollutantKey]) {
        pollutantColumns[pollutantKey] = {
          headerName: trimmed,
          unit,
        };
      }
    }
  }

  // Fallbacks if columns weren't matched by keywords
  if (!locationColumn && headers.length > 0) {
    const first = headers[0].trim();
    const isTimestamp = timestampKeywords.some((kw) => first.toLowerCase().includes(kw));
    const isPollutant = detectPollutantKey(first) !== null;
    if (!isTimestamp && !isPollutant) {
      locationColumn = first;
    }
  }

  return {
    locationColumn,
    timestampColumn,
    pollutantColumns,
    pollutantHeaders,
    allHeaders: headers,
  };
}

/**
 * Parses raw CSV, TSV, or tabular text into normalized Row records with 1-based sequential numbers.
 *
 * @param rawText - Raw tabular text data.
 * @returns ParseResult containing mapped rows, column mappings, and warnings.
 */
export function parseAirQualityData(rawText: string): ParseResult {
  const warnings: string[] = [];
  const trimmedInput = rawText.trim();

  if (!trimmedInput) {
    return {
      rows: [],
      mapping: {
        locationColumn: null,
        timestampColumn: null,
        pollutantColumns: {},
        pollutantHeaders: [],
        allHeaders: [],
      },
      warnings: ["Input text is empty."],
    };
  }

  const parsed = Papa.parse<Record<string, string>>(trimmedInput, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors && parsed.errors.length > 0) {
    for (const err of parsed.errors.slice(0, 5)) {
      warnings.push(`Parser row ${err.row ?? "?"}: ${err.message}`);
    }
  }

  const headers = parsed.meta.fields ?? [];
  const mapping = detectColumns(headers);

  const rawRows = parsed.data;
  const rowCount = Math.min(rawRows.length, MAX_ROWS);

  if (rawRows.length > MAX_ROWS) {
    warnings.push(`Dataset exceeds maximum row limit (${MAX_ROWS}). Truncated remaining rows.`);
  }

  const rows: Row[] = [];

  for (let i = 0; i < rowCount; i++) {
    const rawRow = rawRows[i];
    if (!rawRow) continue;

    const rowNumber = i + 1; // 1-based index (1..n)

    // Extract location
    let location = "Unknown";
    if (mapping.locationColumn && rawRow[mapping.locationColumn] !== undefined) {
      const locVal = String(rawRow[mapping.locationColumn]).trim();
      if (locVal) {
        location = locVal;
      }
    }

    // Extract timestamp
    let timestamp: string | undefined = undefined;
    if (mapping.timestampColumn && rawRow[mapping.timestampColumn] !== undefined) {
      const timeVal = String(rawRow[mapping.timestampColumn]).trim();
      if (timeVal) {
        timestamp = timeVal;
      }
    }

    // Extract pollutant measurements
    const pollutants: Record<string, number | null> = {};
    const unitNotes: Record<string, string> = {};

    for (const [polKey, colMeta] of Object.entries(mapping.pollutantColumns)) {
      let cellVal = rawRow[colMeta.headerName];
      let selectedHeader = colMeta.headerName;
      let selectedUnit = colMeta.unit;

      // Check if primary column is blank or undefined, but another column for this pollutant has data
      // (e.g. Ward 88 has values in "PM2.5 (mg/m3)" instead of standard "PM2.5")
      if (cellVal === undefined || String(cellVal).trim() === "") {
        const altCol = mapping.pollutantHeaders.find(
          (ph) =>
            ph.pollutantKey === polKey &&
            ph.headerName !== colMeta.headerName &&
            rawRow[ph.headerName] !== undefined &&
            String(rawRow[ph.headerName]).trim() !== ""
        );
        if (altCol) {
          cellVal = rawRow[altCol.headerName];
          selectedHeader = altCol.headerName;
          selectedUnit = altCol.unit;
        }
      }

      if (cellVal !== undefined) {
        if (selectedUnit === "mg/m3") {
          unitNotes[polKey] = `header:mg/m3 (${selectedHeader})`;
        }

        const trimmedCell = String(cellVal).trim();
        const num = parseFloat(trimmedCell);
        pollutants[polKey] = !isNaN(num) ? num : null;
      } else {
        pollutants[polKey] = null;
      }
    }

    rows.push({
      rowNumber,
      location,
      timestamp,
      rawValues: rawRow,
      pollutants,
      unitNotes,
    });
  }

  return {
    rows,
    mapping,
    warnings,
  };
}

export const parseCsv = parseAirQualityData;
