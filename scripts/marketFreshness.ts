import type { FinancialSnapshot, MarketSnapshot, ShareStructure } from "../src/domain/types";

export const FINANCIAL_FIELDS = [
  "revenue",
  "grossProfit",
  "ebitda",
  "netIncome",
  "operatingExpense",
  "totalCash",
  "totalDebt",
  "enterpriseValue",
  "freeCashflow",
  "operatingCashflow",
  "profitMargin"
] as const satisfies readonly (keyof FinancialSnapshot)[];

export type FinancialField = (typeof FINANCIAL_FIELDS)[number];

export interface FreshnessBuckets {
  stalePrice: boolean;
  marketAgeDays?: number;
  missingFinancialFields: FinancialField[];
  alternateListingOrProviderRoute: boolean;
  sourceQualityConcern: boolean;
}

export interface FreshnessCompanyResult {
  id: string;
  ticker: string;
  name: string;
  ok: boolean;
  statusCode?: number;
  elapsedMs?: number;
  marketSnapshot?: MarketSnapshot;
  financialSnapshot?: FinancialSnapshot;
  shareStructure?: ShareStructure;
  buckets?: FreshnessBuckets;
  error?: string;
}

export interface FreshnessSummary {
  stalePrices: string[];
  missingFinancialFields: Array<{ ticker: string; fields: FinancialField[] }>;
  alternateListingOrProviderRoutes: string[];
  sourceQualityConcerns: string[];
  failedCompanies: string[];
}

export function getMissingFinancialFields(financial: FinancialSnapshot | undefined): FinancialField[] {
  return FINANCIAL_FIELDS.filter((field) => {
    const value = financial?.[field];
    return financial?.status !== "sourced" || value === undefined || value === "Unavailable";
  });
}

export function marketAgeDays(asOf: string | undefined, auditedAt = Date.now()): number | undefined {
  if (!asOf || asOf === "Unavailable") return undefined;
  const timestamp = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`).valueOf();
  if (Number.isNaN(timestamp)) return undefined;
  return Math.floor((auditedAt - timestamp) / 86_400_000);
}

export function buildFreshnessBuckets(
  market: MarketSnapshot | undefined,
  financial: FinancialSnapshot | undefined,
  shares: ShareStructure | undefined,
  auditedAt = Date.now()
): FreshnessBuckets {
  const ageDays = marketAgeDays(market?.asOf, auditedAt);
  const sourceLabels = [market?.sourceLabel, financial?.sourceLabel].filter(Boolean).join(" ");

  return {
    stalePrice: ageDays === undefined || ageDays > 5,
    marketAgeDays: ageDays,
    missingFinancialFields: getMissingFinancialFields(financial),
    alternateListingOrProviderRoute: /alternate listing|provider route/i.test(sourceLabels),
    sourceQualityConcern:
      (market?.dataNeeded.length ?? 0) > 0 ||
      (financial?.dataNeeded.length ?? 0) > 0 ||
      (shares?.notes.length ?? 0) > 0
  };
}

export function summarizeFreshnessResults(results: FreshnessCompanyResult[]): FreshnessSummary {
  return {
    stalePrices: results.filter((result) => result.buckets?.stalePrice).map((result) => result.ticker),
    missingFinancialFields: results
      .filter((result) => (result.buckets?.missingFinancialFields.length ?? 0) > 0)
      .map((result) => ({ ticker: result.ticker, fields: result.buckets?.missingFinancialFields ?? [] })),
    alternateListingOrProviderRoutes: results
      .filter((result) => result.buckets?.alternateListingOrProviderRoute)
      .map((result) => result.ticker),
    sourceQualityConcerns: results
      .filter((result) => result.buckets?.sourceQualityConcern)
      .map((result) => result.ticker),
    failedCompanies: results.filter((result) => !result.ok).map((result) => result.ticker)
  };
}
