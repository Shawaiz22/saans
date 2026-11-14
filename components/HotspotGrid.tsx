"use client";

import React from "react";
import { LocationStats, NAQICategory } from "@/lib/types";

interface HotspotGridProps {
  stats: LocationStats[];
  hotspots: string[];
}

export function HotspotGrid({ stats, hotspots }: HotspotGridProps) {
  const getNAQIColor = (category: NAQICategory) => {
    switch (category) {
      case "Good":
        return {
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
          badge: "bg-emerald-600 text-white",
        };
      case "Satisfactory":
        return {
          bg: "bg-lime-50",
          text: "text-lime-700",
          border: "border-lime-200",
          badge: "bg-lime-600 text-white",
        };
      case "Moderate":
        return {
          bg: "bg-amber-50",
          text: "text-amber-700",
          border: "border-amber-200",
          badge: "bg-amber-500 text-white",
        };
      case "Poor":
        return {
          bg: "bg-orange-50",
          text: "text-orange-700",
          border: "border-orange-200",
          badge: "bg-orange-500 text-white",
        };
      case "Very Poor":
        return {
          bg: "bg-rose-50",
          text: "text-rose-700",
          border: "border-rose-200",
          badge: "bg-rose-600 text-white",
        };
      case "Severe":
        return {
          bg: "bg-red-50",
          text: "text-red-900",
          border: "border-red-300",
          badge: "bg-red-700 text-white",
        };
      default:
        return {
          bg: "bg-slate-50",
          text: "text-slate-700",
          border: "border-slate-200",
          badge: "bg-slate-500 text-white",
        };
    }
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case "rising":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
            <span>↗</span> Rising
          </span>
        );
      case "falling":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
            <span>↘</span> Falling
          </span>
        );
      case "steady":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
            <span>➔</span> Steady
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
            Insufficient
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="p-4 sm:px-6 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm">
            📍
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <span>Ward Telemetry, NAQI Categories & Hotspots</span>
            </h3>
            <p className="text-xs text-slate-500">
              India NAQI benchmarks (CPCB) with first-half vs second-half trend analysis
            </p>
          </div>
        </div>

        {hotspots.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full">
            <span className="animate-pulse">●</span>
            <span>{hotspots.length} Urgent Hotspot{hotspots.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((item, idx) => {
          const isHotspot = hotspots.includes(item.location);
          const naqiColors = getNAQIColor(item.naqiCategory);

          return (
            <div
              key={`${item.location}-${item.pollutant}-${idx}`}
              className={`p-4 rounded-xl border transition-all ${
                isHotspot
                  ? "border-red-300 bg-gradient-to-b from-red-50/40 to-white shadow-xs ring-1 ring-red-400/30"
                  : "border-slate-200/80 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 leading-snug">
                    {item.location}
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500">
                    {item.pollutant.toUpperCase()} Telemetry
                  </span>
                </div>
                {isHotspot && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white uppercase tracking-wider shadow-2xs">
                    Hotspot
                  </span>
                )}
              </div>

              {/* NAQI Badge */}
              <div className="my-2.5 flex items-center justify-between">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${naqiColors.badge} shadow-2xs`}
                >
                  NAQI: {item.naqiCategory}
                </span>
                {getTrendBadge(item.trend)}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-lg bg-slate-50/80 border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-500 block">Mean Conc.</span>
                  <span className="text-base font-bold text-slate-800">
                    {item.mean !== null ? `${item.mean} µg/m³` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Peak Max</span>
                  <span className="text-base font-bold text-slate-800">
                    {item.max !== null ? `${item.max} µg/m³` : "—"}
                  </span>
                </div>
              </div>

              {/* Half comparison & counts */}
              <div className="space-y-1 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">1st Half Mean:</span>
                  <span className="font-mono">{item.firstHalfMean ?? "—"} µg/m³</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">2nd Half Mean:</span>
                  <span className="font-mono">{item.secondHalfMean ?? "—"} µg/m³</span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-slate-400">Valid / Missing:</span>
                  <span className="font-mono">
                    {item.count} / <span className="text-amber-600 font-semibold">{item.missing}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

