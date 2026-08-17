import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AdapterStatus, AnalystForecast, CompanyCandidate, FinancialSnapshot, MarketSnapshot, ShareStructure, SourceDocument } from "./types";

const retrievedAt = "2026-06-29T12:00:00.000Z";

const seededSources: Record<string, SourceDocument[]> = {
  "us-gold-mining": [
    {
      id: "sec-usgo-10k",
      title: "SEC annual filing",
      sourceType: "filing",
      publisher: "SEC EDGAR",
      url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
      retrievedAt,
      excerpts: [
        "The company is an exploration-stage issuer focused on the Whistler gold-copper project in Alaska.",
        "The company reported no revenue from mining operations and expects to need additional financing."
      ]
    },
    {
      id: "usgo-presentation",
      title: "Corporate presentation",
      sourceType: "presentation",
      publisher: "Company website",
      url: "https://example.com/usgo-presentation",
      retrievedAt,
      excerpts: [
        "Management highlights district-scale exploration potential and proximity to existing infrastructure.",
        "Upcoming catalysts include drilling results and updated technical work."
      ]
    },
    {
      id: "usgo-drill-news",
      title: "Exploration update highlights drilling and technical work",
      sourceType: "news",
      publisher: "Company news",
      url: "https://example.com/usgo-drill-news",
      retrievedAt,
      excerpts: [
        "The company reported drilling-focused exploration updates at the Whistler project.",
        "The update frames drill results and technical work as near-term catalysts for evaluating project scale."
      ]
    },
    {
      id: "fmp-usgo-profile",
      title: "Market profile adapter result",
      sourceType: "market_data",
      publisher: "FMP-style provider adapter",
      url: "https://site.financialmodelingprep.com/developer/docs",
      retrievedAt,
      excerpts: ["Market-data adapter records ticker, exchange, and commodity exposure for the company profile."]
    }
  ],
  "snowline-gold": [
    {
      id: "sedar-snowline-search",
      title: "SEDAR+ disclosure search placeholder",
      sourceType: "regulatory_search",
      publisher: "SEDAR+",
      url: "https://www.sedarplus.ca/",
      retrievedAt,
      excerpts: [
        "SEDAR+ public search is the required regulatory discovery path for Canadian issuer filings.",
        "Upcoming catalysts include drilling results and updated technical work."
      ]
    },
    {
      id: "snowline-presentation",
      title: "Exploration presentation",
      sourceType: "presentation",
      publisher: "Company website",
      url: "https://example.com/snowline-presentation",
      retrievedAt,
      excerpts: ["The company describes a gold exploration project with district-scale discovery potential."]
    }
  ],
  "g-mining-ventures": [
    {
      id: "sedar-gmin-search",
      title: "SEDAR+ disclosure search placeholder",
      sourceType: "regulatory_search",
      publisher: "SEDAR+",
      url: "https://www.sedarplus.ca/",
      retrievedAt,
      excerpts: ["Canadian issuer filings should be validated through SEDAR+ public search."]
    }
  ],
  "western-copper-gold": [
    {
      id: "sec-wrn-filing",
      title: "SEC filing adapter result",
      sourceType: "filing",
      publisher: "SEC EDGAR",
      url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
      retrievedAt,
      excerpts: ["The issuer has copper and gold project exposure and should be reviewed for permitting and technical milestones."]
    }
  ],
  "f3-uranium": [
    {
      id: "sedar-f3-search",
      title: "SEDAR+ disclosure search placeholder",
      sourceType: "regulatory_search",
      publisher: "SEDAR+",
      url: "https://www.sedarplus.ca/",
      retrievedAt,
      excerpts: ["Canadian uranium exploration disclosure requires document-level review through SEDAR+."]
    }
  ]
};

export interface SourceCollectionResult {
  sources: SourceDocument[];
  adapters: AdapterStatus[];
}

interface FmpProfile {
  symbol?: string;
  price?: number;
  marketCap?: number;
  change?: number;
  changePercentage?: number;
  volume?: number;
  averageVolume?: number;
  range?: string;
  currency?: string;
}

interface FmpSharesFloat {
  date?: string;
  freeFloat?: number;
  floatShares?: number;
  outstandingShares?: number;
  source?: string;
}

interface FmpOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
}

interface YahooQuote {
  symbol?: string;
  quoteType?: string;
  exchange?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  sharesOutstanding?: number;
  currency?: string;
  regularMarketTime?: Date | number | string;
}

interface YahooOptions {
  fetcher?: typeof fetch;
}

interface MarketSnapshotOptions {
  yahooFetcher?: typeof fetch;
  fmpOptions?: FmpOptions;
}

interface MarketDataOptions extends MarketSnapshotOptions {
  yahooSummary?: YahooSupplementalModules;
  yahooSummaryFetcher?: (symbol: string) => Promise<YahooSupplementalModules | undefined>;
}

type YahooSupplementalModules = {
  financialData?: {
    currentPrice?: number;
    targetHighPrice?: number;
    targetLowPrice?: number;
    targetMeanPrice?: number;
    targetMedianPrice?: number;
    recommendationKey?: string;
    recommendationMean?: number;
    numberOfAnalystOpinions?: number;
    totalCash?: number;
    ebitda?: number;
    totalDebt?: number;
    totalRevenue?: number;
    grossProfits?: number;
    freeCashflow?: number;
    operatingCashflow?: number;
    profitMargins?: number;
  };
  defaultKeyStatistics?: {
    enterpriseValue?: number;
    profitMargins?: number;
    floatShares?: number;
    sharesOutstanding?: number;
    heldPercentInsiders?: number;
    heldPercentInstitutions?: number;
    netIncomeToCommon?: number;
    mostRecentQuarter?: Date | number | string;
  };
  majorHoldersBreakdown?: {
    insidersPercentHeld?: number;
    institutionsPercentHeld?: number;
    institutionsFloatPercentHeld?: number;
  };
  recommendationTrend?: {
    trend?: Array<{
      period?: string;
      strongBuy?: number;
      buy?: number;
      hold?: number;
      sell?: number;
      strongSell?: number;
    }>;
  };
  incomeStatementHistory?: {
    incomeStatementHistory?: Array<{
      endDate?: Date | number | string;
      totalRevenue?: number;
      grossProfit?: number;
      ebitda?: number;
      ebit?: number;
      totalOperatingExpenses?: number;
      netIncome?: number;
    }>;
  };
};

export interface YahooSupplementalData {
  analystForecast?: AnalystForecast;
  financialSnapshot?: FinancialSnapshot;
  shareStructure?: ShareStructure;
}

const FMP_DOCS_URL = "https://site.financialmodelingprep.com/developer/docs";
const YAHOO_FINANCE_URL = "https://finance.yahoo.com/";

const money = (value: number | undefined, currency = "USD") => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const prefix = currency === "USD" || currency === "CAD" ? "$" : "";
  return `${prefix}${value.toFixed(2)}`;
};

const compactMoney = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
};

const compactNonZeroMoney = (value: number | undefined) => {
  if (value === 0) return undefined;
  return compactMoney(value);
};

const compactShares = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return Math.round(value).toLocaleString();
};

const parseCompactValue = (value: string | undefined) => {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[$,%]/g, "").replace(/,/g, "");
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([kmbt])?$/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return undefined;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : suffix === "t" ? 1_000_000_000_000 : 1;
  return number * multiplier;
};

const wholeNumber = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString() : undefined;

const signedMoney = (value: number | undefined, currency?: string) => {
  const formatted = money(Math.abs(value ?? Number.NaN), currency);
  if (!formatted || typeof value !== "number") return undefined;
  return `${value >= 0 ? "+" : "-"}${formatted}`;
};

const signedPercent = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}%` : undefined;

const percent = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : undefined;

const hasFiniteNumber = (value: number | undefined) => typeof value === "number" && Number.isFinite(value);

const titleCase = (value: string | undefined) =>
  value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : undefined;

const dateFrom = (value: Date | number | string | undefined) => {
  if (!value) return undefined;
  let normalized: Date | number | string = value;
  if (typeof value === "number") {
    normalized = value > 1_000_000_000_000 ? value : value > 1_000_000_000 ? value * 1000 : value;
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
    const numericValue = Number(value);
    normalized = numericValue > 1_000_000_000_000 ? numericValue : numericValue > 1_000_000_000 ? numericValue * 1000 : numericValue;
  }
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  const year = date.getUTCFullYear();
  return Number.isNaN(date.valueOf()) || year < 1990 || year > new Date().getUTCFullYear() + 1
    ? undefined
    : date.toISOString().slice(0, 10);
};

const rangeParts = (range: string | undefined) => {
  if (!range) return {};
  const [low, high] = range.split("-").map((part) => Number(part.trim()));
  return {
    low: Number.isFinite(low) ? low : undefined,
    high: Number.isFinite(high) ? high : undefined
  };
};

function resolveFmpApiKey(explicit?: string) {
  if (explicit) return explicit;
  if (process.env.FMP_API_KEY) return process.env.FMP_API_KEY;

  try {
    const config = readFileSync(join(homedir(), ".codex", "config.toml"), "utf8");
    const server = /\[mcp_servers\.fmp\][\s\S]*?url\s*=\s*"([^"]+)"/.exec(config);
    const url = server?.[1];
    const key = url ? /apikey=([^&"\s]+)/.exec(url)?.[1] : undefined;
    return key;
  } catch {
    return undefined;
  }
}

async function fetchJson<T>(url: string, fetcher: typeof fetch): Promise<T[]> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`FMP request failed with ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? (body as T[]) : [body as T];
}

export function normalizeYahooSymbol(company: CompanyCandidate) {
  return company.ticker.trim().toUpperCase();
}

const yahooTickerAliasPattern = /^[A-Z0-9]{1,8}(\.[A-Z]{1,3})?$/;

export function yahooSupplementalSymbolCandidates(company: CompanyCandidate) {
  const primary = normalizeYahooSymbol(company);
  const symbols = new Set([primary]);
  if (primary.endsWith(".V")) {
    const base = primary.replace(/\.V$/, "");
    symbols.add(`${base}.TO`);
  }
  for (const alias of company.aliases ?? []) {
    const trimmed = alias.trim();
    const normalized = trimmed.toUpperCase();
    const explicitTickerAlias = trimmed === normalized || normalized.includes(".") || /\d/.test(normalized);
    if (explicitTickerAlias && yahooTickerAliasPattern.test(normalized)) symbols.add(normalized);
  }
  if (primary.endsWith(".V")) {
    const base = primary.replace(/\.V$/, "");
    symbols.add(`${base}.NE`);
  }
  return Array.from(symbols);
}

async function fetchYahooQuote(symbol: string, fetcher?: typeof fetch): Promise<YahooQuote | undefined> {
  if (!fetcher) {
    const YahooFinance = (await import("yahoo-finance2")).default;
    const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    return (await yahooFinance.quote(symbol)) as YahooQuote;
  }

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Yahoo Finance request failed with ${response.status}`);
  const body = (await response.json()) as { quoteResponse?: { result?: YahooQuote[] } };
  return body.quoteResponse?.result?.[0];
}

async function fetchYahooQuoteSummary(symbol: string): Promise<YahooSupplementalModules | undefined> {
  const YahooFinance = (await import("yahoo-finance2")).default;
  const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return (await yahooFinance.quoteSummary(symbol, {
    modules: [
      "financialData",
      "defaultKeyStatistics",
      "majorHoldersBreakdown",
      "recommendationTrend",
      "incomeStatementHistory"
    ]
  })) as YahooSupplementalModules;
}

export function mapYahooSupplementalData(
  company: CompanyCandidate,
  summary: YahooSupplementalModules | undefined,
  symbol = normalizeYahooSymbol(company)
): YahooSupplementalData {
  if (!summary) return {};
  const financialData = summary.financialData;
  const keyStats = summary.defaultKeyStatistics;
  const holders = summary.majorHoldersBreakdown;
  const statement = summary.incomeStatementHistory?.incomeStatementHistory?.[0];
  const asOf = dateFrom(statement?.endDate) ?? dateFrom(keyStats?.mostRecentQuarter) ?? new Date().toISOString().slice(0, 10);
  const currency = company.country === "CA" ? "CAD" : "USD";

  const target = financialData?.targetMeanPrice ?? financialData?.targetMedianPrice;
  const currentPrice = financialData?.currentPrice;
  const analystCount = financialData?.numberOfAnalystOpinions;
  const recommendation = titleCase(financialData?.recommendationKey);
  const trend = summary.recommendationTrend?.trend?.[0];
  const recommendationVotes = trend
    ? [trend.strongBuy, trend.buy, trend.hold, trend.sell, trend.strongSell].filter((value) => typeof value === "number").reduce((sum, value) => sum + (value ?? 0), 0)
    : undefined;
  const opinionCount = analystCount ?? recommendationVotes;
  const upside =
    typeof target === "number" && typeof currentPrice === "number" && currentPrice > 0
      ? `${((target / currentPrice - 1) * 100 >= 0 ? "+" : "")}${((target / currentPrice - 1) * 100).toFixed(1)}%`
      : undefined;

  const analystForecast =
    hasFiniteNumber(target) || recommendation || (opinionCount !== undefined && opinionCount > 0)
      ? {
          status: "sourced" as const,
          consensusLabel: recommendation
            ? `${recommendation} consensus${opinionCount ? ` from ${opinionCount} analyst${opinionCount === 1 ? "" : "s"}` : ""}`
            : `Consensus target${opinionCount ? ` from ${opinionCount} analyst${opinionCount === 1 ? "" : "s"}` : ""}`,
          priceTarget: money(target, currency),
          upsideDownside: upside,
          timeHorizon: "12 months",
          summary:
            "Yahoo Finance analyst-summary data is available for this issuer. Treat the target as market consensus context, then verify the analyst roster, publication dates, and assumptions before relying on it.",
          sourceUrl: `${YAHOO_FINANCE_URL}quote/${encodeURIComponent(symbol)}/analysis`,
          sourceLabel: "Yahoo Finance analyst summary",
          dataNeeded: [
            "Confirm the analyst roster, publication dates, and whether stale targets are included.",
            "Compare target assumptions against the latest technical report, cash runway, and catalyst calendar."
          ]
        }
      : undefined;

  const financialFields = {
    revenue: compactMoney(financialData?.totalRevenue ?? statement?.totalRevenue),
    grossProfit: compactMoney(financialData?.grossProfits ?? statement?.grossProfit),
    ebitda: compactMoney(financialData?.ebitda ?? statement?.ebitda),
    netIncome: compactMoney(keyStats?.netIncomeToCommon ?? statement?.netIncome),
    operatingExpense: compactNonZeroMoney(statement?.totalOperatingExpenses),
    totalCash: compactMoney(financialData?.totalCash),
    totalDebt: compactMoney(financialData?.totalDebt),
    enterpriseValue: compactMoney(keyStats?.enterpriseValue),
    freeCashflow: compactMoney(financialData?.freeCashflow),
    operatingCashflow: compactMoney(financialData?.operatingCashflow),
    profitMargin: percent(financialData?.profitMargins ?? keyStats?.profitMargins)
  };
  const financialSnapshot = Object.values(financialFields).some(Boolean)
    ? {
        status: "sourced" as const,
        ...financialFields,
        sourceLabel: "Yahoo Finance financial summary",
        sourceUrl: `${YAHOO_FINANCE_URL}quote/${encodeURIComponent(symbol)}/financials`,
        asOf,
        dataNeeded: [
          "Reconcile Yahoo summary financials with the latest MD&A, 10-Q/10-K, or SEDAR+ filing.",
          "Calculate cash runway from current cash, burn rate, and committed exploration budget.",
          "Operating expense is left unavailable when Yahoo reports a zero value without a reliable statement field.",
          "Exploration-stage issuers often have limited revenue; cash, debt, and expense trend matter more than earnings alone."
        ]
      }
    : undefined;

  const shareStructure: ShareStructure | undefined =
    hasFiniteNumber(keyStats?.sharesOutstanding) ||
    hasFiniteNumber(keyStats?.floatShares) ||
    hasFiniteNumber(holders?.insidersPercentHeld ?? keyStats?.heldPercentInsiders) ||
    hasFiniteNumber(holders?.institutionsPercentHeld ?? keyStats?.heldPercentInstitutions)
      ? {
          asOf,
          sharesOutstanding: compactShares(keyStats?.sharesOutstanding),
          publicFloat: compactShares(keyStats?.floatShares),
          insiderOwnership: percent(holders?.insidersPercentHeld ?? keyStats?.heldPercentInsiders),
          institutionalOwnership: percent(holders?.institutionsPercentHeld ?? keyStats?.heldPercentInstitutions),
          floatQuality:
            "Yahoo Finance provides public float and holder-percentage context where available; fully diluted shares, warrants, options, restricted shares, and strategic holders still require issuer filings.",
          notes: [
            "Use Yahoo holder fields as a starting point, then reconcile against the latest proxy, annual filing, and issuer presentation.",
            "Do not infer strategic ownership, warrants, options, or fully diluted shares from Yahoo summary fields alone."
          ],
          sourceUrl: `${YAHOO_FINANCE_URL}quote/${encodeURIComponent(symbol)}/holders`
        }
      : undefined;

  return { analystForecast, financialSnapshot, shareStructure };
}

export async function collectYahooSupplementalData(
  company: CompanyCandidate,
  fetcher = fetchYahooQuoteSummary
): Promise<YahooSupplementalData> {
  const combined: YahooSupplementalData = {};
  for (const symbol of yahooSupplementalSymbolCandidates(company)) {
    try {
      const next = mapYahooSupplementalData(company, await fetcher(symbol), symbol);
      combined.analystForecast ??= next.analystForecast;
      combined.financialSnapshot ??= next.financialSnapshot;
      combined.shareStructure ??= next.shareStructure;
      if (combined.analystForecast && combined.financialSnapshot && combined.shareStructure) break;
    } catch {
      continue;
    }
  }
  return combined;
}

export async function collectMarketData(
  company: CompanyCandidate,
  options: MarketDataOptions = {}
): Promise<{ marketSnapshot: MarketSnapshot; supplemental: YahooSupplementalData }> {
  const [marketSnapshot, supplemental] = await Promise.all([
    collectMarketSnapshot(company, options),
    options.yahooSummary
      ? Promise.resolve(mapYahooSupplementalData(company, options.yahooSummary))
      : collectYahooSupplementalData(company, options.yahooSummaryFetcher)
  ]);

  return { marketSnapshot, supplemental: reconcileSupplementalWithMarketSnapshot(supplemental, marketSnapshot) };
}

function reconcileSupplementalWithMarketSnapshot(
  supplemental: YahooSupplementalData,
  marketSnapshot: MarketSnapshot
): YahooSupplementalData {
  if (!supplemental.shareStructure || !marketSnapshot.sharesOutstanding || !/FMP fallback/.test(marketSnapshot.sourceLabel)) {
    return supplemental;
  }

  const marketShares = parseCompactValue(marketSnapshot.sharesOutstanding);
  const supplementalShares = parseCompactValue(supplemental.shareStructure.sharesOutstanding);
  const publicFloat = parseCompactValue(supplemental.shareStructure.publicFloat);
  if (!marketShares || supplementalShares === marketShares) return supplemental;

  const publicFloatLooksStale = publicFloat !== undefined && publicFloat > marketShares;
  return {
    ...supplemental,
    shareStructure: {
      ...supplemental.shareStructure,
      asOf: marketSnapshot.asOf,
      sharesOutstanding: marketSnapshot.sharesOutstanding,
      publicFloat: publicFloatLooksStale ? undefined : supplemental.shareStructure.publicFloat,
      floatQuality: publicFloatLooksStale
        ? "FMP provided a newer outstanding-share count than Yahoo; Yahoo public float was suppressed because it exceeded the newer share count and needs filing reconciliation."
        : supplemental.shareStructure.floatQuality,
      notes: Array.from(
        new Set([
          "FMP shares-float data corrected Yahoo's stale outstanding-share count; reconcile against the latest filing before relying on ownership conclusions.",
          ...supplemental.shareStructure.notes
        ])
      ),
      sourceUrl: marketSnapshot.sourceUrl ?? supplemental.shareStructure.sourceUrl
    }
  };
}

export async function collectYahooMarketSnapshot(
  company: CompanyCandidate,
  options: YahooOptions = {}
): Promise<MarketSnapshot | undefined> {
  const primary = normalizeYahooSymbol(company);
  for (const symbol of yahooSupplementalSymbolCandidates(company)) {
    try {
      const quote = await fetchYahooQuote(symbol, options.fetcher);
      const snapshot = quote ? mapYahooQuoteToMarketSnapshot(company, quote, symbol, primary) : undefined;
      if (snapshot) return snapshot;
    } catch {
      continue;
    }
  }
  return undefined;
}

function isUsableYahooQuote(quote: YahooQuote) {
  if (!hasFiniteNumber(quote.regularMarketPrice)) return false;
  if (quote.quoteType && quote.quoteType !== "EQUITY") return false;
  const asOf = dateFrom(quote.regularMarketTime);
  if (!asOf) return false;
  const quoteTime = new Date(`${asOf}T00:00:00.000Z`).valueOf();
  const staleCutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
  return quoteTime >= staleCutoff;
}

function mapYahooQuoteToMarketSnapshot(
  company: CompanyCandidate,
  quote: YahooQuote,
  symbol: string,
  primarySymbol = normalizeYahooSymbol(company)
): MarketSnapshot | undefined {
  if (!isUsableYahooQuote(quote)) return undefined;
  const currency = quote.currency ?? "USD";
  const change = signedMoney(quote.regularMarketChange, currency);
  const percent = signedPercent(quote.regularMarketChangePercent);
  const alternateSymbolNote =
    symbol === primarySymbol
      ? "Yahoo Finance via YFinance"
      : `Yahoo Finance via YFinance (${symbol} alternate listing)`;

  return {
    status: "sourced",
    price: money(quote.regularMarketPrice, currency),
    currency,
    changePercent: change && percent ? `${change} (${percent})` : percent ?? change,
    marketCap: compactMoney(quote.marketCap),
    volume: wholeNumber(quote.regularMarketVolume),
    averageVolume: wholeNumber(quote.averageDailyVolume3Month),
    fiftyTwoWeekHigh: money(quote.fiftyTwoWeekHigh, currency),
    fiftyTwoWeekLow: money(quote.fiftyTwoWeekLow, currency),
    sharesOutstanding: compactShares(quote.sharesOutstanding),
    sourceLabel: alternateSymbolNote,
    sourceUrl: `${YAHOO_FINANCE_URL}quote/${encodeURIComponent(symbol)}`,
    asOf: dateFrom(quote.regularMarketTime) ?? new Date().toISOString().slice(0, 10),
    dataNeeded: [
      "Yahoo Finance does not replace filing-backed insider, strategic, warrant, option, or fully diluted ownership checks.",
      "Reconcile shares outstanding with issuer filings before relying on share-structure conclusions."
    ]
  };
}

function isCompleteMarketSnapshot(snapshot: MarketSnapshot) {
  return Boolean(
    snapshot.price &&
      snapshot.changePercent &&
      snapshot.marketCap &&
      snapshot.volume &&
      snapshot.averageVolume &&
      snapshot.fiftyTwoWeekHigh &&
      snapshot.fiftyTwoWeekLow &&
      snapshot.sharesOutstanding
  );
}

function snapshotDateValue(snapshot: MarketSnapshot) {
  if (!snapshot.asOf || snapshot.asOf === "Unavailable") return undefined;
  const date = new Date(`${snapshot.asOf.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? undefined : date.valueOf();
}

function needsFreshnessCrossCheck(snapshot: MarketSnapshot) {
  const asOf = snapshotDateValue(snapshot);
  if (!asOf) return true;
  return asOf < Date.now() - 5 * 24 * 60 * 60 * 1000;
}

function mergeMarketSnapshots(primary: MarketSnapshot, fallback: MarketSnapshot): MarketSnapshot {
  const fallbackIsNewer =
    (snapshotDateValue(fallback) ?? 0) > (snapshotDateValue(primary) ?? Number.NEGATIVE_INFINITY);
  const selectField = <K extends keyof MarketSnapshot>(field: K) =>
    fallbackIsNewer ? fallback[field] ?? primary[field] : primary[field] ?? fallback[field];
  return {
    ...primary,
    price: selectField("price"),
    currency: selectField("currency"),
    changePercent: selectField("changePercent"),
    marketCap: selectField("marketCap"),
    volume: selectField("volume"),
    averageVolume: selectField("averageVolume"),
    fiftyTwoWeekHigh: selectField("fiftyTwoWeekHigh"),
    fiftyTwoWeekLow: selectField("fiftyTwoWeekLow"),
    sharesOutstanding: selectField("sharesOutstanding"),
    sourceLabel: "Yahoo Finance + FMP fallback",
    sourceUrl: primary.sourceUrl ?? fallback.sourceUrl,
    asOf: selectField("asOf"),
    dataNeeded: Array.from(new Set([...primary.dataNeeded, ...fallback.dataNeeded]))
  };
}

export async function collectMarketSnapshot(
  company: CompanyCandidate,
  options: MarketSnapshotOptions = {}
): Promise<MarketSnapshot> {
  const yahoo = await collectYahooMarketSnapshot(company, { fetcher: options.yahooFetcher });
  if (yahoo && isCompleteMarketSnapshot(yahoo) && !needsFreshnessCrossCheck(yahoo)) return yahoo;

  const fmp = await collectFmpMarketSnapshot(company, options.fmpOptions);
  if (yahoo && fmp) return mergeMarketSnapshots(yahoo, fmp);
  if (yahoo) return yahoo;
  if (fmp) return { ...fmp, sourceLabel: "FMP fallback" };

  return {
    status: "not_sourced",
    sourceLabel: "Yahoo Finance and FMP unavailable",
    sourceUrl: YAHOO_FINANCE_URL,
    asOf: "Unavailable",
    dataNeeded: [
      "Yahoo Finance/YFinance did not return usable market data for this ticker.",
      "FMP did not return usable market data for this ticker.",
      "Use filings, issuer presentations, or manual import for share structure until a market-data source is available."
    ]
  };
}

export async function collectFmpMarketSnapshot(
  company: CompanyCandidate,
  options: FmpOptions = {}
): Promise<MarketSnapshot | undefined> {
  const apiKey = resolveFmpApiKey(options.apiKey);
  if (!apiKey) return undefined;

  const fetcher = options.fetcher ?? fetch;
  const snapshots: MarketSnapshot[] = [];
  for (const symbol of yahooSupplementalSymbolCandidates(company)) {
    const snapshot = await collectFmpMarketSnapshotForSymbol(symbol, apiKey, fetcher);
    if (snapshot) snapshots.push(snapshot);
  }

  return snapshots.sort((a, b) => (snapshotDateValue(b) ?? 0) - (snapshotDateValue(a) ?? 0))[0];
}

async function collectFmpMarketSnapshotForSymbol(
  rawSymbol: string,
  apiKey: string,
  fetcher: typeof fetch
): Promise<MarketSnapshot | undefined> {
  const symbol = encodeURIComponent(rawSymbol);
  const profileUrl = `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${encodeURIComponent(apiKey)}`;
  const sharesUrl = `https://financialmodelingprep.com/stable/shares-float?symbol=${symbol}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const [profileRows, shareRows] = await Promise.all([
      fetchJson<FmpProfile>(profileUrl, fetcher),
      fetchJson<FmpSharesFloat>(sharesUrl, fetcher).catch(() => [] as FmpSharesFloat[])
    ]);
    const profile = profileRows[0];
    if (!profile) return undefined;

    const shares = shareRows[0];
    const range = rangeParts(profile.range);
    const currency = profile.currency ?? "USD";
    const change = signedMoney(profile.change, currency);
    const percent = signedPercent(profile.changePercentage);

    return {
      status: "sourced",
      price: money(profile.price, currency),
      currency,
      changePercent: change && percent ? `${change} (${percent})` : percent ?? change,
      marketCap: compactMoney(profile.marketCap),
      volume: wholeNumber(profile.volume),
      averageVolume: wholeNumber(profile.averageVolume),
      fiftyTwoWeekHigh: money(range.high, currency),
      fiftyTwoWeekLow: money(range.low, currency),
      sharesOutstanding: compactShares(shares?.outstandingShares),
      sourceLabel: "FMP profile and shares-float",
      sourceUrl: FMP_DOCS_URL,
      asOf: dateFrom(shares?.date) ?? new Date().toISOString().slice(0, 10),
      dataNeeded: [
        "FMP quote endpoint remains useful for intraday quote-specific fields when subscription coverage allows it.",
        "Reconcile FMP float/outstanding shares with latest filings before relying on ownership conclusions.",
        "Insider, strategic, warrant, option, and fully diluted ownership still require filings or a richer ownership dataset."
      ]
    };
  } catch {
    return undefined;
  }
}

export function collectSources(company: CompanyCandidate): SourceCollectionResult {
  const marketProviderConfigured = true;
  return {
    sources: seededSources[company.id] ?? [],
    adapters: [
      {
        id: "sec-edgar",
        name: "SEC EDGAR APIs",
        status: company.country === "US" ? "seeded" : "configured",
        note: "Official U.S. filing adapter boundary; V1 uses seeded excerpts and links to the official API docs.",
        contributes: ["annual and quarterly filing discovery", "risk-factor excerpts", "financing and revenue disclosures"],
        missing: ["structured cash runway extraction", "share-count table extraction", "S-K 1300 technical-report summary parsing"]
      },
      {
        id: "sedar-plus",
        name: "SEDAR+ Public Search",
        status: company.country === "CA" ? "seeded" : "configured",
        note: "Canadian disclosure discovery is represented as a cited public-search source because no clean public API is assumed.",
        contributes: ["Canadian filing discovery path", "regulatory-search provenance", "issuer disclosure availability"],
        missing: ["automated document download", "NI 43-101 technical report parsing", "management information circular extraction"]
      },
      {
        id: "market-data",
        name: "Yahoo/YFinance and FMP market data",
        status: marketProviderConfigured ? "configured" : "needs_key",
        note: "Yahoo Finance/YFinance is the primary market-data source; FMP is used as a fallback for missing quote fields.",
        contributes: [
          "current price",
          "market cap",
          "volume and average volume",
          "52-week range",
          "shares outstanding when available",
          "Yahoo analyst targets when available",
          "Yahoo financial summary fields",
          "Yahoo public float and holder percentages when available"
        ],
        missing: ["analyst roster and publication dates", "fully diluted ownership", "warrants and options", "filing-backed cash runway"]
      },
      {
        id: "manual-import",
        name: "Manual PDF/source import",
        status: "manual",
        note: "Reserved for presentations, technical reports, and notes the automated run misses.",
        contributes: ["technical reports", "investor presentations", "manual fact overrides with provenance"],
        missing: ["operator upload workflow", "PDF table extraction", "human approval queue for corrected facts"]
      }
    ]
  };
}
