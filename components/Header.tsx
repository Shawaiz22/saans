"use client";

import React from "react";

interface HeaderProps {
  onLoadSample: () => void;
  isLoadingSample: boolean;
}

export function Header({ onLoadSample, isLoadingSample }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 font-bold text-xl tracking-tight">
            सां
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Saans <span className="text-slate-400 font-normal">| Civic Air Quality Studio</span>
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                v1.0 Traceable GenAI
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Grounded civic intelligence, zero-hallucination data audits & multi-tier public advisories
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onLoadSample}
            disabled={isLoadingSample}
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <span>{isLoadingSample ? "Loading..." : "Load Messy Test Dataset"}</span>
            <span className="px-1.5 py-0.2 bg-white rounded text-[10px] text-slate-500 border border-slate-200 font-mono">
              ward-aq-messy.csv
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

