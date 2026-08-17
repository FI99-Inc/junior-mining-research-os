import { describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";

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

describe("API app", () => {
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
