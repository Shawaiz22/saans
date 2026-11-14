"use client";

import React, { useState } from "react";
import { QualityFlag } from "@/lib/types";

interface QualityAuditCardProps {
  totalRows: number;
  totalMissing: number;
  totalFlags: number;
  flagsByType: Record<string, number>;
  flags: QualityFlag[];
  reliabilityAssessment: string;
  onRowClick?: (rowNum: number) => void;
}

export function QualityAuditCard({
  totalRows,
  totalMissing,
  totalFlags,
  flagsByType,
  flags,
  reliabilityAssessment,
  onRowClick,
}: QualityAuditCardProps) {
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const filteredFlags =
    selectedFilter === "all"
      ? flags
      : flags.filter((f) => f.type === selectedFilter);

  const getBadgeColor = (type: string) => {
    switch (type) {
      case "missing":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "negative":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "unit_mismatch":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "spike":
        return "bg-red-50 text-red-700 border-red-200";
      case "stuck_sensor":
        return "bg-orange-50 text-orange-700 border-orange-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="p-4 sm:px-6 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
            🛡️
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <span>Deterministic Sensor & Data Quality Audit</span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Pure Code Engine
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Sensor integrity flags & missing counts calculated by deterministic code rules, never by AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
              reliabilityAssessment.toLowerCase().includes("high")
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : reliabilityAssessment.toLowerCase().includes("moderate")
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}
          >
            Reliability: {reliabilityAssessment}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded cursor-pointer"
          >
            {isExpanded ? "Collapse ▲" : "Expand ▼"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 sm:p-6 space-y-5">
          {/* Defect Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              {
                type: "missing",
                label: "Missing Values",
                count: flagsByType.missing || totalMissing,
                desc: 'Blanks, "NA", "null", "-"',
                color: "amber",
              },
              {
                type: "negative",
                label: "Negative Readings",
                count: flagsByType.negative || 0,
                desc: "Sensor drift / < 0 values",
                color: "rose",
              },
              {
                type: "unit_mismatch",
                label: "Unit Mismatch",
                count: flagsByType.unit_mismatch || 0,
                desc: "mg/m³ converted to µg/m³",
                color: "purple",
              },
              {
                type: "spike",
                label: "Severe Spikes",
                count: flagsByType.spike || 0,
                desc: "> 5x location median",
                color: "red",
              },
              {
                type: "stuck_sensor",
                label: "Stuck Sensors",
                count: flagsByType.stuck_sensor || 0,
                desc: "Identical value 6+ times",
                color: "orange",
              },
            ].map((card) => {
              const isActive = selectedFilter === card.type;
              return (
                <button
                  key={card.type}
                  type="button"
                  onClick={() =>
                    setSelectedFilter(isActive ? "all" : card.type)
                  }
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isActive
                      ? "ring-2 ring-sky-500 border-transparent shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">
                      {card.label}
                    </span>
                    <span className="text-base font-bold text-slate-900">
                      {card.count}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    {card.desc}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Flags Audit Log Table */}
          {flags.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {filteredFlags.length} of {totalFlags} flagged items
                  {selectedFilter !== "all" && ` (filtered by ${selectedFilter})`}
                </span>
                {selectedFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setSelectedFilter("all")}
                    className="text-sky-600 hover:underline cursor-pointer"
                  >
                    Reset filter
                  </button>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 font-semibold w-16">Row #</th>
                      <th className="py-2 px-3 font-semibold">Location / Ward</th>
                      <th className="py-2 px-3 font-semibold">Pollutant</th>
                      <th className="py-2 px-3 font-semibold">Defect Type</th>
                      <th className="py-2 px-3 font-semibold">Audit Finding & Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredFlags.map((flag, idx) => (
                      <tr
                        key={`${flag.rowNumber}-${flag.type}-${idx}`}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono font-medium text-slate-700">
                          {onRowClick ? (
                            <button
                              type="button"
                              onClick={() => onRowClick(flag.rowNumber)}
                              className="text-sky-600 hover:text-sky-800 underline font-semibold cursor-pointer"
                              title="Click to highlight in data table"
                            >
                              #{flag.rowNumber}
                            </button>
                          ) : (
                            `#${flag.rowNumber}`
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-medium">
                          {flag.location}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {flag.pollutant ? flag.pollutant.toUpperCase() : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getBadgeColor(
                              flag.type
                            )}`}
                          >
                            {flag.type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {flag.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <span>✓</span>
              <span>All readings are cleanly structured with zero sensor faults or missing values detected.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

