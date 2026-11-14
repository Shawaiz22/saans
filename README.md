# Saans (सांस) — Civic Air Quality Briefing Studio

A grounded Civic Air Quality Briefing Studio built in **Next.js App Router**, **TypeScript (Strict)**, and **Tailwind CSS**. Designed for local authorities, housing societies (RWAs), and school administrators to paste or upload raw, messy air quality data and generate verified, traceable briefings and accessible public advisories powered by Gemini GenAI and deterministic code verification.

---

## Requirement Mapping Table

| Problem Requirement | Implementing File(s) | Description |
| :--- | :--- | :--- |
| **Tabular Data Ingestion** | [`lib/parse.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/parse.ts) | Parses messy CSV, TSV, or pasted text tables via PapaParse. Assigns sequential 1-based identifiers (`1..n`) to every row. |
| **Header Heuristics** | [`lib/parse.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/parse.ts) | Case-insensitive detection of location (`ward`, `station`, `site`), timestamp (`time`, `date`), and pollutants (`pm2.5`, `pm10`, `no2`, `so2`, `co`, `o3`). Detects header unit specs (`mg/m3` vs `ug/m3`). |
| **Data Hygiene & Defect Flags** | [`lib/quality.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/quality.ts) | Detects missing values (`""`, `"NA"`, `"N/A"`, `"-"`, `"null"`), negative sensor errors, unit mismatches, severe spikes (`> 5x` location median), and stuck sensor runs (`6+` consecutive identical values). |
| **Unit Normalization** | [`lib/quality.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/quality.ts) | Converts `mg/m³` to standard `µg/m³` (`1 mg/m³ = 1000 µg/m³`) for cells and headers. |
| **Code-Calculated Missing Counts** | [`lib/quality.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/quality.ts), [`lib/stats.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/stats.ts) | Computed strictly by deterministic TypeScript code; never estimated or counted by AI. |
| **Descriptive Statistics & Trends** | [`lib/stats.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/stats.ts) | Computes count, missing, mean, max, and first-half vs second-half mean comparison to classify trends (`rising`, `falling`, `steady`). |
| **India NAQI Categories** | [`lib/stats.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/stats.ts) | Maps 24-hr concentrations to official Central Pollution Control Board (CPCB) NAQI bands (`Good`, `Satisfactory`, `Moderate`, `Poor`, `Very Poor`, `Severe`). |
| **Traceability & Citation Verifier** | [`lib/verify.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/verify.ts) | Verifies AI claims against dataset rows. Marks `verified` only if all cited row numbers exist AND belong to the named location; else marks `unverified` with the exact mismatch reason. |
| **Zod Schemas** | [`lib/schemas.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/schemas.ts) | Strict runtime schemas for API requests and Gemini structured output. |
| **Boundary Constraints** | [`lib/limits.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/lib/limits.ts) | Enforces `MAX_BODY_BYTES = 200_000` (200 KB), `MAX_ROWS = 5000`, and `ROWS_SENT_TO_AI = 300`. |
| **Messy Test Dataset** | [`public/samples/ward-aq-messy.csv`](file:///Users/shawaizsiddiqui/Documents/projects/saans/public/samples/ward-aq-messy.csv) | Test input with 4 wards, 2 days of hourly data, mixed date formats, one column in mg/m³, blanks/NA, one negative value, one stuck run, and one clear rising hotspot ward. |
| **GenAI Briefing API** | [`app/api/brief/route.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/app/api/brief/route.ts) | Role-targeted brief endpoint utilizing `@google/genai` (temp 0.2) with deterministic grounding, row citation verification, per-IP rate limiting, and safe client errors. |
| **Multi-Lingual Advisory API** | [`app/api/advisory/route.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/app/api/advisory/route.ts) | Generates citizen advisories in English (`en`), Hindi (`hi`), and Urdu (`ur`) across `simple` (Grade 5) and `detailed` reading levels. |
| **Interactive Civic UI** | [`app/page.tsx`](file:///Users/shawaizsiddiqui/Documents/projects/saans/app/page.tsx) | Pure, clean UI with accessible form controls, `aria-live` regions, visible focus rings, row highlighting chips, and comparison with previous briefs stored in `localStorage`. |
| **Security Headers** | [`next.config.ts`](file:///Users/shawaizsiddiqui/Documents/projects/saans/next.config.ts) | Implements strict CSP with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`. |
| **Vitest Test Suite** | [`test/`](file:///Users/shawaizsiddiqui/Documents/projects/saans/test) | Comprehensive test coverage across `parse.test.ts`, `quality.test.ts`, `stats.test.ts`, `verify.test.ts` (including wrong-location citation), and `messy-dataset.test.ts`. |

---

## Getting Started

### 1. Environment Configuration
Copy `.env.example` to `.env.local` and configure your Gemini API key (server only, never prefixed with `NEXT_PUBLIC_`):
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

*(Note: If no API key is provided, Saans seamlessly falls back to its deterministic local analytical engine so all UI and audit features remain 100% testable).*

### 2. Run Quality Checks
```bash
# Run Vitest test suite
npm test

# Run TypeScript type check
npm run typecheck

# Run ESLint
npm run lint
```

### 3. Launch the Studio
```bash
npm run dev
```
Navigate to `http://localhost:3000`. Click **Load sample dataset** to immediately test the end-to-end audit, verification, and civic briefing pipeline on messy real-world data.
