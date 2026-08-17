export type Exchange = "NASDAQ" | "NYSE American" | "OTC" | "TSX" | "TSXV" | "CSE";

export interface CompanyCandidate {
  id: string;
  name: string;
  ticker: string;
  exchange: Exchange;
  country: "US" | "CA";
  commodityFocus: string[];
  aliases?: string[];
  websiteUrl?: string;
  description?: string;
  projects?: string[];
  jurisdiction?: string;
  stage?: string;
  management?: ManagementPerson[];
  shareStructure?: ShareStructure;
  marketSnapshot?: MarketSnapshot;
  analystForecast?: AnalystForecast;
  financialSnapshot?: FinancialSnapshot;
}

export type SourceType = "filing" | "presentation" | "news" | "market_data" | "regulatory_search" | "manual";

export interface SourceDocument {
  id: string;
  title: string;
  sourceType: SourceType;
  publisher: string;
  url: string;
  retrievedAt: string;
  excerpts: string[];
}

export type EvidenceFactCategory =
  | "technical_report"
  | "drill_results"
  | "resource_estimate"
  | "metallurgy"
  | "infrastructure"
  | "permitting"
  | "cash_balance"
  | "burn_rate"
  | "cash_runway"
  | "basic_shares"
  | "fully_diluted_shares"
  | "warrants_options"
  | "recent_financing"
  | "insider_ownership"
  | "management_biography"
  | "prior_outcomes"
  | "capital_allocation";

export interface EvidenceFact {
  id: string;
  category: EvidenceFactCategory;
  label: string;
  value: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  confidence: "low" | "medium" | "high";
  retrievedAt: string;
}

export interface EvidenceCategoryStatus {
  id: EvidenceFactCategory;
  label: string;
  status: "found" | "missing";
  factCount: number;
}

export interface EvidenceCollectionStatus {
  mode: "automated";
  summary: string;
  adapters: AdapterStatus[];
  categories: EvidenceCategoryStatus[];
  gaps: string[];
  updatedAt: string;
}

export interface AdapterStatus {
  id: string;
  name: string;
  status: "seeded" | "configured" | "needs_key" | "manual";
  note: string;
  contributes: string[];
  missing: string[];
}

export interface MemoSection {
  id: string;
  title: string;
  status: "supported" | "inferred" | "unknown";
  body: string;
  citationIds: string[];
}

export interface ScoreCategory {
  key: string;
  label: string;
  score: number;
  confidence: "low" | "medium" | "high";
  confidenceRationale: string;
  rationale: string;
  drivers: string[];
  positiveDrivers: string[];
  negativeDrivers: string[];
  improveActions: string[];
  downgradeTriggers: string[];
  dataNeeded: string[];
  citationIds: string[];
}

export interface TimelineScore {
  horizon: "3M" | "6M" | "1Y" | "3Y" | "5Y";
  label: string;
  score: number;
  confidence: "low" | "medium" | "high";
  summary: string;
  drivers: string[];
  companyGoals: string[];
}

export interface Scorecard {
  overall: number;
  confidence: "low" | "medium" | "high";
  categories: ScoreCategory[];
  timelineScores: TimelineScore[];
  methodology: ScoringMethodology;
  evidenceAudit: EvidenceAudit;
}

export interface ScoringMethodology {
  version: string;
  name: string;
  categoryWeights: Array<{
    key: string;
    label: string;
    weight: number;
  }>;
  confidenceModel: string;
  requiredInputs: string[];
  sourceLinks: Array<{
    label: string;
    url: string;
  }>;
}

export interface EvidenceAudit {
  missingCriticalCount: number;
  availableCriticalCount: number;
  requirements: EvidenceRequirement[];
}

export interface EvidenceRequirement {
  id: string;
  label: string;
  importance: "critical" | "important" | "supporting";
  status: "available" | "missing";
  sourceTypes: SourceType[];
  whyItMatters: string;
}

export interface InvestorLens {
  id: string;
  name: string;
  initials: string;
  portraitTone: string;
  portraitUrl?: string;
  portraitSourceUrl?: string;
  approach: string;
  focus: string;
  background: string;
  view: string;
  positives: string[];
  concerns: string[];
  metrics: string[];
  checklist: string[];
  sourceLinks: Array<{
    label: string;
    url: string;
  }>;
  citationIds: string[];
  disclaimer: string;
}

export interface AnalystForecast {
  status: "sourced" | "not_sourced";
  consensusLabel: string;
  priceTarget?: string;
  upsideDownside?: string;
  timeHorizon: string;
  summary: string;
  sourceUrl?: string;
  sourceLabel?: string;
  dataNeeded: string[];
}

export interface FinancialSnapshot {
  status: "sourced" | "not_available";
  revenue?: string;
  grossProfit?: string;
  ebitda?: string;
  netIncome?: string;
  operatingExpense?: string;
  totalCash?: string;
  totalDebt?: string;
  enterpriseValue?: string;
  freeCashflow?: string;
  operatingCashflow?: string;
  profitMargin?: string;
  sourceLabel: string;
  sourceUrl?: string;
  asOf: string;
  dataNeeded: string[];
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  summary: string;
  impact: "positive" | "neutral" | "negative" | "watch";
  citationIds: string[];
}

export interface ManagementPerson {
  name: string;
  role: string;
  bio: string;
  experience: string[];
  group?: "executive" | "board" | "technical" | "advisor" | "project_lead";
  linkedInUrl?: string;
  linkedInStatus?: "verified" | "likely_match" | "needs_review";
  sourceUrl?: string;
  sourceStatus?: "issuer" | "filing" | "registry" | "candidate" | "unknown";
  profileImageUrl?: string;
  evidenceIds?: string[];
  trackRecord?: string[];
  openQuestions?: string[];
}

export interface PersonSource {
  id: string;
  personName?: string;
  title: string;
  url: string;
  publisher: string;
  sourceType: SourceType;
  excerpt: string;
  confidence: "low" | "medium" | "high";
}

export interface LinkedInCandidate {
  personName: string;
  url?: string;
  status: "verified" | "likely_match" | "needs_review";
  sourceIds: string[];
  retrievedAt: string;
}

export interface TrackRecordEvidence {
  personName?: string;
  theme: "prior_outcome" | "capital_allocation" | "insider_alignment" | "technical_execution";
  summary: string;
  sourceId: string;
  confidence: "low" | "medium" | "high";
}

export interface ManagementConfidenceSignal {
  id: string;
  label: string;
  status: "positive" | "gap" | "watch";
  detail: string;
  sourceIds: string[];
}

export interface ManagementEvidence {
  people: ManagementPerson[];
  sources: PersonSource[];
  linkedInCandidates: LinkedInCandidate[];
  trackRecord: TrackRecordEvidence[];
  confidenceSignals: ManagementConfidenceSignal[];
  gaps: string[];
  summary: string;
}

export interface ShareStructure {
  asOf: string;
  sharesOutstanding?: string;
  publicFloat?: string;
  insiderOwnership?: string;
  institutionalOwnership?: string;
  strategicOwnership?: string;
  floatQuality: string;
  notes: string[];
  sourceUrl?: string;
}

export interface MarketSnapshot {
  status: "sourced" | "not_sourced";
  price?: string;
  currency?: string;
  changePercent?: string;
  marketCap?: string;
  volume?: string;
  averageVolume?: string;
  fiftyTwoWeekHigh?: string;
  fiftyTwoWeekLow?: string;
  sharesOutstanding?: string;
  sourceLabel: string;
  sourceUrl?: string;
  asOf: string;
  dataNeeded: string[];
}

export interface RiskScenario {
  id: string;
  title: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  timeframe: string;
  summary: string;
  whatMustGoRight: string[];
  whereItCouldFallShort: string[];
}

export interface RedFlag {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  detail: string;
  citationIds: string[];
}

export interface ResearchRun {
  id: string;
  query: string;
  company: CompanyCandidate;
  createdAt: string;
  refreshedAt: string;
  sources: SourceDocument[];
  evidenceFacts: EvidenceFact[];
  evidenceStatus: EvidenceCollectionStatus;
  scorecard: Scorecard;
  investorLenses: InvestorLens[];
  analystForecast: AnalystForecast;
  financialSnapshot: FinancialSnapshot;
  marketSnapshot: MarketSnapshot;
  news: NewsItem[];
  management: ManagementPerson[];
  managementEvidence: ManagementEvidence;
  shareStructure: ShareStructure;
  riskScenarios: RiskScenario[];
  redFlags: RedFlag[];
  catalysts: MemoSection[];
  memo: {
    title: string;
    sections: MemoSection[];
  };
}

export interface ReportComparison {
  fromId: string;
  toId: string;
  overallDelta: number;
  changedCategories: Array<{
    key: string;
    label: string;
    delta: number;
  }>;
}
