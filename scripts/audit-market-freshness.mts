import type { Server } from "node:http";
import { createApp } from "../server/app";
import { COMPANY_UNIVERSE } from "../src/domain/companyResolver";
import type { ResearchRun } from "../src/domain/types";
import {
  buildFreshnessBuckets,
  summarizeFreshnessResults,
  type FreshnessCompanyResult
} from "./marketFreshness";

interface HealthResponse {
  status?: string;
  mode?: string;
}

interface AuditOutput {
  auditType: "live-network";
  notice: string;
  auditedAt: string;
  health: HealthResponse;
  ok: boolean;
  count: number;
  summary: ReturnType<typeof summarizeFreshnessResults>;
  results: FreshnessCompanyResult[];
}

type FreshnessResearchRun = Pick<ResearchRun, "marketSnapshot" | "financialSnapshot" | "shareStructure">;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFreshnessResearchRun(value: unknown): value is FreshnessResearchRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return Boolean(run.marketSnapshot && run.financialSnapshot && run.shareStructure);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<AuditOutput> {
  const auditedAt = new Date();
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("The temporary audit server did not expose a TCP address.");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = (await healthResponse.json()) as HealthResponse;
    if (!healthResponse.ok || health.status !== "ok") {
      throw new Error(`Health check failed with HTTP ${healthResponse.status}.`);
    }

    const results: FreshnessCompanyResult[] = [];
    for (const company of COMPANY_UNIVERSE) {
      const started = Date.now();
      try {
        const response = await fetch(`${baseUrl}/api/research-runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: company.ticker })
        });
        const payload = (await response.json()) as unknown;
        if (!response.ok || !isFreshnessResearchRun(payload)) {
          const detail = payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "Invalid research response")
            : "Invalid research response";
          throw new Error(`HTTP ${response.status}: ${detail}`);
        }

        results.push({
          id: company.id,
          ticker: company.ticker,
          name: company.name,
          ok: true,
          statusCode: response.status,
          elapsedMs: Date.now() - started,
          marketSnapshot: payload.marketSnapshot,
          financialSnapshot: payload.financialSnapshot,
          shareStructure: payload.shareStructure,
          buckets: buildFreshnessBuckets(
            payload.marketSnapshot,
            payload.financialSnapshot,
            payload.shareStructure,
            auditedAt.valueOf()
          )
        });
        console.error(`[audit] ${company.ticker} ${response.status} ${Date.now() - started}ms`);
      } catch (error) {
        results.push({
          id: company.id,
          ticker: company.ticker,
          name: company.name,
          ok: false,
          elapsedMs: Date.now() - started,
          error: errorMessage(error)
        });
        console.error(`[audit] ${company.ticker} ERROR ${errorMessage(error)}`);
      }
    }

    const ok = results.every((result) => result.ok);
    if (!ok) process.exitCode = 1;
    return {
      auditType: "live-network",
      notice: "Results vary over time because this audit contacts live external providers. Output is not investment advice.",
      auditedAt: auditedAt.toISOString(),
      health,
      ok,
      count: results.length,
      summary: summarizeFreshnessResults(results),
      results
    };
  } finally {
    await closeServer(server);
  }
}

void main()
  .then((output) => console.log(JSON.stringify(output, null, 2)))
  .catch((error: unknown) => {
    process.exitCode = 1;
    console.error(`[audit] FATAL ${errorMessage(error)}`);
    console.log(JSON.stringify({
      auditType: "live-network",
      notice: "Results vary over time because this audit contacts live external providers. Output is not investment advice.",
      auditedAt: new Date().toISOString(),
      ok: false,
      error: errorMessage(error),
      count: 0,
      results: []
    }, null, 2));
  });
