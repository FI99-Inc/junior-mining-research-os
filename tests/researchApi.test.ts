import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchResearchHistory, requestResearchRun, searchCompanyCandidates } from "../src/api/researchApi";
import type { CompanyCandidate, ResearchRun } from "../src/domain/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const company: CompanyCandidate = {
  id: "us-goldmining",
  name: "US GoldMining Inc.",
  ticker: "USGO",
  exchange: "NASDAQ",
  country: "US",
  commodityFocus: ["Gold", "Copper"]
};

describe("research API client", () => {
  it("encodes company searches and returns matching candidates", async () => {
    const fetcher = vi.fn(async () => Response.json([company]));
    vi.stubGlobal("fetch", fetcher);

    await expect(searchCompanyCandidates("US Gold", new AbortController().signal)).resolves.toEqual([company]);
    expect(fetcher).toHaveBeenCalledWith("/api/companies?q=US%20Gold", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("returns no suggestions when the company endpoint is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));

    await expect(searchCompanyCandidates("USGO")).resolves.toEqual([]);
  });

  it("posts the research query and imported sources", async () => {
    const run = { id: "run-1", query: "USGO", company } as ResearchRun;
    const fetcher = vi.fn(async () => Response.json(run));
    vi.stubGlobal("fetch", fetcher);
    const manualSources = [{
      title: "Issuer presentation",
      sourceType: "manual" as const,
      publisher: "Issuer",
      url: "https://example.com/presentation.pdf",
      excerpts: ["Project update"]
    }];

    await expect(requestResearchRun("USGO", manualSources)).resolves.toEqual(run);
    expect(fetcher).toHaveBeenCalledWith("/api/research-runs", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "USGO", manualSources })
    }));
  });

  it("uses a server error when available and a readable fallback otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "Company not found." }, { status: 404 }))
      .mockResolvedValueOnce(new Response("<html>Gateway failure</html>", { status: 502 })));

    await expect(requestResearchRun("UNKNOWN", [])).rejects.toThrow("Company not found.");
    await expect(requestResearchRun("USGO", [])).rejects.toThrow(
      "Research failed. The service is temporarily unavailable; please try again."
    );
  });

  it("loads research history and rejects unsuccessful responses", async () => {
    const run = { id: "run-1", query: "USGO", company } as ResearchRun;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json([run]))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 })));

    await expect(fetchResearchHistory()).resolves.toEqual([run]);
    await expect(fetchResearchHistory()).rejects.toThrow("Unable to load research history.");
  });
});
