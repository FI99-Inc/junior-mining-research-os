import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { collectEvidence } from "../src/domain/evidencePipeline";
import { collectMarketData } from "../src/domain/sourceAdapters";

vi.mock("../src/domain/evidencePipeline", () => ({
  collectEvidence: vi.fn(async () => {
    throw new Error("Live evidence must not run in demo mode");
  })
}));

vi.mock("../src/domain/sourceAdapters", () => ({
  collectMarketData: vi.fn(async () => {
    throw new Error("Live market data must not run in demo mode");
  })
}));

async function withApi(app: ReturnType<typeof createApp>, test: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server port");
  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function postResearch(baseUrl: string, query: string) {
  return fetch(`${baseUrl}/api/research-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
}

describe("offline demo mode", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("serves one deterministic fictional company without invoking live adapters", async () => {
    await withApi(createApp({ demoMode: true }), async (baseUrl) => {
      await expect(fetch(`${baseUrl}/api/health`).then((response) => response.json())).resolves.toEqual({
        status: "ok",
        mode: "demo",
        demoNotice: "Demo data — fictional and not investment research"
      });

      const companies = await fetch(`${baseUrl}/api/companies?q=`).then((response) => response.json());
      expect(companies).toEqual([
        expect.objectContaining({
          id: "aeon-ridge-minerals-demo",
          name: "Aeon Ridge Minerals Ltd.",
          ticker: "AEON.V"
        })
      ]);

      const firstResponse = await postResearch(baseUrl, "AEON.V");
      const secondResponse = await postResearch(baseUrl, "Aeon Ridge Minerals");
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      const firstRun = await firstResponse.json();
      const secondRun = await secondResponse.json();

      expect(secondRun).toEqual(firstRun);
      expect(firstRun.id).toBe("demo-aeon-ridge-2026-09-15");
      expect(firstRun.company.marketSnapshot).toEqual(expect.objectContaining({ status: "sourced", price: "$1.24" }));
      expect(firstRun.financialSnapshot).toEqual(expect.objectContaining({ status: "sourced", totalCash: "$18.4M" }));
      expect(firstRun.management.length).toBeGreaterThanOrEqual(3);
      expect(firstRun.news.length).toBeGreaterThan(0);
      expect(firstRun.riskScenarios.length).toBeGreaterThan(0);
      expect(firstRun.sources.length).toBeGreaterThan(0);
      expect(firstRun.sources.every((source: { url: string }) => new URL(source.url).hostname.endsWith("example.invalid"))).toBe(true);
      expect(JSON.stringify(firstRun)).toContain("Demo data — fictional and not investment research");
      expect(collectEvidence).not.toHaveBeenCalled();
      expect(collectMarketData).not.toHaveBeenCalled();
    });
  });

  it("keeps the fictional demo issuer out of normal live research", async () => {
    await withApi(createApp({ demoMode: false }), async (baseUrl) => {
      await expect(fetch(`${baseUrl}/api/health`).then((response) => response.json())).resolves.toEqual({
        status: "ok",
        mode: "live"
      });
      const response = await postResearch(baseUrl, "AEON.V");
      expect(response.status).toBe(404);
      expect(collectEvidence).not.toHaveBeenCalled();
      expect(collectMarketData).not.toHaveBeenCalled();
    });
  });
});
