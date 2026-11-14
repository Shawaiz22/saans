/**
 * @file limits.ts
 * @description Boundary limits and constraints for air quality dataset parsing and AI prompting.
 */

/** Maximum allowed payload size for raw CSV/table body in bytes (200 KB). */
export const MAX_BODY_BYTES = 200_000;

/** Maximum allowed rows to parse and process in a single dataset upload. */
export const MAX_ROWS = 5000;

/** Maximum representative data rows included in the prompt payload sent to Gemini. */
export const ROWS_SENT_TO_AI = 300;

