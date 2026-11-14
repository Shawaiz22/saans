import { describe, it, expect } from "vitest";
import { verifyFindings, verifyActions, verifyItemTraceability } from "../lib/verify";
import { Row, Finding, Action } from "../lib/types";

describe("verify.ts", () => {
  const sampleRows: Row[] = [
    {
      rowNumber: 1,
      location: "Ward 45 (Industrial)",
      rawValues: {},
      pollutants: { pm25: 120 },
    },
    {
      rowNumber: 2,
      location: "Ward 45 (Industrial)",
      rawValues: {},
      pollutants: { pm25: 180 },
    },
    {
      rowNumber: 3,
      location: "Ward 12 (Indiranagar)",
      rawValues: {},
      pollutants: { pm25: 35 },
    },
  ];

  const rowMap = new Map<number, Row>();
  sampleRows.forEach((r) => rowMap.set(r.rowNumber, r));

  it("marks item verified when all cited rows exist and match the location", () => {
    const item = {
      location: "Ward 45 (Industrial)",
      citedRowNumbers: [1, 2],
    };

    const result = verifyItemTraceability(item, rowMap, sampleRows.length);
    expect(result.status).toBe("verified");
    expect(result.reason).toBeUndefined();
  });

  it("marks item unverified when cited row does not exist", () => {
    const item = {
      location: "Ward 45 (Industrial)",
      citedRowNumbers: [1, 99],
    };

    const result = verifyItemTraceability(item, rowMap, sampleRows.length);
    expect(result.status).toBe("unverified");
    expect(result.reason).toContain("Row 99 does not exist");
  });

  it("marks item unverified when row exists but belongs to wrong location", () => {
    // Row 3 exists, but belongs to Ward 12, whereas the claim is for Ward 45
    const item = {
      location: "Ward 45 (Industrial)",
      citedRowNumbers: [1, 3],
    };

    const result = verifyItemTraceability(item, rowMap, sampleRows.length);
    expect(result.status).toBe("unverified");
    expect(result.reason).toContain("Row 3 belongs to 'Ward 12 (Indiranagar)', not 'Ward 45 (Industrial)'");
  });

  it("marks item unverified when citedRowNumbers is empty", () => {
    const item = {
      location: "Ward 45 (Industrial)",
      citedRowNumbers: [],
    };

    const result = verifyItemTraceability(item, rowMap, sampleRows.length);
    expect(result.status).toBe("unverified");
    expect(result.reason).toContain("No data rows cited");
  });

  it("verifies findings and actions batches accurately", () => {
    const findings: Finding[] = [
      {
        id: "f1",
        location: "Ward 45 (Industrial)",
        headline: "Rising PM2.5 in Industrial zone",
        description: "Observations show consistent increases.",
        citedRowNumbers: [1, 2],
      },
      {
        id: "f2",
        location: "Ward 45 (Industrial)",
        headline: "False claim using another ward's row",
        description: "This finding improperly references Ward 12.",
        citedRowNumbers: [3], // row exists but belongs to Ward 12!
      },
    ];

    const verifiedFindings = verifyFindings(findings, sampleRows);
    expect(verifiedFindings[0].verificationStatus).toBe("verified");
    expect(verifiedFindings[1].verificationStatus).toBe("unverified");
    expect(verifiedFindings[1].verificationReason).toContain("belongs to 'Ward 12 (Indiranagar)', not 'Ward 45 (Industrial)'");

    const actions: Action[] = [
      {
        id: "a1",
        priority: "immediate",
        targetRole: "ward_officer",
        location: "Ward 45 (Industrial)",
        title: "Deploy water misting cannons",
        action: "Spray arterial industrial avenues immediately.",
        rationale: "Grounded in high particulate spikes.",
        citedRowNumbers: [2],
      },
      {
        id: "a2",
        priority: "high",
        targetRole: "school",
        location: "Ward 45 (Industrial)",
        title: "Cancel outdoor activities",
        action: "Move physical education classes indoors.",
        rationale: "Bad citations.",
        citedRowNumbers: [500], // row doesn't exist
      },
    ];

    const verifiedActions = verifyActions(actions, sampleRows);
    expect(verifiedActions[0].verificationStatus).toBe("verified");
    expect(verifiedActions[1].verificationStatus).toBe("unverified");
  });
});

