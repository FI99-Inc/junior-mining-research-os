import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANY_UNIVERSE } from "../src/domain/companyResolver";
import { collectEvidence, type BrowserPageFetcher } from "../src/domain/evidencePipeline";
import { createResearchRun } from "../src/domain/researchEngine";

const RUN_TIME = "2026-09-14T12:34:56.000Z";
const LEGACY_SEED_TIME = "2026-06-29T12:00:00.000Z";

const unavailableBrowser: BrowserPageFetcher = Object.assign(
  async (url: string) => ({
    url,
    finalUrl: url,
    title: "",
    html: "",
    text: "",
    links: [],
    mode: "playwright" as const,
    ok: false,
    error: "Unavailable in boundary test"
  }),
  { close: async () => undefined }
);

const unavailableFetch: typeof fetch = async () => new Response("", { status: 404 });

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("production evidence boundary", () => {
  it.each(COMPANY_UNIVERSE)("does not seed evidence for an offline $ticker research run", async (company) => {
    const result = await collectEvidence(company, {
      fetcher: unavailableFetch,
      browserFetcher: unavailableBrowser,
      now: () => RUN_TIME
    });

    expect(result.sources).toEqual([]);
    expect(result.facts).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("example.com");
    expect(JSON.stringify(result)).not.toContain(LEGACY_SEED_TIME);
  });

  it("treats a reachable SEDAR+ search page as adapter status, not issuer evidence", async () => {
    const company = COMPANY_UNIVERSE.find((candidate) => candidate.country === "CA")!;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      return url.includes("sedarplus.ca")
        ? new Response("<html><title>SEDAR+ search</title></html>", { status: 200, headers: { "content-type": "text/html" } })
        : unavailableFetch(input);
    };

    const result = await collectEvidence(company, {
      fetcher,
      browserFetcher: unavailableBrowser,
      now: () => RUN_TIME
    });

    expect(result.sources).toEqual([]);
    expect(result.facts).toEqual([]);
    expect(result.status.adapters).toContainEqual(
      expect.objectContaining({ id: "sedar-plus-live", status: "configured" })
    );
  });

  it("does not turn SEC filing metadata into evidence when the filing document cannot be retrieved", async () => {
    const company = COMPANY_UNIVERSE.find((candidate) => candidate.country === "US")!;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("company_tickers.json")) {
        return Response.json({ 0: { cik_str: 1947244, ticker: company.ticker, title: company.name } });
      }
      if (url.includes("submissions/CIK")) {
        return Response.json({
          filings: {
            recent: {
              accessionNumber: ["0001947244-26-000002"],
              primaryDocument: ["form4.xml"],
              form: ["4"],
              filingDate: ["2026-04-02"]
            }
          }
        });
      }
      return unavailableFetch(input);
    };

    const result = await collectEvidence(company, {
      fetcher,
      browserFetcher: unavailableBrowser,
      now: () => RUN_TIME
    });

    expect(result.sources.filter((source) => source.publisher.startsWith("SEC EDGAR"))).toEqual([]);
    expect(result.facts.filter((fact) => fact.sourceUrl.includes("sec.gov/Archives"))).toEqual([]);
  });

  it("does not let registry-only management narratives raise live management evidence or scoring", () => {
    const company = COMPANY_UNIVERSE.find((candidate) => candidate.management?.length)!;
    const withoutRegistry = { ...company, management: undefined };
    const registryRun = createResearchRun(company, [], company.ticker);
    const emptyRun = createResearchRun(withoutRegistry, [], company.ticker);
    const registryScore = registryRun.scorecard.categories.find((category) => category.key === "management")!;
    const emptyScore = emptyRun.scorecard.categories.find((category) => category.key === "management")!;

    expect(registryScore.score).toBe(emptyScore.score);
    expect(registryScore.confidence).toBe("low");
    expect(registryScore.citationIds).toEqual([]);
    expect(registryRun.managementEvidence.sources).toEqual([]);
    expect(registryRun.management.every((person) => person.sourceStatus === "unknown")).toBe(true);
    expect(registryRun.management.every((person) => person.sourceUrl === undefined)).toBe(true);
    expect(registryRun.management.every((person) => person.evidenceIds?.length === 0)).toBe(true);
  });

  it("keeps placeholder domains, fixed seed dates, and seeded evidence declarations out of production modules", () => {
    const productionFiles = ["src", "server"].flatMap((directory) => productionTypeScriptFiles(join(process.cwd(), directory)));
    const productionText = productionFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(productionText).not.toMatch(/example\.com/i);
    expect(productionText).not.toContain(LEGACY_SEED_TIME);
    expect(productionText).not.toMatch(/seededSources|disclosure search placeholder|uses seeded excerpts/i);
    expect(productionText).not.toContain('|| "Manual source"');
    expect(productionText).not.toMatch(/tests[\\/]fixtures/);
  });
});
