import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectSources,
  collectMarketData,
  collectMarketSnapshot,
  collectYahooSupplementalData,
  collectYahooMarketSnapshot,
  mapYahooSupplementalData,
  normalizeYahooSymbol,
  yahooSupplementalSymbolCandidates
} from "../src/domain/sourceAdapters";
import type { CompanyCandidate } from "../src/domain/types";

vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  readFileSync: vi.fn(() => { throw new Error("Config access is forbidden"); })
}));

const company: CompanyCandidate = {
  id: "us-gold-mining",
  name: "US GoldMining Inc.",
  ticker: "USGO",
  exchange: "NASDAQ",
  country: "US",
  commodityFocus: ["Gold", "Copper"]
};

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const daysAgoUnixSeconds = (days: number) => Math.floor(new Date(`${daysAgoIso(days)}T20:00:00.000Z`).valueOf() / 1000);
const daysAgoUnixMilliseconds = (days: number) => new Date(`${daysAgoIso(days)}T20:00:00.000Z`).valueOf();

describe("collectYahooMarketSnapshot", () => {
  it("maps Yahoo Finance quote data into a sourced market snapshot", async () => {
    const quoteDate = daysAgoIso(1);
    const fetcher: typeof fetch = vi.fn(async () =>
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "USGO",
              regularMarketPrice: 1.45,
              regularMarketChange: -0.05,
              regularMarketChangePercent: -3.33,
              marketCap: 21000000,
              regularMarketVolume: 250000,
              averageDailyVolume3Month: 180000,
              fiftyTwoWeekHigh: 2.75,
              fiftyTwoWeekLow: 0.91,
              sharesOutstanding: 14400000,
              currency: "USD",
              regularMarketTime: daysAgoUnixSeconds(1)
            }
          ]
        }
      })
    );

    const snapshot = await collectYahooMarketSnapshot(company, { fetcher });

    expect(snapshot).toBeDefined();
    if (!snapshot) throw new Error("Expected Yahoo snapshot");
    expect(snapshot.status).toBe("sourced");
    expect(snapshot.price).toBe("$1.45");
    expect(snapshot.changePercent).toBe("-$0.05 (-3.33%)");
    expect(snapshot.marketCap).toBe("$21.0M");
    expect(snapshot.volume).toBe("250,000");
    expect(snapshot.averageVolume).toBe("180,000");
    expect(snapshot.fiftyTwoWeekHigh).toBe("$2.75");
    expect(snapshot.fiftyTwoWeekLow).toBe("$0.91");
    expect(snapshot.sharesOutstanding).toBe("14.4M");
    expect(snapshot.asOf).toBe(quoteDate);
    expect(snapshot.sourceLabel).toBe("Yahoo Finance via YFinance");
  });

  it("normalizes Yahoo market timestamps whether they arrive as seconds or milliseconds", async () => {
    const quoteDate = daysAgoIso(1);
    const fetcher: typeof fetch = vi.fn(async () =>
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "USGO",
              regularMarketPrice: 1.45,
              currency: "USD",
              regularMarketTime: daysAgoUnixMilliseconds(1)
            }
          ]
        }
      })
    );

    const snapshot = await collectYahooMarketSnapshot(company, { fetcher });

    expect(snapshot).toBeDefined();
    expect(snapshot?.asOf).toBe(quoteDate);
  });

  it("preserves Yahoo-compatible Canadian suffixes", () => {
    expect(normalizeYahooSymbol({ ...company, ticker: "SGD.V", exchange: "TSXV", country: "CA" })).toBe("SGD.V");
    expect(normalizeYahooSymbol({ ...company, ticker: "WRN.TO", exchange: "TSX", country: "CA" })).toBe("WRN.TO");
    expect(normalizeYahooSymbol(company)).toBe("USGO");
  });

  it("builds supplemental fallback candidates for sparse Canadian Yahoo listings", () => {
    expect(
      yahooSupplementalSymbolCandidates({
        ...company,
        ticker: "SGD.V",
        exchange: "TSXV",
        country: "CA",
        aliases: ["Snowline", "SGD.TO", "SNWGF"]
      })
    ).toEqual(["SGD.V", "SGD.TO", "SNWGF", "SGD.NE"]);
  });

  it("skips stale or misclassified Yahoo market quotes and uses the current alternate listing", async () => {
    const alternateQuoteDate = daysAgoIso(1);
    const fallbackCompany: CompanyCandidate = {
      ...company,
      ticker: "ISO.V",
      exchange: "TSXV",
      country: "CA",
      aliases: ["IsoEnergy", "ISO.TO", "ISOU", "ISENF"]
    };
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const symbol = new URL(url).searchParams.get("symbols");
      if (symbol === "ISO.V") {
        return Response.json({
          quoteResponse: {
            result: [
              {
                symbol: "ISO.V",
                quoteType: "MUTUALFUND",
                regularMarketPrice: 3.63,
                currency: "CAD",
                regularMarketTime: "2024-07-23"
              }
            ]
          }
        });
      }
      return Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "ISO.TO",
              quoteType: "EQUITY",
              regularMarketPrice: 15.02,
              regularMarketChange: 0.44,
              regularMarketChangePercent: 3.02,
              marketCap: 976127296,
              regularMarketVolume: 55895,
              averageDailyVolume3Month: 100000,
              fiftyTwoWeekHigh: 16,
              fiftyTwoWeekLow: 4,
              sharesOutstanding: 64988500,
              currency: "CAD",
              regularMarketTime: alternateQuoteDate
            }
          ]
        }
      });
    });

    const snapshot = await collectYahooMarketSnapshot(fallbackCompany, { fetcher });

    expect(snapshot?.price).toBe("$15.02");
    expect(snapshot?.sourceLabel).toContain("ISO.TO alternate listing");
    expect(snapshot?.sourceUrl).toContain("ISO.TO");
  });
});

describe("mapYahooSupplementalData", () => {
  it("maps Yahoo quoteSummary data into forecasts, financials, and share structure", () => {
    const supplemental = mapYahooSupplementalData(company, {
      financialData: {
        currentPrice: 1.45,
        targetMeanPrice: 2.1,
        targetMedianPrice: 2,
        recommendationKey: "buy",
        numberOfAnalystOpinions: 4,
        totalRevenue: 0,
        grossProfits: -1200000,
        ebitda: -8400000,
        totalCash: 11200000,
        totalDebt: 900000,
        freeCashflow: -6300000,
        operatingCashflow: -6100000
      },
      defaultKeyStatistics: {
        sharesOutstanding: 14400000,
        floatShares: 9100000,
        heldPercentInsiders: 0.185,
        heldPercentInstitutions: 0.072,
        enterpriseValue: 9850000,
        profitMargins: -0.42
      },
      majorHoldersBreakdown: {
        insidersPercentHeld: 0.185,
        institutionsPercentHeld: 0.072
      },
      recommendationTrend: {
        trend: [{ period: "0m", strongBuy: 1, buy: 2, hold: 1, sell: 0, strongSell: 0 }]
      },
      incomeStatementHistory: {
        incomeStatementHistory: [{ endDate: "2025-12-31", totalOperatingExpenses: 0 }]
      }
    });

    expect(supplemental.analystForecast?.status).toBe("sourced");
    expect(supplemental.analystForecast?.consensusLabel).toBe("Buy consensus from 4 analysts");
    expect(supplemental.analystForecast?.priceTarget).toBe("$2.10");
    expect(supplemental.analystForecast?.upsideDownside).toBe("+44.8%");
    expect(supplemental.financialSnapshot?.status).toBe("sourced");
    expect(supplemental.financialSnapshot?.ebitda).toBe("-$8.4M");
    expect(supplemental.financialSnapshot?.operatingExpense).toBeUndefined();
    expect(supplemental.financialSnapshot?.totalCash).toBe("$11.2M");
    expect(supplemental.shareStructure?.sharesOutstanding).toBe("14.4M");
    expect(supplemental.shareStructure?.publicFloat).toBe("9.1M");
    expect(supplemental.shareStructure?.insiderOwnership).toBe("18.5%");
    expect(supplemental.shareStructure?.institutionalOwnership).toBe("7.2%");
  });
});

describe("collectYahooSupplementalData", () => {
  it("fills financials from an alternate Yahoo listing when the primary symbol is sparse", async () => {
    const fallbackCompany: CompanyCandidate = {
      ...company,
      ticker: "SGD.V",
      exchange: "TSXV",
      country: "CA",
      aliases: ["Snowline", "SGD.TO", "SNWGF"]
    };
    const fetcher = vi.fn(async (symbol: string) => {
      if (symbol === "SGD.V") return {};
      if (symbol === "SGD.TO") {
        return {
          financialData: {
            currentPrice: 9.5,
            totalCash: 100516000,
            ebitda: -71388360,
            totalDebt: 204000,
            freeCashflow: -39461552,
            operatingCashflow: -61363532
          },
          defaultKeyStatistics: {
            sharesOutstanding: 176106260,
            floatShares: 131590120,
            heldPercentInsiders: 0.16024,
            heldPercentInstitutions: 0.21399,
            netIncomeToCommon: -59288384,
            mostRecentQuarter: "2026-03-30 20:00:00"
          }
        };
      }
      return {};
    });

    const supplemental = await collectYahooSupplementalData(fallbackCompany, fetcher);

    expect(fetcher).toHaveBeenCalledWith("SGD.V");
    expect(fetcher).toHaveBeenCalledWith("SGD.TO");
    expect(supplemental.financialSnapshot?.status).toBe("sourced");
    expect(supplemental.financialSnapshot?.totalCash).toBe("$100.5M");
    expect(supplemental.financialSnapshot?.sourceUrl).toContain("SGD.TO");
    expect(supplemental.shareStructure?.sharesOutstanding).toBe("176.1M");
  });
});

describe("collectMarketSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(["partial", "older", "failed", "empty", "throws"])(
    "uses only Yahoo for %s quotes without config or external fetch access",
    async (scenario) => {
      const externalFetch = vi.fn(() => { throw new Error("Unexpected external request"); });
      vi.stubGlobal("fetch", externalFetch);
      const yahooFetcher: typeof fetch = vi.fn(async (input) => {
        expect(new URL(String(input)).hostname).toBe("query1.finance.yahoo.com");
        if (scenario === "throws") throw new Error("Yahoo unavailable");
        if (scenario === "failed") return new Response("Unavailable", { status: 503 });
        return Response.json({ quoteResponse: { result: scenario === "empty" ? [] : [{
          symbol: "USGO",
          regularMarketPrice: 1.45,
          currency: "USD",
          regularMarketTime: daysAgoIso(scenario === "older" ? 10 : 1)
        }] } });
      });

      const snapshot = await collectMarketSnapshot(company, { yahooFetcher });

      expect(externalFetch).not.toHaveBeenCalled();
      expect(readFileSync).not.toHaveBeenCalled();
      if (["failed", "empty", "throws"].includes(scenario)) {
        expect(snapshot.status).toBe("not_sourced");
        expect(snapshot.sourceLabel).toBe("Yahoo Finance unavailable");
        expect(snapshot.price).toBeUndefined();
      } else {
        expect(snapshot.status).toBe("sourced");
        expect(snapshot.price).toBe("$1.45");
        expect(snapshot.sharesOutstanding).toBeUndefined();
        expect(snapshot.marketCap).toBeUndefined();
        expect(snapshot.sourceLabel).toBe("Yahoo Finance via YFinance");
        expect(snapshot.asOf).toBe(daysAgoIso(scenario === "older" ? 10 : 1));
      }
    }
  );

  it("advertises only Yahoo market data and no seeded provider profile", () => {
    const result = collectSources(company);
    expect(result.adapters.find((adapter) => adapter.id === "market-data")).toMatchObject({
      name: "Yahoo/YFinance market data",
      status: "configured"
    });
    expect(result.sources.filter((source) => source.sourceType === "market_data")).toEqual([]);
  });
});

describe("collectMarketData", () => {
  it("returns market snapshot and Yahoo supplemental data through one adapter boundary", async () => {
    const yahooFetcher: typeof fetch = vi.fn(async () =>
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "USGO",
              regularMarketPrice: 1.45,
              regularMarketChange: 0.02,
              regularMarketChangePercent: 1.4,
              marketCap: 21000000,
              regularMarketVolume: 250000,
              averageDailyVolume3Month: 180000,
              fiftyTwoWeekHigh: 2.75,
              fiftyTwoWeekLow: 0.91,
              sharesOutstanding: 14400000,
              currency: "USD",
              regularMarketTime: Math.floor(Date.now() / 1000)
            }
          ]
        }
      })
    );

    const marketData = await collectMarketData(company, {
      yahooFetcher,
      yahooSummary: {
        financialData: {
          currentPrice: 1.45,
          targetMeanPrice: 2.1,
          recommendationKey: "buy",
          numberOfAnalystOpinions: 4,
          totalRevenue: 0,
          totalCash: 11200000
        },
        defaultKeyStatistics: {
          sharesOutstanding: 14400000,
          floatShares: 9100000,
          heldPercentInsiders: 0.185
        }
      }
    });

    expect(marketData.marketSnapshot.sourceLabel).toBe("Yahoo Finance via YFinance");
    expect(marketData.marketSnapshot.price).toBe("$1.45");
    expect(marketData.supplemental.analystForecast?.priceTarget).toBe("$2.10");
    expect(marketData.supplemental.financialSnapshot?.revenue).toBe("$0");
    expect(marketData.supplemental.shareStructure?.publicFloat).toBe("9.1M");
  });

});
