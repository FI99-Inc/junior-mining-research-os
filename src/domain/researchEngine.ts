import type {
  AnalystForecast,
  CompanyCandidate,
  EvidenceAudit,
  EvidenceCollectionStatus,
  EvidenceFact,
  EvidenceRequirement,
  FinancialSnapshot,
  InvestorLens,
  ManagementEvidence,
  ManagementPerson,
  MarketSnapshot,
  MemoSection,
  NewsItem,
  RedFlag,
  ResearchRun,
  RiskScenario,
  ScoreCategory,
  Scorecard,
  ScoringMethodology,
  ShareStructure,
  SourceDocument,
  TimelineScore
} from "./types";

const nowIso = () => new Date().toISOString();
let runSequence = 0;

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const textFrom = (sources: SourceDocument[]) => sources.flatMap((source) => source.excerpts).join(" ").toLowerCase();

const sourceIds = (sources: SourceDocument[]) => sources.map((source) => source.id);

const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const defaultEvidenceStatus = (): EvidenceCollectionStatus => ({
  mode: "automated",
  summary: "Automated evidence collection has not run for this report.",
  adapters: [],
  categories: [],
  gaps: [],
  updatedAt: nowIso()
});

function parseMarketNumber(value?: string) {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[$,%]/g, "").replace(/,/g, "");
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([kmbt])?$/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return undefined;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : suffix === "t" ? 1_000_000_000_000 : 1;
  return number * multiplier;
}

function formatCompact(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function marketSignalsFrom(snapshot: MarketSnapshot): MarketSignals {
  const price = parseMarketNumber(snapshot.price);
  const marketCap = parseMarketNumber(snapshot.marketCap);
  const volume = parseMarketNumber(snapshot.volume);
  const averageVolume = parseMarketNumber(snapshot.averageVolume);
  const fiftyTwoWeekHigh = parseMarketNumber(snapshot.fiftyTwoWeekHigh);
  const fiftyTwoWeekLow = parseMarketNumber(snapshot.fiftyTwoWeekLow);
  const sharesOutstanding = parseMarketNumber(snapshot.sharesOutstanding);
  const range =
    price !== undefined && fiftyTwoWeekHigh !== undefined && fiftyTwoWeekLow !== undefined && fiftyTwoWeekHigh > fiftyTwoWeekLow
      ? (price - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)
      : undefined;
  const rangePosition = range === undefined ? undefined : Math.max(0, Math.min(1, range));
  const liquidityRatio = volume !== undefined && averageVolume !== undefined && averageVolume > 0 ? volume / averageVolume : undefined;
  const dollarVolume = price !== undefined && volume !== undefined ? price * volume : undefined;
  const thinLiquidity = (dollarVolume !== undefined && dollarVolume < 250_000) || (liquidityRatio !== undefined && liquidityRatio < 0.25);
  const highShareCount = sharesOutstanding !== undefined && sharesOutstanding >= 500_000_000;
  const tinyMarketCap = marketCap !== undefined && marketCap < 25_000_000;
  const nearLow = rangePosition !== undefined && rangePosition <= 0.2;
  const nearHigh = rangePosition !== undefined && rangePosition >= 0.75;

  return {
    hasMarketData: snapshot.status === "sourced",
    sourceLabel: snapshot.sourceLabel,
    price,
    marketCap,
    volume,
    averageVolume,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    sharesOutstanding,
    rangePosition,
    liquidityRatio,
    dollarVolume,
    nearLow,
    nearHigh,
    thinLiquidity,
    highShareCount,
    tinyMarketCap,
    marketCapDriver:
      marketCap !== undefined
        ? `Current market cap is ${formatCompact(marketCap)}, giving the valuation score a real market anchor instead of a registry-only estimate.`
        : undefined,
    shareCountDriver:
      sharesOutstanding !== undefined
        ? `Yahoo Finance market data shows ${snapshot.sharesOutstanding} shares outstanding; fully diluted ownership still needs filings.`
        : undefined,
    rangeDriver:
      rangePosition !== undefined
        ? `The current price sits around ${Math.round(rangePosition * 100)}% of the 52-week range, which informs short-term momentum and contrarian-risk context.`
        : undefined,
    liquidityDriver:
      dollarVolume !== undefined
        ? `Recent dollar volume is approximately ${formatCompact(dollarVolume)}, a practical liquidity check for position sizing and near-term feasibility.`
        : undefined
  };
}

function marketSignalScore(signals: MarketSignals) {
  if (!signals.hasMarketData) return 40;
  let score = 50;
  if (signals.marketCap !== undefined) score += 4;
  if (signals.sharesOutstanding !== undefined) score += 3;
  if (signals.nearHigh) score += 6;
  if (signals.nearLow) score -= 7;
  if (signals.thinLiquidity) score -= 12;
  if (signals.highShareCount) score -= 6;
  if (signals.tinyMarketCap) score -= 4;
  if (signals.liquidityRatio !== undefined && signals.liquidityRatio >= 1.25) score += 5;
  return clamp(score);
}

function buildEvidenceCoverage(sources: SourceDocument[], marketSignals: MarketSignals, facts: EvidenceFact[] = []): EvidenceCoverage {
  const sourceText = textFrom(sources);
  const factCategories = new Set(facts.map((fact) => fact.category));
  return {
    technicalReport: hasAny(sourceText, ["technical report", "ni 43-101", "s-k 1300", "resource estimate", "mineral resource", "metallurgy"]),
    projectEvidence: hasAny(sourceText, ["project", "deposit", "exploration", "drilling", "resource", "mineral resource", "metallurgy"]),
    shareStructure: hasAny(sourceText, ["fully diluted", "shares outstanding", "warrants", "options", "insider ownership"]),
    marketData: marketSignals.hasMarketData || hasAny(sourceText, ["market cap", "enterprise value", "share price", "cash", "debt"]),
    cashRunway: hasAny(sourceText, ["cash runway", "working capital", "cash balance", "burn rate", "months of runway"]),
    filings: sources.some((source) => source.sourceType === "filing" || source.sourceType === "regulatory_search"),
    news: sources.some((source) => source.sourceType === "news"),
    managementEvidence: factCategories.has("management_biography") || factCategories.has("prior_outcomes") || factCategories.has("capital_allocation") || hasAny(sourceText, [
      "management biography",
      "executive biographies",
      "leadership",
      "board of directors",
      "technical team",
      "qualified person",
      "prior discoveries",
      "prior mine",
      "mine builds",
      "public-company financings",
      "capital allocation",
      "insider ownership"
    ]),
    jurisdictionDetail: hasAny(sourceText, ["permitting timeline", "land tenure", "environmental", "community engagement", "infrastructure access"]),
    catalystCalendar: hasAny(sourceText, ["catalyst calendar", "dated catalyst", "permitting timeline", "drilling results", "technical studies"])
  };
}

function strongerConfidence(
  current: ScoreCategory["confidence"],
  next: ScoreCategory["confidence"]
): ScoreCategory["confidence"] {
  const rank = { low: 1, medium: 2, high: 3 } as const;
  return rank[next] > rank[current] ? next : current;
}

type BaseScoreCategory = Omit<
  ScoreCategory,
  "positiveDrivers" | "negativeDrivers" | "improveActions" | "downgradeTriggers" | "dataNeeded"
>;

interface MarketSignals {
  hasMarketData: boolean;
  sourceLabel?: string;
  price?: number;
  marketCap?: number;
  volume?: number;
  averageVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  sharesOutstanding?: number;
  rangePosition?: number;
  liquidityRatio?: number;
  dollarVolume?: number;
  marketCapDriver?: string;
  shareCountDriver?: string;
  rangeDriver?: string;
  liquidityDriver?: string;
  nearLow: boolean;
  nearHigh: boolean;
  thinLiquidity: boolean;
  highShareCount: boolean;
  tinyMarketCap: boolean;
}

interface EvidenceCoverage {
  technicalReport: boolean;
  projectEvidence: boolean;
  shareStructure: boolean;
  marketData: boolean;
  cashRunway: boolean;
  filings: boolean;
  news: boolean;
  managementEvidence: boolean;
  jurisdictionDetail: boolean;
  catalystCalendar: boolean;
}

const SCORING_METHODOLOGY: ScoringMethodology = {
  version: "jmro-2026-06-mining-feasibility-v2",
  name: "Junior Mining Feasibility Framework",
  categoryWeights: [
    { key: "asset_quality", label: "Asset Quality", weight: 22 },
    { key: "capital_structure", label: "Capital Structure and Dilution Risk", weight: 16 },
    { key: "management", label: "Management and Track Record", weight: 14 },
    { key: "jurisdiction", label: "Jurisdiction", weight: 12 },
    { key: "valuation_optionality", label: "Valuation and Optionality", weight: 12 },
    { key: "catalysts", label: "Catalysts", weight: 10 },
    { key: "commodity_exposure", label: "Commodity Exposure", weight: 8 },
    { key: "evidence_confidence", label: "Evidence Confidence", weight: 6 }
  ],
  confidenceModel:
    "Confidence is evidence-weighted rather than score-weighted. Market data can support valuation and liquidity confidence, but technical-report, share-structure, cash-runway, management, and filing gaps still cap the categories they affect.",
  requiredInputs: [
    "Current technical report or equivalent project disclosure",
    "Drill results, resource estimate, metallurgy, infrastructure, and permitting facts",
    "Cash balance, burn rate, and cash runway against the planned work program",
    "Basic and fully diluted share count, warrants, options, and recent financing terms",
    "Insider ownership, management biography, prior outcomes, and capital allocation history",
    "Current market cap, enterprise value, peer set, and commodity price assumptions",
    "Catalyst calendar from news releases, filings, and investor presentations",
    "Analyst price target and rating data only when sourced with dates and provider metadata"
  ],
  sourceLinks: [
    {
      label: "NI 43-101 Canadian mineral disclosure framework",
      url: "https://www.bcsc.bc.ca/industry/companies/mining/technical-reports"
    },
    {
      label: "S-K 1300 SEC mining disclosure framework",
      url: "https://www.sec.gov/corpfin/secg-modernization-property-disclosures-mining-registrants"
    },
    {
      label: "CIM mineral resource and reserve guidance",
      url: "https://mrmr.cim.org/"
    },
    {
      label: "JORC reporting code reference",
      url: "https://www.jorc.org/"
    }
  ]
};

const EVIDENCE_REQUIREMENTS: Omit<EvidenceRequirement, "status">[] = [
  {
    id: "technical-report",
    label: "Technical report or compliant project disclosure",
    importance: "critical",
    sourceTypes: ["manual", "presentation"],
    whyItMatters: "Asset-quality scores need grade, scale, metallurgy, resource, infrastructure, and technical-risk evidence."
  },
  {
    id: "share-structure",
    label: "Basic and fully diluted share structure",
    importance: "critical",
    sourceTypes: ["market_data", "filing"],
    whyItMatters: "Per-share upside depends on basic shares, warrants, options, insider ownership, and financing overhang."
  },
  {
    id: "market-data",
    label: "Current market data and valuation inputs",
    importance: "critical",
    sourceTypes: ["market_data"],
    whyItMatters: "Valuation and optionality need current price, market cap, enterprise value, cash, and debt."
  },
  {
    id: "cash-runway",
    label: "Cash runway and burn rate",
    importance: "critical",
    sourceTypes: ["filing", "market_data"],
    whyItMatters: "Junior miners often depend on external capital; runway determines dilution and catalyst execution risk."
  },
  {
    id: "regulatory-filings",
    label: "Current regulatory filings",
    importance: "important",
    sourceTypes: ["filing", "regulatory_search"],
    whyItMatters: "Filings anchor unsupported claims and preserve unknowns when disclosures cannot be retrieved."
  },
  {
    id: "news-catalysts",
    label: "Recent news and catalyst updates",
    importance: "important",
    sourceTypes: ["news"],
    whyItMatters: "Near-term feasibility depends on drilling, permitting, financing, technical updates, and timing."
  }
];

function section(
  id: string,
  title: string,
  body: string,
  sources: SourceDocument[],
  status: MemoSection["status"] = sources.length ? "supported" : "unknown"
): MemoSection {
  return {
    id,
    title,
    body: sources.length
      ? body
      : "Unknown from current sources. The app could not tie this item to a cited filing, presentation, news item, or market data source.",
    status,
    citationIds: sourceIds(sources)
  };
}

function buildScorecard(company: CompanyCandidate, sources: SourceDocument[], facts: EvidenceFact[] = []): Scorecard {
  const text = textFrom(sources);
  const marketSnapshot = buildMarketSnapshot(company);
  const marketSignals = marketSignalsFrom(marketSnapshot);
  const coverage = buildEvidenceCoverage(sources, marketSignals, facts);
  const managementEvidence = buildManagementEvidence(company, sources, facts);
  const evidenceAudit = buildEvidenceAudit(marketSignals, coverage);
  const evidenceScore = sources.length === 0 ? (marketSignals.hasMarketData ? 32 : 20) : Math.min(95, 35 + sources.length * 20 + (marketSignals.hasMarketData ? 8 : 0));
  const hasProject = hasAny(text, ["project", "deposit", "exploration", "drilling", "resource"]);
  const hasFinancingRisk = hasAny(text, ["additional financing", "need additional financing", "expects to need"]);
  const hasRevenueGap = hasAny(text, ["no revenue", "no revenue from mining operations"]);
  const hasCatalyst = hasAny(text, ["catalyst", "drilling results", "updated technical", "permit"]);
  const newsCount = sources.filter((source) => source.sourceType === "news").length;
  const filingCount = sources.filter((source) => source.sourceType === "filing" || source.sourceType === "regulatory_search").length;
  const citationIds = sourceIds(sources);

  const categories: BaseScoreCategory[] = [
    {
      key: "asset_quality",
      label: "Asset Quality",
      score: clamp((hasProject ? 62 : 34) + (company.commodityFocus.includes("Gold") ? 5 : 0)),
      confidence: hasProject ? "medium" : "low",
      confidenceRationale: hasProject
        ? "Project-level evidence exists, but full technical-report validation is not yet available in V1."
        : "Source excerpts are thin, so the rating leans on the company registry and keeps confidence low.",
      rationale: hasProject
        ? "Sources identify a specific exploration project or deposit, but V1 does not yet validate resource grade, scale, or metallurgy."
        : `${company.name} is currently framed around ${company.projects?.join(", ") ?? "its stated project portfolio"} in ${company.jurisdiction ?? company.country}. The app can identify the asset focus, but needs technical reports, presentations, and drill data before assigning high conviction.`,
      drivers: [
        hasProject ? "Named project or exploration asset found in source excerpts." : "No cited asset detail found.",
        company.projects?.length ? `Company registry lists: ${company.projects.join(", ")}.` : "Project registry detail is missing.",
        "Technical depth remains limited until resource, metallurgy, infrastructure, and permitting documents are ingested."
      ],
      citationIds
    },
    {
      key: "management",
      label: "Management and Track Record",
      score: managementEvidenceScore(managementEvidence),
      confidence: managementEvidenceConfidence(managementEvidence),
      confidenceRationale: managementEvidence.confidenceSignals
        .filter((signal) => signal.status === "positive")
        .slice(0, 2)
        .map((signal) => signal.detail)
        .join(" ") || "Management history, insider ownership, prior discoveries, and capital allocation are not yet fully sourced.",
      rationale: managementEvidence.summary,
      drivers: [
        ...managementEvidence.confidenceSignals.slice(0, 4).map((signal) => signal.detail),
        ...managementEvidence.gaps.slice(0, 2).map((gap) => `Gap: ${gap}`)
      ],
      citationIds: Array.from(new Set([...citationIds, ...managementEvidence.sources.map((source) => source.id)]))
    },
    {
      key: "jurisdiction",
      label: "Jurisdiction",
      score: company.country === "CA" || company.country === "US" ? 66 : 45,
      confidence: sources.length ? "medium" : "low",
      confidenceRationale: "Issuer country and project jurisdiction are known, but local permitting and land-status evidence is incomplete.",
      rationale: `${company.country === "US" ? "U.S." : "Canadian"} issuer coverage fits the V1 Canada/US junior-mining universe.`,
      drivers: [
        `${company.jurisdiction ?? company.country} is the current jurisdiction marker.`,
        "Canada/US coverage is inside the app's first supported universe.",
        "Permitting, land tenure, indigenous/community agreements, and environmental process still need deeper source coverage."
      ],
      citationIds
    },
    {
      key: "capital_structure",
      label: "Capital Structure and Dilution Risk",
      score: clamp(hasFinancingRisk || hasRevenueGap ? 35 : 55),
      confidence: sources.length ? "medium" : "low",
      confidenceRationale:
        hasFinancingRisk || hasRevenueGap
          ? "Financing dependence is explicitly present in the current evidence."
          : "No explicit financing warning was found, but share-count and cash-runway data remain incomplete.",
      rationale:
        hasFinancingRisk || hasRevenueGap
          ? "Sources indicate exploration-stage financing dependence, which raises dilution risk."
          : "No explicit financing warning was found, but V1 has not ingested full share-count and balance-sheet history.",
      drivers: [
        hasRevenueGap ? "No operating revenue was detected in the cited evidence." : "No operating revenue warning detected.",
        hasFinancingRisk ? "Future financing need was detected, increasing dilution risk." : "No explicit near-term financing need detected.",
        "Full confidence requires cash balance, burn rate, warrants/options, and recent financing terms."
      ],
      citationIds
    },
    {
      key: "valuation_optionality",
      label: "Valuation and Optionality",
      score: clamp((hasProject ? 58 : 32) + (marketSignals.marketCap !== undefined ? 5 : 0) - (marketSignals.thinLiquidity ? 3 : 0)),
      confidence: marketSignals.marketCap !== undefined ? "medium" : "low",
      confidenceRationale:
        marketSignals.marketCap !== undefined
          ? "Current market cap is sourced, but cash, debt, resource metrics, and peer multiples still cap valuation confidence."
          : "Valuation confidence is low until market cap, cash, debt, share count, and comparable project metrics are ingested.",
      rationale:
        marketSignals.marketCap !== undefined
          ? "Market data now anchors the optionality discussion, but the app still needs NAV, EV/resource, and comparable-company multiples."
          : "V1 can identify optionality themes, but does not yet calculate NAV, EV/resource, or comparable-company multiples.",
      drivers: [
        hasProject ? "Project optionality exists, but quantitative valuation is not yet modeled." : "No asset base found for optionality scoring.",
        marketSignals.marketCapDriver ?? "No NAV, EV/resource, or peer-comparison calculation is currently available.",
        "Score is capped until market data and technical-report metrics are connected."
      ],
      citationIds
    },
    {
      key: "catalysts",
      label: "Catalysts",
      score: clamp(hasCatalyst ? 68 : 30),
      confidence: sources.length ? "medium" : "low",
      confidenceRationale: hasCatalyst
        ? "Catalysts are mentioned in cited excerpts, but timing and magnitude still require news/filing follow-up."
        : "No cited catalyst was found.",
      rationale: hasCatalyst
        ? "Sources mention upcoming drilling, technical work, or other research milestones."
        : "No cited near-term catalyst was found.",
      drivers: [
        hasCatalyst ? "Drilling, technical work, or catalyst language was detected." : "No catalyst language detected.",
        `${newsCount} cited news item${newsCount === 1 ? "" : "s"} available for this run.`,
        "Short-term scores are highly sensitive to news quality, financing events, and commodity price moves."
      ],
      citationIds
    },
    {
      key: "commodity_exposure",
      label: "Commodity Exposure",
      score: 58,
      confidence: "medium",
      confidenceRationale: "Commodity focus is available from the company registry, but price sensitivity and hedge/exposure data are not modeled.",
      rationale: `Primary exposure: ${company.commodityFocus.join(", ")}.`,
      drivers: [
        `Primary commodities: ${company.commodityFocus.join(", ")}.`,
        "Exposure score is neutral until commodity price sensitivity, cost curve, and project economics are modeled.",
        "Macro relevance differs by investor timeframe."
      ],
      citationIds
    },
    {
      key: "evidence_confidence",
      label: "Evidence Confidence",
      score: evidenceScore,
      confidence: evidenceScore >= 75 ? "high" : evidenceScore >= 45 ? "medium" : "low",
      confidenceRationale:
        evidenceScore >= 75
          ? "Multiple source types were available for this run."
          : evidenceScore >= 45
            ? "Some source coverage is available, but key datasets remain missing."
            : "Evidence coverage is sparse.",
      rationale:
        sources.length > 0
          ? `${sources.length} source document${sources.length === 1 ? "" : "s"} available for this run${marketSignals.hasMarketData ? `, plus a sourced ${marketSignals.sourceLabel} market snapshot` : ""}.`
          : "No source documents were available, so the report must preserve unknowns.",
      drivers: [
        `${sources.length} total source document${sources.length === 1 ? "" : "s"} collected.`,
        `${filingCount} filing or regulatory-search source${filingCount === 1 ? "" : "s"} collected.`,
        marketSignals.hasMarketData
          ? `${marketSignals.sourceLabel} provides current trading and valuation fields for this run.`
          : "Confidence remains bounded by missing live market data, full filings extraction, and technical-report parsing."
      ],
      citationIds
    }
  ];

  const enrichedCategories = categories.map((category) =>
    applyEvidenceCoverageToCategory(
      applyMarketSignalsToCategory(
        enrichCategory(company, category, { hasProject, hasFinancingRisk, hasRevenueGap, hasCatalyst, sources, managementEvidence }),
        marketSignals
      ),
      coverage
    )
  );
  const overall = weightedOverall(enrichedCategories);
  const catalystScore = enrichedCategories.find((item) => item.key === "catalysts")?.score ?? 30;
  const capitalScore = enrichedCategories.find((item) => item.key === "capital_structure")?.score ?? 35;
  const assetScore = enrichedCategories.find((item) => item.key === "asset_quality")?.score ?? 35;
  const evidenceConfidence = evidenceScore >= 75 ? "high" : evidenceScore >= 45 ? "medium" : "low";
  const marketScore = marketSignalScore(marketSignals);
  const timelineMarketDrivers = [
    marketSignals.rangeDriver,
    marketSignals.liquidityDriver,
    marketSignals.thinLiquidity ? "Thin liquidity can exaggerate both short-term upside and downside after news." : undefined
  ].filter((driver): driver is string => Boolean(driver));
  const timelineScores: TimelineScore[] = [
    {
      horizon: "3M" as const,
      label: "Three-month feasibility",
      score: clamp(catalystScore * 0.35 + capitalScore * 0.2 + evidenceScore * 0.15 + marketScore * 0.3),
      confidence: newsCount ? "medium" : "low",
      summary: "Three-month feasibility is driven by news flow, drilling updates, financing risk, and liquidity-sensitive sentiment.",
      drivers: [
        "Short-term score weights news and catalyst visibility most heavily.",
        `${newsCount} news item${newsCount === 1 ? "" : "s"} collected for this company.`,
        hasFinancingRisk ? "Financing risk can pressure short-term performance." : "No explicit short-term financing warning detected.",
        ...timelineMarketDrivers
      ],
      companyGoals: [
        "Clarify the next news item investors should watch, such as drill results, permitting updates, or financing terms.",
        "Keep the project narrative current with recent technical or exploration updates.",
        "Avoid surprise dilution by showing how near-term work is funded."
      ]
    },
    {
      horizon: "6M" as const,
      label: "Six-month feasibility",
      score: clamp(catalystScore * 0.32 + assetScore * 0.24 + capitalScore * 0.18 + evidenceScore * 0.16 + marketScore * 0.1),
      confidence: evidenceConfidence,
      summary: "Six-month feasibility balances catalysts with early confirmation of asset quality and financing runway.",
      drivers: [
        "Weights catalysts, project evidence, and capital structure more evenly.",
        hasProject ? "Project evidence is present." : "Project evidence remains sparse.",
        "Better accuracy needs a dated catalyst calendar and cash runway.",
        marketSignals.marketCapDriver ?? "Live market-cap context is still needed for six-month valuation sensitivity."
      ],
      companyGoals: [
        "Convert near-term exploration or technical work into clearer project evidence.",
        "Show enough funding runway to continue the planned work program.",
        "Publish updates that reduce uncertainty around target quality, permitting, or development path."
      ]
    },
    {
      horizon: "1Y" as const,
      label: "One-year feasibility",
      score: clamp(assetScore * 0.3 + capitalScore * 0.25 + catalystScore * 0.2 + evidenceScore * 0.25),
      confidence: evidenceConfidence,
      summary: "One-year feasibility emphasizes whether catalysts can convert into asset de-risking without excessive dilution.",
      drivers: [
        "Weights asset quality, financing risk, evidence coverage, and catalysts.",
        hasRevenueGap ? "No operating revenue makes dilution risk more important over one year." : "Revenue gap not explicitly detected.",
        "Technical work and financing terms should be tracked before relying on the score."
      ],
      companyGoals: [
        "Demonstrate that project work is moving from story value toward measurable de-risking.",
        "Maintain a financing plan that supports drilling, studies, or permitting without excessive dilution.",
        "Build enough evidence for investors to compare the project against peers."
      ]
    },
    {
      horizon: "3Y" as const,
      label: "Three-year feasibility",
      score: clamp(assetScore * 0.36 + enrichedCategories.find((item) => item.key === "jurisdiction")!.score * 0.18 + capitalScore * 0.24 + evidenceScore * 0.22),
      confidence: evidenceConfidence === "high" ? "medium" : "low",
      summary: "Three-year feasibility focuses on whether the project can mature through resource definition, studies, permitting, and disciplined financing.",
      drivers: [
        "Medium-term score weights project de-risking and capital structure more than immediate news.",
        "A credible three-year path usually needs stronger technical disclosure, financing discipline, and jurisdiction progress.",
        "Confidence is capped until resource, engineering, and permitting milestones can be dated and sourced."
      ],
      companyGoals: [
        "Advance the project through drilling, resource work, technical studies, or permitting milestones.",
        "Show that the management team can finance progress without permanently impairing per-share upside.",
        "Create enough project evidence for strategic investors, acquirers, or development partners to underwrite the asset."
      ]
    },
    {
      horizon: "5Y" as const,
      label: "Five-year feasibility",
      score: clamp(assetScore * 0.4 + enrichedCategories.find((item) => item.key === "jurisdiction")!.score * 0.2 + capitalScore * 0.2 + evidenceScore * 0.2),
      confidence: evidenceConfidence === "high" ? "medium" : "low",
      summary: "Five-year feasibility is mainly about deposit quality, jurisdiction, management execution, and survival through financing cycles.",
      drivers: [
        "Long-term score weights asset quality and jurisdiction more heavily than short-term news.",
        "Five-year confidence is capped until resource, metallurgy, permitting, and management history are sourced.",
        "Long-term upside can be meaningful, but exploration-stage dilution risk remains central."
      ],
      companyGoals: [
        "Move the asset toward a development decision, strategic transaction, or clearly larger resource base.",
        "Prove the project can survive commodity cycles, permitting scrutiny, and repeated financing windows.",
        "Preserve per-share optionality so long-term upside accrues to shareholders instead of being diluted away."
      ]
    }
  ];
  return {
    overall,
    confidence: scorecardConfidence(evidenceScore, evidenceAudit),
    categories: enrichedCategories,
    timelineScores,
    methodology: SCORING_METHODOLOGY,
    evidenceAudit
  };
}

function buildEvidenceAudit(marketSignals: MarketSignals, coverage: EvidenceCoverage): EvidenceAudit {
  const requirements = EVIDENCE_REQUIREMENTS.map((requirement): EvidenceRequirement => {
    const available = requirementAvailable(requirement.id, marketSignals, coverage);
    return { ...requirement, status: available ? "available" : "missing" };
  });
  return {
    requirements,
    availableCriticalCount: requirements.filter((item) => item.importance === "critical" && item.status === "available").length,
    missingCriticalCount: requirements.filter((item) => item.importance === "critical" && item.status === "missing").length
  };
}

function requirementAvailable(requirementId: string, marketSignals: MarketSignals, coverage: EvidenceCoverage) {
  switch (requirementId) {
    case "technical-report":
      return coverage.technicalReport;
    case "share-structure":
      return coverage.shareStructure;
    case "market-data":
      return coverage.marketData || marketSignals.hasMarketData;
    case "cash-runway":
      return coverage.cashRunway;
    case "regulatory-filings":
      return coverage.filings;
    case "news-catalysts":
      return coverage.news;
    default:
      return false;
  }
}

function scorecardConfidence(evidenceScore: number, audit: EvidenceAudit): Scorecard["confidence"] {
  if (audit.missingCriticalCount >= 2) return "low";
  if (audit.missingCriticalCount === 1) return "medium";
  return evidenceScore >= 75 ? "high" : evidenceScore >= 45 ? "medium" : "low";
}

function weightedOverall(categories: ScoreCategory[]) {
  return clamp(
    SCORING_METHODOLOGY.categoryWeights.reduce((sum, weight) => {
      const category = categories.find((item) => item.key === weight.key);
      return sum + ((category?.score ?? 0) * weight.weight) / 100;
    }, 0)
  );
}

function enrichCategory(
  company: CompanyCandidate,
  category: BaseScoreCategory,
  context: {
    hasProject: boolean;
    hasFinancingRisk: boolean;
    hasRevenueGap: boolean;
    hasCatalyst: boolean;
    sources: SourceDocument[];
    managementEvidence: ManagementEvidence;
  }
): ScoreCategory {
  const projectList = company.projects?.join(", ") ?? "stated project portfolio";
  const baseDataNeeded = [
    "Latest issuer presentation and technical report",
    "Current market cap, cash, debt, and fully diluted share count",
    "Recent news releases and regulatory filings"
  ];
  const newsCount = context.sources.filter((source) => source.sourceType === "news").length;
  const details: Record<
    string,
    Pick<ScoreCategory, "positiveDrivers" | "negativeDrivers" | "improveActions" | "downgradeTriggers" | "dataNeeded">
  > = {
    asset_quality: {
      positiveDrivers: [
        `${company.name} has an identifiable asset focus: ${projectList}.`,
        context.hasProject
          ? "Current excerpts mention project, drilling, deposit, or resource language."
          : "Company registry still provides a project anchor for initial diligence."
      ],
      negativeDrivers: [
        "The current run does not yet validate grade, continuity, metallurgy, infrastructure, or resource economics.",
        "Asset score is capped until source adapters ingest technical-report depth."
      ],
      improveActions: [
        "Add a current technical report, investor presentation, and drill-result table.",
        "Show scale, grade, continuity, metallurgy, access, and infrastructure relative to comparable projects."
      ],
      downgradeTriggers: [
        "Drill results fail to confirm continuity or grade.",
        "Technical work reveals metallurgy, depth, access, water, or infrastructure issues."
      ],
      dataNeeded: ["Technical report", "Drill database", "Resource estimate or target rationale", ...baseDataNeeded]
    },
    management: {
      positiveDrivers: [
        context.managementEvidence.people.length
          ? `${context.managementEvidence.people.length} management profile${context.managementEvidence.people.length === 1 ? "" : "s"} are available with structured diligence context.`
          : "The app preserves management as a focused diligence lane instead of hiding missing data.",
        ...context.managementEvidence.confidenceSignals
          .filter((signal) => signal.status === "positive")
          .slice(0, 2)
          .map((signal) => signal.detail)
      ],
      negativeDrivers: [
        ...context.managementEvidence.gaps.slice(0, 2),
        "Junior miners depend heavily on capital allocation and market timing."
      ],
      improveActions: [
        "Add executive biographies, prior project outcomes, insider ownership, and financing history.",
        "Compare management's stated plans against delivered milestones."
      ],
      downgradeTriggers: [
        "Repeated missed milestones or promotional disclosure without technical progress.",
        "Financings that transfer too much upside away from existing holders."
      ],
      dataNeeded: ["Executive biographies", "Insider filings", "Prior company outcomes", ...baseDataNeeded]
    },
    jurisdiction: {
      positiveDrivers: [
        `${company.jurisdiction ?? company.country} is inside the app's first Canada/US diligence universe.`,
        "Known jurisdiction lets the app focus permitting and land-status checks."
      ],
      negativeDrivers: [
        "Local permitting, land tenure, environmental review, and community factors still need source-level verification.",
        "A country label is not enough to score project-level permitting risk."
      ],
      improveActions: [
        "Add land-status, permitting, environmental, and community-agreement sources.",
        "Map project location against infrastructure, protected areas, and comparable mine approvals."
      ],
      downgradeTriggers: [
        "Permit delays, land disputes, or community opposition become visible.",
        "Jurisdiction headlines raise the discount rate for similar projects."
      ],
      dataNeeded: ["Permitting timeline", "Land tenure map", "Environmental filings", ...baseDataNeeded]
    },
    capital_structure: {
      positiveDrivers: [
        context.hasFinancingRisk ? "Financing risk is explicitly identified rather than ignored." : "No explicit financing warning was detected in the current excerpts.",
        "The share-structure section separates ownership and dilution diligence from asset quality."
      ],
      negativeDrivers: [
        context.hasRevenueGap ? "No operating revenue was detected, which increases reliance on external capital." : "Cash runway and burn rate remain incomplete.",
        "Fully diluted share count, warrants, options, and financing terms are not yet ingested."
      ],
      improveActions: [
        "Add cash, burn rate, working capital, warrants, options, and recent financing terms.",
        "Calculate months of runway under the stated work program."
      ],
      downgradeTriggers: [
        "Discounted equity raise with heavy warrants.",
        "Cash runway tightens before value-adding catalysts arrive."
      ],
      dataNeeded: ["Cash and burn rate", "Fully diluted shares", "Warrant schedule", "Recent financing terms"]
    },
    valuation_optionality: {
      positiveDrivers: [
        `Optionality exists if ${projectList} can scale relative to enterprise value.`,
        "The app keeps valuation confidence low until quantitative market data is connected."
      ],
      negativeDrivers: [
        "No NAV, EV/resource, or peer multiple is calculated yet.",
        "Optionality can be overstated when project scale, grade, and dilution are not modeled together."
      ],
      improveActions: [
        "Add market cap, cash, debt, resource metrics, and peer comparables.",
        "Calculate enterprise value per resource unit where a compliant resource exists."
      ],
      downgradeTriggers: [
        "Market cap rises faster than technical evidence.",
        "Peer comparison shows weaker grade, scale, metallurgy, or location."
      ],
      dataNeeded: ["Market data", "Peer set", "Resource metrics", "Enterprise value"]
    },
    catalysts: {
      positiveDrivers: [
        context.hasCatalyst ? "Current excerpts mention drilling, technical work, permitting, or catalyst language." : "The timeline section identifies what catalyst data the app needs next.",
        `${newsCount} news source${newsCount === 1 ? "" : "s"} were collected.`
      ],
      negativeDrivers: [
        "Catalyst timing and expected magnitude are not yet pulled into a dated calendar.",
        "Junior-miner catalysts can be binary and highly sensitive to market conditions."
      ],
      improveActions: [
        "Build a dated catalyst calendar from news releases and presentations.",
        "Separate technical catalysts from financing, permitting, and macro catalysts."
      ],
      downgradeTriggers: [
        "Expected news is delayed or arrives below market expectations.",
        "Catalyst requires financing before value can be tested."
      ],
      dataNeeded: ["News calendar", "Presentation milestones", "Permit schedule", ...baseDataNeeded]
    },
    commodity_exposure: {
      positiveDrivers: [
        `Primary commodity exposure is ${company.commodityFocus.join(", ")}.`,
        "Commodity exposure is explicit, which helps compare macro sensitivity by timeframe."
      ],
      negativeDrivers: [
        "Price sensitivity, cost curve position, and project economics are not modeled.",
        "Commodity tailwinds cannot compensate for weak asset or financing evidence."
      ],
      improveActions: [
        "Add commodity price scenarios and project-level sensitivity.",
        "Compare project economics across conservative, base, and upside commodity cases."
      ],
      downgradeTriggers: [
        "Commodity cycle weakens before financing or project catalysts.",
        "Project economics require aggressive long-term price assumptions."
      ],
      dataNeeded: ["Commodity price deck", "Project sensitivity table", "Peer commodity exposure"]
    },
    evidence_confidence: {
      positiveDrivers: [
        `${context.sources.length} source document${context.sources.length === 1 ? "" : "s"} were collected in this run.`,
        "The app explicitly shows missing evidence instead of inventing unsupported facts."
      ],
      negativeDrivers: [
        "Source coverage is not yet broad enough for a full institutional-quality conclusion.",
        "Live analyst forecasts, market data, filings extraction, and technical reports are still incomplete."
      ],
      improveActions: [
        "Connect live filings, market data, analyst forecast, and presentation adapters.",
        "Require every material claim to carry source metadata."
      ],
      downgradeTriggers: [
        "Material claims cannot be tied to filings, presentations, news, or market data.",
        "Sources conflict without reconciliation."
      ],
      dataNeeded: ["SEC/SEDAR documents", "Company presentations", "Market data", "Analyst forecast sources"]
    }
  };

  return { ...category, ...details[category.key] };
}

function applyMarketSignalsToCategory(category: ScoreCategory, signals: MarketSignals): ScoreCategory {
  if (!signals.hasMarketData) return category;

  const withCommon = {
    ...category,
    dataNeeded: category.dataNeeded.filter((item) => item !== "Market data")
  };

  switch (category.key) {
    case "capital_structure": {
      const positiveDrivers = [...category.positiveDrivers];
      const negativeDrivers = [...category.negativeDrivers];
      const drivers = [...category.drivers];
      let scoreAdjustment = 0;

      if (signals.shareCountDriver) {
        drivers.push(signals.shareCountDriver);
        positiveDrivers.push("Basic shares outstanding are sourced from market data, improving the starting point for dilution analysis.");
        scoreAdjustment += 4;
      }
      if (signals.highShareCount) {
        negativeDrivers.push("The current share count is already stretched, so future financings could further reduce per-share upside.");
        scoreAdjustment -= 7;
      }
      if (signals.thinLiquidity) {
        negativeDrivers.push("Thin trading liquidity can make capital raises more expensive and make exits harder for larger positions.");
        scoreAdjustment -= 4;
      }

      return {
        ...withCommon,
        score: clamp(category.score + scoreAdjustment),
        confidence: signals.sharesOutstanding !== undefined ? "medium" : category.confidence,
        confidenceRationale:
          signals.sharesOutstanding !== undefined
            ? "Basic shares outstanding are sourced, but fully diluted shares, warrants, options, insider ownership, and financing terms still need filings."
            : category.confidenceRationale,
        drivers,
        positiveDrivers,
        negativeDrivers,
        dataNeeded: ["Fully diluted shares", "Warrant schedule", "Options", "Insider ownership", "Recent financing terms"]
      };
    }
    case "valuation_optionality": {
      const positiveDrivers = [...category.positiveDrivers];
      const negativeDrivers = [...category.negativeDrivers];
      const drivers = [...category.drivers];
      let scoreAdjustment = 0;

      if (signals.marketCapDriver) {
        drivers.push(signals.marketCapDriver);
        positiveDrivers.push("Market capitalization is sourced, so optionality can be judged against a current public-market valuation.");
        scoreAdjustment += 3;
      }
      if (signals.tinyMarketCap) {
        positiveDrivers.push("A very small market cap can create high optionality if the project evidence improves.");
        negativeDrivers.push("A very small market cap also signals financing fragility and limited institutional sponsorship.");
        scoreAdjustment -= 2;
      }
      if (signals.nearLow) {
        negativeDrivers.push("The stock is trading near the lower end of its 52-week range, which may indicate weak market confidence or tax-loss-style pressure.");
        scoreAdjustment -= 4;
      }
      if (signals.nearHigh) {
        positiveDrivers.push("The stock is trading toward the upper end of its 52-week range, suggesting the market is already rewarding recent evidence or expectations.");
        scoreAdjustment += 3;
      }

      return {
        ...withCommon,
        score: clamp(category.score + scoreAdjustment),
        confidence: signals.marketCap !== undefined ? "medium" : category.confidence,
        drivers,
        positiveDrivers,
        negativeDrivers
      };
    }
    case "catalysts": {
      const positiveDrivers = [...category.positiveDrivers];
      const negativeDrivers = [...category.negativeDrivers];
      const drivers = [...category.drivers];
      let scoreAdjustment = 0;

      if (signals.rangeDriver) drivers.push(signals.rangeDriver);
      if (signals.liquidityDriver) drivers.push(signals.liquidityDriver);
      if (signals.liquidityRatio !== undefined && signals.liquidityRatio >= 1.25) {
        positiveDrivers.push("Trading volume is running above average, which can indicate heightened attention around catalysts.");
        scoreAdjustment += 4;
      }
      if (signals.thinLiquidity) {
        negativeDrivers.push("thin liquidity makes catalyst reactions less reliable and can amplify downside if news disappoints.");
        scoreAdjustment -= 7;
      }
      if (signals.nearLow) {
        negativeDrivers.push("A price near the 52-week low can signal skepticism that upcoming catalysts will arrive on time or meet expectations.");
        scoreAdjustment -= 3;
      }

      return {
        ...withCommon,
        score: clamp(category.score + scoreAdjustment),
        drivers,
        positiveDrivers,
        negativeDrivers
      };
    }
    case "evidence_confidence":
      return {
        ...withCommon,
        positiveDrivers: [
          ...category.positiveDrivers,
          `${signals.sourceLabel ?? "Market data"} supplies current price, valuation, volume, 52-week range, and share-count fields where available.`
        ],
        negativeDrivers: [
          ...category.negativeDrivers.filter((item) => !item.includes("market data")),
          "Market data improves trading and valuation context but does not replace filings, technical reports, cash runway, or ownership documents."
        ],
        dataNeeded: ["SEC/SEDAR documents", "Company presentations", "Analyst forecast sources", "Technical report extraction"]
      };
    default:
      return withCommon;
  }
}

function applyEvidenceCoverageToCategory(category: ScoreCategory, coverage: EvidenceCoverage): ScoreCategory {
  switch (category.key) {
    case "asset_quality":
      if (coverage.technicalReport && coverage.projectEvidence) {
        return {
          ...category,
          confidence: "high",
          confidenceRationale:
            "Technical-report style evidence, resource language, metallurgy, and project disclosure are present, so asset confidence can move above a registry-level read.",
          drivers: [
            ...category.drivers,
            "Technical-report and resource-estimate language were detected in the source set."
          ],
          positiveDrivers: [
            ...category.positiveDrivers,
            "Resource, metallurgy, and technical disclosure improve the evidence base behind asset quality."
          ],
          dataNeeded: ["Drill database", "Resource table", "Metallurgy details", "Infrastructure assumptions"]
        };
      }
      if (coverage.projectEvidence) {
        return {
          ...category,
          confidence: strongerConfidence(category.confidence, "medium"),
          confidenceRationale: "Project-level source evidence exists, but technical-report depth is still needed for high confidence."
        };
      }
      return category;
    case "management":
      if (!coverage.managementEvidence) return category;
      return {
        ...category,
        confidence: strongerConfidence(category.confidence, "medium"),
        confidenceRationale:
          "Management biography, insider-alignment, prior-outcome, or capital-allocation evidence is present, but full independent track-record verification is still needed.",
        drivers: [
          ...category.drivers,
          "Management-history evidence was detected in the source set."
        ],
        positiveDrivers: [
          ...category.positiveDrivers,
          "Management, insider ownership, prior discoveries, or capital-allocation history is now part of the evidence base."
        ],
        dataNeeded: ["Independent biography checks", "Insider filings", "Prior company outcomes", "Financing history"]
      };
    case "jurisdiction":
      if (!coverage.jurisdictionDetail) return category;
      return {
        ...category,
        confidence: strongerConfidence(category.confidence, coverage.filings ? "high" : "medium"),
        confidenceRationale:
          "Permitting, land-tenure, environmental, infrastructure, or community-detail evidence was found, improving jurisdiction confidence beyond country-level classification.",
        drivers: [
          ...category.drivers,
          "Jurisdiction detail was detected beyond the basic country or exchange listing."
        ],
        dataNeeded: ["Permit documents", "Land-tenure map", "Environmental baseline details", "Community agreement status"]
      };
    case "capital_structure":
      if (coverage.shareStructure && coverage.cashRunway) {
        return {
          ...category,
          confidence: "high",
          confidenceRationale:
            "Share-structure evidence and cash-runway evidence are both present, so dilution confidence can rise while ownership-specific gaps remain visible.",
          drivers: [
            ...category.drivers,
            "Fully diluted share-structure and cash-runway language were detected in the source set."
          ],
          positiveDrivers: [
            ...category.positiveDrivers,
            "Cash balance, burn rate, runway, fully diluted shares, warrants, options, or insider ownership evidence improves dilution analysis."
          ],
          dataNeeded: ["Financing terms by date", "Warrant expiry schedule", "Option schedule", "Insider filing reconciliation"]
        };
      }
      if (coverage.shareStructure || coverage.cashRunway) {
        return {
          ...category,
          confidence: strongerConfidence(category.confidence, "medium"),
          confidenceRationale:
            "Partial capital-structure or runway evidence is present, but both are needed before dilution confidence can move high."
        };
      }
      return category;
    case "valuation_optionality":
      if (coverage.marketData && coverage.technicalReport) {
        return {
          ...category,
          confidence: strongerConfidence(category.confidence, "high"),
          confidenceRationale:
            "Market data and technical-report/resource evidence are both present, allowing optionality to be judged against a current market valuation and project evidence.",
          dataNeeded: ["Peer EV/resource comparison", "Cash and debt", "NAV sensitivity", "Commodity price deck"]
        };
      }
      return category;
    case "catalysts":
      if (coverage.news && coverage.catalystCalendar) {
        return {
          ...category,
          confidence: strongerConfidence(category.confidence, "high"),
          confidenceRationale:
            "News and dated catalyst-calendar language are present, so near-term catalyst confidence can rise while outcome risk remains explicit.",
          drivers: [
            ...category.drivers,
            "Dated catalyst, drilling, permitting, or technical-study language was detected."
          ],
          dataNeeded: ["Expected catalyst dates", "Required financing before catalysts", "Historical milestone delivery"]
        };
      }
      return category;
    case "evidence_confidence":
      if (coverage.technicalReport && coverage.shareStructure && coverage.cashRunway && coverage.marketData && coverage.filings && coverage.news) {
        return {
          ...category,
          confidence: "high",
          confidenceRationale:
            "The run includes the core evidence classes needed for a reasonable basis: technical disclosure, share structure, cash runway, market data, filings, and news.",
          positiveDrivers: [
            ...category.positiveDrivers,
            "Core confidence inputs are covered: technical disclosure, capital structure, runway, market data, filings, and news."
          ],
          dataNeeded: ["Source reconciliation", "Analyst forecast sources", "Ownership filing reconciliation"]
        };
      }
      return category;
    default:
      return category;
  }
}

function buildInvestorLenses(company: CompanyCandidate, sources: SourceDocument[]): InvestorLens[] {
  const citations = sourceIds(sources);
  const noEvidence = sources.length === 0;
  const disclaimer =
    "This independent analytical framework does not represent any person or organization and does not imply affiliation, endorsement, or investment advice.";

  const view = (focus: string) =>
    noEvidence
      ? "Current sources are insufficient for a supported view. Use this framework as a checklist of what to verify next."
      : `Apply ${focus} to ${company.name}, with every positive claim tied back to the cited source set.`;

  return [
    {
      id: "contrarian-downside-survival",
      name: "Contrarian and downside-survival lens",
      initials: "CD",
      visualTone: "gold",
      approach: "Contrarian resource optionality, management credibility, jurisdiction, and survival through weak markets.",
      focus: "contrarian resource optionality, jurisdiction, management credibility, and financing survival",
      background:
        "This resource-cycle investing framework starts with downside survival, management credibility, financing resilience, and whether the asset offers meaningful optionality.",
      view: view("resource optionality and downside survival"),
      positives: noEvidence ? ["Potential upside cannot be assessed without project evidence."] : ["Exploration optionality is present if the cited project scale is credible."],
      concerns: ["Avoid promotion-driven narratives without evidence for scale, cost of capital, and management execution."],
      metrics: ["Investment Quality asset quality and jurisdiction scores", "Financing runway and dilution markers", "Evidence quality behind scale and grade claims"],
      checklist: [
        "Does management have a record of creating per-share value in prior resource cycles?",
        "Is the asset large enough that optionality can matter if the commodity cycle improves?",
        "Can the company survive weak markets without destructive dilution?",
        "Are jurisdiction, title, permitting, and technical claims independently verifiable?"
      ],
      sourceLinks: [],
      citationIds: citations,
      disclaimer
    },
    {
      id: "discovery-sponsorship",
      name: "Discovery and sponsorship lens",
      initials: "DS",
      visualTone: "silver",
      approach: "Discovery upside, strong sponsorship, insider alignment, and whether financing can accelerate exploration.",
      focus: "high-upside discovery potential, insider alignment, large backers, and whether financing can accelerate exploration",
      background:
        "This framework tests whether credible sponsorship, aligned ownership, and adequately funded exploration can convert geological potential into repeatable discovery evidence.",
      view: view("sponsorship quality, discovery upside, and whether capital backing improves the odds of a real discovery"),
      positives: ["Strategic sponsorship matters when it funds drilling, signals conviction, and reduces near-term financing stress."],
      concerns: ["Prominent backers do not replace deposit evidence, technical validation, or disciplined entry price."],
      metrics: ["Recent financing size and terms", "Insider or strategic-holder ownership", "Drill result cadence and grade continuity"],
      checklist: [
        "Is there meaningful insider or strategic investor ownership rather than only promotional endorsement?",
        "Does financing improve the odds of a discovery by funding enough drilling?",
        "Are drill results showing grade continuity, scale, and repeatability?",
        "Can the company keep exploration momentum without giving away too much dilution?"
      ],
      sourceLinks: [],
      citationIds: citations,
      disclaimer
    },
    {
      id: "macro-jurisdiction-capital-scarcity",
      name: "Macro, jurisdiction, and capital-scarcity lens",
      initials: "MC",
      visualTone: "copper",
      approach: "Macro cycle, capital scarcity, jurisdiction, incentives, and asymmetric upside in scarce resource themes.",
      focus: "commodity cycle, jurisdiction, capital scarcity, management incentives, and asymmetry versus macro demand",
      background:
        "This framework connects commodity-cycle conditions with jurisdiction, infrastructure, incentives, capital availability, and the dilution required to reach the next value milestone.",
      view: view("macro tailwinds, jurisdictional risk, and whether the story has asymmetric upside if the commodity cycle strengthens"),
      positives: [`${company.commodityFocus.join(", ")} exposure can matter more if macro demand and capital flows turn supportive.`],
      concerns: ["Macro themes should not overpower company-specific financing, permitting, and asset-quality risk."],
      metrics: ["Commodity exposure and cycle timing", "Jurisdiction and permitting risk", "Capital availability versus drilling/development needs"],
      checklist: [
        "Does the macro setup support the commodity, or is the thesis relying only on company promotion?",
        "Is the jurisdiction attractive after taxes, permitting, infrastructure, and political risk?",
        "Are management incentives aligned with common shareholders?",
        "Is the upside asymmetric after considering capital needs and dilution?"
      ],
      sourceLinks: [],
      citationIds: citations,
      disclaimer
    }
  ];
}

function buildAnalystForecast(company: CompanyCandidate): AnalystForecast {
  if (company.analystForecast) return company.analystForecast;

  return {
    status: "not_sourced",
    consensusLabel: "Forecast unavailable in current data",
    timeHorizon: "12 months",
    summary:
      "Analyst target data was not available from the current market-data run. Many junior miners have limited or inconsistent broker coverage; add a sourced analyst report or a richer provider feed before relying on targets.",
    sourceUrl: "https://finance.yahoo.com/",
    sourceLabel: "Forecast data gap",
    dataNeeded: [
      "Latest analyst price target or consensus target",
      "Analyst rating distribution and publication dates",
      "Current share price used to calculate upside/downside",
      "Source name and timestamp for every price target"
    ]
  };
}

function buildFinancialSnapshot(company: CompanyCandidate): FinancialSnapshot {
  if (company.financialSnapshot) return company.financialSnapshot;

  return {
    status: "not_available",
    sourceLabel: "Financial data gap",
    sourceUrl: company.country === "US" ? "https://www.sec.gov/search-filings" : "https://www.sedarplus.ca/",
    asOf: "Unavailable",
    dataNeeded: [
      "Current cash balance, debt, and working capital from the latest filing.",
      "EBITDA, net income, operating expenses, operating cash flow, and free cash flow from Yahoo Finance or filings.",
      "Exploration budget and burn rate needed to estimate cash runway.",
      "Issuer financial statements or MD&A to reconcile any market-data summary fields."
    ]
  };
}

function managementGroup(role: string): NonNullable<ManagementPerson["group"]> {
  if (/chief|ceo|cfo|coo|president|executive/i.test(role)) return "executive";
  if (/chair|director|board/i.test(role)) return "board";
  if (/geolog|technical|qualified person|exploration|qp/i.test(role)) return "technical";
  if (/advisor|consultant/i.test(role)) return "advisor";
  return "project_lead";
}

function managementSourceStatusFromEvidence(
  sources: ManagementEvidence["sources"]
): NonNullable<ManagementPerson["sourceStatus"]> {
  if (sources.some((source) => source.sourceType === "filing" || /sec\.gov|sedarplus|sedi\.ca/i.test(source.url))) return "filing";
  if (sources.some((source) => /company website|issuer/i.test(source.publisher))) return "issuer";
  if (sources.some((source) => /linkedin\.com/i.test(source.url))) return "candidate";
  return "unknown";
}

function linkedInUrlFromSources(person: ManagementPerson, sources: ManagementEvidence["sources"]) {
  const name = person.name.toLowerCase();
  return sources.find((source) => {
    const haystack = `${source.personName ?? ""} ${source.title} ${source.excerpt}`.toLowerCase();
    return /linkedin\.com\/in/i.test(source.url) && haystack.includes(name);
  })?.url;
}

function linkedInStatusFromSources(
  person: ManagementPerson,
  linkedInUrl: string | undefined,
  sources: ManagementEvidence["sources"]
): NonNullable<ManagementPerson["linkedInStatus"]> {
  if (!linkedInUrl) return "needs_review";
  const name = person.name.toLowerCase();
  const matchingLinkedInSource = sources.find((source) => {
    const haystack = `${source.personName ?? ""} ${source.title} ${source.publisher} ${source.excerpt}`.toLowerCase();
    return source.url === linkedInUrl && haystack.includes(name);
  });
  if (!matchingLinkedInSource) return "needs_review";
  return /company website|issuer|filing/i.test(matchingLinkedInSource.publisher) ? "verified" : "likely_match";
}

function collectLinkedInCandidates(
  _company: CompanyCandidate,
  people: ManagementPerson[],
  _sources: ManagementEvidence["sources"],
  retrievedAt: string
): ManagementEvidence["linkedInCandidates"] {
  return people.map((person) => ({
    personName: person.name,
    url: person.linkedInStatus === "verified" || person.linkedInStatus === "likely_match" ? person.linkedInUrl : undefined,
    status: person.linkedInStatus ?? "needs_review",
    sourceIds: person.evidenceIds ?? [],
    retrievedAt
  }));
}

function managementOpenQuestions(person: ManagementPerson): string[] {
  return [
    `Verify ${person.name}'s prior company outcomes and whether those assets advanced beyond promotion.`,
    "Review insider ownership, option grants, and personal capital at risk.",
    "Compare stated milestones with delivered drilling, financing, permitting, and technical progress."
  ];
}

function managementPersonText(person: ManagementPerson) {
  return `${person.name} ${person.role} ${person.bio} ${person.experience.join(" ")} ${person.trackRecord?.join(" ") ?? ""}`;
}

function managementEvidenceText(evidence: ManagementEvidence) {
  return `${evidence.people.map(managementPersonText).join(" ")} ${evidence.sources.map((source) => `${source.title} ${source.publisher} ${source.excerpt}`).join(" ")} ${evidence.trackRecord.map((record) => record.summary).join(" ")}`;
}

function managementRoleCoverage(people: ManagementPerson[]) {
  const groups = new Set(people.map((person) => person.group ?? managementGroup(person.role)));
  const hasExecutive = groups.has("executive");
  const hasBoard = groups.has("board");
  const hasTechnical = groups.has("technical") || people.some((person) => /geolog|exploration|technical|qualified person|p\.?\s?geo|p\.?\s?eng|metallurg|engineer/i.test(managementPersonText(person)));
  const hasFinance = people.some((person) => /chief financial|cfo|finance|accounting|treasury|audit|capital markets/i.test(managementPersonText(person)));
  const covered = [hasExecutive, hasBoard, hasTechnical, hasFinance].filter(Boolean).length;

  return {
    covered,
    hasExecutive,
    hasBoard,
    hasTechnical,
    hasFinance,
    detail: `Role coverage spans ${covered}/4 core lanes: executive, board, technical, and finance.`
  };
}

function hasIssuerOrFilingRosterEvidence(evidence: ManagementEvidence) {
  return evidence.people.some((person) => person.sourceStatus === "issuer" || person.sourceStatus === "filing") ||
    evidence.sources.some((source) => source.confidence !== "low" || /issuer|filing|sedar|sec|circular|proxy|annual|aif/i.test(`${source.publisher} ${source.title}`));
}

function managementTechnicalCredibility(evidence: ManagementEvidence) {
  const text = managementEvidenceText(evidence);
  const hasCredential = /\b(P\.?\s?Geo\.?|P\.?\s?Eng\.?|qualified person|QP|geologist|engineer|metallurgist|Ph\.?\s?D\.?|M\.?\s?Sc\.?|B\.?\s?Sc\.?)\b/i.test(text);
  const hasRelevantExperience = /exploration|resource|reserve|drill|mine development|mine construction|operations|technical report|metallurgy|project development/i.test(text);
  const score = [hasCredential, hasRelevantExperience].filter(Boolean).length;

  return {
    score,
    status: score >= 2 ? ("positive" as const) : score === 1 ? ("watch" as const) : ("gap" as const),
    detail:
      score >= 2
        ? "Technical credibility includes credentials or qualified-person language plus relevant exploration, development, or operating experience."
        : score === 1
          ? "Technical credibility has partial support, but credentials and directly relevant project experience need fuller corroboration."
          : "Technical credibility is not yet supported by credentials, qualified-person language, or directly relevant project experience."
  };
}

function managementPriorOutcomeStrength(evidence: ManagementEvidence) {
  const outcomeRecords = evidence.trackRecord.filter((record) => record.theme === "prior_outcome" || record.theme === "technical_execution");
  const highQualityRecords = outcomeRecords.filter((record) => record.confidence !== "low");
  const count = outcomeRecords.length;

  return {
    count,
    highQualityCount: highQualityRecords.length,
    status: highQualityRecords.length >= 2 || count >= 4 ? ("positive" as const) : count >= 1 ? ("watch" as const) : ("gap" as const),
    detail:
      count > 0
        ? `Prior-outcome evidence includes ${count} discovery, development, transaction, financing, or technical-execution signal${count === 1 ? "" : "s"}.`
        : "Prior discoveries, mine builds, transactions, financings, and technical-execution outcomes are not yet independently supported."
  };
}

function managementCapitalAllocationStrength(evidence: ManagementEvidence) {
  const text = managementEvidenceText(evidence);
  const hasCapitalAllocation = evidence.trackRecord.some((record) => record.theme === "capital_allocation") ||
    /capital allocation|financing terms|project financing|treasury|burn rate|cash runway|working capital|financings?/i.test(text);
  const hasInsiderAlignment = evidence.trackRecord.some((record) => record.theme === "insider_alignment") ||
    /insider ownership|beneficial ownership|management ownership|forms? 3|forms? 4|forms? 5|sedi|security ownership/i.test(text);

  return {
    hasCapitalAllocation,
    hasInsiderAlignment,
    status: hasCapitalAllocation && hasInsiderAlignment ? ("positive" as const) : hasCapitalAllocation || hasInsiderAlignment ? ("watch" as const) : ("gap" as const),
    detail:
      hasCapitalAllocation && hasInsiderAlignment
        ? "Capital allocation and insider alignment both have cited support."
        : hasCapitalAllocation
          ? "Capital allocation evidence is present, but insider ownership/alignment remains incomplete."
          : hasInsiderAlignment
            ? "Insider ownership/alignment evidence is present, but financing and capital allocation history remains incomplete."
            : "Insider ownership, option grants, financing terms, and capital allocation history remain key open diligence gaps."
  };
}

function normalizedPersonName(value: string) {
  return value.toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

function issuerPeopleFromSources(sources: SourceDocument[]): ManagementPerson[] {
  return sources
    .filter((source) => source.publisher === "Issuer team page")
    .map((source): ManagementPerson | undefined => {
      const titleMatch = source.title.match(/^(.+?)\s+-\s+(.+)$/);
      const name = titleMatch?.[1];
      const role = titleMatch?.[2];
      const bio = source.excerpts.slice(1).join(" ").replace(/\s+/g, " ").trim() || source.excerpts[0]?.trim();
      if (!name || !role || !bio) return undefined;
      return {
        name,
        role,
        bio,
        experience: [bio],
        group: source.managementGroup ?? managementGroup(role),
        sourceUrl: source.url,
        sourceStatus: "issuer",
        profileImageUrl: source.imageUrl,
        trackRecord: /discover|mine|build|financ|capital|transaction|acquisition|acquired|deposit|development|operation|project/i.test(bio)
          ? [bio]
          : [],
        evidenceIds: [source.id]
      };
    })
    .filter((person): person is ManagementPerson => Boolean(person));
}

function mergeManagementPeople(registryPeople: ManagementPerson[], issuerPeople: ManagementPerson[]) {
  const merged = new Map<string, ManagementPerson>();
  for (const person of registryPeople) {
    merged.set(normalizedPersonName(person.name), person);
  }
  for (const issuerPerson of issuerPeople) {
    const key = normalizedPersonName(issuerPerson.name);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, issuerPerson);
      continue;
    }
    merged.set(key, {
      ...existing,
      role: existing.role.length >= issuerPerson.role.length ? existing.role : issuerPerson.role,
      bio: existing.bio.length >= issuerPerson.bio.length ? existing.bio : issuerPerson.bio,
      experience: Array.from(new Set([...existing.experience, ...issuerPerson.experience])),
      group: existing.group ?? issuerPerson.group,
      sourceUrl: issuerPerson.sourceUrl ?? existing.sourceUrl,
      sourceStatus: issuerPerson.sourceStatus ?? existing.sourceStatus,
      profileImageUrl: existing.profileImageUrl ?? issuerPerson.profileImageUrl,
      evidenceIds: Array.from(new Set([...(existing.evidenceIds ?? []), ...(issuerPerson.evidenceIds ?? [])])),
      trackRecord: Array.from(new Set([...(existing.trackRecord ?? []), ...(issuerPerson.trackRecord ?? [])]))
    });
  }
  return Array.from(merged.values());
}

function buildManagementEvidence(
  company: CompanyCandidate,
  sources: SourceDocument[],
  facts: EvidenceFact[] = []
): ManagementEvidence {
  const registryContext = company.management?.length
    ? company.management.map((person) => ({
        ...person,
        sourceStatus: "unknown" as const,
        evidenceIds: [] as string[],
        trackRecord: [] as string[]
      }))
    : [
        {
          name: "Management team",
          role: "Key executives and directors",
          bio: "Detailed executive biographies were not available in the current registry entry.",
          experience: [
            "Verify prior discoveries, mine builds, financings, and public-company outcomes.",
            "Review insider ownership and whether management has bought stock with personal capital.",
            "Check whether the team has experience in the same commodity, jurisdiction, and project stage."
          ],
          sourceStatus: "unknown" as const
        }
      ];
  const issuerPeople = issuerPeopleFromSources(sources);
  const registryPeople =
    issuerPeople.length && registryContext.length === 1 && registryContext[0].name === "Management team"
      ? issuerPeople
      : mergeManagementPeople(registryContext, issuerPeople);

  const managementSources = sources.filter(
    (source) =>
      source.publisher === "Issuer team page" ||
      /management|leadership|executive|director|board|governance|technical team|qualified person|advisor|profile/i.test(
        `${source.title} ${source.publisher} ${source.excerpts.join(" ")}`
      )
  );
  const factSources = facts.filter((fact) =>
    ["management_biography", "prior_outcomes", "capital_allocation", "insider_ownership"].includes(fact.category)
  );

  const personSources: ManagementEvidence["sources"] = [
    ...managementSources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      sourceType: source.sourceType,
      excerpt: source.excerpts[0] ?? source.title,
      confidence: source.sourceType === "filing" || source.sourceType === "regulatory_search" ? ("medium" as const) : ("low" as const)
    })),
    ...factSources.map((fact) => ({
      id: fact.sourceId,
      title: fact.sourceTitle,
      url: fact.sourceUrl,
      publisher: "Evidence extraction",
      sourceType: "manual" as const,
      excerpt: fact.excerpt,
      confidence: fact.confidence
    }))
  ];

  const people = registryPeople.map((person) => {
    const isGenericRosterEntry = person.name === "Management team";
    const evidenceIds = personSources
      .filter((source) => {
        const name = person.name.toLowerCase();
        if (source.personName) return source.personName === person.name;
        return source.title.toLowerCase().includes(name) || source.excerpt.toLowerCase().includes(name);
      })
      .map((source) => source.id);
    const matchingSources = personSources.filter((source) => evidenceIds.includes(source.id));
    const trackRecord = isGenericRosterEntry || evidenceIds.length === 0
      ? []
      : person.experience.filter((item) => /discover|mine|build|financ|capital|transaction|deposit|development|operation|project/i.test(item));
    const sourcedLinkedInUrl = linkedInUrlFromSources(person, personSources);
    const discoveredLinkedInUrl = sourcedLinkedInUrl ?? person.linkedInUrl;
    return {
      ...person,
      group: person.group ?? managementGroup(person.role),
      sourceStatus: evidenceIds.length ? managementSourceStatusFromEvidence(matchingSources) : "unknown",
      sourceUrl: evidenceIds.length ? person.sourceUrl : undefined,
      profileImageUrl: evidenceIds.length ? person.profileImageUrl : undefined,
      linkedInUrl: discoveredLinkedInUrl,
      linkedInStatus: linkedInStatusFromSources(person, discoveredLinkedInUrl, personSources),
      evidenceIds,
      trackRecord: person.trackRecord ?? trackRecord,
      openQuestions: person.openQuestions ?? managementOpenQuestions(person)
    };
  });

  const linkedInCandidates = collectLinkedInCandidates(company, people, personSources, new Date().toISOString());

  const trackRecord = [
    ...people.flatMap((person) =>
      (person.trackRecord ?? []).map((item) => ({
        personName: person.name,
        theme: /financ|capital/i.test(item) ? ("capital_allocation" as const) : /technical|geolog|exploration|project/i.test(item) ? ("technical_execution" as const) : ("prior_outcome" as const),
        summary: item,
        sourceId: person.evidenceIds?.[0] ?? `management-registry-${slug(company.id)}-${slug(person.name)}`,
        confidence: person.sourceStatus === "issuer" || person.sourceStatus === "filing" ? ("medium" as const) : ("low" as const)
      }))
    ),
    ...factSources.map((fact) => ({
      theme:
        fact.category === "capital_allocation"
          ? ("capital_allocation" as const)
          : fact.category === "insider_ownership"
            ? ("insider_alignment" as const)
            : ("prior_outcome" as const),
      summary: fact.value,
      sourceId: fact.sourceId,
      confidence: fact.confidence
    }))
  ];

  const verifiedLinkedInCount = linkedInCandidates.filter((candidate) => candidate.status === "verified").length;
  const likelyLinkedInCount = linkedInCandidates.filter((candidate) => candidate.status === "likely_match").length;
  const usableLinkedInCount = verifiedLinkedInCount + likelyLinkedInCount;
  const issuerSourcedCount = people.filter((person) => person.sourceStatus === "issuer").length;
  const roleCoverage = managementRoleCoverage(people);
  const hasSourcedRoster = hasIssuerOrFilingRosterEvidence({ people, sources: personSources, linkedInCandidates, trackRecord, confidenceSignals: [], gaps: [], summary: "" });
  const technicalCredibility = managementTechnicalCredibility({ people, sources: personSources, linkedInCandidates, trackRecord, confidenceSignals: [], gaps: [], summary: "" });
  const priorOutcomes = managementPriorOutcomeStrength({ people, sources: personSources, linkedInCandidates, trackRecord, confidenceSignals: [], gaps: [], summary: "" });
  const capitalAllocation = managementCapitalAllocationStrength({ people, sources: personSources, linkedInCandidates, trackRecord, confidenceSignals: [], gaps: [], summary: "" });
  const gaps = [
    people.length <= 1 || roleCoverage.covered < 2 ? "Full executive, board, technical, advisor, and project-lead roster still needs discovery." : undefined,
    !hasSourcedRoster ? "Roster needs issuer, filing, or circular evidence before confidence can rise above low." : undefined,
    usableLinkedInCount === 0 ? "No verified or likely LinkedIn profiles are available for this run." : undefined,
    priorOutcomes.status !== "positive" ? "Prior discoveries, mine builds, financings, and public-company outcomes need more cited support." : undefined,
    technicalCredibility.status === "gap" ? "Technical credentials, qualified-person evidence, or directly relevant project-stage experience needs support." : undefined,
    capitalAllocation.status !== "positive" ? "Insider ownership, option grants, and financing/capital-allocation history are not yet independently sourced." : undefined
  ].filter((gap): gap is string => Boolean(gap));

  const confidenceSignals = [
    {
      id: "roster-depth",
      label: "Roster depth",
      status: people.length >= 3 && hasSourcedRoster ? ("positive" as const) : people.length >= 2 ? ("watch" as const) : ("gap" as const),
      detail: `${people.length} management profile${people.length === 1 ? "" : "s"} are available for this run; ${issuerSourcedCount} came from issuer website evidence.`,
      sourceIds: personSources.map((source) => source.id)
    },
    {
      id: "role-coverage",
      label: "Role coverage",
      status: roleCoverage.covered >= 3 && hasSourcedRoster ? ("positive" as const) : roleCoverage.covered >= 2 ? ("watch" as const) : ("gap" as const),
      detail: roleCoverage.detail,
      sourceIds: personSources.map((source) => source.id)
    },
    {
      id: "technical-credibility",
      label: "Technical credibility",
      status: technicalCredibility.status,
      detail: technicalCredibility.detail,
      sourceIds: personSources.map((source) => source.id)
    },
    {
      id: "verified-profiles",
      label: "LinkedIn profile coverage",
      status: verifiedLinkedInCount && hasSourcedRoster ? ("positive" as const) : likelyLinkedInCount || verifiedLinkedInCount ? ("watch" as const) : ("gap" as const),
      detail: `${verifiedLinkedInCount} verified and ${likelyLinkedInCount} likely LinkedIn/public profile${usableLinkedInCount === 1 ? "" : "s"} are available.`,
      sourceIds: linkedInCandidates.flatMap((candidate) => candidate.sourceIds)
    },
    {
      id: "track-record",
      label: "Track record evidence",
      status: priorOutcomes.status,
      detail: priorOutcomes.detail,
      sourceIds: trackRecord.map((record) => record.sourceId)
    },
    {
      id: "alignment-capital",
      label: "Alignment and capital allocation",
      status: capitalAllocation.status,
      detail: capitalAllocation.detail,
      sourceIds: factSources.map((fact) => fact.sourceId)
    }
  ];

  return {
    people,
    sources: personSources,
    linkedInCandidates,
    trackRecord,
    confidenceSignals,
    gaps,
    summary:
      people.length && personSources.length
        ? `${company.name}'s management read is based on ${people.length} structured profile${people.length === 1 ? "" : "s"}, ${trackRecord.length} track-record signal${trackRecord.length === 1 ? "" : "s"}, ${verifiedLinkedInCount} verified LinkedIn/public profile${verifiedLinkedInCount === 1 ? "" : "s"}, and ${likelyLinkedInCount} likely profile${likelyLinkedInCount === 1 ? "" : "s"}.`
        : "Management quality remains a key diligence item. The app could not verify a complete roster, LinkedIn profile set, insider alignment, or prior outcomes from current evidence."
  };
}

function managementEvidenceScore(evidence: ManagementEvidence) {
  const roleCoverage = managementRoleCoverage(evidence.people);
  const hasSourcedRoster = hasIssuerOrFilingRosterEvidence(evidence);
  if (!hasSourcedRoster) return 30;
  const technicalCredibility = managementTechnicalCredibility(evidence);
  const priorOutcomes = managementPriorOutcomeStrength(evidence);
  const capitalAllocation = managementCapitalAllocationStrength(evidence);
  const rosterScore = Math.min(16, evidence.people.length * 3 + roleCoverage.covered * 2);
  const sourceScore = Math.min(16, evidence.sources.filter((source) => source.confidence !== "low").length * 4 + (hasSourcedRoster ? 4 : 0));
  const technicalScore = technicalCredibility.status === "positive" ? 12 : technicalCredibility.status === "watch" ? 5 : 0;
  const linkedInScore = Math.min(
    6,
    evidence.linkedInCandidates.filter((candidate) => candidate.status === "verified").length * 3 +
      evidence.linkedInCandidates.filter((candidate) => candidate.status === "likely_match").length
  );
  const trackRecordScore = Math.min(16, priorOutcomes.highQualityCount * 5 + Math.max(0, priorOutcomes.count - priorOutcomes.highQualityCount) * 2);
  const alignmentScore = capitalAllocation.hasInsiderAlignment ? 7 : 0;
  const capitalScore = capitalAllocation.hasCapitalAllocation ? 7 : 0;
  const gapPenalty = Math.min(16, evidence.gaps.length * 3 + (!hasSourcedRoster ? 6 : 0));
  const uncapped = 28 + rosterScore + sourceScore + technicalScore + linkedInScore + trackRecordScore + alignmentScore + capitalScore - gapPenalty;
  const cap = !hasSourcedRoster ? 55 : capitalAllocation.status === "gap" ? 78 : technicalCredibility.status === "gap" ? 72 : 95;
  return Math.min(cap, clamp(uncapped));
}

function managementEvidenceConfidence(evidence: ManagementEvidence): ScoreCategory["confidence"] {
  const hasSourcedRoster = hasIssuerOrFilingRosterEvidence(evidence);
  if (!hasSourcedRoster) return "low";
  const roleCoverage = managementRoleCoverage(evidence.people);
  const technicalCredibility = managementTechnicalCredibility(evidence);
  const priorOutcomes = managementPriorOutcomeStrength(evidence);
  const capitalAllocation = managementCapitalAllocationStrength(evidence);
  const positives = evidence.confidenceSignals.filter((signal) => signal.status === "positive").length;
  const verifiedProfiles = evidence.linkedInCandidates.filter((candidate) => candidate.status === "verified").length;
  if (
    evidence.people.length >= 4 &&
    roleCoverage.covered >= 3 &&
    technicalCredibility.status === "positive" &&
    priorOutcomes.status === "positive" &&
    capitalAllocation.status === "positive" &&
    positives >= 4 &&
    verifiedProfiles >= 1
  ) {
    return "high";
  }
  if (evidence.people.length >= 1 && roleCoverage.covered >= 1 && positives >= 1 && evidence.sources.length >= 1) return "medium";
  return "low";
}

function buildMarketSnapshot(company: CompanyCandidate): MarketSnapshot {
  return (
    company.marketSnapshot ?? {
      status: "not_sourced",
      sourceLabel: "Market data unavailable",
      sourceUrl: "https://finance.yahoo.com/",
      asOf: "Unavailable",
      dataNeeded: [
        "Yahoo/YFinance quote data for current price, day change, volume, and 52-week range",
        "Yahoo quoteSummary data for shares outstanding, float, analyst targets, and summary financials",
        "Current SEC/SEDAR filings to verify insider, strategic, or fully diluted ownership"
      ]
    }
  );
}

function isUnavailable(value: string | undefined) {
  return !value || /^(not yet sourced|not sourced|unavailable|unknown)$/i.test(value.trim());
}

function fallbackShareStructure(company: CompanyCandidate, marketSnapshot: MarketSnapshot): ShareStructure {
  if (company.shareStructure) {
    return {
      ...company.shareStructure,
      asOf: isUnavailable(company.shareStructure.asOf) ? marketSnapshot.asOf : company.shareStructure.asOf,
      sharesOutstanding: isUnavailable(company.shareStructure.sharesOutstanding)
        ? marketSnapshot.sharesOutstanding ?? company.shareStructure.sharesOutstanding
        : company.shareStructure.sharesOutstanding,
      publicFloat: isUnavailable(company.shareStructure.publicFloat) ? undefined : company.shareStructure.publicFloat,
      insiderOwnership: isUnavailable(company.shareStructure.insiderOwnership) ? undefined : company.shareStructure.insiderOwnership,
      institutionalOwnership: isUnavailable(company.shareStructure.institutionalOwnership)
        ? undefined
        : company.shareStructure.institutionalOwnership,
      strategicOwnership: isUnavailable(company.shareStructure.strategicOwnership) ? undefined : company.shareStructure.strategicOwnership,
      sourceUrl: company.shareStructure.sourceUrl ?? marketSnapshot.sourceUrl
    };
  }

  return (
    {
      asOf: marketSnapshot.status === "sourced" ? marketSnapshot.asOf : "Unavailable",
      sharesOutstanding: marketSnapshot.sharesOutstanding,
      publicFloat: undefined,
      insiderOwnership: undefined,
      institutionalOwnership: undefined,
      strategicOwnership: undefined,
      floatQuality:
        marketSnapshot.status === "sourced"
          ? "Shares outstanding can be populated from market data, but float, insider, strategic, warrant, option, and fully diluted figures still need ownership-specific sourcing."
          : "Unknown until current share count, insider ownership, strategic holders, warrants, options, and recent financing terms are ingested.",
      notes: [
        "Use Yahoo Finance market data where available, then reconcile with filings before relying on ownership figures.",
        "Confirm basic shares outstanding, fully diluted shares, warrants, options, and restricted shares.",
        "Compare insider and strategic ownership against recent financings to judge alignment.",
        "Watch for cheap warrant overhang that could cap upside during strong news cycles."
      ],
      sourceUrl: marketSnapshot.sourceUrl ?? (company.country === "US" ? "https://www.sec.gov/search-filings/edgar-application-programming-interfaces" : "https://www.sedarplus.ca/")
    }
  );
}

function buildRiskScenarios(company: CompanyCandidate, sources: SourceDocument[]): RiskScenario[] {
  const text = textFrom(sources);
  const financingRisk = hasAny(text, ["additional financing", "need additional financing", "expects to need", "no revenue"]);
  const explorationStage = /exploration/i.test(company.stage ?? company.description ?? "") || hasAny(text, ["exploration", "drilling"]);

  return [
    {
      id: "capital-dilution",
      title: "Capital and Dilution Scenario",
      probability: financingRisk ? "high" : "medium",
      impact: "high",
      timeframe: "3M to 18M",
      summary:
        "The company may need to raise capital before the market gives full credit for the project, which can dilute shareholders or slow the work program.",
      whatMustGoRight: [
        "Raise capital on terms that keep enough per-share exposure for existing holders.",
        "Use proceeds for value-adding drilling, studies, permitting, or land work.",
        "Show insider or strategic participation when possible."
      ],
      whereItCouldFallShort: [
        "Financing lands at a weak price with heavy warrant coverage.",
        "Cash runway shortens before meaningful technical results are released.",
        "Commodity sentiment weakens and closes the financing window."
      ]
    },
    {
      id: "exploration-technical",
      title: "Exploration and Technical Scenario",
      probability: explorationStage ? "high" : "medium",
      impact: "high",
      timeframe: "6M to 3Y",
      summary:
        "Project value depends on the company turning geological promise into repeatable, economic evidence that survives technical review.",
      whatMustGoRight: [
        "Drilling confirms continuity, scale, grade, and geometry.",
        "Metallurgy, infrastructure, and access support a credible development path.",
        "Technical disclosure becomes easier to compare against peer projects."
      ],
      whereItCouldFallShort: [
        "High-grade intervals fail to repeat or do not connect into a coherent deposit.",
        "Metallurgy, strip ratio, depth, water, power, or access issues weaken economics.",
        "The project requires more drilling capital than the market is willing to fund."
      ]
    },
    {
      id: "permitting-jurisdiction",
      title: "Permitting and Jurisdiction Scenario",
      probability: "medium",
      impact: "medium",
      timeframe: "1Y to 5Y",
      summary:
        "Even strong projects can lose time and value if permits, land access, community relations, or environmental review become harder than expected.",
      whatMustGoRight: [
        `Maintain clear progress in ${company.jurisdiction ?? company.country}.`,
        "Resolve land, environmental, and community questions before they become financing blockers.",
        "Keep permitting milestones visible and dated."
      ],
      whereItCouldFallShort: [
        "Permits or consultations take longer than the market expects.",
        "Environmental concerns force redesign, added studies, or higher costs.",
        "Jurisdiction headlines change the discount rate investors apply to the asset."
      ]
    },
    {
      id: "market-cycle",
      title: "Commodity and Market-Cycle Scenario",
      probability: "medium",
      impact: "medium",
      timeframe: "3M to 5Y",
      summary:
        `${company.commodityFocus.join(", ")} exposure can help if the cycle strengthens, but the same exposure can reduce financing access and valuation if sentiment turns.`,
      whatMustGoRight: [
        "Commodity prices and sector capital flows stay supportive through key company milestones.",
        "The company releases evidence strong enough to stand out from peers.",
        "Management keeps spending aligned with the market window."
      ],
      whereItCouldFallShort: [
        "Sector multiples compress before major catalysts arrive.",
        "Strong technical work is ignored because risk appetite is weak.",
        "Peer discoveries or financings reset investor expectations."
      ]
    }
  ];
}

function buildNews(sources: SourceDocument[]): NewsItem[] {
  return sources
    .filter((source) => source.sourceType === "news")
    .map((source) => {
      const text = source.excerpts.join(" ");
      const impact = /drill|result|discovery|technical/i.test(text) ? "watch" : "neutral";
      return {
        id: source.id,
        title: source.title,
        publisher: source.publisher,
        url: source.url,
        publishedAt: source.retrievedAt,
        summary:
          text ||
          "News source captured by the app, but no excerpt was available. Review the linked article before relying on the headline.",
        impact,
        citationIds: [source.id]
      };
    });
}

function buildRedFlags(sources: SourceDocument[]): RedFlag[] {
  const text = textFrom(sources);
  const citations = sourceIds(sources);
  const flags: RedFlag[] = [];

  if (hasAny(text, ["no revenue", "no revenue from mining operations"])) {
    flags.push({
      id: "no-operating-revenue",
      title: "No operating revenue",
      severity: "high",
      detail: "The company appears exploration-stage and does not yet generate mining operating revenue.",
      citationIds: citations
    });
  }
  if (hasAny(text, ["additional financing", "need additional financing", "expects to need"])) {
    flags.push({
      id: "future-financing",
      title: "Future financing and dilution risk",
      severity: "high",
      detail: "Sources indicate future financing needs, which can dilute holders or constrain the project timeline.",
      citationIds: citations
    });
  }
  if (sources.length === 0) {
    flags.push({
      id: "insufficient-evidence",
      title: "Insufficient cited evidence",
      severity: "medium",
      detail: "The app could not retrieve source documents for this run, so conclusions should remain provisional.",
      citationIds: []
    });
  }

  return flags;
}

function buildMemo(company: CompanyCandidate, sources: SourceDocument[], scorecard: Scorecard, redFlags: RedFlag[]): ResearchRun["memo"] {
  const supported = sources.length > 0;
  const projectSource = sources.filter((source) => source.excerpts.some((excerpt) => /project|exploration|deposit|drilling/i.test(excerpt)));
  const financingSource = sources.filter((source) => source.excerpts.some((excerpt) => /financing|revenue|dilut/i.test(excerpt)));
  const catalystSource = sources.filter((source) => source.excerpts.some((excerpt) => /catalyst|drilling results|technical work|permit/i.test(excerpt)));
  const blockerCount = scorecard.evidenceAudit.missingCriticalCount + redFlags.length;
  const managementCategory = scorecard.categories.find((category) => category.key === "management");
  const assetCategory = scorecard.categories.find((category) => category.key === "asset_quality");
  const catalystCategory = scorecard.categories.find((category) => category.key === "catalysts");
  const evidenceCategory = scorecard.categories.find((category) => category.key === "evidence_confidence");
  const supportDrivers = [
    assetCategory?.positiveDrivers[0],
    managementCategory?.positiveDrivers[0],
    catalystCategory?.positiveDrivers[0],
    company.projects?.length ? `Project focus: ${company.projects.join(", ")}.` : undefined,
    company.jurisdiction ? `Jurisdiction marker: ${company.jurisdiction}.` : undefined
  ].filter((driver): driver is string => Boolean(driver));
  const blockerDrivers = [
    ...scorecard.evidenceAudit.requirements
      .filter((requirement) => requirement.status === "missing")
      .slice(0, 3)
      .map((requirement) => `${requirement.label}: ${requirement.whyItMatters}`),
    ...redFlags.slice(0, 2).map((flag) => flag.title)
  ];

  const sections: MemoSection[] = [
    section(
      "current_read",
      "Current Read",
      `${company.name} currently screens at ${scorecard.overall}/100 feasibility with ${scorecard.confidence} evidence confidence. The brief should be treated as a research guide: ${blockerCount} major blocker${blockerCount === 1 ? "" : "s"} still need review before conviction can move materially higher.`,
      sources
    ),
    section(
      "support",
      "Thesis Support",
      supportDrivers.length
        ? supportDrivers.join(" ")
        : "The current run has limited positive evidence. Add project disclosure, management biographies, market data, and technical reports before relying on a positive thesis.",
      projectSource.length ? projectSource : sources,
      projectSource.length || supported ? "supported" : "unknown"
    ),
    section(
      "blockers",
      "Conviction Blockers",
      blockerDrivers.length
        ? blockerDrivers.join(" ")
        : "No major blocker was detected from the current source set, but unsupported technical, financial, and ownership fields should still be reviewed.",
      sources,
      supported ? "inferred" : "unknown"
    ),
    section(
      "capital",
      "Capital and Dilution Watch",
      "Focus on cash balance, burn rate, runway, shares outstanding, fully diluted shares, warrants, options, insider ownership, and recent financing terms. These items determine whether project upside can translate into per-share upside.",
      financingSource.length ? financingSource : sources,
      financingSource.length ? "supported" : supported ? "inferred" : "unknown"
    ),
    section(
      "catalysts",
      "Catalyst Path",
      "Near-term changes to the rating will likely come from drilling results, technical reports, permitting milestones, financing terms, or other company news that improves or weakens the evidence base.",
      catalystSource,
      catalystSource.length ? "supported" : "unknown"
    ),
    section(
      "questions",
      "Next Research Questions",
      "Verify the latest technical report, cash runway, fully diluted share count, insider ownership, management track record, recent financing terms, and dated catalyst calendar before raising conviction.",
      sources,
      supported ? "inferred" : "unknown"
    ),
    section(
      "source_quality",
      "Source Quality",
      evidenceCategory?.rationale ?? `${sources.length} source document${sources.length === 1 ? "" : "s"} available for this run.`,
      sources,
      supported ? "supported" : "unknown"
    )
  ];

  return {
    title: company.name,
    sections
  };
}

export function createResearchRun(
  company: CompanyCandidate,
  sources: SourceDocument[],
  query: string,
  evidence: { facts?: EvidenceFact[]; status?: EvidenceCollectionStatus } = {}
): ResearchRun {
  const createdAt = nowIso();
  const evidenceFacts = evidence.facts ?? [];
  const scorecard = buildScorecard(company, sources, evidenceFacts);
  const redFlags = buildRedFlags(sources);
  const memo = buildMemo(company, sources, scorecard, redFlags);
  const catalysts = memo.sections.filter((section) => section.id === "catalysts");
  const news = buildNews(sources);
  const marketSnapshot = buildMarketSnapshot(company);
  const managementEvidence = buildManagementEvidence(company, sources, evidenceFacts);

  return {
    id: `${company.id}-${slug(query)}-${Date.now()}-${++runSequence}`,
    query,
    company,
    createdAt,
    refreshedAt: createdAt,
    sources,
    evidenceFacts,
    evidenceStatus: evidence.status ?? defaultEvidenceStatus(),
    scorecard,
    investorLenses: buildInvestorLenses(company, sources),
    analystForecast: buildAnalystForecast(company),
    marketSnapshot,
    news,
    management: managementEvidence.people,
    managementEvidence,
    financialSnapshot: buildFinancialSnapshot(company),
    shareStructure: fallbackShareStructure(company, marketSnapshot),
    riskScenarios: buildRiskScenarios(company, sources),
    redFlags,
    catalysts,
    memo
  };
}
