import { createResearchRun } from "../src/domain/researchEngine";
import type {
  AdapterStatus,
  CompanyCandidate,
  EvidenceCollectionStatus,
  EvidenceFact,
  EvidenceFactCategory,
  ResearchRun,
  RiskScenario,
  SourceDocument
} from "../src/domain/types";

export const DEMO_NOTICE = "Demo data — fictional and not investment research";
const DEMO_TIME = "2026-09-15T12:00:00.000Z";

export const DEMO_COMPANY: CompanyCandidate = {
  id: "aeon-ridge-minerals-demo",
  name: "Aeon Ridge Minerals Ltd.",
  ticker: "AEON.V",
  exchange: "TSXV",
  country: "CA",
  commodityFocus: ["Gold", "Copper"],
  aliases: ["Aeon Ridge", "AEON"],
  websiteUrl: "https://aeon-ridge.example.invalid/",
  description: "Fictional exploration company evaluating the Northstar gold-copper project in northern Canada.",
  projects: ["Northstar gold-copper project"],
  jurisdiction: "Fictional northern Canadian jurisdiction",
  stage: "Exploration",
  marketSnapshot: {
    status: "sourced",
    price: "$1.24",
    currency: "CAD",
    changePercent: "+2.48%",
    marketCap: "$99.2M",
    volume: "186,400",
    averageVolume: "142,000",
    fiftyTwoWeekHigh: "$1.68",
    fiftyTwoWeekLow: "$0.72",
    sharesOutstanding: "80.0M",
    sourceLabel: "Fictional demo market feed",
    sourceUrl: "https://market-data.example.invalid/aeon-v",
    asOf: "2026-09-15 12:00 UTC",
    dataNeeded: []
  },
  analystForecast: {
    status: "sourced",
    consensusLabel: "Fictional demonstration consensus",
    priceTarget: "$1.65",
    upsideDownside: "+33.1%",
    timeHorizon: "12 months",
    summary: "Two fictional analysts model a higher valuation if the planned drill and metallurgy milestones are completed.",
    sourceUrl: "https://research.example.invalid/aeon-ridge-consensus",
    sourceLabel: "Fictional demo analyst coverage",
    dataNeeded: []
  },
  financialSnapshot: {
    status: "sourced",
    revenue: "$0",
    grossProfit: "$0",
    ebitda: "-$7.4M",
    netIncome: "-$7.8M",
    operatingExpense: "$8.0M",
    totalCash: "$18.4M",
    totalDebt: "$0",
    enterpriseValue: "$80.8M",
    freeCashflow: "-$11.2M",
    operatingCashflow: "-$7.6M",
    profitMargin: "Not meaningful (pre-revenue)",
    sourceLabel: "Fictional demo financial statements",
    sourceUrl: "https://filings.example.invalid/aeon-ridge-q2-2026",
    asOf: "2026-06-30",
    dataNeeded: []
  },
  shareStructure: {
    asOf: "2026-09-15",
    sharesOutstanding: "80.0M",
    publicFloat: "53.6M (67%)",
    insiderOwnership: "6.4M (8%)",
    institutionalOwnership: "8.0M (10%)",
    strategicOwnership: "12.0M (15%)",
    floatQuality: "Fictional ownership categories reconcile to 80.0M basic shares outstanding.",
    notes: [
      "Fully diluted count is 90.0M: 80.0M basic shares, 7.0M warrants, and 3.0M options.",
      "The latest fictional financing issued 10.0M shares at $1.00 with half-warrant coverage at $1.50."
    ],
    sourceUrl: "https://filings.example.invalid/aeon-ridge-capital-structure"
  },
  management: [
    {
      name: "Mira Calder",
      role: "Chief Executive Officer",
      bio: "Fictional mining executive with 18 years of exploration, financing, and public-company leadership experience.",
      experience: ["Led two fictional resource-stage exploration programs", "Completed fictional financings totaling $70M"],
      group: "executive",
      sourceUrl: "https://aeon-ridge.example.invalid/team/mira-calder"
    },
    {
      name: "Jonah Vale",
      role: "Vice President, Exploration",
      bio: "Fictional professional geologist with 16 years of porphyry and intrusion-related gold exploration experience.",
      experience: ["Directed fictional discovery drilling", "Managed fictional resource definition programs"],
      group: "technical",
      sourceUrl: "https://aeon-ridge.example.invalid/team/jonah-vale"
    },
    {
      name: "Priya North",
      role: "Chief Financial Officer",
      bio: "Fictional finance executive with 14 years of mining reporting, treasury, and capital-markets experience.",
      experience: ["Managed fictional exploration budgets", "Oversaw fictional public-company reporting"],
      group: "executive",
      sourceUrl: "https://aeon-ridge.example.invalid/team/priya-north"
    }
  ]
};

const DEMO_SOURCES: SourceDocument[] = [
  {
    id: "demo-northstar-technical-report",
    title: "Northstar fictional technical report",
    sourceType: "filing",
    publisher: "Aeon Ridge fictional disclosure",
    url: "https://filings.example.invalid/aeon-ridge-technical-report",
    retrievedAt: DEMO_TIME,
    excerpts: [
      "The fictional technical report describes an inferred mineral resource of 18.0 million tonnes grading 1.20 g/t gold and 0.24% copper at the Northstar project.",
      "Fictional metallurgical tests returned 91% gold recovery and 82% copper recovery.",
      "The fictional project is 45 kilometres from an all-season road and a planned grid-power connection.",
      "Fictional environmental baseline work is complete and the exploration permit remains valid through 2028."
    ]
  },
  {
    id: "demo-aeon-financials",
    title: "Aeon Ridge fictional quarterly financial statements",
    sourceType: "filing",
    publisher: "Aeon Ridge fictional disclosure",
    url: "https://filings.example.invalid/aeon-ridge-q2-2026",
    retrievedAt: DEMO_TIME,
    excerpts: [
      "At June 30, 2026, the fictional cash balance was $18.4M, debt was nil, annual operating expense was $8.0M, and the planned $12.0M work program provided approximately 18 months of runway.",
      "The fictional capital structure comprised 80.0M basic shares and 90.0M fully diluted shares, including 7.0M warrants and 3.0M options.",
      "Fictional insider ownership was 8%, and a recent $10.0M financing issued shares at $1.00 with half-warrant coverage at $1.50."
    ]
  },
  {
    id: "demo-aeon-market",
    title: "AEON.V fictional market snapshot",
    sourceType: "market_data",
    publisher: "Fictional demo market feed",
    url: "https://market-data.example.invalid/aeon-v",
    retrievedAt: DEMO_TIME,
    excerpts: ["AEON.V closed at a fictional $1.24 CAD with 80.0M shares outstanding and a $99.2M market capitalization."]
  },
  ...DEMO_COMPANY.management!.map((person, index): SourceDocument => ({
    id: `demo-management-${index + 1}`,
    title: `${person.name} - ${person.role}`,
    sourceType: "manual",
    publisher: "Issuer team page",
    url: person.sourceUrl!,
    retrievedAt: DEMO_TIME,
    excerpts: [`${person.name} ${person.role}`, `${person.bio} ${person.experience.join(". ")}.`],
    managementGroup: person.group
  })),
  {
    id: "demo-news-drilling",
    title: "Aeon Ridge reports fictional Northstar drill results",
    sourceType: "news",
    publisher: "Aeon Ridge fictional newsroom",
    url: "https://news.example.invalid/aeon-ridge-northstar-results",
    retrievedAt: "2026-09-10T12:00:00.000Z",
    excerpts: ["Fictional drill results extended mineralization by 120 metres, with follow-up drilling planned for the fourth quarter of 2026."]
  },
  {
    id: "demo-news-metallurgy",
    title: "Aeon Ridge completes fictional metallurgy program",
    sourceType: "news",
    publisher: "Aeon Ridge fictional newsroom",
    url: "https://news.example.invalid/aeon-ridge-metallurgy",
    retrievedAt: "2026-08-28T12:00:00.000Z",
    excerpts: ["Fictional metallurgy results reported 91% gold recovery and 82% copper recovery, supporting the next technical study."]
  }
];

const factDefinitions: Array<[EvidenceFactCategory, string, string]> = [
  ["technical_report", "Technical report / project disclosure", DEMO_SOURCES[0].excerpts[0]],
  ["drill_results", "Drill results", DEMO_SOURCES.at(-2)!.excerpts[0]],
  ["resource_estimate", "Resource estimate", DEMO_SOURCES[0].excerpts[0]],
  ["metallurgy", "Metallurgy", DEMO_SOURCES[0].excerpts[1]],
  ["infrastructure", "Infrastructure", DEMO_SOURCES[0].excerpts[2]],
  ["permitting", "Permitting", DEMO_SOURCES[0].excerpts[3]],
  ["cash_balance", "Cash balance", DEMO_SOURCES[1].excerpts[0]],
  ["burn_rate", "Burn rate", DEMO_SOURCES[1].excerpts[0]],
  ["cash_runway", "Cash runway", DEMO_SOURCES[1].excerpts[0]],
  ["basic_shares", "Basic shares", DEMO_SOURCES[1].excerpts[1]],
  ["fully_diluted_shares", "Fully diluted shares", DEMO_SOURCES[1].excerpts[1]],
  ["warrants_options", "Warrants and options", DEMO_SOURCES[1].excerpts[1]],
  ["recent_financing", "Recent financing", DEMO_SOURCES[1].excerpts[2]],
  ["insider_ownership", "Insider ownership", DEMO_SOURCES[1].excerpts[2]],
  ["management_biography", "Management biography", DEMO_SOURCES[3].excerpts[1]],
  ["prior_outcomes", "Prior outcomes", DEMO_SOURCES[3].excerpts[1]],
  ["capital_allocation", "Capital allocation history", DEMO_SOURCES[5].excerpts[1]]
];

const DEMO_FACTS: EvidenceFact[] = factDefinitions.map(([category, label, excerpt]) => {
  const source = category.startsWith("management") || category === "prior_outcomes" || category === "capital_allocation"
    ? DEMO_SOURCES.find((candidate) => candidate.excerpts.includes(excerpt))!
    : category === "drill_results"
      ? DEMO_SOURCES.at(-2)!
      : ["technical_report", "resource_estimate", "metallurgy", "infrastructure", "permitting"].includes(category)
        ? DEMO_SOURCES[0]
        : DEMO_SOURCES[1];
  return {
    id: `demo-fact-${category}`,
    category,
    label,
    value: excerpt,
    sourceId: source.id,
    sourceUrl: source.url,
    sourceTitle: source.title,
    excerpt,
    confidence: "high",
    retrievedAt: DEMO_TIME
  };
});

const DEMO_ADAPTERS: AdapterStatus[] = [
  {
    id: "offline-demo-fixture",
    name: "Offline fictional demo fixture",
    status: "configured",
    note: DEMO_NOTICE,
    contributes: ["deterministic interface demonstration"],
    missing: []
  }
];

const DEMO_STATUS: EvidenceCollectionStatus = {
  mode: "automated",
  summary: `17 of 17 fictional evidence categories are populated for interface demonstration. ${DEMO_NOTICE}.`,
  adapters: DEMO_ADAPTERS,
  categories: factDefinitions.map(([id, label]) => ({ id, label, status: "found", factCount: 1 })),
  gaps: [],
  updatedAt: DEMO_TIME
};

const DEMO_RISKS: RiskScenario[] = [
  {
    id: "demo-resource-continuity",
    title: "Fictional Resource Continuity Scenario",
    probability: "medium",
    impact: "high",
    timeframe: "6M to 2Y",
    summary: "The fictional valuation depends on follow-up drilling confirming grade and continuity beyond the current resource envelope.",
    whatMustGoRight: ["Planned holes extend continuous mineralization", "Updated modelling preserves grade and geometry"],
    whereItCouldFallShort: ["Step-out drilling misses the target", "Additional tonnes arrive at materially lower grade"]
  },
  {
    id: "demo-financing",
    title: "Fictional Financing Scenario",
    probability: "medium",
    impact: "medium",
    timeframe: "12M to 24M",
    summary: "The fictional 18-month runway must carry the project through the next drill and study milestones before another financing.",
    whatMustGoRight: ["Spending remains within the $12.0M work program", "Milestones support stronger financing terms"],
    whereItCouldFallShort: ["Program costs exceed budget", "Weak markets force financing below the prior $1.00 issue price"]
  }
];

export type DemoResearchRun = ResearchRun & { demoNotice: string; adapters: AdapterStatus[] };

export function createDemoResearchRun(): DemoResearchRun {
  const run = createResearchRun(DEMO_COMPANY, DEMO_SOURCES, DEMO_COMPANY.ticker, {
    facts: DEMO_FACTS,
    status: DEMO_STATUS
  });
  return {
    ...run,
    id: "demo-aeon-ridge-2026-09-15",
    query: DEMO_COMPANY.ticker,
    createdAt: DEMO_TIME,
    refreshedAt: DEMO_TIME,
    managementEvidence: {
      ...run.managementEvidence,
      linkedInCandidates: run.managementEvidence.linkedInCandidates.map((candidate) => ({
        ...candidate,
        retrievedAt: DEMO_TIME
      }))
    },
    riskScenarios: DEMO_RISKS,
    demoNotice: DEMO_NOTICE,
    adapters: DEMO_ADAPTERS
  };
}

export function searchDemoCompanies(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [DEMO_COMPANY];
  const searchable = [DEMO_COMPANY.name, DEMO_COMPANY.ticker, ...(DEMO_COMPANY.aliases ?? [])].join(" ").toLowerCase();
  return searchable.includes(normalized) ? [DEMO_COMPANY] : [];
}

export function resolveDemoCompany(query: string) {
  return searchDemoCompanies(query)[0];
}
