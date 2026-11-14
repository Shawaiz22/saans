"use client";

import React, { useState, useEffect, useRef } from "react";

interface FindingItem {
  location: string;
  text: string;
  severity: "low" | "moderate" | "high" | "critical";
  rows: number[];
  verified: boolean;
  reason?: string;
}

interface ActionItem {
  priority: "immediate" | "high" | "medium" | "low";
  action: string;
  why: string;
  rows: number[];
  verified: boolean;
  reason?: string;
  location?: string;
}

interface CareNotes {
  children: string;
  olderAdults: string;
  sensitive: string;
}

interface ChangesSummary {
  improved: string[];
  worsened: string[];
  appeared: string[];
  resolved: string[];
}

interface QualityData {
  totalRows: number;
  missing: number;
  flagsByType: Record<string, number>;
  flags: Array<{
    rowNumber: number;
    location: string;
    pollutant?: string;
    type: string;
    message: string;
  }>;
}

interface BriefResult {
  findings: FindingItem[];
  actions: ActionItem[];
  careNotes: CareNotes;
  internalNote: string;
  changes: ChangesSummary;
  quality: QualityData;
  stats?: Array<{
    location: string;
    pollutant: string;
    count: number;
    missing: number;
    mean: number | null;
    max: number | null;
    trend: string;
    naqiCategory: string;
  }>;
  rows?: Array<{
    rowNumber: number;
    location: string;
    timestamp?: string;
    pollutants: Record<string, number | null>;
  }>;
}

interface AdvisoryData {
  title: string;
  generalNotice: string;
  children: string;
  olderAdults: string;
  sensitive: string;
  dos: string[];
  donts: string[];
}

export default function Home() {
  const [csvText, setCsvText] = useState<string>("");
  const [audience, setAudience] = useState<"ward_officer" | "housing_society" | "school">("ward_officer");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [brief, setBrief] = useState<BriefResult | null>(null);
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);

  // Advisory State
  const [advisoryLang, setAdvisoryLang] = useState<"en" | "hi" | "ur">("en");
  const [advisoryLevel, setAdvisoryLevel] = useState<"simple" | "detailed">("simple");
  const [isAdvisoryLoading, setIsAdvisoryLoading] = useState<boolean>(false);
  const [advisory, setAdvisory] = useState<AdvisoryData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load previous brief on mount
  const getStoredPreviousBrief = () => {
    try {
      const stored = localStorage.getItem("saans_previous_brief");
      return stored ? JSON.parse(stored) : undefined;
    } catch {
      return undefined;
    }
  };

  const handleLoadSample = async () => {
    try {
      setErrorMessage("");
      const res = await fetch("/samples/ward-aq-messy.csv");
      if (!res.ok) throw new Error("Sample file not found");
      const text = await res.text();
      setCsvText(text);
    } catch {
      setErrorMessage("Could not load sample dataset. Please try uploading manually.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvText(text);
        setErrorMessage("");
      }
    };
    reader.readAsText(file);
  };

  const handleCreateBrief = async () => {
    if (!csvText.trim()) {
      setErrorMessage("Please paste or upload air quality data before creating a brief.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setBrief(null);
    setAdvisory(null);

    try {
      const previousBrief = getStoredPreviousBrief();
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          audience,
          previousBrief,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate brief.");
      }

      setBrief(data);

      // Save to localStorage in try/catch
      try {
        localStorage.setItem(
          "saans_previous_brief",
          JSON.stringify({
            audience,
            findings: data.findings,
            actions: data.actions,
            timestamp: new Date().toISOString(),
          })
        );
      } catch {
        // ignore localStorage errors (e.g. storage quota)
      }

      // Automatically generate initial advisory
      generateAdvisory(data, advisoryLang, advisoryLevel);

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating brief";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const generateAdvisory = async (
    currentBrief: BriefResult,
    lang: "en" | "hi" | "ur",
    lvl: "simple" | "detailed"
  ) => {
    setIsAdvisoryLoading(true);
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: {
            findings: currentBrief.findings,
            actions: currentBrief.actions,
            careNotes: currentBrief.careNotes,
          },
          language: lang,
          level: lvl,
        }),
      });
      const data = await res.json();
      if (data.success && data.advisory) {
        setAdvisory(data.advisory);
      }
    } catch {
      // ignore or fallback
    } finally {
      setIsAdvisoryLoading(false);
    }
  };

  const handleAdvisoryChange = (lang: "en" | "hi" | "ur", lvl: "simple" | "detailed") => {
    setAdvisoryLang(lang);
    setAdvisoryLevel(lvl);
    if (brief) {
      generateAdvisory(brief, lang, lvl);
    }
  };

  const scrollToRow = (rowNum: number) => {
    setHighlightedRow(rowNum);
    const rowEl = document.getElementById(`data-row-${rowNum}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Studio Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Saans <span className="font-normal text-slate-500">| Civic Air Quality Briefing Studio</span>
            </h1>
            <p className="text-xs text-slate-600">
              Data hygiene validation, deterministic row citations & multi-lingual civic advisories
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadSample}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 transition-colors"
          >
            Load sample dataset
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8 flex-1 w-full">
        {/* Ingestion & Audience Form */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Ingestion & Brief Configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Audience Selection */}
            <div className="space-y-2">
              <label htmlFor="audience-select" className="block text-xs font-semibold text-slate-800">
                Audience Persona
              </label>
              <select
                id="audience-select"
                value={audience}
                onChange={(e) => setAudience(e.target.value as any)}
                className="w-full text-sm border border-slate-300 rounded-md p-2 bg-white text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <option value="ward_officer">Ward Officer (Enforcement & Misting)</option>
                <option value="housing_society">Housing Society (RWA & Air Purifiers)</option>
                <option value="school">School (Recess & Assemblies)</option>
              </select>
              <p className="text-[11px] text-slate-500">
                Prioritizes recommended civic actions according to jurisdictional authority.
              </p>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <label htmlFor="csv-file-input" className="block text-xs font-semibold text-slate-800">
                Upload Table File
              </label>
              <input
                id="csv-file-input"
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv,.tsv,.txt"
                className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 hover:file:bg-slate-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              />
              <p className="text-[11px] text-slate-500">
                Accepts messy CSV, TSV, or plain text with inconsistent units and missing values.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex flex-col justify-end">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleCreateBrief}
                className="w-full py-2.5 px-4 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 transition-colors"
              >
                {isLoading ? "Analyzing & Generating Brief..." : "Create brief"}
              </button>
            </div>
          </div>

          {/* Raw Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="csv-textarea" className="text-xs font-semibold text-slate-800">
                Raw Air Quality Data (Pasted Text or CSV)
              </label>
              {csvText && (
                <button
                  type="button"
                  onClick={() => setCsvText("")}
                  className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                >
                  Clear text
                </button>
              )}
            </div>
            <textarea
              id="csv-textarea"
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste raw table rows here (e.g. Ward,Timestamp,PM2.5,PM10)..."
              className="w-full font-mono text-xs border border-slate-300 rounded-md p-3 bg-slate-50 focus:bg-white text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            />
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-md"
            >
              {errorMessage}
            </div>
          )}
        </section>

        {/* Dynamic Results Container */}
        <div ref={resultsRef} aria-live="polite" className="space-y-8">
          {brief && (
            <>
              {/* Top Overview: Data Quality Summary */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Data Quality & Sensor Audit</h2>
                    <p className="text-xs text-slate-500">
                      Evaluated deterministically by code. Missing counts are computed by code, never by AI.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-medium bg-slate-100 px-2 py-1 rounded border border-slate-200">
                    {brief.quality.totalRows} rows analyzed
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 block">Missing Values</span>
                    <span className="text-lg font-bold text-slate-900">{brief.quality.missing}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Blanks, NA, &quot;-&quot;</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 block">Negative Readings</span>
                    <span className="text-lg font-bold text-slate-900">
                      {brief.quality.flagsByType.negative || 0}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Sensor drift (&lt; 0)</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 block">Unit Mismatches</span>
                    <span className="text-lg font-bold text-slate-900">
                      {brief.quality.flagsByType.unit_mismatch || 0}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">mg/m³ to µg/m³</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 block">Severe Spikes</span>
                    <span className="text-lg font-bold text-slate-900">
                      {brief.quality.flagsByType.spike || 0}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">&gt; 5x location median</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 block">Stuck Sensors</span>
                    <span className="text-lg font-bold text-slate-900">
                      {brief.quality.flagsByType.stuck_sensor || 0}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Same value 6+ times</span>
                  </div>
                </div>

                {brief.quality.flags.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-semibold text-slate-700">Audit Flags Log</span>
                    <div className="max-h-44 overflow-y-auto border border-slate-200 rounded text-xs divide-y divide-slate-100">
                      {brief.quality.flags.map((flag, idx) => (
                        <div
                          key={`flag-${idx}`}
                          className="p-2 flex items-center justify-between gap-4 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => scrollToRow(flag.rowNumber)}
                              className="font-mono text-slate-700 font-semibold hover:underline"
                            >
                              Row #{flag.rowNumber}
                            </button>
                            <span className="text-slate-400">|</span>
                            <span className="font-medium text-slate-800">{flag.location}</span>
                            <span className="text-slate-500">[{flag.type.replace(/_/g, " ")}]</span>
                          </div>
                          <span className="text-slate-600 text-[11px] truncate">{flag.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Findings Section */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">Findings & Evidence Citations</h2>
                  <p className="text-xs text-slate-500">
                    Every observation is grounded in cited dataset row numbers and verified by code.
                  </p>
                </div>

                <div className="space-y-3">
                  {brief.findings.map((finding, idx) => (
                    <div
                      key={`finding-${idx}`}
                      className="p-4 rounded border border-slate-200 bg-slate-50 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900">
                            {finding.location}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                              finding.severity === "critical"
                                ? "bg-red-100 text-red-800"
                                : finding.severity === "high"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {finding.severity}
                          </span>
                        </div>

                        {finding.verified ? (
                          <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            ✓ Verified
                          </span>
                        ) : (
                          <span className="text-[11px] text-red-700 font-medium bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                            ⚠️ Unverified: {finding.reason}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed">{finding.text}</p>

                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-slate-500">Cited rows:</span>
                        {finding.rows.map((rowNum) => (
                          <button
                            key={`f-row-${rowNum}`}
                            type="button"
                            onClick={() => scrollToRow(rowNum)}
                            className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-900"
                          >
                            #{rowNum}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Actions Section */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    Prioritized Actions for {audience.replace(/_/g, " ")}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Role-tailored mitigations prioritized by immediate civic urgency.
                  </p>
                </div>

                <div className="space-y-3">
                  {brief.actions.map((act, idx) => (
                    <div
                      key={`action-${idx}`}
                      className="p-4 rounded border border-slate-200 bg-white space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                            act.priority === "immediate"
                              ? "bg-red-600 text-white"
                              : act.priority === "high"
                              ? "bg-orange-500 text-white"
                              : "bg-slate-700 text-white"
                          }`}
                        >
                          {act.priority}
                        </span>

                        {act.verified ? (
                          <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            ✓ Verified
                          </span>
                        ) : (
                          <span className="text-[11px] text-red-700 font-medium bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                            ⚠️ Unverified: {act.reason}
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-semibold text-slate-900">{act.action}</p>
                      <p className="text-xs text-slate-600">{act.why}</p>

                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-slate-500">Evidence citations:</span>
                        {act.rows.map((rowNum) => (
                          <button
                            key={`a-row-${rowNum}`}
                            type="button"
                            onClick={() => scrollToRow(rowNum)}
                            className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-slate-50 border border-slate-300 text-slate-700 hover:bg-slate-100"
                          >
                            #{rowNum}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Changes Section (Comparison with Previous Brief) */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    Changes from Previous Brief
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tracks hotspot evolutions, worsening trends, or resolved pollution spikes.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 rounded border border-slate-200 bg-slate-50 space-y-1.5">
                    <span className="text-xs font-semibold text-slate-800">Worsened / Escalated</span>
                    {brief.changes.worsened.length > 0 ? (
                      <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                        {brief.changes.worsened.map((w, i) => (
                          <li key={`w-${i}`}>{w}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">No worsening conditions identified.</p>
                    )}
                  </div>

                  <div className="p-3 rounded border border-slate-200 bg-slate-50 space-y-1.5">
                    <span className="text-xs font-semibold text-slate-800">Improved / Stabilized</span>
                    {brief.changes.improved.length > 0 ? (
                      <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                        {brief.changes.improved.map((im, i) => (
                          <li key={`im-${i}`}>{im}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">No stabilization noted in latest window.</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Internal Note Section */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">Internal Briefing Note</h2>
                  <p className="text-xs text-slate-500">
                    Administrative memo for official record-keeping and field coordination.
                  </p>
                </div>
                <div className="p-4 bg-slate-100 rounded border border-slate-200 text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed">
                  {brief.internalNote}
                </div>
              </section>

              {/* Citizen Advisory Section */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Citizen Health Advisory</h2>
                    <p className="text-xs text-slate-500">
                      Public notice with dedicated care sections for vulnerable groups.
                    </p>
                  </div>

                  {/* Language and Level Selectors */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <label htmlFor="lang-select" className="text-slate-500">
                        Language:
                      </label>
                      <select
                        id="lang-select"
                        value={advisoryLang}
                        onChange={(e) =>
                          handleAdvisoryChange(e.target.value as any, advisoryLevel)
                        }
                        className="border border-slate-300 rounded px-2 py-1 text-xs bg-white text-slate-800"
                      >
                        <option value="en">English</option>
                        <option value="hi">हिंदी (Hindi)</option>
                        <option value="ur">اردو (Urdu)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <label htmlFor="level-select" className="text-slate-500">
                        Level:
                      </label>
                      <select
                        id="level-select"
                        value={advisoryLevel}
                        onChange={(e) =>
                          handleAdvisoryChange(advisoryLang, e.target.value as any)
                        }
                        className="border border-slate-300 rounded px-2 py-1 text-xs bg-white text-slate-800"
                      >
                        <option value="simple">Simple (Grade 5)</option>
                        <option value="detailed">Detailed (Civic)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {isAdvisoryLoading ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Generating localized advisory in {advisoryLang.toUpperCase()} ({advisoryLevel})...
                  </div>
                ) : advisory ? (
                  <div
                    dir={advisoryLang === "ur" ? "rtl" : "ltr"}
                    className="space-y-4 text-slate-900"
                  >
                    <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">{advisory.title}</h3>
                      <p className="text-xs text-slate-700 leading-relaxed">{advisory.generalNotice}</p>
                    </div>

                    {/* Care Notes for Sensitive Groups */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-3.5 rounded border border-slate-200 bg-white space-y-1">
                        <span className="text-xs font-bold text-slate-800 block">
                          👶 Children & Students
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">{advisory.children}</p>
                      </div>

                      <div className="p-3.5 rounded border border-slate-200 bg-white space-y-1">
                        <span className="text-xs font-bold text-slate-800 block">
                          👵 Older Adults
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">{advisory.olderAdults}</p>
                      </div>

                      <div className="p-3.5 rounded border border-slate-200 bg-white space-y-1">
                        <span className="text-xs font-bold text-slate-800 block">
                          🫁 Sensitive / Asthma
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">{advisory.sensitive}</p>
                      </div>
                    </div>

                    {/* DOs & DONTs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="p-3.5 bg-emerald-50/60 rounded border border-emerald-200 space-y-1.5">
                        <span className="text-xs font-bold text-emerald-900 block">
                          DOs (Protective Steps)
                        </span>
                        <ul className="text-xs text-emerald-800 list-disc list-inside space-y-1">
                          {advisory.dos.map((d, i) => (
                            <li key={`do-${i}`}>{d}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-3.5 bg-rose-50/60 rounded border border-rose-200 space-y-1.5">
                        <span className="text-xs font-bold text-rose-900 block">
                          DONTs (Activities to Avoid)
                        </span>
                        <ul className="text-xs text-rose-800 list-disc list-inside space-y-1">
                          {advisory.donts.map((d, i) => (
                            <li key={`dont-${i}`}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              {/* Complete Traceable Data Table */}
              {brief.rows && brief.rows.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Parsed Data Rows (Numbered 1..{brief.rows.length})
                      </h2>
                      <p className="text-xs text-slate-500">
                        Clicking on any cited row chip above scrolls and highlights the respective row.
                      </p>
                    </div>
                    {highlightedRow && (
                      <button
                        type="button"
                        onClick={() => setHighlightedRow(null)}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        Clear highlight
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto border border-slate-200 rounded text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-700 sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-2 font-semibold w-16">Row #</th>
                          <th className="p-2 font-semibold">Location</th>
                          <th className="p-2 font-semibold">Timestamp</th>
                          <th className="p-2 font-semibold">PM2.5 (µg/m³)</th>
                          <th className="p-2 font-semibold">PM10 (µg/m³)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {brief.rows.map((r) => {
                          const isHigh = highlightedRow === r.rowNumber;
                          return (
                            <tr
                              key={`r-${r.rowNumber}`}
                              id={`data-row-${r.rowNumber}`}
                              className={`transition-colors ${
                                isHigh ? "bg-amber-100 font-semibold" : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="p-2 font-mono font-medium text-slate-600">
                                #{r.rowNumber}
                              </td>
                              <td className="p-2 text-slate-800">{r.location}</td>
                              <td className="p-2 text-slate-500 font-mono text-[11px]">
                                {r.timestamp || "—"}
                              </td>
                              <td className="p-2 font-mono">
                                {r.pollutants.pm25 !== null && r.pollutants.pm25 !== undefined ? (
                                  `${r.pollutants.pm25}`
                                ) : (
                                  <span className="text-slate-400">null</span>
                                )}
                              </td>
                              <td className="p-2 font-mono">
                                {r.pollutants.pm10 !== null && r.pollutants.pm10 !== undefined ? (
                                  `${r.pollutants.pm10}`
                                ) : (
                                  <span className="text-slate-400">null</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        Saans Civic Air Quality Briefing Studio &bull; Grounded telemetry &bull; Deterministic verification
      </footer>
    </div>
  );
}
