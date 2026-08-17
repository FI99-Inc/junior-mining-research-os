import { describe, expect, it } from "vitest";
import { createResearchRun } from "../src/domain/researchEngine";
import { collectSources } from "../src/domain/sourceAdapters";
import type { CompanyCandidate, EvidenceFact, SourceDocument } from "../src/domain/types";

const candidate: CompanyCandidate = {
  id: "us-gold-mining",
  name: "US GoldMining Inc.",
  ticker: "USGO",
  exchange: "NASDAQ",
  country: "US",
  commodityFocus: ["Gold", "Copper"],
  websiteUrl: "https://www.usgoldmining.us/",
  description: "Exploration-stage gold-copper company advancing the Whistler project in Alaska.",
  projects: ["Whistler gold-copper project"],
  jurisdiction: "Alaska, United States"
};

const sources: SourceDocument[] = [
  {
    id: "sec-10k-2025",
    title: "2025 Form 10-K",
    sourceType: "filing",
    publisher: "SEC EDGAR",
    url: "https://www.sec.gov/example",
    retrievedAt: "2026-06-29T12:00:00.000Z",
    excerpts: [
      "The company is an exploration-stage issuer focused on the Whistler gold-copper project in Alaska.",
      "The company reported no revenue from mining operations and expects to need additional financing."
    ]
  },
  {
    id: "company-presentation",
    title: "Corporate Presentation",
    sourceType: "presentation",
    publisher: "Company",
    url: "https://example.com/presentation.pdf",
    retrievedAt: "2026-06-29T12:00:00.000Z",
    excerpts: [
      "Management highlights district-scale exploration potential and proximity to existing infrastructure.",
      "Upcoming catalysts include drilling results and updated technical work."
    ]
  },
  {
    id: "drill-news",
    title: "Drill results exploration update",
    sourceType: "news",
    publisher: "Company news",
    url: "https://example.com/news",
    retrievedAt: "2026-06-29T12:00:00.000Z",
    excerpts: ["The company published drilling results and technical work for the Whistler project."]
  }
];

const richConfidenceSources: SourceDocument[] = [
  ...sources,
  {
    id: "technical-report-2026",
    title: "NI 43-101 technical report",
    sourceType: "presentation",
    publisher: "Company technical disclosure",
    url: "https://example.com/technical-report",
    retrievedAt: "2026-06-29T12:00:00.000Z",
    excerpts: [
      "The technical report includes a mineral resource estimate, metallurgy discussion, infrastructure review, and project disclosure for the Whistler gold-copper project.",
      "The resource estimate and technical report describe mineral resource scale, grade continuity, and metallurgical recovery assumptions."
    ]
  },
  {
    id: "capital-structure-2026",
    title: "Share structure and runway update",
    sourceType: "filing",
    publisher: "SEC EDGAR",
    url: "https://www.sec.gov/example-capital",
    retrievedAt: "2026-06-29T12:00:00.000Z",
    excerpts: [
      "The company disclosed shares outstanding, fully diluted shares, warrants, options, insider ownership, working capital, cash balance, burn rate, and months of runway.",
      "Management biography disclosure describes prior discoveries, public-company financings, insider ownership, and capital allocation history."
    ]
  },
  {
    id: "permitting-update-2026",
    title: "Permitting and land tenure update",
    sourceType: "news",
    publisher: "Company news",
    url: "https://example.com/permitting",
    retrievedAt: "2026-06-29T12:00:00.000Z",
    excerpts: [
      "The company provided permitting timeline, land tenure, environmental baseline, infrastructure access, and community engagement updates.",
      "The update includes a dated catalyst calendar for drilling, permitting, and technical studies."
    ]
  }
];

const sourcedMarketSnapshot = {
  status: "sourced" as const,
  price: "$8.00",
  currency: "USD",
  changePercent: "-1.2%",
  marketCap: "$108.0M",
  volume: "41,000",
  averageVolume: "60,000",
  fiftyTwoWeekHigh: "$18.00",
  fiftyTwoWeekLow: "$7.40",
  sharesOutstanding: "13.4M",
  sourceLabel: "Yahoo Finance via YFinance",
  sourceUrl: "https://finance.yahoo.com/",
  asOf: "2026-06-30",
  dataNeeded: []
};

function confidenceAverage(run: ReturnType<typeof createResearchRun>) {
  const rank = { low: 1, medium: 2, high: 3 } as const;
  return run.scorecard.categories.reduce((sum, category) => sum + rank[category.confidence], 0) / run.scorecard.categories.length;
}

describe("createResearchRun", () => {
  it("generates a cited analyst memo with transparent scores and investor lenses", () => {
    const run = createResearchRun(candidate, sources, "USGO");

    expect(run.company.ticker).toBe("USGO");
    expect(run.company.websiteUrl).toContain("usgoldmining");
    expect(run.company.description).toContain("Whistler");
    expect(run.memo.title).toBe("US GoldMining Inc.");
    expect(run.memo.sections.map((section) => section.id)).toEqual([
      "current_read",
      "support",
      "blockers",
      "capital",
      "catalysts",
      "questions",
      "source_quality"
    ]);
    expect(run.memo.sections.map((section) => section.id)).not.toEqual(
      expect.arrayContaining(["company", "jurisdiction", "valuation", "risks"])
    );
    expect(run.memo.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "current_read", title: "Current Read" }),
        expect.objectContaining({ id: "support", title: "Thesis Support" }),
        expect.objectContaining({ id: "blockers", title: "Conviction Blockers" }),
        expect.objectContaining({ id: "capital", title: "Capital and Dilution Watch" }),
        expect.objectContaining({ id: "catalysts", title: "Catalyst Path" }),
        expect.objectContaining({ id: "questions", title: "Next Research Questions" }),
        expect.objectContaining({ id: "source_quality", title: "Source Quality" })
      ])
    );
    expect(run.memo.sections.every((section) => section.citationIds.length > 0)).toBe(true);
    expect(run.scorecard.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "asset_quality", drivers: expect.arrayContaining([expect.any(String)]) }),
        expect.objectContaining({ key: "capital_structure", drivers: expect.arrayContaining([expect.any(String)]) }),
        expect.objectContaining({ key: "evidence_confidence", drivers: expect.arrayContaining([expect.any(String)]) })
      ])
    );
    expect(run.scorecard.categories[0].positiveDrivers.length).toBeGreaterThan(0);
    expect(run.scorecard.categories[0].negativeDrivers.length).toBeGreaterThan(0);
    expect(run.scorecard.categories[0].improveActions).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(run.scorecard.categories[0].downgradeTriggers).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(run.scorecard.categories[0].dataNeeded).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(run.scorecard.methodology.version).toMatch(/^jmro-/);
    expect(run.scorecard.methodology.categoryWeights.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(run.scorecard.methodology.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("technical report"),
        expect.stringContaining("cash runway"),
        expect.stringContaining("fully diluted")
      ])
    );
    expect(run.scorecard.methodology.sourceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringContaining("NI 43-101") }),
        expect.objectContaining({ label: expect.stringContaining("S-K 1300") })
      ])
    );
    expect(run.scorecard.confidence).not.toBe("high");
    expect(run.scorecard.evidenceAudit.missingCriticalCount).toBeGreaterThan(0);
    expect(run.scorecard.evidenceAudit.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "technical-report", status: "missing" }),
        expect.objectContaining({ id: "share-structure", status: "missing" }),
        expect.objectContaining({ id: "market-data", status: "missing" })
      ])
    );
    expect(run.scorecard.timelineScores.map((item) => item.horizon)).toEqual(["3M", "6M", "1Y", "3Y", "5Y"]);
    expect(run.scorecard.timelineScores.find((item) => item.horizon === "3M")?.drivers).toEqual(
      expect.arrayContaining([expect.stringContaining("news")])
    );
    expect(run.scorecard.timelineScores.find((item) => item.horizon === "3Y")?.companyGoals).toEqual(
      expect.arrayContaining([expect.stringContaining("project")])
    );
    expect(run.marketSnapshot.status).toBe("not_sourced");
    expect(run.marketSnapshot.dataNeeded).toEqual(expect.arrayContaining([expect.stringContaining("FMP")]));
    expect(run.management).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          role: expect.any(String),
          experience: expect.arrayContaining([expect.any(String)]),
          linkedInStatus: expect.any(String),
          openQuestions: expect.arrayContaining([expect.any(String)])
        })
      ])
    );
    expect(run.managementEvidence.summary).toContain("management");
    expect(run.managementEvidence.confidenceSignals).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "roster-depth" })])
    );
    expect(run.riskScenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining("Capital") }),
        expect.objectContaining({ title: expect.stringContaining("Exploration") })
      ])
    );
    expect(run.shareStructure.floatQuality).toBeTruthy();
    expect(run.investorLenses.map((lens) => lens.name)).toEqual(["Rick Rule", "Eric Sprott", "Marin Katusa"]);
    expect(run.investorLenses[0].initials).toBe("RR");
    expect(run.investorLenses[0].portraitTone).toBeTruthy();
    expect(run.investorLenses[0].portraitUrl).toContain("rick-rule");
    expect(run.investorLenses.find((lens) => lens.name === "Eric Sprott")?.portraitUrl).toContain("eric-sprott");
    expect(run.investorLenses[0].approach).toContain("optionality");
    expect(run.investorLenses[0].metrics).toEqual(expect.arrayContaining([expect.stringContaining("Investment Quality")]));
    expect(run.investorLenses[0].background).toContain("resource");
    expect(run.investorLenses[0].checklist).toEqual(expect.arrayContaining([expect.stringContaining("management")]));
    expect(run.investorLenses[0].sourceLinks).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("ruleinvestmentmedia") })])
    );
    expect(run.investorLenses.find((lens) => lens.name === "Eric Sprott")?.checklist).toEqual(
      expect.arrayContaining([expect.stringContaining("insider")])
    );
    expect(run.investorLenses.find((lens) => lens.name === "Marin Katusa")?.checklist).toEqual(
      expect.arrayContaining([expect.stringContaining("macro")])
    );
    expect(run.investorLenses[0].disclaimer).toContain("synthesized analytical lens");
    expect(run.analystForecast.status).toBe("not_sourced");
    expect(run.analystForecast.consensusLabel).toBe("Forecast unavailable in current data");
    expect(run.analystForecast.summary).not.toContain("No sourced analyst forecast");
    expect(run.analystForecast.dataNeeded).toEqual(expect.arrayContaining([expect.stringContaining("price target")]));
    expect(run.financialSnapshot.status).toBe("not_available");
    expect(run.financialSnapshot.dataNeeded).toEqual(expect.arrayContaining([expect.stringContaining("cash")]));
    expect(run.news).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining("Drill"),
          summary: expect.stringContaining("drilling")
        })
      ])
    );
    expect(run.redFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining("No operating revenue") }),
        expect.objectContaining({ title: expect.stringContaining("Future financing") })
      ])
    );
  });

  it("marks unsupported material facts as unknown instead of inventing evidence", () => {
    const run = createResearchRun(candidate, [], "USGO");

    expect(run.memo.sections.some((section) => section.status === "unknown")).toBe(true);
    expect(run.scorecard.categories.find((item) => item.key === "evidence_confidence")?.score).toBeLessThan(40);
    expect(run.scorecard.confidence).toBe("low");
    expect(run.scorecard.evidenceAudit.missingCriticalCount).toBeGreaterThanOrEqual(4);
    expect(run.sources).toHaveLength(0);
  });

  it("marks LinkedIn-only management candidates as likely matches without exposing match details", () => {
    const run = createResearchRun(
      {
        ...candidate,
        management: [
          {
            name: "Tim Smith",
            role: "Chief Executive Officer",
            bio: "Mining executive profile requiring source corroboration.",
            experience: ["Exploration leadership"],
            linkedInUrl: "https://www.linkedin.com/in/timsmith"
          }
        ]
      },
      [],
      "USGO"
    );

    expect(run.management[0].linkedInStatus).toBe("likely_match");
    expect(run.managementEvidence.linkedInCandidates[0]).toEqual(
      expect.objectContaining({
        personName: "Tim Smith",
        status: "likely_match",
        url: "https://www.linkedin.com/in/timsmith",
        sourceIds: expect.arrayContaining([expect.any(String)]),
        retrievedAt: expect.any(String)
      })
    );
    expect(run.managementEvidence.linkedInCandidates[0]).not.toHaveProperty("matchScore");
    expect(run.managementEvidence.linkedInCandidates[0]).not.toHaveProperty("matchReasons");
    expect(run.managementEvidence.linkedInCandidates[0]).not.toHaveProperty("rationale");
    expect(run.scorecard.categories.find((item) => item.key === "management")?.confidence).toBe("low");
    expect(run.managementEvidence.gaps).not.toEqual(expect.arrayContaining([expect.stringContaining("strict-match LinkedIn")]));
  });

  it("marks missing LinkedIn candidates as needs review", () => {
    const run = createResearchRun(
      {
        ...candidate,
        management: [
          {
            name: "Project Lead",
            role: "Technical Advisor",
            bio: "Technical advisor profile requiring LinkedIn discovery.",
            experience: ["Project diligence"]
          }
        ]
      },
      [],
      "USGO"
    );

    expect(run.management[0].linkedInStatus).toBe("needs_review");
    expect(run.managementEvidence.linkedInCandidates[0]).toEqual(
      expect.objectContaining({
        personName: "Project Lead",
        status: "needs_review",
        url: undefined
      })
    );
  });

  it("uses issuer team page people when the registry has only a management placeholder", () => {
    const run = createResearchRun(
      candidate,
      [
        {
          id: "issuer-team-usgo-0-0-jane-doe",
          title: "Jane Doe - Vice President, Exploration",
          sourceType: "manual",
          publisher: "Issuer team page",
          url: "https://www.usgoldmining.us/company/management",
          retrievedAt: "2026-07-04T12:00:00.000Z",
          excerpts: [
            "Issuer website management biography: Jane Doe is listed as Vice President, Exploration.",
            "Issuer team group: technical.",
            "Issuer profile image: https://www.usgoldmining.us/jane.jpg.",
            "Jane Doe is a geologist with discovery, mine development, acquisition, and public-company financing experience."
          ]
        }
      ],
      "USGO"
    );

    expect(run.management).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Jane Doe",
          role: "Vice President, Exploration",
          group: "technical",
          sourceStatus: "issuer",
          sourceUrl: "https://www.usgoldmining.us/company/management",
          profileImageUrl: "https://www.usgoldmining.us/jane.jpg",
          linkedInStatus: "needs_review",
          bio: expect.stringContaining("public-company financing")
        })
      ])
    );
    expect(run.managementEvidence.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "issuer-team-usgo-0-0-jane-doe",
          title: expect.stringContaining("Jane Doe"),
          publisher: "Issuer team page"
        })
      ])
    );
    expect(run.scorecard.categories.find((item) => item.key === "management")?.confidence).toBe("medium");
  });

  it("merges issuer team evidence into existing registry people without duplicates", () => {
    const run = createResearchRun(
      {
        ...candidate,
        management: [
          {
            name: "Tim Smith",
            role: "Chief Executive Officer",
            bio: "Mining executive profile requiring issuer corroboration.",
            experience: ["Exploration leadership"],
            linkedInUrl: "https://www.linkedin.com/in/timsmith"
          }
        ]
      },
      [
        {
          id: "issuer-team-usgo-0-0-tim-smith",
          title: "Tim Smith - President and Chief Executive Officer",
          sourceType: "manual",
          publisher: "Issuer team page",
          url: "https://www.usgoldmining.us/company/management",
          retrievedAt: "2026-07-04T12:00:00.000Z",
          excerpts: [
            "Issuer website management biography: Tim Smith is listed as President and Chief Executive Officer.",
            "Issuer team group: executive.",
            "Issuer profile image: unavailable.",
            "Tim Smith has led mining exploration projects, public-company financings, and project development programs."
          ]
        }
      ],
      "USGO"
    );

    const timSmith = run.management.filter((person) => person.name === "Tim Smith");
    expect(timSmith).toHaveLength(1);
    expect(timSmith[0]).toEqual(
      expect.objectContaining({
        sourceStatus: "issuer",
        sourceUrl: "https://www.usgoldmining.us/company/management",
        linkedInStatus: "likely_match",
        bio: expect.stringContaining("public-company financings")
      })
    );
  });

  it("raises the management score only when role coverage, technical credibility, outcomes, capital allocation, and alignment are sourced", () => {
    const managementRichCompany: CompanyCandidate = {
      ...candidate,
      management: [
        {
          name: "Alex Builder",
          role: "Chief Executive Officer",
          bio: "Mine-building executive with more than 25 years of public-company leadership and project development experience.",
          experience: ["Built and financed mine development projects", "Led public-company transactions"],
          linkedInUrl: "https://www.linkedin.com/in/alexbuilder",
          linkedInStatus: "verified",
          sourceUrl: "https://example.com/team"
        },
        {
          name: "Casey Capital",
          role: "Chief Financial Officer",
          bio: "Finance executive with mining-sector financing, treasury, audit, and capital allocation experience.",
          experience: ["Led project financings and disciplined treasury management"],
          linkedInUrl: "https://www.linkedin.com/in/caseycapital",
          linkedInStatus: "verified",
          sourceUrl: "https://example.com/team"
        },
        {
          name: "Dana Geo",
          role: "Vice President, Exploration, P.Geo.",
          bio: "Exploration geologist and qualified person with more than 20 years of discovery and resource-definition experience.",
          experience: ["P.Geo. qualified person", "Led discovery and resource definition programs"],
          sourceUrl: "https://example.com/team"
        },
        {
          name: "Robin Governance",
          role: "Independent Director",
          bio: "Independent director with governance, prior acquisition, and mining capital-markets experience.",
          experience: ["Board governance", "Prior acquisition outcome"],
          sourceUrl: "https://example.com/team"
        }
      ]
    };
    const facts: EvidenceFact[] = [
      {
        id: "management-bio-fact",
        category: "management_biography",
        label: "Management biography",
        value: "Issuer and filing evidence identify executive, finance, technical, and board members.",
        sourceId: "proxy-management",
        sourceUrl: "https://example.com/proxy",
        sourceTitle: "Management information circular",
        excerpt: "Executive officers, directors, and technical leaders are described with role and biography detail.",
        confidence: "high",
        retrievedAt: "2026-07-05T12:00:00.000Z"
      },
      {
        id: "prior-outcome-fact",
        category: "prior_outcomes",
        label: "Prior outcomes",
        value: "Management biographies cite prior mine builds, acquisitions, financings, and resource definition outcomes.",
        sourceId: "proxy-management",
        sourceUrl: "https://example.com/proxy",
        sourceTitle: "Management information circular",
        excerpt: "Prior mine builds, acquisitions, public-company financings, and resource definition outcomes are disclosed.",
        confidence: "high",
        retrievedAt: "2026-07-05T12:00:00.000Z"
      },
      {
        id: "capital-allocation-fact",
        category: "capital_allocation",
        label: "Capital allocation",
        value: "Filing evidence describes recent financing terms and capital allocation discipline.",
        sourceId: "proxy-management",
        sourceUrl: "https://example.com/proxy",
        sourceTitle: "Management information circular",
        excerpt: "Recent financing terms, treasury management, and capital allocation history are disclosed.",
        confidence: "high",
        retrievedAt: "2026-07-05T12:00:00.000Z"
      },
      {
        id: "insider-ownership-fact",
        category: "insider_ownership",
        label: "Insider ownership",
        value: "Filing evidence discloses insider ownership and management beneficial ownership.",
        sourceId: "proxy-management",
        sourceUrl: "https://example.com/proxy",
        sourceTitle: "Management information circular",
        excerpt: "Security ownership of directors and executive officers is disclosed.",
        confidence: "high",
        retrievedAt: "2026-07-05T12:00:00.000Z"
      }
    ];
    const run = createResearchRun(
      managementRichCompany,
      [
        ...richConfidenceSources,
        {
          id: "proxy-management",
          title: "Management information circular",
          sourceType: "filing",
          publisher: "SEDAR+",
          url: "https://example.com/proxy",
          retrievedAt: "2026-07-05T12:00:00.000Z",
          excerpts: [
            "The circular lists executive officers, directors, beneficial ownership, insider ownership, prior mine builds, acquisitions, project financings, P.Geo. credentials, and capital allocation history."
          ]
        }
      ],
      "USGO",
      { facts }
    );

    const management = run.scorecard.categories.find((item) => item.key === "management");
    expect(management?.score).toBeGreaterThanOrEqual(80);
    expect(management?.confidence).toBe("high");
    expect(management?.drivers).toEqual(expect.arrayContaining([expect.stringContaining("Role coverage")]));
    expect(management?.drivers).toEqual(expect.arrayContaining([expect.stringContaining("Technical credibility")]));
    expect(run.managementEvidence.confidenceSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "role-coverage", status: "positive" }),
        expect.objectContaining({ id: "technical-credibility", status: "positive" }),
        expect.objectContaining({ id: "alignment-capital", status: "positive" })
      ])
    );
  });

  it("does not let LinkedIn-only profiles create a strong management score", () => {
    const run = createResearchRun(
      {
        ...candidate,
        management: [
          {
            name: "Alex Profile",
            role: "Chief Executive Officer",
            bio: "Mining executive profile requiring source corroboration.",
            experience: ["Public-company leadership"],
            linkedInUrl: "https://www.linkedin.com/in/alexprofile"
          },
          {
            name: "Casey Profile",
            role: "Chief Financial Officer",
            bio: "Finance profile requiring source corroboration.",
            experience: ["Mining finance"],
            linkedInUrl: "https://www.linkedin.com/in/caseyprofile"
          }
        ]
      },
      [],
      "USGO"
    );

    const management = run.scorecard.categories.find((item) => item.key === "management");
    expect(management?.score).toBeLessThanOrEqual(55);
    expect(management?.confidence).toBe("low");
    expect(run.managementEvidence.confidenceSignals.find((signal) => signal.id === "verified-profiles")?.status).toBe("watch");
    expect(run.managementEvidence.gaps).toEqual(expect.arrayContaining([expect.stringContaining("issuer, filing, or circular evidence")]));
  });

  it("describes source adapter contributions and missing data", () => {
    const collected = collectSources(candidate);

    expect(collected.adapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sec-edgar",
          contributes: expect.arrayContaining([expect.stringContaining("filing")]),
          missing: expect.arrayContaining([expect.any(String)])
        }),
        expect.objectContaining({
          id: "market-data",
          contributes: expect.arrayContaining([expect.stringContaining("market")]),
          missing: expect.arrayContaining([expect.stringContaining("analyst")])
        })
      ])
    );
  });

  it("uses sourced market snapshot fields for share-structure fallback", () => {
    const run = createResearchRun(
      {
        ...candidate,
        shareStructure: undefined,
        marketSnapshot: {
          status: "sourced",
          price: "$1.23",
          currency: "USD",
          marketCap: "$18.0M",
          volume: "125,000",
          fiftyTwoWeekHigh: "$2.40",
          fiftyTwoWeekLow: "$0.80",
          sharesOutstanding: "14.6M",
          sourceLabel: "FMP profile and shares-float",
          sourceUrl: "https://site.financialmodelingprep.com/developer/docs",
          asOf: "2026-06-30",
          dataNeeded: []
        }
      },
      sources,
      "USGO"
    );

    expect(run.marketSnapshot.status).toBe("sourced");
    expect(run.shareStructure.sharesOutstanding).toBe("14.6M");
    expect(run.shareStructure.floatQuality).toContain("market data");
  });

  it("uses Yahoo supplemental data for analyst forecasts, financials, and ownership fields", () => {
    const run = createResearchRun(
      {
        ...candidate,
        analystForecast: {
          status: "sourced",
          consensusLabel: "Buy consensus from 4 analysts",
          priceTarget: "$2.10",
          upsideDownside: "+44.8%",
          timeHorizon: "12 months",
          summary: "Yahoo Finance consensus data indicates a positive target spread.",
          sourceUrl: "https://finance.yahoo.com/quote/USGO/analysis",
          sourceLabel: "Yahoo Finance analyst summary",
          dataNeeded: ["Confirm provider timestamp and analyst roster."]
        },
        financialSnapshot: {
          status: "sourced",
          revenue: "$0",
          ebitda: "-$8.4M",
          netIncome: "-$7.9M",
          totalCash: "$11.2M",
          totalDebt: "$900.0K",
          freeCashflow: "-$6.3M",
          sourceLabel: "Yahoo Finance financial summary",
          sourceUrl: "https://finance.yahoo.com/quote/USGO/financials",
          asOf: "2026-06-30",
          dataNeeded: ["Reconcile with latest MD&A."]
        },
        shareStructure: {
          asOf: "2026-06-30",
          sharesOutstanding: "14.4M",
          publicFloat: "9.1M",
          insiderOwnership: "18.5%",
          institutionalOwnership: "7.2%",
          strategicOwnership: "Unavailable",
          floatQuality: "Yahoo provides public float and holder percentages; fully diluted ownership still needs filings.",
          notes: ["Reconcile Yahoo holder data with filings and issuer documents."],
          sourceUrl: "https://finance.yahoo.com/quote/USGO/holders"
        }
      },
      sources,
      "USGO"
    );

    expect(run.analystForecast.status).toBe("sourced");
    expect(run.analystForecast.priceTarget).toBe("$2.10");
    expect(run.financialSnapshot.status).toBe("sourced");
    expect(run.financialSnapshot.ebitda).toBe("-$8.4M");
    expect(run.shareStructure.publicFloat).toBe("9.1M");
    expect(run.shareStructure.insiderOwnership).toBe("18.5%");
  });

  it("uses sourced Yahoo market data to sharpen feasibility scores and evidence confidence", () => {
    const baseline = createResearchRun(candidate, sources, "USGO");
    const run = createResearchRun(
      {
        ...candidate,
        marketSnapshot: {
          status: "sourced",
          price: "$8.00",
          currency: "USD",
          changePercent: "-1.2%",
          marketCap: "$108.0M",
          volume: "41,000",
          averageVolume: "60,000",
          fiftyTwoWeekHigh: "$18.00",
          fiftyTwoWeekLow: "$7.40",
          sharesOutstanding: "13.4M",
          sourceLabel: "Yahoo Finance via YFinance",
          sourceUrl: "https://finance.yahoo.com/",
          asOf: "2026-06-30",
          dataNeeded: []
        }
      },
      sources,
      "USGO"
    );

    const valuation = run.scorecard.categories.find((item) => item.key === "valuation_optionality");
    const capital = run.scorecard.categories.find((item) => item.key === "capital_structure");
    const evidence = run.scorecard.categories.find((item) => item.key === "evidence_confidence");

    expect(run.scorecard.overall).toBeGreaterThanOrEqual(baseline.scorecard.overall);
    expect(run.scorecard.evidenceAudit.requirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "market-data", status: "available" })])
    );
    expect(valuation?.confidence).toBe("medium");
    expect(valuation?.drivers).toEqual(expect.arrayContaining([expect.stringContaining("market cap")]));
    expect(capital?.drivers).toEqual(expect.arrayContaining([expect.stringContaining("shares outstanding")]));
    expect(evidence?.positiveDrivers).toEqual(expect.arrayContaining([expect.stringContaining("Yahoo Finance")]));
    expect(run.scorecard.timelineScores.find((item) => item.horizon === "3M")?.drivers).toEqual(
      expect.arrayContaining([expect.stringContaining("52-week")])
    );
  });

  it("penalizes thin liquidity and stretched share counts without inferring ownership", () => {
    const run = createResearchRun(
      {
        ...candidate,
        marketSnapshot: {
          status: "sourced",
          price: "$1.00",
          currency: "USD",
          marketCap: "$12.0M",
          volume: "1,000",
          averageVolume: "100,000",
          fiftyTwoWeekHigh: "$10.00",
          fiftyTwoWeekLow: "$0.90",
          sharesOutstanding: "650.0M",
          sourceLabel: "Yahoo Finance via YFinance",
          sourceUrl: "https://finance.yahoo.com/",
          asOf: "2026-06-30",
          dataNeeded: []
        }
      },
      sources,
      "USGO"
    );

    const capital = run.scorecard.categories.find((item) => item.key === "capital_structure");
    const catalysts = run.scorecard.categories.find((item) => item.key === "catalysts");

    expect(capital?.negativeDrivers).toEqual(expect.arrayContaining([expect.stringContaining("share count")]));
    expect(catalysts?.negativeDrivers).toEqual(expect.arrayContaining([expect.stringContaining("thin liquidity")]));
    expect(run.shareStructure.insiderOwnership).toBeUndefined();
    expect(run.shareStructure.strategicOwnership).toBeUndefined();
  });

  it("raises average category confidence to medium only when core evidence coverage is present", () => {
    const run = createResearchRun(
      {
        ...candidate,
        marketSnapshot: sourcedMarketSnapshot
      },
      richConfidenceSources,
      "USGO"
    );

    expect(confidenceAverage(run)).toBeGreaterThanOrEqual(2);
    expect(run.scorecard.confidence).not.toBe("low");
    expect(run.scorecard.evidenceAudit.missingCriticalCount).toBe(0);
    expect(run.scorecard.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "asset_quality", confidence: "high" }),
        expect.objectContaining({ key: "management", confidence: "medium" }),
        expect.objectContaining({ key: "capital_structure", confidence: "high" }),
        expect.objectContaining({ key: "evidence_confidence", confidence: "high" })
      ])
    );
    expect(run.scorecard.timelineScores.find((item) => item.horizon === "3Y")?.confidence).toBe("medium");
    expect(run.scorecard.timelineScores.find((item) => item.horizon === "5Y")?.confidence).toBe("medium");
  });

  it("keeps confidence low when market data exists without project, filing, or technical evidence", () => {
    const run = createResearchRun(
      {
        ...candidate,
        marketSnapshot: sourcedMarketSnapshot
      },
      [],
      "USGO"
    );

    expect(confidenceAverage(run)).toBeLessThan(2);
    expect(run.scorecard.confidence).toBe("low");
    expect(run.scorecard.evidenceAudit.missingCriticalCount).toBeGreaterThanOrEqual(3);
    expect(run.scorecard.categories.find((item) => item.key === "management")?.confidence).toBe("low");
    expect(run.scorecard.categories.find((item) => item.key === "asset_quality")?.confidence).toBe("low");
  });
});
