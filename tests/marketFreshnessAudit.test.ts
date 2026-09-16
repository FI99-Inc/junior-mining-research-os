import { describe, expect, it } from "vitest";
import {
  buildFreshnessBuckets,
  getMissingFinancialFields,
  marketAgeDays,
  summarizeFreshnessResults,
  type FreshnessCompanyResult
} from "../scripts/marketFreshness";
import type { FinancialSnapshot, MarketSnapshot, ShareStructure } from "../src/domain/types";

const marketSnapshot: MarketSnapshot = {
  status: "sourced",
  price: "$1.25",
  sourceLabel: "Yahoo Finance via YFinance",
  asOf: "2026-09-15",
  dataNeeded: []
};

const financialSnapshot: FinancialSnapshot = {
  status: "sourced",
  revenue: "$0",
  totalCash: "$12.0M",
  sourceLabel: "Yahoo Finance via YFinance",
  asOf: "2026-06-30",
  dataNeeded: []
};

const shareStructure: ShareStructure = {
  asOf: "2026-06-30",
  floatQuality: "Public float reported",
  notes: []
};

describe("market freshness audit helpers", () => {
  it("calculates market age against a supplied audit timestamp", () => {
    const auditedAt = Date.parse("2026-09-16T12:00:00.000Z");

    expect(marketAgeDays("2026-09-10", auditedAt)).toBe(6);
    expect(marketAgeDays("Unavailable", auditedAt)).toBeUndefined();
    expect(marketAgeDays(undefined, auditedAt)).toBeUndefined();
  });

  it("reports unavailable financial fields without treating zero as missing", () => {
    expect(getMissingFinancialFields(financialSnapshot)).toContain("ebitda");
    expect(getMissingFinancialFields(financialSnapshot)).not.toContain("revenue");
    expect(getMissingFinancialFields(undefined)).toHaveLength(11);
  });

  it("keeps route observations and source-quality concerns in separate buckets", () => {
    const buckets = buildFreshnessBuckets(
      { ...marketSnapshot, sourceLabel: "Yahoo Finance via ABC.TO alternate listing", dataNeeded: ["Current volume"] },
      financialSnapshot,
      { ...shareStructure, notes: ["Insider ownership unavailable"] },
      Date.parse("2026-09-16T12:00:00.000Z")
    );

    expect(buckets.alternateListingOrProviderRoute).toBe(true);
    expect(buckets.sourceQualityConcern).toBe(true);
    expect(buckets.stalePrice).toBe(false);
  });

  it("summarizes failed companies and each evidence-quality bucket independently", () => {
    const results: FreshnessCompanyResult[] = [
      {
        id: "alpha",
        ticker: "AAA.V",
        name: "Alpha Mining",
        ok: true,
        buckets: {
          stalePrice: true,
          marketAgeDays: 9,
          missingFinancialFields: ["ebitda"],
          alternateListingOrProviderRoute: true,
          sourceQualityConcern: false
        }
      },
      {
        id: "beta",
        ticker: "BBB",
        name: "Beta Mining",
        ok: false,
        error: "Provider unavailable"
      }
    ];

    expect(summarizeFreshnessResults(results)).toEqual({
      stalePrices: ["AAA.V"],
      missingFinancialFields: [{ ticker: "AAA.V", fields: ["ebitda"] }],
      alternateListingOrProviderRoutes: ["AAA.V"],
      sourceQualityConcerns: [],
      failedCompanies: ["BBB"]
    });
  });
});
