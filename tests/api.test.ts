import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { collectEvidence } from "../src/domain/evidencePipeline";
import { collectMarketData } from "../src/domain/sourceAdapters";

vi.mock("../src/domain/evidencePipeline", () => ({
  collectEvidence: vi.fn(async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").toISOString();
    return {
      sources: [
        {
          id: "test-evidence-source",
          title: "Test technical report and capital update",
          sourceType: "filing",
          publisher: "Test evidence adapter",
          url: "https://example.com/test-technical-report",
          retrievedAt: now,
          excerpts: [
            "Technical report, drill results, resource estimate, metallurgy, infrastructure, permitting, cash balance, shares outstanding, insider ownership, and management biography evidence."
          ]
        }
      ],
      facts: [
        {
          id: "test-fact-technical-report",
          category: "technical_report",
          label: "Technical report / project disclosure",
          value: "Technical report evidence found.",
          sourceId: "test-evidence-source",
          sourceUrl: "https://example.com/test-technical-report",
          sourceTitle: "Test technical report and capital update",
          excerpt: "Technical report evidence found.",
          confidence: "medium",
          retrievedAt: now
        }
      ],
      status: {
        mode: "automated",
        summary: "1 of 17 evidence categories have cited automated evidence.",
        adapters: [
          {
            id: "sec-edgar-live",
            name: "SEC EDGAR automated discovery",
            status: "configured",
            note: "Test SEC evidence adapter.",
            contributes: ["recent filing URLs"],
            missing: []
          }
        ],
        categories: [
          {
            id: "technical_report",
            label: "Technical report / project disclosure",
            status: "found",
            factCount: 1
          }
        ],
        gaps: [],
        updatedAt: now
      },
      gaps: []
    };
  })
}));

vi.mock("../src/domain/sourceAdapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/domain/sourceAdapters")>();
  return {
    ...actual,
    collectMarketData: vi.fn(async (company) => ({
      marketSnapshot: company.marketSnapshot,
      supplemental: {}
    }))
  };
});

async function withApi(test: (baseUrl: string) => Promise<void>) {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server port");
  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function postResearch(baseUrl: string, body: string | undefined) {
  return fetch(`${baseUrl}/api/research-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
}

describe("API app", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.mocked(collectEvidence).mockReset();
    vi.mocked(collectMarketData).mockReset();
  });

  it.each([
    ["missing body", undefined],
    ["missing query", "{}"],
    ["null query", JSON.stringify({ query: null })],
    ["numeric query", JSON.stringify({ query: 123 })],
    ["boolean query", JSON.stringify({ query: true })],
    ["array query", JSON.stringify({ query: ["USGO"] })],
    ["object query", JSON.stringify({ query: { ticker: "USGO" } })],
    ["empty query", JSON.stringify({ query: "" })],
    ["whitespace query", JSON.stringify({ query: " \t\n " })]
  ])("returns JSON 400 for %s without starting adapters", async (_label, body) => {
    await withApi(async (baseUrl) => {
      const response = await postResearch(baseUrl, body);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ error: "Query must be a non-empty string." });
      expect(collectEvidence).not.toHaveBeenCalled();
      expect(collectMarketData).not.toHaveBeenCalled();
      expect(await (await fetch(`${baseUrl}/api/research-runs`)).json()).toEqual([]);
    });
  });

  it("returns a sanitized JSON 400 for malformed JSON", async () => {
    await withApi(async (baseUrl) => {
      const response = await postResearch(baseUrl, '{"query":"USGO","secret":"private-input",');
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ error: "Malformed JSON request body." });
      expect(collectEvidence).not.toHaveBeenCalled();
      expect(collectMarketData).not.toHaveBeenCalled();
    });
  });

  it.each([
    [100 * 1024, 200],
    [100 * 1024 + 1, 413]
  ])("preserves the JSON body limit: %i bytes returns JSON %i", async (size, status) => {
    const emptyBody = JSON.stringify({ query: "USGO", padding: "" });
    const body = JSON.stringify({ query: "USGO", padding: "x".repeat(size - Buffer.byteLength(emptyBody)) });
    expect(Buffer.byteLength(body)).toBe(size);

    await withApi(async (baseUrl) => {
      const response = await postResearch(baseUrl, body);
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain("application/json");
      if (status === 413) {
        expect(await response.json()).toEqual({ error: "JSON request body exceeds the 100kb limit." });
        expect(collectEvidence).not.toHaveBeenCalled();
        expect(collectMarketData).not.toHaveBeenCalled();
        expect(await (await fetch(`${baseUrl}/api/research-runs`)).json()).toEqual([]);
      } else {
        expect((await response.json()).company.ticker).toBe("USGO");
      }
    });
  });

  it.each(["evidence", "market"] as const)("sanitizes unexpected %s adapter rejections as JSON 500", async (adapter) => {
    const failure = new Error("Adapter failed: api_key=private-key", {
      cause: new Error("secret connection credentials")
    });
    failure.stack = "private-stack-trace";
    if (adapter === "evidence") vi.mocked(collectEvidence).mockRejectedValueOnce(failure);
    else vi.mocked(collectMarketData).mockRejectedValueOnce(failure);

    await withApi(async (baseUrl) => {
      const response = await postResearch(baseUrl, JSON.stringify({ query: "USGO" }));
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ error: "Unable to create research run." });
      expect(await (await fetch(`${baseUrl}/api/research-runs`)).json()).toEqual([]);
      const retry = await postResearch(baseUrl, JSON.stringify({ query: "USGO" }));
      expect(retry.status).toBe(200);
      expect((await retry.json()).company.ticker).toBe("USGO");
    });
  });

  it("starts evidence and market requests before either completes", async () => {
    let releaseEvidence!: () => void;
    let releaseMarket!: () => void;
    const evidenceGate = new Promise<void>((resolve) => { releaseEvidence = resolve; });
    const marketGate = new Promise<void>((resolve) => { releaseMarket = resolve; });
    const evidenceImplementation = vi.mocked(collectEvidence).getMockImplementation()!;
    const marketImplementation = vi.mocked(collectMarketData).getMockImplementation()!;
    vi.mocked(collectEvidence).mockImplementationOnce(async (...args) => {
      await evidenceGate;
      return evidenceImplementation(...args);
    });
    vi.mocked(collectMarketData).mockImplementationOnce(async (...args) => {
      await marketGate;
      return marketImplementation(...args);
    });

    await withApi(async (baseUrl) => {
      const request = postResearch(baseUrl, JSON.stringify({ query: "USGO" }));
      try {
        await vi.waitFor(() => {
          expect(collectEvidence).toHaveBeenCalledTimes(1);
          expect(collectMarketData).toHaveBeenCalledTimes(1);
        });
        expect(await (await fetch(`${baseUrl}/api/research-runs`)).json()).toEqual([]);
        releaseMarket();
        expect(await (await fetch(`${baseUrl}/api/research-runs`)).json()).toEqual([]);
        releaseEvidence();
        const response = await request;
        expect(response.status).toBe(200);
        expect((await response.json()).company.ticker).toBe("USGO");
      } finally {
        releaseEvidence();
        releaseMarket();
        await request;
      }
    });
  });

  it("preserves trimmed queries and tolerant manual source normalization", async () => {
    await withApi(async (baseUrl) => {
      const response = await postResearch(baseUrl, JSON.stringify({
        query: "  USGO  ",
        manualSources: [
          null, 7, {}, { title: "No excerpts" },
          { title: "  Imported disclosure  ", publisher: " ", url: " ", sourceType: "unknown", excerpts: [123, " ", " Cash balance "] },
          { title: 456, excerptText: "First paragraph\n\nSecond paragraph" }
        ]
      }));
      expect(response.status).toBe(200);
      const report = await response.json();
      expect(report.company.ticker).toBe("USGO");
      expect(report.sources.filter((source: { id: string }) => source.id.startsWith("manual-"))).toEqual([
        expect.objectContaining({ title: "Imported disclosure", publisher: "Issuer document import", url: "Manual source", sourceType: "manual", excerpts: ["123", "Cash balance"] }),
        expect.objectContaining({ title: "456", excerpts: ["First paragraph", "Second paragraph"] })
      ]);
      expect(report.adapters).toEqual(report.evidenceStatus.adapters);
    });
  });

  it.each([null, {}, "ignored"])("continues ignoring non-array manualSources: %j", async (manualSources) => {
    await withApi(async (baseUrl) => {
      const response = await postResearch(baseUrl, JSON.stringify({ query: "USGO", manualSources }));
      expect(response.status).toBe(200);
      expect((await response.json()).sources).toHaveLength(1);
    });
  });

  it("searches companies and creates a cited research run", async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server port");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const search = await fetch(`${baseUrl}/api/companies?q=snowline`);
      expect(search.ok).toBe(true);
      const companies = await search.json();
      expect(companies[0].ticker).toBe("SGD.V");

      const reportResponse = await fetch(`${baseUrl}/api/research-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "USGO" })
      });
      expect(reportResponse.ok).toBe(true);
      const report = await reportResponse.json();
      expect(report.company.ticker).toBe("USGO");
      expect(report.evidenceStatus.summary).toMatch(/evidence categories/i);
      expect(report.evidenceStatus.adapters).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/sec-edgar|company-website|newswire/) })])
      );
      expect(report.evidenceFacts).toEqual(
        expect.arrayContaining([expect.objectContaining({ sourceUrl: expect.any(String), excerpt: expect.any(String) })])
      );
      expect(report.memo.sections.some((section: { citationIds: string[] }) => section.citationIds.length > 0)).toBe(
        true
      );

      const historyResponse = await fetch(`${baseUrl}/api/research-runs`);
      const history = await historyResponse.json();
      expect(history).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("returns a clear 404 for unsupported tickers", async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server port");

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/research-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "NOPE" })
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Company not found in the V1 Canada/US junior-mining universe." });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("accepts issuer document evidence and uses it to improve confidence coverage", async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server port");

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/research-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "USGO",
          manualSources: [
            {
              title: "Whistler Technical Report and Capital Update",
              sourceType: "manual",
              publisher: "Issuer document import",
              url: "https://example.com/whistler-technical-report.pdf",
              excerpts: [
                "The technical report includes a mineral resource estimate, metallurgy, infrastructure access, permitting timeline, land tenure, and environmental baseline for the Whistler project.",
                "The issuer disclosed shares outstanding, fully diluted shares, warrants, options, insider ownership, working capital, cash balance, burn rate, and months of runway.",
                "Management biography disclosure includes prior discoveries, public-company financings, capital allocation history, and a dated catalyst calendar for drilling results and technical studies."
              ]
            }
          ]
        })
      });

      expect(response.ok).toBe(true);
      const report = await response.json();
      expect(report.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "Whistler Technical Report and Capital Update",
            publisher: "Issuer document import"
          })
        ])
      );
      expect(report.scorecard.evidenceAudit.missingCriticalCount).toBe(0);
      expect(report.scorecard.categories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "asset_quality", confidence: "high" }),
          expect.objectContaining({ key: "capital_structure", confidence: "high" }),
          expect.objectContaining({ key: "management", confidence: "medium" })
        ])
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
