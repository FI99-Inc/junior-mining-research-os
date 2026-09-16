import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { createResearchRun } from "../src/domain/researchEngine";
import { resolveCompany } from "../src/domain/companyResolver";
import { sourceAdapterStatuses } from "../src/domain/sourceAdapters";
import { createDemoResearchRun } from "../server/demoFixture";
import { syntheticResearchSources } from "./fixtures/syntheticEvidence";

describe("App", () => {
  afterEach(cleanup);

  it("shows the persistent fictional-data warning when the API reports demo mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/health")) {
          return Response.json({
            status: "ok",
            mode: "demo",
            demoNotice: "Demo data — fictional and not investment research"
          });
        }
        if (url.includes("/api/companies")) {
          return Response.json([
            {
              id: "aeon-ridge-minerals-demo",
              name: "Aeon Ridge Minerals Ltd.",
              ticker: "AEON.V",
              exchange: "TSXV",
              country: "CA",
              commodityFocus: ["Gold", "Copper"]
            }
          ]);
        }
        if (url.endsWith("/api/research-runs") && init?.method === "POST") {
          return Response.json(createDemoResearchRun());
        }
        return Response.json([]);
      })
    );

    render(<App />);

    const notice = await screen.findByText("Demo data — fictional and not investment research");
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.getAllByRole("button", { name: /research aeon\.v/i })).toHaveLength(1);
    expect(notice).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /research aeon\.v/i }));
    await screen.findByRole("heading", { name: "Aeon Ridge Minerals Ltd." });
    expect(screen.getByText("Demo data — fictional and not investment research")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /share structure/i }));
    const ownershipChart = screen.getByRole("img", { name: /ownership distribution/i }).parentElement!;
    expect(within(ownershipChart).getByText("67%")).toBeInTheDocument();
    expect(within(ownershipChart).getByText("8%")).toBeInTheDocument();
    expect(within(ownershipChart).getByText("15%")).toBeInTheDocument();
    expect(within(ownershipChart).getByText("10%")).toBeInTheDocument();
  });

  it("generates a single-stock research memo with scorecard, lenses, sources, and history", async () => {
    const company = resolveCompany("USGO");
    if (!company) throw new Error("Missing test company");
    const sources = syntheticResearchSources();
    const run = {
      ...createResearchRun(company, sources, "USGO"),
      evidenceFacts: [
        {
          id: "fact-test-technical-report",
          category: "technical_report",
          label: "Technical report / project disclosure",
          value: "Technical report evidence was discovered automatically.",
          sourceId: sources[0].id,
          sourceUrl: sources[0].url,
          sourceTitle: sources[0].title,
          excerpt: "Technical report evidence was discovered automatically.",
          confidence: "medium",
          retrievedAt: "2026-07-03T12:00:00.000Z"
        }
      ],
      evidenceStatus: {
        mode: "automated",
        summary: "1 of 17 evidence categories have cited automated evidence.",
        adapters: [
          {
            id: "sec-edgar-live",
            name: "SEC EDGAR filing retrieval",
            status: "configured",
            note: "Resolved CIK and discovered recent SEC filings.",
            contributes: ["recent filing URLs"],
            missing: ["full filing text extraction"]
          }
        ],
        categories: [
          { id: "technical_report", label: "Technical report / project disclosure", status: "found", factCount: 1 },
          { id: "fully_diluted_shares", label: "Fully diluted shares", status: "missing", factCount: 0 }
        ],
        gaps: ["Fully diluted shares"],
        updatedAt: "2026-07-03T12:00:00.000Z"
      }
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/research-runs") && init?.method === "POST") {
          return Response.json({ ...run, adapters: sourceAdapterStatuses(company) });
        }
        if (url.endsWith("/api/research-runs")) {
          return Response.json([run]);
        }
        return Response.json([]);
      })
    );

    render(<App />);
    expect(screen.getByRole("banner")).toHaveClass("app-header");
    expect(screen.getByTestId("sticky-search")).toHaveClass("compact-search");
    expect(screen.getByTestId("hero-search")).toBeInTheDocument();
    expect(screen.getByText(/Explore companies/i)).toBeInTheDocument();
    expect(screen.getByText("3 analytical frameworks")).toBeInTheDocument();
    expect(screen.queryByText("3 investor frameworks")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /research/i }).length).toBeGreaterThanOrEqual(10);

    const tickerInputs = screen.getAllByLabelText(/ticker or company/i);
    await userEvent.clear(tickerInputs[0]);
    await userEvent.type(tickerInputs[0], "USGO");
    await userEvent.click(screen.getAllByRole("button", { name: /run research/i })[0]);

    await waitFor(() => expect(screen.getByRole("heading", { name: "US GoldMining Inc." })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "US GoldMining Inc." })).toBeInTheDocument();
    expect(screen.queryByText(/Explore companies/i)).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toContainElement(screen.getByRole("button", { name: /home/i }));
    expect(screen.getByRole("navigation", { name: /report sections/i })).not.toContainElement(screen.getByRole("button", { name: /home/i }));
    expect(screen.queryByText(/Research guide/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Strict citations/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /investment quality/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /decision brief/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^memo$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^scorecard$/i })).not.toBeInTheDocument();
    expect(screen.queryByText("US GoldMining Inc. Analyst Memo")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Overall feasibility/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Evidence adjusted/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Whistler/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /company website/i })).toBeInTheDocument();
    expect(screen.queryByText(/Rick Rule/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved Research/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /data adapters/i })).toBeInTheDocument();
    expect(screen.queryByText(/SEC EDGAR APIs/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Market snapshot/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Research Collection Status/i })).toBeInTheDocument();
    expect(screen.getByText(/Click to review adapters/i)).toBeInTheDocument();
    expect(screen.queryByText(/SEC EDGAR filing retrieval/i)).not.toBeVisible();
    expect(screen.getAllByText(/Current price/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/52-week high/i)).toBeInTheDocument();
    expect(screen.getByText(/52-week low/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Shares outstanding/i).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /asset quality details/i }));
    expect(screen.getByText(/What drove this score/i)).toBeInTheDocument();
    expect(screen.getByText(/Positive evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Negative evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/What would improve this rating/i)).toBeInTheDocument();
    expect(screen.getByText(/What would reduce this rating/i)).toBeInTheDocument();
    expect(screen.getByText(/Scoring methodology/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /NI 43-101/i })).not.toBeVisible();
    await userEvent.click(screen.getByText(/Research Collection Status/i));
    expect(screen.getByText(/SEC EDGAR filing retrieval/i)).toBeVisible();
    expect(screen.getAllByText(/Technical report \/ project disclosure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fully diluted shares/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByText(/Junior Mining Feasibility Framework/i));
    expect(screen.getByRole("link", { name: /NI 43-101/i })).toBeVisible();
    expect(screen.getByLabelText(/Feasibility timeline/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText("3Y"));
    await userEvent.click(screen.getByRole("button", { name: /5Y/i }));
    expect(screen.getAllByText(/Five-year/i).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /market perspectives/i }));
    expect(screen.queryByText(/^Score$/i)).not.toBeInTheDocument();
    const investorRegion = screen.getByRole("region", { name: /Analytical frameworks/i });
    const brokerRegion = screen.getByRole("region", { name: /Broker and market coverage/i });
    expect(investorRegion).not.toHaveTextContent(/Analyst Forecast/i);
    expect(brokerRegion).toHaveTextContent(/Analyst Forecast/i);
    expect(screen.getByRole("heading", { name: /Analyst Forecast/i })).toBeInTheDocument();
    expect(screen.getByText(/Analyst target data was not available/i)).toBeInTheDocument();
    expect(within(investorRegion).queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Analyst forecast chart/i })).toBeInTheDocument();
    expect(screen.getByText(/Awaiting target data/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Contrarian and downside-survival lens/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Discovery and sponsorship lens/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Macro, jurisdiction, and capital-scarcity lens/i })).toBeInTheDocument();
    expect(screen.queryByText(/Rick Rule|Eric Sprott|Marin Katusa/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Contrarian and downside-survival lens/i }));
    expect(screen.getByText(/How to apply this framework/i)).toBeInTheDocument();
    expect(screen.getByText(/resource-cycle investing/i)).toBeInTheDocument();
    expect(screen.getByText(/Framework checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/Figures to watch/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /news/i }));
    expect(screen.getByText(/News and Catalysts/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read source/i })).toBeInTheDocument();
    expect(screen.getByText(/External mining-news references/i)).toBeInTheDocument();
    expect(screen.getByText(/not automated feeds/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Junior Mining Network/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TMX Newsfile/i })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/news source logo/i).length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/Transparent Scorecard/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /management/i }));
    expect(screen.getByText(/Management Team/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Track record/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Management intelligence/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Profile link supplied|Profile link discovered|Profile link unavailable/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/LinkedIn verified|LinkedIn likely match|LinkedIn needs review/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Key background/i).length).toBeGreaterThan(0);
    const firstBackground = screen.getAllByText(/Key background/i)[0].closest(".management-highlights") as HTMLElement | null;
    if (!firstBackground) throw new Error("Missing management highlights");
    expect(within(firstBackground).getByText(/Specialty:/i)).toBeInTheDocument();
    expect(within(firstBackground).queryByText(/\.\.\./)).not.toBeInTheDocument();
    screen.queryAllByText(/Diligence checklist/i).forEach((item) => expect(item).not.toBeVisible());
    await userEvent.click(screen.getAllByText(/Read full profile/i)[0]);
    expect(screen.getAllByText(/Diligence checklist/i)[0]).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Public profile link/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Coffee Gold Deposit/i).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /share structure/i }));
    expect(screen.getByText(/Share Structure/i)).toBeInTheDocument();
    expect(screen.getByText(/Insider ownership/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ownership distribution pie chart/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /financials/i }));
    expect(screen.getByRole("region", { name: /Company financial snapshot/i })).toBeInTheDocument();
    expect(screen.getByText(/Company Financials/i)).toBeInTheDocument();
    expect(screen.getAllByText(/EBITDA/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Free cash flow/i).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /risks/i }));
    expect(screen.getByText(/Risk Scenarios/i)).toBeInTheDocument();
    expect(screen.getByText(/What must go right/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Sources$/i }));
    expect(screen.getByText(/Evidence quality/i)).toBeInTheDocument();
    expect(screen.getByText(/Needs evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Source coverage/i)).toBeInTheDocument();
    expect(screen.queryByText(/Analyst Memo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Decision Brief/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /home/i }));
    expect(screen.getByText(/Explore companies/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "US GoldMining Inc." })).not.toBeInTheDocument();
  });

  it("shows company suggestions while typing a ticker or company name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/companies")) {
          return Response.json([
            {
              id: "us-gold-mining",
              name: "US GoldMining Inc.",
              ticker: "USGO",
              exchange: "NASDAQ",
              country: "US",
              commodityFocus: ["Gold", "Copper"]
            }
          ]);
        }
        return Response.json([]);
      })
    );

    render(<App />);
    const tickerInputs = screen.getAllByLabelText(/ticker or company/i);
    await userEvent.clear(tickerInputs[0]);
    await userEvent.type(tickerInputs[0], "U");

    await waitFor(() => expect(screen.getByRole("option", { name: /USGO/i })).toBeInTheDocument());
  });

  it("sends imported issuer evidence with a research request", async () => {
    const company = resolveCompany("USGO");
    if (!company) throw new Error("Missing test company");
    const sources = syntheticResearchSources();
    const run = createResearchRun(
      company,
      [
        ...sources,
        {
          id: "manual-usgo-technical-report",
          title: "Whistler Technical Report",
          sourceType: "manual",
          publisher: "Issuer document import",
          url: "https://example.com/technical-report.pdf",
          retrievedAt: "2026-06-30T12:00:00.000Z",
          excerpts: [
            "The technical report includes a mineral resource estimate, metallurgy, working capital, cash balance, fully diluted shares, warrants, options, insider ownership, and a dated catalyst calendar."
          ]
        }
      ],
      "USGO"
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/research-runs") && init?.method === "POST") {
        return Response.json({ ...run, adapters: sourceAdapterStatuses(company) });
      }
      if (url.endsWith("/api/research-runs")) {
        return Response.json([]);
      }
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await userEvent.type(screen.getAllByLabelText(/issuer document title/i)[0], "Whistler Technical Report");
    await userEvent.type(screen.getAllByLabelText(/source URL/i)[0], "https://example.com/technical-report.pdf");
    await userEvent.type(
      screen.getAllByLabelText(/evidence text/i)[0],
      "technical report mineral resource estimate metallurgy working capital cash balance fully diluted shares warrants options insider ownership dated catalyst calendar"
    );
    await userEvent.click(screen.getAllByRole("button", { name: /add source/i })[0]);
    expect(screen.getByText(/1 imported issuer source/i)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /run research/i })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/research-runs", expect.any(Object)));
    const request = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/api/research-runs") && init?.method === "POST");
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.[1]?.body));
    expect(body.manualSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Whistler Technical Report",
          url: "https://example.com/technical-report.pdf",
          excerpts: expect.arrayContaining([expect.stringContaining("technical report")])
        })
      ])
    );
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "US GoldMining Inc." }).length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByRole("button", { name: /^Sources$/i }).at(-1)!);
    expect(screen.getByRole("heading", { name: /Sources/i })).toBeInTheDocument();
  });
});
