import { describe, expect, it, vi } from "vitest";
import {
  collectFmpMarketSnapshot,
  collectMarketData,
  collectMarketSnapshot,
  collectYahooSupplementalData,
  collectYahooMarketSnapshot,
  mapYahooSupplementalData,
  normalizeYahooSymbol,
  yahooSupplementalSymbolCandidates
} from "../src/domain/sourceAdapters";
import type { CompanyCandidate } from "../src/domain/types";

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

describe("collectFmpMarketSnapshot", () => {
  it("maps FMP profile and shares-float data into a sourced market snapshot", async () => {
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("profile")) {
        return Response.json([
          {
            symbol: "USGO",
            price: 1.23,
            marketCap: 18000000,
            change: 0.04,
            changePercentage: 3.36,
            volume: 125000,
            averageVolume: 98000,
            range: "0.80-2.40",
            currency: "USD"
          }
        ]);
      }
      return Response.json([
        {
          symbol: "USGO",
          date: "2026-06-30 20:59:30",
          freeFloat: 72.5,
          floatShares: 10500000,
          outstandingShares: 14600000,
          source: "FMP"
        }
      ]);
    });

    const snapshot = await collectFmpMarketSnapshot(company, { apiKey: "test-key", fetcher });

    expect(snapshot).toBeDefined();
    if (!snapshot) throw new Error("Expected FMP snapshot");
    expect(snapshot.status).toBe("sourced");
    expect(snapshot.price).toBe("$1.23");
    expect(snapshot.changePercent).toBe("+$0.04 (+3.36%)");
    expect(snapshot.marketCap).toBe("$18.0M");
    expect(snapshot.volume).toBe("125,000");
    expect(snapshot.averageVolume).toBe("98,000");
    expect(snapshot.fiftyTwoWeekLow).toBe("$0.80");
    expect(snapshot.fiftyTwoWeekHigh).toBe("$2.40");
    expect(snapshot.sharesOutstanding).toBe("14.6M");
    expect(snapshot.asOf).toBe("2026-06-30");
  });

  it("uses a fresher FMP alternate listing when the primary Canadian symbol is stale", async () => {
    const fallbackCompany: CompanyCandidate = {
      ...company,
      ticker: "GMIN.V",
      exchange: "TSXV",
      country: "CA",
      aliases: ["G Mining Ventures", "GMIN.TO", "GMINF"]
    };
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const symbol = new URL(url).searchParams.get("symbol");
      if (url.includes("profile")) {
        if (symbol === "GMIN.V") {
          return Response.json([{ symbol, price: 1.68, marketCap: 751800000, currency: "CAD" }]);
        }
        if (symbol === "GMIN.TO") {
          return Response.json([{ symbol, price: 42.17, marketCap: 10000000000, currency: "CAD" }]);
        }
      }
      if (symbol === "GMIN.V") return Response.json([{ symbol, date: "2024-01-10", outstandingShares: 447500000 }]);
      if (symbol === "GMIN.TO") return Response.json([{ symbol, date: "2026-07-07", outstandingShares: 237700000 }]);
      return Response.json([]);
    });

    const snapshot = await collectFmpMarketSnapshot(fallbackCompany, { apiKey: "test-key", fetcher });

    expect(snapshot?.price).toBe("$42.17");
    expect(snapshot?.marketCap).toBe("$10.0B");
    expect(snapshot?.sharesOutstanding).toBe("237.7M");
    expect(snapshot?.asOf).toBe("2026-07-07");
  });
});

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
  it("uses Yahoo as the primary source when Yahoo returns complete data", async () => {
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
    const fmpFetcher: typeof fetch = vi.fn(async () => Response.json([]));

    const snapshot = await collectMarketSnapshot(company, { yahooFetcher, fmpOptions: { apiKey: "test-key", fetcher: fmpFetcher } });

    expect(snapshot.status).toBe("sourced");
    expect(snapshot.price).toBe("$1.45");
    expect(snapshot.sharesOutstanding).toBe("14.4M");
    expect(snapshot.sourceLabel).toBe("Yahoo Finance via YFinance");
    expect(fmpFetcher).not.toHaveBeenCalled();
  });

  it("fills missing Yahoo fields from FMP", async () => {
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
              currency: "USD",
              regularMarketTime: Math.floor(Date.now() / 1000)
            }
          ]
        }
      })
    );
    const fmpFetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("profile")) {
        return Response.json([{ symbol: "USGO", currency: "USD" }]);
      }
      return Response.json([{ symbol: "USGO", date: "2026-06-30", outstandingShares: 14600000 }]);
    });

    const snapshot = await collectMarketSnapshot(company, { yahooFetcher, fmpOptions: { apiKey: "test-key", fetcher: fmpFetcher } });

    expect(snapshot.status).toBe("sourced");
    expect(snapshot.price).toBe("$1.45");
    expect(snapshot.sharesOutstanding).toBe("14.6M");
    expect(snapshot.sourceLabel).toBe("Yahoo Finance + FMP fallback");
  });

  it("cross-checks stale complete Yahoo snapshots with newer FMP float data", async () => {
    const staleYahooDate = daysAgoIso(10);
    const fmpShareDate = daysAgoIso(1);
    const yahooFetcher: typeof fetch = vi.fn(async () =>
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "ASCU.TO",
              quoteType: "EQUITY",
              regularMarketPrice: 8.06,
              regularMarketChange: 0.19,
              regularMarketChangePercent: 2.41,
              marketCap: 1684603904,
              regularMarketVolume: 2934245,
              averageDailyVolume3Month: 1459081,
              fiftyTwoWeekHigh: 10.725,
              fiftyTwoWeekLow: 2.2,
              sharesOutstanding: 209007925,
              currency: "CAD",
              regularMarketTime: staleYahooDate
            }
          ]
        }
      })
    );
    const fmpFetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("profile")) {
        return Response.json([
          {
            symbol: "ASCU.TO",
            price: 8.06,
            marketCap: 1447863154,
            change: 0.19,
            changePercentage: 2.41,
            volume: 2934245,
            averageVolume: 1459081,
            range: "2.2-10.725",
            currency: "CAD"
          }
        ]);
      }
      return Response.json([{ symbol: "ASCU.TO", date: fmpShareDate, outstandingShares: 179635627 }]);
    });

    const snapshot = await collectMarketSnapshot(
      { ...company, ticker: "ASCU.TO", exchange: "TSX", country: "CA" },
      { yahooFetcher, fmpOptions: { apiKey: "test-key", fetcher: fmpFetcher } }
    );

    expect(snapshot.price).toBe("$8.06");
    expect(snapshot.marketCap).toBe("$1.4B");
    expect(snapshot.sharesOutstanding).toBe("179.6M");
    expect(snapshot.asOf).toBe(fmpShareDate);
    expect(snapshot.sourceLabel).toBe("Yahoo Finance + FMP fallback");
  });

  it("falls back to FMP when Yahoo fails", async () => {
    const yahooFetcher: typeof fetch = vi.fn(async () => new Response("blocked", { status: 503 }));
    const fmpFetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("profile")) {
        return Response.json([{ symbol: "USGO", price: 1.23, currency: "USD", marketCap: 18000000 }]);
      }
      return Response.json([{ symbol: "USGO", date: "2026-06-30", outstandingShares: 14600000 }]);
    });

    const snapshot = await collectMarketSnapshot(company, { yahooFetcher, fmpOptions: { apiKey: "test-key", fetcher: fmpFetcher } });

    expect(snapshot.status).toBe("sourced");
    expect(snapshot.price).toBe("$1.23");
    expect(snapshot.sourceLabel).toBe("FMP fallback");
  });

  it("returns a not-sourced snapshot when Yahoo and FMP both fail", async () => {
    const yahooFetcher: typeof fetch = vi.fn(async () => new Response("blocked", { status: 503 }));
    const fmpFetcher: typeof fetch = vi.fn(async () => new Response("blocked", { status: 503 }));

    const snapshot = await collectMarketSnapshot(company, { yahooFetcher, fmpOptions: { apiKey: "test-key", fetcher: fmpFetcher } });

    expect(snapshot.status).toBe("not_sourced");
    expect(snapshot.sourceLabel).toBe("Yahoo Finance and FMP unavailable");
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
    const fmpFetcher: typeof fetch = vi.fn(async () => Response.json([]));

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
      },
      fmpOptions: { apiKey: "test-key", fetcher: fmpFetcher }
    });

    expect(marketData.marketSnapshot.sourceLabel).toBe("Yahoo Finance via YFinance");
    expect(marketData.marketSnapshot.price).toBe("$1.45");
    expect(marketData.supplemental.analystForecast?.priceTarget).toBe("$2.10");
    expect(marketData.supplemental.financialSnapshot?.revenue).toBe("$0");
    expect(marketData.supplemental.shareStructure?.publicFloat).toBe("9.1M");
    expect(fmpFetcher).not.toHaveBeenCalled();
  });

  it("uses newer FMP shares to correct stale Yahoo supplemental share structure", async () => {
    const staleYahooDate = daysAgoIso(10);
    const fmpShareDate = daysAgoIso(1);
    const yahooFetcher: typeof fetch = vi.fn(async () =>
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "ASCU.TO",
              quoteType: "EQUITY",
              regularMarketPrice: 8.06,
              marketCap: 1684603904,
              sharesOutstanding: 209007925,
              currency: "CAD",
              regularMarketTime: staleYahooDate
            }
          ]
        }
      })
    );
    const fmpFetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("profile")) {
        return Response.json([{ symbol: "ASCU.TO", price: 8.06, marketCap: 1447863154, currency: "CAD" }]);
      }
      return Response.json([{ symbol: "ASCU.TO", date: fmpShareDate, outstandingShares: 179635627 }]);
    });

    const marketData = await collectMarketData(
      { ...company, ticker: "ASCU.TO", exchange: "TSX", country: "CA" },
      {
        yahooFetcher,
        yahooSummary: {
          defaultKeyStatistics: {
            sharesOutstanding: 209007925,
            floatShares: 209007925,
            heldPercentInsiders: 0.107,
            heldPercentInstitutions: 0.51
          }
        },
        fmpOptions: { apiKey: "test-key", fetcher: fmpFetcher }
      }
    );

    expect(marketData.marketSnapshot.sourceLabel).toBe("Yahoo Finance + FMP fallback");
    expect(marketData.marketSnapshot.sharesOutstanding).toBe("179.6M");
    expect(marketData.supplemental.shareStructure?.sharesOutstanding).toBe("179.6M");
    expect(marketData.supplemental.shareStructure?.publicFloat).toBeUndefined();
    expect(marketData.supplemental.shareStructure?.asOf).toBe(fmpShareDate);
  });
});
