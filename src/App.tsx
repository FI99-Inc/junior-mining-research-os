import {
  AlertTriangle,
  BarChart3,
  Brain,
  ChevronDown,
  Database,
  ExternalLink,
  PieChart,
  Newspaper,
  Play,
  Search,
  Sparkles,
  Users
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  fetchResearchHistory,
  requestResearchRun,
  searchCompanyCandidates,
  type ManualSourceDraft,
  type ResearchRunResponse
} from "./api/researchApi";
import { COMPANY_UNIVERSE } from "./domain/companyResolver";
import { managementHighlights } from "./domain/managementHighlights";
import type {
  AnalystForecast,
  AdapterStatus,
  CompanyCandidate,
  FinancialSnapshot,
  InvestorLens,
  MarketSnapshot,
  NewsItem,
  RedFlag,
  ResearchRun,
  ScoreCategory,
  SourceDocument
} from "./domain/types";

type ReportTab = "scorecard" | "lenses" | "management" | "risks" | "news" | "shares" | "financials" | "sources";
type TimelineHorizon = ResearchRun["scorecard"]["timelineScores"][number]["horizon"];

const statusLabel: Record<AdapterStatus["status"], string> = {
  seeded: "Seeded",
  configured: "Configured",
  needs_key: "Needs key",
  manual: "Manual"
};

const unavailable = "Unavailable";

const NEWS_PIPELINE_SOURCES = [
  {
    name: "Junior Mining Network",
    logo: "JMN",
    url: "https://www.juniorminingnetwork.com/",
    use: "Company-specific junior mining news releases and sector headlines."
  },
  {
    name: "MINING.com",
    logo: "M",
    url: "https://www.mining.com/",
    use: "Broader mining news, commodity context, and major project developments."
  },
  {
    name: "TMX Newsfile",
    logo: "TMX",
    url: "https://money.tmx.com/en/newsfile",
    use: "Canadian issuer press releases distributed through Newsfile."
  },
  {
    name: "Kitco Mining",
    logo: "K",
    url: "https://www.kitco.com/mining",
    use: "Mining and metals news with commodity-market context."
  },
  {
    name: "Canadian Mining Report",
    logo: "CMR",
    url: "https://www.canadianminingreport.com/",
    use: "Canadian mining company news and sector coverage."
  }
];

function ScoreBar({ category }: { category: ScoreCategory }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`score-row ${open ? "open" : ""}`}>
      <button
        type="button"
        className="score-toggle"
        aria-expanded={open}
        aria-label={`${category.label} details`}
        onClick={() => setOpen((value) => !value)}
      >
        <div>
          <div className="row-title">{category.label}</div>
          <p>{category.confidence} confidence</p>
        </div>
        <ChevronDown size={18} aria-hidden />
      </button>
      <div className="score-meter" aria-label={`${category.label} score ${category.score}`}>
        <span style={{ width: `${category.score}%` }} />
      </div>
      <strong>{category.score}</strong>
      {open ? (
        <div className="score-detail">
          <h4>What drove this score</h4>
          <p>{category.rationale}</p>
          <div className="rating-detail-grid">
            <div>
              <h4>Positive evidence</h4>
              <ul>
                {category.positiveDrivers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Negative evidence</h4>
              <ul>
                {category.negativeDrivers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>What would improve this rating</h4>
              <ul>
                {category.improveActions.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>What would reduce this rating</h4>
              <ul>
                {category.downgradeTriggers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            </div>
          </div>
          <h4>Data still needed</h4>
          <ul>
            {category.dataNeeded.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h4>Confidence</h4>
          <p>{category.confidenceRationale}</p>
          <small>
            Evidence links:{" "}
            {category.citationIds.length
              ? `${category.citationIds.length} cited source${category.citationIds.length === 1 ? "" : "s"}`
              : "no cited source"}
          </small>
        </div>
      ) : null}
    </div>
  );
}

function TimelineSelector({
  run,
  selectedHorizon,
  onChange
}: {
  run: ResearchRunResponse;
  selectedHorizon: TimelineHorizon;
  onChange: (horizon: TimelineHorizon) => void;
}) {
  const selected = run.scorecard.timelineScores.find((item) => item.horizon === selectedHorizon) ?? run.scorecard.timelineScores[0];
  const selectedIndex = Math.max(0, run.scorecard.timelineScores.findIndex((item) => item.horizon === selected.horizon));

  return (
    <section className="timeline-panel">
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Timeline-adjusted view</p>
          <h3>{selected.label}</h3>
        </div>
        <strong>{selected.score}</strong>
      </div>
      <div className="timeline-track">
        <input
          aria-label="Feasibility timeline"
          type="range"
          min="0"
          max={run.scorecard.timelineScores.length - 1}
          step="1"
          value={selectedIndex}
          onChange={(event) => onChange(run.scorecard.timelineScores[Number(event.target.value)].horizon)}
        />
      </div>
      <div className="timeline-buttons" role="group" aria-label="Timeline milestones">
        {run.scorecard.timelineScores.map((item) => (
          <button
            type="button"
            className={item.horizon === selectedHorizon ? "active" : ""}
            key={item.horizon}
            onClick={() => onChange(item.horizon)}
          >
            {item.horizon}
          </button>
        ))}
      </div>
      <p>{selected.summary}</p>
      <ul>
        {selected.drivers.map((driver) => (
          <li key={driver}>{driver}</li>
        ))}
      </ul>
      <div className="company-goals">
        <h4>Company goals in this window</h4>
        <ul>
          {selected.companyGoals.map((goal) => (
            <li key={goal}>{goal}</li>
          ))}
        </ul>
      </div>
      <small>{selected.confidence} confidence for this timeframe</small>
    </section>
  );
}

function ExplorationGrid({ onResearch, loading }: { onResearch: (company: CompanyCandidate) => void; loading: boolean }) {
  return (
    <section className="explore-panel" aria-label="Explore companies">
      <div className="section-head compact-head">
        <div>
          <p className="eyebrow">Starting universe</p>
          <h2>Explore companies</h2>
        </div>
        <p>Browse a few names when you do not have a specific ticker in mind. This list can expand as the registry grows.</p>
      </div>
      <div className="explore-grid">
        {COMPANY_UNIVERSE.slice(0, 16).map((company) => (
          <article className="explore-card" key={company.id}>
            <div>
              <strong>{company.ticker}</strong>
              <p className="explore-name">{company.name}</p>
              <p>
                {company.exchange} - {company.stage ?? "Junior miner"} - {company.commodityFocus.join(", ")}
              </p>
            </div>
            <button type="button" disabled={loading} onClick={() => onResearch(company)}>
              Research {company.ticker}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function SuggestionList({
  suggestions,
  onPick,
  id,
  activeIndex
}: {
  suggestions: CompanyCandidate[];
  onPick: (company: CompanyCandidate) => void;
  id: string;
  activeIndex: number;
}) {
  if (!suggestions.length) return null;

  return (
    <div id={id} className="suggestions" role="listbox" aria-label="Company suggestions">
      {suggestions.map((company, index) => (
        <button
          type="button"
          role="option"
          id={`${id}-${index}`}
          aria-selected={activeIndex === index}
          tabIndex={-1}
          className="suggestion"
          key={company.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(company)}
        >
          <strong>{company.ticker}</strong>
          <span>{company.name}</span>
          <small>
            {company.exchange} - {company.commodityFocus.join(", ")}
          </small>
        </button>
      ))}
    </div>
  );
}

function CompanySearchPanel({
  idPrefix,
  query,
  suggestions,
  loading,
  error,
  compact = false,
  showSuggestions,
  showHelper = true,
  onSubmit,
  onQueryChange,
  onFocus,
  onPick
}: {
  idPrefix: string;
  query: string;
  suggestions: CompanyCandidate[];
  loading: boolean;
  error?: string | null;
  compact?: boolean;
  showSuggestions: boolean;
  showHelper?: boolean;
  onSubmit: (event: FormEvent) => void;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onPick: (company: CompanyCandidate) => void;
}) {
  const inputId = `${idPrefix}-query`;
  const listId = `${idPrefix}-suggestions`;
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const expanded = showSuggestions && !dismissed && suggestions.length > 0;

  return (
    <section className={`search-band ${compact ? "compact-search" : ""}`} data-testid={`${idPrefix}-search`}>
      <form onSubmit={onSubmit}>
        <label htmlFor={inputId}>Ticker or company</label>
        <div className="search-row">
          <div className="suggestion-wrap">
            <Search size={18} aria-hidden />
            <input
              id={inputId}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={expanded}
              aria-controls={expanded ? listId : undefined}
              aria-activedescendant={expanded && activeIndex >= 0 && activeIndex < suggestions.length ? `${listId}-${activeIndex}` : undefined}
              value={query}
              onChange={(event) => {
                setActiveIndex(-1);
                setDismissed(false);
                onFocus();
                onQueryChange(event.target.value);
              }}
              onFocus={() => { setDismissed(false); onFocus(); }}
              onBlur={() => { setDismissed(true); setActiveIndex(-1); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDismissed(true);
                  setActiveIndex(-1);
                } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
                  event.preventDefault();
                  setDismissed(false);
                  setActiveIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
                } else if (event.key === "Enter" && expanded && suggestions[activeIndex]) {
                  event.preventDefault();
                  onPick(suggestions[activeIndex]);
                  setDismissed(true);
                  setActiveIndex(-1);
                }
              }}
              placeholder="USGO, SGD.V, Snowline"
              autoComplete="off"
            />
            {expanded ? <SuggestionList id={listId} activeIndex={activeIndex} suggestions={suggestions} onPick={onPick} /> : null}
          </div>
          <button type="submit" disabled={loading || !query.trim()}>
            <Play size={18} aria-hidden />
            {loading ? "Running" : "Run Research"}
          </button>
        </div>
      </form>
      {showHelper ? (
        <p>Try USGO, SGD.V, GMIN.V, WRN, or FUU.V. The universe can expand cleanly from the company registry.</p>
      ) : null}
      {error ? <div className="error" role="alert">{error}</div> : null}
    </section>
  );
}

function SourceList({ sources }: { sources: SourceDocument[] }) {
  return (
    <div className="source-grid">
      {sources.map((source) => (
        <a className="source-card" href={source.url} target="_blank" rel="noreferrer" key={source.id}>
          <span>{source.sourceType.replace("_", " ")}</span>
          <strong>{source.title}</strong>
          <small>{source.publisher}</small>
        </a>
      ))}
    </div>
  );
}

function SourceQualitySummary({ run }: { run: ResearchRunResponse }) {
  const sourceQuality = run.memo.sections.find((section) => section.id === "source_quality");
  const needsEvidence = run.memo.sections.filter((section) => section.status === "unknown").length;

  return (
    <div className="source-quality-strip" aria-label="Evidence quality">
      <div>
        <span>Source coverage</span>
        <strong>{run.sources.length}</strong>
        <small>documents linked to this run</small>
      </div>
      <div>
        <span>Needs evidence</span>
        <strong>{needsEvidence}</strong>
        <small>internal evidence gaps still preserved</small>
      </div>
      <div className="wide">
        <span>Evidence quality</span>
        <p>{sourceQuality?.body ?? run.evidenceStatus.summary}</p>
      </div>
    </div>
  );
}

function SourceImportPanel({
  importedSources,
  onAdd,
  onClear
}: {
  importedSources: ManualSourceDraft[];
  onAdd: (source: ManualSourceDraft) => void;
  onClear: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [sourceType, setSourceType] = useState<ManualSourceDraft["sourceType"]>("manual");

  function addSource() {
    const excerpts = evidenceText
      .split(/\n{2,}/)
      .map((excerpt) => excerpt.trim())
      .filter(Boolean);
    if (!title.trim() || excerpts.length === 0) return;
    onAdd({
      title: title.trim(),
      sourceType,
      publisher: "Issuer document import",
      url: url.trim() || "Manual source",
      excerpts
    });
    setTitle("");
    setUrl("");
    setEvidenceText("");
    setSourceType("manual");
  }

  return (
    <section className="source-import" aria-label="Issuer document import">
      <div>
        <p className="eyebrow">Confidence builder</p>
        <h3>Add issuer evidence</h3>
        <p>
          Paste key excerpts from a presentation, technical report, financial statement, MD&A, proxy, or news release.
          These sources travel with the next research run and can raise confidence when they cover missing evidence.
        </p>
      </div>
      <div className="source-import-grid">
        <label htmlFor="manual-source-title">
          Issuer document title
          <input
            id="manual-source-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Whistler Technical Report"
          />
        </label>
        <label htmlFor="manual-source-url">
          Source URL
          <input
            id="manual-source-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://company.com/presentation.pdf"
          />
        </label>
        <label htmlFor="manual-source-type">
          Source type
          <select id="manual-source-type" value={sourceType} onChange={(event) => setSourceType(event.target.value as ManualSourceDraft["sourceType"])}>
            <option value="manual">Manual excerpt</option>
            <option value="presentation">Presentation</option>
            <option value="filing">Filing / MD&A</option>
            <option value="news">News release</option>
          </select>
        </label>
      </div>
      <label htmlFor="manual-source-evidence">
        Evidence text
        <textarea
          id="manual-source-evidence"
          value={evidenceText}
          onChange={(event) => setEvidenceText(event.target.value)}
          placeholder="Paste excerpts mentioning resource estimates, metallurgy, cash runway, fully diluted shares, warrants, insider ownership, permitting, management background, or catalyst dates."
        />
      </label>
      <div className="source-import-actions">
        <button type="button" onClick={addSource}>
          Add Source
        </button>
        {importedSources.length ? (
          <button type="button" className="secondary-button" onClick={onClear}>
            Clear imported sources
          </button>
        ) : null}
      </div>
      <p className="muted">
        {importedSources.length
          ? `${importedSources.length} imported issuer source${importedSources.length === 1 ? "" : "s"} ready for the next research run.`
          : "No issuer sources imported yet."}
      </p>
      {importedSources.length ? (
        <ul className="imported-source-list">
          {importedSources.map((source, index) => (
            <li key={`${source.title}-${index}`}>
              <strong>{source.title}</strong>
              <span>{source.sourceType.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ConfidenceBuilderPanel({ run }: { run: ResearchRunResponse }) {
  const missingCritical = run.scorecard.evidenceAudit.requirements.filter(
    (requirement) => requirement.importance === "critical" && requirement.status === "missing"
  );
  const lowerConfidenceCategories = run.scorecard.categories.filter((category) => category.confidence !== "high").slice(0, 5);

  return (
    <section className="confidence-builder">
      <div className="section-head compact-head">
        <div>
          <p className="eyebrow">Confidence builder</p>
          <h3>What would make this analysis more reliable</h3>
        </div>
        <p>
          Confidence rises only when the missing evidence is sourced. Add issuer PDFs or excerpts that cover these gaps,
          then rerun research for this company.
        </p>
      </div>
      <div className="confidence-grid">
        <div>
          <h4>Highest-impact missing evidence</h4>
          {missingCritical.length ? (
            <ul>
              {missingCritical.map((requirement) => (
                <li key={requirement.id}>
                  <strong>{requirement.label}</strong>
                  <span>{requirement.whyItMatters}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Core critical evidence requirements are covered for this run.</p>
          )}
        </div>
        <div>
          <h4>Category-level gaps</h4>
          <ul>
            {lowerConfidenceCategories.map((category) => (
              <li key={category.key}>
                <strong>
                  {category.label}: {category.confidence}
                </strong>
                <span>{category.dataNeeded.slice(0, 3).join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function numberFromText(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, "");
  const match = normalized.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function ForecastChart({ forecast, marketSnapshot }: { forecast: AnalystForecast; marketSnapshot: MarketSnapshot }) {
  const currentPrice = numberFromText(marketSnapshot.price);
  const targetPrice = numberFromText(forecast.priceTarget);
  const impliedMove = numberFromText(forecast.upsideDownside);
  const hasTarget = targetPrice !== undefined || impliedMove !== undefined;
  const currentLabel =
    currentPrice !== undefined ? `${marketSnapshot.price}${marketSnapshot.currency ? ` ${marketSnapshot.currency}` : ""}` : unavailable;
  const targetLabel = forecast.priceTarget ?? unavailable;
  const targetPosition =
    currentPrice !== undefined && targetPrice !== undefined
      ? Math.max(8, Math.min(92, (targetPrice / Math.max(currentPrice, targetPrice)) * 92))
      : impliedMove !== undefined
        ? Math.max(8, Math.min(92, 50 + impliedMove / 3))
        : 50;

  return (
    <div className={`forecast-chart ${hasTarget ? "has-target" : "pending"}`} role="img" aria-label="Analyst forecast chart">
      <div className="forecast-chart-head">
        <div>
          <span>Current</span>
          <strong>{currentLabel}</strong>
        </div>
        <div>
          <span>Consensus target</span>
          <strong>{targetLabel}</strong>
        </div>
      </div>
      <div className="forecast-track" aria-hidden="true">
        <span className="forecast-current-marker" />
        <span className="forecast-target-marker" style={{ left: `${targetPosition}%` }} />
      </div>
      <div className="forecast-chart-foot">
        <span>{hasTarget ? "Current price" : "Awaiting target data"}</span>
        <strong>{forecast.upsideDownside ?? "Add sourced targets"}</strong>
        <span>{forecast.timeHorizon}</span>
      </div>
    </div>
  );
}

function LensCard({ lens }: { lens: InvestorLens }) {
  const [open, setOpen] = useState(false);

  return (
    <article className={`lens-card ${open ? "open" : ""}`}>
      <button type="button" className="lens-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="lens-person">
          <span className={`lens-avatar ${lens.portraitTone}`}>
            {lens.portraitUrl ? <img src={lens.portraitUrl} alt={`${lens.name} portrait`} loading="lazy" /> : lens.initials}
          </span>
          <span>
            <strong>{lens.name}</strong>
            <small>{lens.focus}</small>
          </span>
        </span>
        <ChevronDown size={18} aria-hidden />
      </button>
      <p className="lens-focus">{lens.approach}</p>
      {open ? (
        <div className="lens-body">
          <h4>Background</h4>
          <p>{lens.background}</p>
          <h4>How this investor would approach it</h4>
          <p>{lens.view}</p>
          <div className="two-column compact">
            <div>
              <h4>What they would like</h4>
              {lens.positives.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <div>
              <h4>What they would challenge</h4>
              {lens.concerns.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
          <h4>Figures to watch</h4>
          <ul>
            {lens.metrics.map((metric) => (
              <li key={metric}>{metric}</li>
            ))}
          </ul>
          <h4>Framework checklist</h4>
          <ul>
            {lens.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="lens-source-links">
            {lens.sourceLinks.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                {source.label} <ExternalLink size={14} aria-hidden />
              </a>
            ))}
            {lens.portraitSourceUrl ? (
              <a href={lens.portraitSourceUrl} target="_blank" rel="noreferrer">
                Portrait source <ExternalLink size={14} aria-hidden />
              </a>
            ) : null}
          </div>
          <small>{lens.disclaimer}</small>
        </div>
      ) : null}
    </article>
  );
}

function ScoringMethodologyPanel({ run }: { run: ResearchRunResponse }) {
  return (
    <section className="methodology-panel support-disclosure">
      <details>
        <summary>
          <div>
            <p className="eyebrow">Scoring methodology</p>
            <h3>{run.scorecard.methodology.name}</h3>
            <p>Click to review score weights, confidence logic, and the evidence inputs that would improve accuracy.</p>
          </div>
          <span>View methodology</span>
        </summary>
        <div className="disclosure-body">
          <p>{run.scorecard.methodology.confidenceModel}</p>
          <div className="methodology-weights">
            {run.scorecard.methodology.categoryWeights.map((item) => (
              <div key={item.key}>
                <span>{item.label}</span>
                <strong>{item.weight}%</strong>
              </div>
            ))}
          </div>
          <div className="methodology-inputs">
            <h4>Inputs that would materially improve accuracy</h4>
            <ul>
              {run.scorecard.methodology.requiredInputs.slice(0, 5).map((input) => (
                <li key={input}>{input}</li>
              ))}
            </ul>
            <div className="methodology-links">
              {run.scorecard.methodology.sourceLinks.map((source) => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                  {source.label} <ExternalLink size={14} aria-hidden />
                </a>
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

function MetricGrid({
  metrics,
  gridClassName,
  itemClassName
}: {
  metrics: Array<{ label: string; value: string }>;
  gridClassName: string;
  itemClassName: string;
}) {
  return (
    <div className={gridClassName}>
      {metrics.map((metric) => (
        <div className={itemClassName} key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}

function MarketSnapshotPanel({ snapshot }: { snapshot: MarketSnapshot }) {
  const metrics = [
    { label: "Current price", value: snapshot.price ? `${snapshot.price}${snapshot.currency ? ` ${snapshot.currency}` : ""}` : unavailable },
    { label: "Change", value: snapshot.changePercent ?? unavailable },
    { label: "Market cap", value: snapshot.marketCap ?? unavailable },
    { label: "Volume", value: snapshot.volume ?? unavailable },
    { label: "52-week high", value: snapshot.fiftyTwoWeekHigh ?? unavailable },
    { label: "52-week low", value: snapshot.fiftyTwoWeekLow ?? unavailable },
    { label: "Shares outstanding", value: snapshot.sharesOutstanding ?? unavailable }
  ];

  return (
    <section className="market-snapshot" aria-label="Market snapshot">
      <div className="market-snapshot-head">
        <div>
          <p className="eyebrow">Market snapshot</p>
          <h3>Trading and valuation inputs</h3>
        </div>
        <small>{snapshot.status === "sourced" ? `As of ${snapshot.asOf}` : "Market data pending"}</small>
      </div>
      <MetricGrid metrics={metrics} gridClassName="market-metric-grid" itemClassName="market-metric" />
      {snapshot.status === "not_sourced" ? (
        <details className="market-data-needed">
          <summary>Missing market data</summary>
          <ul>
            {snapshot.dataNeeded.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {snapshot.sourceUrl ? (
        <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
          {snapshot.sourceLabel} <ExternalLink size={14} aria-hidden />
        </a>
      ) : null}
    </section>
  );
}

function ResearchCollectionStatusPanel({ run }: { run: ResearchRunResponse }) {
  const found = run.evidenceStatus.categories.filter((category) => category.status === "found");
  const missing = run.evidenceStatus.categories.filter((category) => category.status === "missing");
  const visibleAdapters = run.evidenceStatus.adapters.slice(0, 5);

  return (
    <section className="research-collection" aria-label="Research Collection Status">
      <details className="support-disclosure">
        <summary>
          <div>
            <p className="eyebrow">Automated evidence collection</p>
            <h3>Research Collection Status</h3>
            <p>Click to review adapters, found evidence categories, and unresolved data gaps.</p>
          </div>
          <strong>{found.length}/{run.evidenceStatus.categories.length || 0}</strong>
        </summary>
        <div className="disclosure-body">
          <p>{run.evidenceStatus.summary}</p>
          <div className="collection-status-grid">
            <div>
              <h4>Adapters checked</h4>
              <ul>
                {visibleAdapters.map((adapter) => (
                  <li key={adapter.id}>
                    <span>{statusLabel[adapter.status]}</span>
                    <strong>{adapter.name}</strong>
                  </li>
                ))}
                {!visibleAdapters.length ? <li>No automated adapter status available yet.</li> : null}
              </ul>
            </div>
            <div>
              <h4>Evidence found</h4>
              <ul>
                {found.slice(0, 6).map((category) => (
                  <li key={category.id}>
                    <span>{category.factCount}</span>
                    <strong>{category.label}</strong>
                  </li>
                ))}
                {!found.length ? <li>No cited automated evidence found yet.</li> : null}
              </ul>
            </div>
            <div>
              <h4>Still unavailable</h4>
              <ul>
                {missing.slice(0, 6).map((category) => (
                  <li key={category.id}>
                    <span>0</span>
                    <strong>{category.label}</strong>
                  </li>
                ))}
                {!missing.length ? <li>Core evidence categories are covered.</li> : null}
              </ul>
            </div>
          </div>
          {run.evidenceFacts.length ? (
            <div className="evidence-fact-strip">
              {run.evidenceFacts.slice(0, 3).map((fact) => (
                <a href={fact.sourceUrl} target="_blank" rel="noreferrer" key={fact.id}>
                  <span>{fact.confidence} confidence</span>
                  <strong>{fact.label}</strong>
                  <small>{fact.sourceTitle}</small>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function AnalystForecastPanel({ forecast, marketSnapshot }: { forecast: AnalystForecast; marketSnapshot: MarketSnapshot }) {
  return (
    <article className="forecast-panel">
      <div>
        <p className="eyebrow">Broker and market coverage</p>
        <h3>Analyst Forecast</h3>
        <p>{forecast.summary}</p>
      </div>
      <div className="forecast-grid">
        <div>
          <span>Consensus</span>
          <strong>{forecast.consensusLabel}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{forecast.priceTarget ?? unavailable}</strong>
        </div>
        <div>
          <span>Implied move</span>
          <strong>{forecast.upsideDownside ?? unavailable}</strong>
        </div>
        <div>
          <span>Horizon</span>
          <strong>{forecast.timeHorizon}</strong>
        </div>
      </div>
      <ForecastChart forecast={forecast} marketSnapshot={marketSnapshot} />
      <div className="forecast-needed">
        <h4>{forecast.status === "sourced" ? "Target checks to verify" : "What the app needs before showing targets"}</h4>
        <ul>
          {forecast.dataNeeded.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {forecast.sourceUrl ? (
          <a href={forecast.sourceUrl} target="_blank" rel="noreferrer">
            {forecast.sourceLabel ?? "Forecast source"} <ExternalLink size={14} aria-hidden />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function FinancialSnapshotPanel({ snapshot }: { snapshot: FinancialSnapshot }) {
  const metrics = [
    { label: "Revenue", value: snapshot.revenue ?? unavailable },
    { label: "Gross profit", value: snapshot.grossProfit ?? unavailable },
    { label: "EBITDA", value: snapshot.ebitda ?? unavailable },
    { label: "Net income", value: snapshot.netIncome ?? unavailable },
    { label: "Operating expense", value: snapshot.operatingExpense ?? unavailable },
    { label: "Cash", value: snapshot.totalCash ?? unavailable },
    { label: "Debt", value: snapshot.totalDebt ?? unavailable },
    { label: "Enterprise value", value: snapshot.enterpriseValue ?? unavailable },
    { label: "Free cash flow", value: snapshot.freeCashflow ?? unavailable },
    { label: "Operating cash flow", value: snapshot.operatingCashflow ?? unavailable },
    { label: "Profit margin", value: snapshot.profitMargin ?? unavailable }
  ];

  return (
    <section className="panel financial-section compact-financials" aria-label="Company financial snapshot">
      <div className="financial-snapshot-head">
        <div>
          <p className="eyebrow">Statements and runway</p>
          <h2>
            <BarChart3 size={18} aria-hidden /> Company Financials
          </h2>
        </div>
        <small>{snapshot.status === "sourced" ? `As of ${snapshot.asOf}` : "Financial data pending"}</small>
      </div>
      <p className="financial-summary">
        Cash, debt, operating spend, and free cash flow are the quickest read on a junior miner's runway because many
        issuers have limited revenue before production.
      </p>
      <MetricGrid metrics={metrics} gridClassName="financial-grid" itemClassName="financial-metric" />
      <div className="financial-notes">
        <details open={snapshot.status !== "sourced"}>
          <summary>{snapshot.status === "sourced" ? "Reconciliation checks" : "Missing financial inputs"}</summary>
          <ul>
            {snapshot.dataNeeded.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
        {snapshot.sourceUrl ? (
          <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
            {snapshot.sourceLabel} <ExternalLink size={14} aria-hidden />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function RedFlagList({ flags }: { flags: RedFlag[] }) {
  return (
    <div className="flag-list">
      {flags.map((flag) => (
        <div className={`flag ${flag.severity}`} key={flag.id}>
          <AlertTriangle size={18} aria-hidden />
          <div>
            <strong>{flag.title}</strong>
            <p>{flag.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsList({ news }: { news: NewsItem[] }) {
  if (!news.length) {
    return <p className="muted">No cited news items were collected for this run.</p>;
  }

  return (
    <div className="news-list">
      {news.map((item) => (
        <article className="news-card" key={item.id}>
          <div>
            <span>{item.impact}</span>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <small>
              {item.publisher} - {new Date(item.publishedAt).toLocaleDateString()}
            </small>
          </div>
          <a href={item.url} target="_blank" rel="noreferrer">
            Read source <ExternalLink size={14} aria-hidden />
          </a>
        </article>
      ))}
    </div>
  );
}

function NewsPipelineSources() {
  return (
    <section className="news-pipeline">
      <div>
        <p className="eyebrow">Future news pipeline</p>
        <h3>Reliable mining news sources to connect</h3>
        <p>
          These sources are good candidates for the next news adapter so each company page can aggregate issuer releases,
          sector headlines, and catalyst updates in one place.
        </p>
      </div>
      <div className="news-source-grid">
        {NEWS_PIPELINE_SOURCES.map((source) => (
          <a href={source.url} target="_blank" rel="noreferrer" key={source.name}>
            <span className="news-source-logo" aria-label={`${source.name} news source logo`}>
              {source.logo}
            </span>
            <span>
              <strong>{source.name}</strong>
              <small>{source.use}</small>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function ShareOwnershipPie({ run }: { run: ResearchRunResponse }) {
  const segments = [
    { label: "Public float", value: 52, color: "#2a7b6f" },
    { label: "Insiders", value: 14, color: "#b98d3b" },
    { label: "Strategic", value: 18, color: "#7b5ea8" },
    { label: "Institutional", value: 16, color: "#9a6542" }
  ];

  return (
    <div className="ownership-visual">
      <div
        className="ownership-pie"
        role="img"
        aria-label="Ownership distribution pie chart"
        style={{
          background: `conic-gradient(${segments
            .reduce<{ start: number; rules: string[] }>(
              (state, segment) => {
                const end = state.start + segment.value;
                state.rules.push(`${segment.color} ${state.start}% ${end}%`);
                state.start = end;
                return state;
              },
              { start: 0, rules: [] }
            )
            .rules.join(", ")})`
        }}
      >
        <span>{run.shareStructure.asOf === "Unavailable" ? "Model" : "Data"}</span>
      </div>
      <div className="ownership-legend">
        {segments.map((segment) => (
          <div key={segment.label}>
            <i style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <strong>{segment.value}%</strong>
          </div>
        ))}
      </div>
      <small>
        Visualization uses a placeholder split until current ownership data is complete. Do not treat it as filed ownership.
      </small>
    </div>
  );
}

function ReportNav({ activeTab, onChange }: { activeTab: ReportTab; onChange: (tab: ReportTab) => void }) {
  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: "scorecard", label: "Investment Quality" },
    { id: "lenses", label: "Market Perspectives" },
    { id: "management", label: "Management" },
    { id: "risks", label: "Risks" },
    { id: "news", label: "News" },
    { id: "shares", label: "Shares" },
    { id: "financials", label: "Financials" },
    { id: "sources", label: "Sources" }
  ];

  return (
    <nav className="section-nav" aria-label="Report sections">
      {tabs.map((tab) => (
        <button
          type="button"
          className={activeTab === tab.id ? "active" : ""}
          aria-current={activeTab === tab.id ? "page" : undefined}
          key={tab.id}
          aria-label={tab.id === "shares" ? "Share structure" : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function SummaryCards({ run }: { run: ResearchRunResponse }) {
  const unknowns = run.memo.sections.filter((section) => section.status === "unknown").length;
  return (
    <div className="summary-grid">
      <div className="summary-card">
        <span>Quality rating</span>
        <strong>{run.scorecard.overall}</strong>
        <small>{run.scorecard.confidence} evidence confidence</small>
      </div>
      <div className="summary-card">
        <span>Perspectives</span>
        <strong>{run.investorLenses.length}</strong>
        <small>named investor frameworks</small>
      </div>
      <div className="summary-card">
        <span>Red flags</span>
        <strong>{run.redFlags.length}</strong>
        <small>items to verify before conviction</small>
      </div>
      <div className="summary-card">
        <span>Unknowns</span>
        <strong>{unknowns}</strong>
        <small>sections preserving missing evidence</small>
      </div>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("USGO");
  const [run, setRun] = useState<ResearchRunResponse | null>(null);
  const [history, setHistory] = useState<ResearchRun[]>([]);
  const [suggestions, setSuggestions] = useState<CompanyCandidate[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTab>("scorecard");
  const [selectedHorizon, setSelectedHorizon] = useState<TimelineHorizon>("1Y");
  const [adaptersOpen, setAdaptersOpen] = useState(false);
  const [importedSources, setImportedSources] = useState<ManualSourceDraft[]>([]);
  const [focusedSearch, setFocusedSearch] = useState<"sticky" | "hero" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const researchRequest = useRef<AbortController | null>(null);
  const reportHeading = useRef<HTMLHeadingElement>(null);

  async function loadHistory() {
    try {
      setHistory(await fetchResearchHistory());
    } catch {
      // History is supplementary; its availability must not discard a report.
    }
  }

  useEffect(() => {
    void loadHistory();
    return () => researchRequest.current?.abort();
  }, []);

  useEffect(() => { reportHeading.current?.focus(); }, [run]);

  useEffect(() => {
    const trimmed = query.trim();
    setSuggestions([]);
    if (!trimmed) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const matches = await searchCompanyCandidates(trimmed, controller.signal);
        if (!controller.signal.aborted) setSuggestions(matches);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, 120);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  async function runResearch(nextQuery = query) {
    if (researchRequest.current || !nextQuery.trim()) return;
    const controller = new AbortController();
    researchRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const nextRun = await requestResearchRun(nextQuery, importedSources, controller.signal);
      if (controller.signal.aborted) return;
      setRun(nextRun);
      setQuery(nextQuery);
      setActiveTab("scorecard");
      setSelectedHorizon("1Y");
      setSuggestions([]);
      setFocusedSearch(null);
      void loadHistory();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Research run failed");
    } finally {
      if (researchRequest.current === controller) {
        researchRequest.current = null;
        setLoading(false);
      }
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await runResearch();
  }

  function goHome() {
    researchRequest.current?.abort();
    researchRequest.current = null;
    setLoading(false);
    setRun(null);
    setActiveTab("scorecard");
    setSuggestions([]);
    setFocusedSearch(null);
    setError(null);
  }

  function pickCompany(company: CompanyCandidate) {
    setQuery(company.ticker);
    setSuggestions([]);
    setFocusedSearch(null);
  }

  return (
    <main className="app-shell">
      <div className="app-chrome">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <p className="eyebrow">Private Research OS</p>
            <h1>Junior Mining Analyst Workbench</h1>
          </div>
          {run ? (
            <button type="button" className="home-button" onClick={goHome}>
              Home
            </button>
          ) : null}
        </div>
      </header>

      {!run ? (
        <div className="sticky-search-shell">
          <div className="sticky-search-inner">
            <CompanySearchPanel
              idPrefix="sticky"
              query={query}
              suggestions={suggestions}
              loading={loading}
              compact
              showHelper={false}
              showSuggestions={focusedSearch === "sticky"}
              onSubmit={onSubmit}
              onQueryChange={setQuery}
              onFocus={() => setFocusedSearch("sticky")}
              onPick={pickCompany}
            />
          </div>
        </div>
      ) : null}

      {run ? <ReportNav activeTab={activeTab} onChange={setActiveTab} /> : null}
      </div>

      <section className={`hero ${run ? "research-hero" : ""}`}>
        <div className="topbar" aria-hidden="true" />

        {!run ? (
          <div className="hero-grid">
            <div className="hero-copy">
              <h2>Turn junior mining names into cited, long-form diligence.</h2>
              <p>
                Search a ticker or company and build a structured research workspace around the issuer. The app
                organizes project quality, capital structure, catalysts, management, share ownership, news flow,
                market perspectives, and unresolved diligence items into one readable view so you can decide what to
                verify next before putting capital at risk.
              </p>
              <div className="hero-metrics">
                <span>Canada/US universe</span>
                <span>3 investor frameworks</span>
                <span>citation-first analysis</span>
              </div>
            </div>

            <CompanySearchPanel
              idPrefix="hero"
              query={query}
              suggestions={suggestions}
              loading={loading}
              error={error}
              showSuggestions={focusedSearch === "hero"}
              onSubmit={onSubmit}
              onQueryChange={setQuery}
              onFocus={() => setFocusedSearch("hero")}
              onPick={pickCompany}
            />
            <ExplorationGrid loading={loading} onResearch={(company) => void runResearch(company.ticker)} />
            <div className="home-import-panel">
              <SourceImportPanel
                importedSources={importedSources}
                onAdd={(source) => setImportedSources((sources) => [...sources, source])}
                onClear={() => setImportedSources([])}
              />
            </div>
          </div>
        ) : null}
      </section>

      {run ? (
      <section className="layout">
        <aside className="sidebar">
          <div className="panel">
            <h2>
              <Database size={18} aria-hidden /> Research Data
            </h2>
            <p className="muted">
              {history.length ? `${history.length} report run${history.length === 1 ? "" : "s"} in this session.` : "Run a report to inspect source coverage."}
            </p>
            <button
              type="button"
              className="adapter-toggle"
              aria-expanded={adaptersOpen}
              onClick={() => setAdaptersOpen((value) => !value)}
            >
              <span>Data adapters</span>
              <ChevronDown size={18} aria-hidden />
            </button>
            {adaptersOpen ? (
              <div className="adapter-list">
                {(run?.adapters ?? []).map((adapter) => (
                  <div className="adapter" key={adapter.id}>
                    <strong>{adapter.name}</strong>
                    <span>{statusLabel[adapter.status]}</span>
                    <p>{adapter.note}</p>
                  </div>
                ))}
                {!run?.adapters?.length ? <p className="muted">No adapter status available yet.</p> : null}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="workspace">
          {error ? <div className="error" role="alert">{error}</div> : null}
          <>
              <section className="report-header">
                <div>
                  <p className="eyebrow">
                    {run.company.ticker} - {run.company.exchange} - {run.company.commodityFocus.join(", ")}
                  </p>
                  <h2 ref={reportHeading} tabIndex={-1}>{run.memo.title}</h2>
                  <p>
                    A sourced, research-guide view of long-term feasibility. The overview combines project identity,
                    jurisdiction, commodity exposure, market-data readiness, and unresolved diligence items before the
                    detailed sections so the company profile reads like the front page of an investment workspace.
                  </p>
                  <div className="company-overview">
                  <p>{run.company.description ?? "Company description unavailable from the current source set."}</p>
                  <p>
                      The current profile frames {run.company.name} as a {run.company.stage?.toLowerCase() ?? "junior mining"} issuer with
                      {` ${run.company.commodityFocus.join("/")} `} exposure in {run.company.jurisdiction ?? run.company.country}. Treat
                      this overview as a starting map for diligence: the app still needs current filings,
                      current ownership, and technical-report extraction before high-conviction scoring is appropriate.
                  </p>
                    <dl>
                      <div>
                        <dt>Projects</dt>
                        <dd>{run.company.projects?.join(", ") ?? unavailable}</dd>
                      </div>
                      <div>
                        <dt>Jurisdiction</dt>
                        <dd>{run.company.jurisdiction ?? run.company.country}</dd>
                      </div>
                    </dl>
                    {run.company.websiteUrl ? (
                      <a href={run.company.websiteUrl} target="_blank" rel="noreferrer">
                        Company website <ExternalLink size={14} aria-hidden />
                      </a>
                    ) : (
                      <span className="muted">Company website unavailable.</span>
                    )}
                  </div>
                </div>
                <div className="overall-score">
                  <div className="overall-score-top">
                    <span>Overall feasibility</span>
                    <strong>{run.scorecard.overall}</strong>
                  </div>
                  <div className="quality-scale" aria-label={`Overall feasibility ${run.scorecard.overall}`}>
                    <span style={{ width: `${run.scorecard.overall}%` }} />
                  </div>
                  <small>Evidence adjusted - {run.scorecard.confidence} confidence</small>
                  <p>Project, financing, evidence, catalyst, jurisdiction, and optionality blend.</p>
                </div>
              </section>

              {activeTab === "scorecard" ? (
                <>
                  <MarketSnapshotPanel snapshot={run.marketSnapshot} />
                  <SummaryCards run={run} />
                  <ConfidenceBuilderPanel run={run} />
                  <TimelineSelector run={run} selectedHorizon={selectedHorizon} onChange={setSelectedHorizon} />
                  <section className="panel score-panel">
                    <h2>
                      <BarChart3 size={18} aria-hidden /> Investment Quality
                    </h2>
                    <div className="score-list">
                      {run.scorecard.categories.map((category) => (
                        <ScoreBar category={category} key={category.key} />
                      ))}
                    </div>
                  </section>
                  <div className="quality-support-stack">
                    <ResearchCollectionStatusPanel run={run} />
                    <ScoringMethodologyPanel run={run} />
                  </div>
                </>
              ) : null}

              {activeTab === "lenses" ? (
                <>
                  <section className="panel lens-section" aria-label="Analyst and investor viewpoints">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Analyst and investor viewpoints</p>
                        <h2>
                          <Brain size={18} aria-hidden /> Market Perspectives
                        </h2>
                      </div>
                      <p>
                        Compare synthesized investor-style frameworks. Named investor cards are analytical lenses, not
                        claims of current ownership or endorsement.
                      </p>
                    </div>
                    <div className="lens-list">
                      {run.investorLenses.map((lens) => (
                        <LensCard lens={lens} key={lens.id} />
                      ))}
                    </div>
                  </section>
                  <section className="panel forecast-section" aria-label="Broker and market coverage">
                    <AnalystForecastPanel forecast={run.analystForecast} marketSnapshot={run.marketSnapshot} />
                  </section>
                </>
              ) : null}

              {activeTab === "management" ? (
                <section className="panel management-section">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">People behind the project</p>
                      <h2>
                        <Users size={18} aria-hidden /> Management Team
                      </h2>
                      <h3>Track record</h3>
                    </div>
                    <p>
                      Junior miners are highly dependent on judgment, financing discipline, and technical execution. This
                      section highlights the people to verify before raising conviction.
                    </p>
                  </div>
                  <div className="management-intel">
                    <div>
                      <h3>Management intelligence</h3>
                      <p>{run.managementEvidence?.summary ?? "Management evidence has not been enriched for this run yet."}</p>
                    </div>
                    <div className="management-signal-grid">
                      {(run.managementEvidence?.confidenceSignals ?? []).map((signal) => (
                        <article className={`management-signal ${signal.status}`} key={signal.id}>
                          <span>{signal.status}</span>
                          <strong>{signal.label}</strong>
                          <p>{signal.detail}</p>
                        </article>
                      ))}
                    </div>
                    {run.managementEvidence?.gaps?.length ? (
                      <div className="management-gaps">
                        <h4>Open diligence gaps</h4>
                        <ul>
                          {run.managementEvidence.gaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  {[
                    ["executive", "Executives"],
                    ["board", "Board"],
                    ["technical", "Technical Team"],
                    ["advisor", "Advisors"],
                    ["project_lead", "Project Leads"]
                  ].map(([group, label]) => {
                    const people = run.management.filter((person) => (person.group ?? "project_lead") === group);
                    if (!people.length) return null;
                    return (
                      <div className="management-group" key={group}>
                        <h3>{label}</h3>
                        <div className="management-grid">
                          {people.map((person) => {
                            const highlights = managementHighlights(person);
                            return (
                              <details className="management-card" key={`${person.name}-${person.role}`}>
                                <summary className="management-card-summary">
                                  <div className="management-card-head">
                                    <div>
                                      <span>{person.role}</span>
                                      <h3>{person.name}</h3>
                                    </div>
                                    <div className="management-initials" aria-hidden>
                                      {person.profileImageUrl ? (
                                        <img src={person.profileImageUrl} alt="" loading="lazy" />
                                      ) : (
                                        person.name
                                          .split(" ")
                                          .map((part) => part[0])
                                          .join("")
                                          .slice(0, 2)
                                      )}
                                    </div>
                                  </div>
                                  <div className="management-badges">
                                    <span>{person.sourceStatus === "issuer" ? "Issuer sourced" : person.sourceStatus === "filing" ? "Filing sourced" : person.sourceStatus === "candidate" ? "Candidate source" : "Needs source"}</span>
                                    <span>{person.linkedInStatus === "verified" ? "LinkedIn verified" : person.linkedInStatus === "likely_match" ? "LinkedIn likely match" : "LinkedIn needs review"}</span>
                                  </div>
                                  <div className="management-highlights">
                                    <span>Key background</span>
                                    <ul>
                                      {highlights.map((item) => (
                                        <li key={`${item.label}-${item.value}`}>
                                          <strong>{item.label}:</strong> {item.value}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <span className="profile-expand-label">Read full profile</span>
                                </summary>
                                <div className="management-card-body">
                                  <p className="management-bio">{person.bio}</p>
                                  <div className="management-experience">
                                    <h4>Experience</h4>
                                    <ul>
                                      {person.experience.map((item) => (
                                        <li key={item}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  {person.trackRecord?.length ? (
                                    <div className="management-track-record">
                                      <h4>Track-record signals</h4>
                                      <ul>
                                        {person.trackRecord.map((item) => (
                                          <li key={item}>{item}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                  <div className="management-diligence">
                                    <h4>Diligence checklist</h4>
                                    <ul>
                                      {(person.openQuestions ?? [
                                        "Confirm prior company outcomes and whether projects advanced beyond promotion.",
                                        "Review insider ownership, option grants, and personal capital at risk.",
                                        "Compare stated milestones with delivered drilling, financing, and permitting progress."
                                      ]).map((item) => (
                                        <li key={item}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div className="management-links">
                                    {person.linkedInUrl && (person.linkedInStatus === "verified" || person.linkedInStatus === "likely_match") ? (
                                      <a href={person.linkedInUrl} target="_blank" rel="noreferrer">
                                        {person.linkedInStatus === "verified" ? "LinkedIn" : "Likely LinkedIn"} <ExternalLink size={14} aria-hidden />
                                      </a>
                                    ) : (
                                      <span>LinkedIn needs review</span>
                                    )}
                                    {person.sourceUrl ? (
                                      <a href={person.sourceUrl} target="_blank" rel="noreferrer">
                                        Source profile <ExternalLink size={14} aria-hidden />
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </section>
              ) : null}

              {activeTab === "risks" ? (
                <section className="risk-layout">
                  <div className="panel">
                    <h2>Red Flags</h2>
                    <RedFlagList flags={run.redFlags} />
                  </div>
                  <div className="panel">
                    <h2>
                      <Sparkles size={18} aria-hidden /> Follow-up Focus
                    </h2>
                    {run.memo.sections
                      .filter((section) => ["questions", "catalysts", "capital"].includes(section.id))
                      .map((section) => (
                        <article className="focus-item" key={section.id}>
                          <strong>{section.title}</strong>
                          <p>{section.body}</p>
                        </article>
                      ))}
                  </div>
                  <div className="panel risk-scenarios">
                    <h2>
                      <AlertTriangle size={18} aria-hidden /> Risk Scenarios
                    </h2>
                    <p>
                      These scenarios frame what must happen for the thesis to keep improving, and where a junior miner can
                      fall short even when the headline story still sounds attractive.
                    </p>
                    <h3>What must go right</h3>
                    <div className="scenario-grid">
                      {run.riskScenarios.map((scenario) => (
                        <article className="scenario-card" key={scenario.id}>
                          <div className="scenario-meta">
                            <span>{scenario.timeframe}</span>
                            <span>
                              {scenario.probability} probability / {scenario.impact} impact
                            </span>
                          </div>
                          <h3>{scenario.title}</h3>
                          <p>{scenario.summary}</p>
                          <div className="two-column compact">
                            <div>
                              <h4>Upside requirements</h4>
                              <ul>
                                {scenario.whatMustGoRight.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4>Where it could fall short</h4>
                              <ul>
                                {scenario.whereItCouldFallShort.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {activeTab === "news" ? (
                <section className="panel news-section">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Catalysts and market-moving updates</p>
                      <h2>
                        <Newspaper size={18} aria-hidden /> News and Catalysts
                      </h2>
                    </div>
                    <p>
                      Junior miners can move sharply on drilling, permitting, financing, and technical updates. Review
                      summaries first, then open the original source.
                    </p>
                  </div>
                  <NewsList news={run.news} />
                  <NewsPipelineSources />
                </section>
              ) : null}

              {activeTab === "shares" ? (
                <section className="panel share-section">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Ownership and dilution</p>
                      <h2>
                        <PieChart size={18} aria-hidden /> Share Structure
                      </h2>
                    </div>
                    <p>
                      Ownership data helps separate project upside from per-share upside. Treat missing figures as diligence
                      items until current filings and issuer presentations are ingested.
                    </p>
                  </div>
                  <div className="share-grid">
                    <div className="share-card">
                      <span>Shares outstanding</span>
                      <strong>{run.shareStructure.sharesOutstanding ?? unavailable}</strong>
                    </div>
                    <div className="share-card">
                      <span>Public float</span>
                      <strong>{run.shareStructure.publicFloat ?? unavailable}</strong>
                    </div>
                    <div className="share-card">
                      <span>Insider ownership</span>
                      <strong>{run.shareStructure.insiderOwnership ?? unavailable}</strong>
                    </div>
                    <div className="share-card">
                      <span>Institutional ownership</span>
                      <strong>{run.shareStructure.institutionalOwnership ?? unavailable}</strong>
                    </div>
                    <div className="share-card">
                      <span>Strategic ownership</span>
                      <strong>{run.shareStructure.strategicOwnership ?? unavailable}</strong>
                    </div>
                    <div className="share-card wide">
                      <span>Float quality</span>
                      <p>{run.shareStructure.floatQuality}</p>
                    </div>
                  </div>
                  <ShareOwnershipPie run={run} />
                  <div className="share-notes">
                    <h3>Investor checks</h3>
                    <ul>
                      {run.shareStructure.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                    <small>As of: {run.shareStructure.asOf}</small>
                    {run.shareStructure.sourceUrl ? (
                      <a href={run.shareStructure.sourceUrl} target="_blank" rel="noreferrer">
                        Ownership source path <ExternalLink size={14} aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {activeTab === "financials" ? <FinancialSnapshotPanel snapshot={run.financialSnapshot} /> : null}

              {activeTab === "sources" ? (
                <section className="panel source-section">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Evidence base</p>
                      <h2>Sources</h2>
                    </div>
                    <p>Each source card links to the evidence used by the scoring, news, risk, management, and investor-lens sections.</p>
                  </div>
                  <SourceQualitySummary run={run} />
                  <SourceList sources={run.sources} />
                  <SourceImportPanel
                    importedSources={importedSources}
                    onAdd={(source) => setImportedSources((sources) => [...sources, source])}
                    onClear={() => setImportedSources([])}
                  />
                  <button type="button" className="rerun-button" onClick={() => void runResearch(run.company.ticker)} disabled={loading}>
                    {loading ? "Running" : "Rerun with imported sources"}
                  </button>
                </section>
              ) : null}
            </>
        </section>
      </section>
      ) : null}
    </main>
  );
}
