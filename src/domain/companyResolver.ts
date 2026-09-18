import type { CompanyCandidate } from "./types";

export const COMPANY_UNIVERSE: CompanyCandidate[] = [
  {
    id: "us-gold-mining",
    name: "US GoldMining Inc.",
    ticker: "USGO",
    exchange: "NASDAQ",
    country: "US",
    commodityFocus: ["Gold", "Copper"],
    aliases: ["US GoldMining", "U.S. GoldMining"],
    websiteUrl: "https://www.usgoldmining.us/",
    description: "Exploration-stage gold-copper company advancing the Whistler project in Alaska.",
    projects: ["Whistler gold-copper project"],
    jurisdiction: "Alaska, United States",
    stage: "Exploration",
    management: [
      {
        name: "Tim Smith",
        role: "Chief Executive Officer",
        bio:
          "Geologist and mining executive leading US GoldMining's Whistler strategy, with career experience across exploration targeting, resource definition, and public-company project advancement.",
        experience: [
          "More than two decades of technical and executive experience across gold, copper, and base-metal exploration",
          "Worked on discovery-stage and resource-stage assets, including Alaska and North American mineral systems",
          "Diligence focus: compare Whistler exploration milestones against prior project advancement and capital discipline"
        ],
        sourceUrl: "https://www.usgoldmining.us/"
      },
      {
        name: "Alastair Still",
        role: "Chairman",
        bio:
          "Mining executive and geologist providing board-level oversight, public-company governance, and technical-resource experience for Whistler.",
        experience: [
          "Executive leadership experience in public mining companies and resource-sector capital allocation",
          "Associated with the Coffee Gold Deposit and Kaminak Gold transaction history, a useful reference point for discovery-to-development execution",
          "Diligence focus: verify repeatability of past project outcomes, insider alignment, and financing discipline"
        ],
        linkedInUrl: "https://ca.linkedin.com/in/alastairstill",
        sourceUrl: "https://www.usgoldmining.us/"
      },
      {
        name: "Tyler Wong",
        role: "Chief Financial Officer",
        bio:
          "Finance lead responsible for reporting discipline, treasury visibility, and the capital-market mechanics that matter for an exploration-stage issuer.",
        experience: [
          "Public-company finance and reporting experience in the mining sector",
          "Relevant to dilution analysis, cash runway tracking, and future financing readiness",
          "Diligence focus: reconcile cash, working capital, warrant overhang, and spending plans against stated exploration goals"
        ],
        sourceUrl: "https://www.usgoldmining.us/"
      }
    ],
    shareStructure: {
      asOf: "Unavailable",
      sharesOutstanding: "Unavailable",
      publicFloat: "Unavailable",
      insiderOwnership: "Unavailable",
      institutionalOwnership: "Unavailable",
      strategicOwnership: "Unavailable",
      floatQuality: "Unknown until current share count, warrants, insider holdings, and strategic ownership are ingested.",
      notes: [
        "Verify latest 10-K/20-F, proxy, and Nasdaq profile before relying on ownership figures.",
        "Watch for warrant overhang, recent private placements, and insider participation in financings."
      ],
      sourceUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces"
    }
  },
  {
    id: "g-mining-ventures",
    name: "G Mining Ventures Corp.",
    ticker: "GMIN.TO",
    exchange: "TSX",
    country: "CA",
    commodityFocus: ["Gold"],
    aliases: ["G Mining Ventures", "GMIN", "GMIN.V", "GMINF"],
    websiteUrl: "https://www.gminingventures.com/",
    description: "Gold developer and operator focused on mine building and project execution in the Americas.",
    projects: ["Tocantinzinho gold mine"],
    jurisdiction: "Brazil and Canada",
    stage: "Developer/Operator",
    management: [
      {
        name: "Louis-Pierre Gignac",
        role: "Chief Executive Officer",
        bio: "Mine-building executive associated with project execution and development-stage gold assets.",
        experience: ["Mine development", "Project construction", "Gold operations"],
        sourceUrl: "https://www.gminingventures.com/"
      }
    ],
    shareStructure: {
      asOf: "Unavailable",
      sharesOutstanding: "Unavailable",
      publicFloat: "Unavailable",
      insiderOwnership: "Unavailable",
      institutionalOwnership: "Unavailable",
      strategicOwnership: "Unavailable",
      floatQuality: "Needs current exchange/filing data.",
      notes: ["Confirm current share count, strategic holders, and any financing overhang."],
      sourceUrl: "https://www.sedarplus.ca/"
    }
  },
  {
    id: "snowline-gold",
    name: "Snowline Gold Corp.",
    ticker: "SGD.TO",
    exchange: "TSX",
    country: "CA",
    commodityFocus: ["Gold"],
    aliases: ["Snowline", "SGD.V", "SNWGF"],
    websiteUrl: "https://snowlinegold.com/",
    description: "Yukon-focused gold explorer advancing district-scale discovery targets.",
    projects: ["Rogue project"],
    jurisdiction: "Yukon, Canada",
    stage: "Exploration",
    management: [
      {
        name: "Scott Berdahl",
        role: "Chief Executive Officer",
        bio: "Exploration executive focused on Yukon gold discovery and project advancement.",
        experience: ["Yukon exploration", "Discovery-stage project leadership", "Public-company management"],
        sourceUrl: "https://snowlinegold.com/"
      }
    ],
    shareStructure: {
      asOf: "Unavailable",
      sharesOutstanding: "Unavailable",
      publicFloat: "Unavailable",
      insiderOwnership: "Unavailable",
      institutionalOwnership: "Unavailable",
      strategicOwnership: "Unavailable",
      floatQuality: "Needs current issuer presentation and SEDAR+ filings.",
      notes: ["Check insider ownership, strategic investors, and financing history."],
      sourceUrl: "https://www.sedarplus.ca/"
    }
  },
  {
    id: "western-copper-gold",
    name: "Western Copper and Gold Corp.",
    ticker: "WRN",
    exchange: "NYSE American",
    country: "CA",
    commodityFocus: ["Copper", "Gold", "Molybdenum"],
    aliases: ["Western Copper", "WRN.TO"],
    websiteUrl: "https://www.westerncopperandgold.com/",
    description: "Copper-gold developer focused on the Casino project.",
    projects: ["Casino project"],
    jurisdiction: "Yukon, Canada",
    stage: "Development",
    management: [
      {
        name: "Sandeep Singh",
        role: "Chief Executive Officer",
        bio: "Leads a copper-gold developer with focus on permitting and project advancement.",
        experience: ["Capital markets", "Mining development", "Public-company leadership"],
        sourceUrl: "https://www.westerncopperandgold.com/"
      }
    ],
    shareStructure: {
      asOf: "Unavailable",
      sharesOutstanding: "Unavailable",
      publicFloat: "Unavailable",
      insiderOwnership: "Unavailable",
      institutionalOwnership: "Unavailable",
      strategicOwnership: "Unavailable",
      floatQuality: "Needs current filings and strategic-holder review.",
      notes: ["Review strategic ownership, public float, and any project-financing dilution risk."],
      sourceUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces"
    }
  },
  {
    id: "f3-uranium",
    name: "F3 Uranium Corp.",
    ticker: "FUU.V",
    exchange: "TSXV",
    country: "CA",
    commodityFocus: ["Uranium"],
    aliases: ["F3 Uranium", "FUUFF"],
    websiteUrl: "https://f3uranium.com/",
    description: "Uranium explorer focused on high-grade discovery targets in the Athabasca Basin.",
    projects: ["Patterson Lake North"],
    jurisdiction: "Saskatchewan, Canada",
    stage: "Exploration",
    management: [
      {
        name: "Dev Randhawa",
        role: "Chief Executive Officer",
        bio: "Resource executive associated with uranium exploration and capital markets.",
        experience: ["Uranium exploration", "Public-company leadership", "Resource capital markets"],
        sourceUrl: "https://f3uranium.com/"
      }
    ],
    shareStructure: {
      asOf: "Unavailable",
      sharesOutstanding: "Unavailable",
      publicFloat: "Unavailable",
      insiderOwnership: "Unavailable",
      institutionalOwnership: "Unavailable",
      strategicOwnership: "Unavailable",
      floatQuality: "Needs current SEDAR+ filings and issuer presentation.",
      notes: ["Verify insider ownership, warrant overhang, and uranium-sector strategic holders."],
      sourceUrl: "https://www.sedarplus.ca/"
    }
  },
  {
    id: "isoenergy",
    name: "IsoEnergy Ltd.",
    ticker: "ISO.TO",
    exchange: "TSX",
    country: "CA",
    commodityFocus: ["Uranium"],
    aliases: ["IsoEnergy", "ISO.V", "ISOU", "ISENF"],
    websiteUrl: "https://www.isoenergy.ca/",
    description: "Uranium company with exploration and development exposure in the Athabasca Basin and other jurisdictions.",
    projects: ["Larocque East", "Hurricane deposit"],
    jurisdiction: "Saskatchewan, Canada",
    stage: "Exploration/Development"
  },
  {
    id: "nexgen-energy",
    name: "NexGen Energy Ltd.",
    ticker: "NXE",
    exchange: "NYSE American",
    country: "CA",
    commodityFocus: ["Uranium"],
    aliases: ["NXE.TO", "NexGen"],
    websiteUrl: "https://www.nexgenenergy.ca/",
    description: "Uranium developer focused on the Rook I project and Arrow deposit.",
    projects: ["Rook I", "Arrow deposit"],
    jurisdiction: "Saskatchewan, Canada",
    stage: "Development"
  },
  {
    id: "skeena-resources",
    name: "Skeena Resources Ltd.",
    ticker: "SKE",
    exchange: "NYSE American",
    country: "CA",
    commodityFocus: ["Gold", "Silver"],
    aliases: ["SKE.TO", "Skeena"],
    websiteUrl: "https://skeenaresources.com/",
    description: "Gold-silver developer focused on the Eskay Creek project.",
    projects: ["Eskay Creek"],
    jurisdiction: "British Columbia, Canada",
    stage: "Development"
  },
  {
    id: "fireweed-metals",
    name: "Fireweed Metals Corp.",
    ticker: "FWZ.V",
    exchange: "TSXV",
    country: "CA",
    commodityFocus: ["Zinc", "Lead", "Silver", "Tungsten"],
    aliases: ["Fireweed", "FWEDF"],
    websiteUrl: "https://fireweedmetals.com/",
    description: "Critical-minerals explorer and developer focused on zinc and tungsten projects.",
    projects: ["Macmillan Pass", "Mactung"],
    jurisdiction: "Yukon and Northwest Territories, Canada",
    stage: "Exploration/Development"
  },
  {
    id: "faraday-copper",
    name: "Faraday Copper Corp.",
    ticker: "FDY.TO",
    exchange: "TSX",
    country: "CA",
    commodityFocus: ["Copper"],
    aliases: ["Faraday", "CPPKF"],
    websiteUrl: "https://faradaycopper.com/",
    description: "Copper developer advancing the Copper Creek project.",
    projects: ["Copper Creek"],
    jurisdiction: "Arizona, United States",
    stage: "Development"
  },
  {
    id: "liberty-gold",
    name: "Liberty Gold Corp.",
    ticker: "LGD.TO",
    exchange: "TSX",
    country: "CA",
    commodityFocus: ["Gold"],
    aliases: ["Liberty Gold", "LGDTF"],
    websiteUrl: "https://libertygold.ca/",
    description: "Gold developer focused on oxide gold projects in the Great Basin.",
    projects: ["Black Pine"],
    jurisdiction: "Idaho, United States",
    stage: "Development"
  }
];

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const tickerForms = (ticker: string) => {
  const normalized = normalize(ticker);
  const withoutCanadianSuffix = normalized.replace(/\.(v|to|cn)$/i, "");
  return new Set([normalized, withoutCanadianSuffix]);
};

export function resolveCompany(query: string): CompanyCandidate | undefined {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return undefined;

  return COMPANY_UNIVERSE.find((company) => {
    const tickerMatches = tickerForms(company.ticker).has(normalizedQuery);
    const aliasMatches = [company.name, ...(company.aliases ?? [])].some((alias) =>
      normalize(alias).includes(normalizedQuery)
    );
    const queryContainsAlias = [company.name, ...(company.aliases ?? [])].some((alias) =>
      normalizedQuery.includes(normalize(alias))
    );
    return tickerMatches || aliasMatches || queryContainsAlias;
  });
}

export function searchCompanies(query: string): CompanyCandidate[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return COMPANY_UNIVERSE;

  return COMPANY_UNIVERSE.map((company) => {
    const ticker = normalize(company.ticker);
    const name = normalize(company.name);
    const aliases = (company.aliases ?? []).map(normalize);
    const terms = [ticker, name, company.exchange.toLowerCase(), ...company.commodityFocus.map(normalize), ...aliases];
    const matches = terms.some((term) => term.includes(normalizedQuery));
    let rank = 100;
    if (ticker.startsWith(normalizedQuery)) rank = 0;
    else if (name.startsWith(normalizedQuery)) rank = 1;
    else if (aliases.some((alias) => alias.startsWith(normalizedQuery))) rank = 2;
    else if (ticker.includes(normalizedQuery)) rank = 3;
    else if (name.includes(normalizedQuery)) rank = 4;
    else if (matches) rank = 5;
    return { company, rank, matches };
  })
    .filter((item) => item.matches)
    .sort((a, b) => a.rank - b.rank || a.company.ticker.localeCompare(b.company.ticker))
    .map((item) => item.company);
}
