"use client";

import React, { useRef } from "react";
import { TargetRole, ReadingLevel } from "@/lib/types";

interface InputSectionProps {
  csvText: string;
  setCsvText: (text: string) => void;
  audienceRole: TargetRole;
  setAudienceRole: (role: TargetRole) => void;
  selectedLanguages: string[];
  setSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  readingLevel: ReadingLevel;
  setReadingLevel: (level: ReadingLevel) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  hasPreviousBrief: boolean;
  compareWithPrevious: boolean;
  setCompareWithPrevious: (val: boolean) => void;
}

export function InputSection({
  csvText,
  setCsvText,
  audienceRole,
  setAudienceRole,
  selectedLanguages,
  setSelectedLanguages,
  readingLevel,
  setReadingLevel,
  isGenerating,
  onGenerate,
  hasPreviousBrief,
  compareWithPrevious,
  setCompareWithPrevious,
}: InputSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvText(text);
      }
    };
    reader.readAsText(file);
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(lang)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter((l) => l !== lang);
      }
      return [...prev, lang];
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="border-b border-slate-100 p-4 sm:px-6 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span>Data Ingestion & Stakeholder Configuration</span>
          </h2>
          <p className="text-xs text-slate-500">
            Paste or upload messy air quality tables with inconsistent units, missing cells, or timestamps
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv,.tsv,.txt"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            📁 Upload CSV / TSV
          </button>
          {csvText && (
            <button
              type="button"
              onClick={() => setCsvText("")}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {/* Stakeholder & Language Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stakeholder Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center justify-between">
              <span>Stakeholder Role</span>
              <span className="text-[10px] text-slate-400">Tailors actions</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "ward_officer", label: "Ward Officer", icon: "🏛️" },
                { id: "housing_society", label: "Housing Society", icon: "🏢" },
                { id: "school", label: "School Principal", icon: "🏫" },
              ].map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setAudienceRole(role.id as TargetRole)}
                  className={`p-2 rounded-xl text-xs font-medium border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    audienceRole === role.id
                      ? "bg-sky-50 border-sky-300 text-sky-800 font-semibold shadow-xs"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base">{role.icon}</span>
                  <span className="text-[11px] text-center leading-tight">{role.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Citizen Advisory Languages */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center justify-between">
              <span>Advisory Languages</span>
              <span className="text-[10px] text-slate-400">Multi-lingual civic reach</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { code: "en", name: "English" },
                { code: "hi", name: "हिंदी (Hindi)" },
                { code: "mr", name: "मराठी (Marathi)" },
                { code: "ta", name: "தமிழ் (Tamil)" },
              ].map((lang) => {
                const isSelected = selectedLanguages.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => toggleLanguage(lang.code)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-teal-50 border-teal-300 text-teal-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {isSelected && <span className="mr-1">✓</span>}
                    {lang.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reading Level & Comparison */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center justify-between">
              <span>Reading Level & Comparison</span>
              <span className="text-[10px] text-slate-400">Demographic accessibility</span>
            </label>
            <div className="space-y-2">
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setReadingLevel("simple")}
                  className={`flex-1 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                    readingLevel === "simple"
                      ? "bg-white text-slate-900 shadow-2xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Simple (Grade 5 / Citizen)
                </button>
                <button
                  type="button"
                  onClick={() => setReadingLevel("standard")}
                  className={`flex-1 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                    readingLevel === "standard"
                      ? "bg-white text-slate-900 shadow-2xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Standard (Administrative)
                </button>
              </div>

              {hasPreviousBrief && (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={compareWithPrevious}
                    onChange={(e) => setCompareWithPrevious(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Compare with Previous Brief</span>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Textarea for CSV / TSV */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700 flex items-center justify-between">
            <span>Raw Air Quality Data (CSV, TSV, or Pasted Rows)</span>
            <span className="text-[10px] font-mono text-slate-400">
              {csvText.trim().split("\n").length} lines | {new Blob([csvText]).size} bytes
            </span>
          </label>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste your raw CSV, TSV, or table rows here...
e.g.
Ward,Timestamp,PM2.5,PM10
Ward 45 (Industrial),2026-11-12 08:00,120,210
Ward 12 (Indiranagar),12/11/2026 09:00,38,72
Ward 88 (City Market),2026-11-12 10:00,0.085 mg/m3,150"
            rows={7}
            className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 resize-y"
          />
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            disabled={!csvText.trim() || isGenerating}
            onClick={onGenerate}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-sky-600/20 transition-all cursor-pointer"
          >
            {isGenerating ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Analyzing Sensors & Generating Brief...</span>
              </>
            ) : (
              <>
                <span>✨ Generate Civic Air Quality Brief</span>
                <span className="text-sky-200 text-xs">→</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

