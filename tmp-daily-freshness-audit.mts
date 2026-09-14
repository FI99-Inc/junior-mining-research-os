import { createApp } from "./server/app.ts";
import { COMPANY_UNIVERSE } from "./src/domain/companyResolver.ts";

const FINANCIAL_FIELDS = [
  "revenue",
  "grossProfit",
  "ebitda",
  "netIncome",
  "operatingExpense",
  "totalCash",
  "totalDebt",
  "enterpriseValue",
  "freeCashflow",
  "operatingCashflow",
  "profitMargin"
];

function missingFields(financial: any) {
  return FINANCIAL_FIELDS.filter(
    (field) => !financial || financial.status !== "sourced" || financial[field] === undefined || financial[field] === "Unavailable"
  );
}

function ageDays(asOf: string | undefined) {
  if (!asOf || asOf === "Unavailable") return undefined;
  const timestamp = new Date(`${String(asOf).slice(0, 10)}T00:00:00.000Z`).valueOf();
  if (Number.isNaN(timestamp)) return undefined;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}

function isStale(asOf: string | undefined) {
  const days = ageDays(asOf);
  return days === undefined || days > 5;
}

async function main() {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  const results: any[] = [];

  for (const company of COMPANY_UNIVERSE) {
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/research-runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: company.ticker })
      });
      const run = await response.json();
      results.push({
        id: company.id,
        ticker: company.ticker,
        name: company.name,
        ok: response.ok,
        statusCode: response.status,
        elapsedMs: Date.now() - started,
        marketSnapshot: run.marketSnapshot,
        financialSnapshot: run.financialSnapshot,
        shareStructure: run.shareStructure,
        buckets: {
          stalePrice: isStale(run.marketSnapshot?.asOf),
          marketAgeDays: ageDays(run.marketSnapshot?.asOf),
          missingFinancialFields: missingFields(run.financialSnapshot),
          providerDisagreement:
            /alternate listing/i.test(run.marketSnapshot?.sourceLabel ?? "") ||
            /alternate listing/i.test(run.financialSnapshot?.sourceLabel ?? ""),
          sourceQualityConcern:
            (run.marketSnapshot?.dataNeeded ?? []).length > 0 ||
            (run.financialSnapshot?.dataNeeded ?? []).length > 0 ||
            (run.shareStructure?.notes ?? []).length > 0
        }
      });
      console.error(`[audit] ${company.ticker} ${response.status} ${Date.now() - started}ms`);
    } catch (error) {
      results.push({
        id: company.id,
        ticker: company.ticker,
        name: company.name,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`[audit] ${company.ticker} ERROR ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  server.close();
  console.log(JSON.stringify({ auditedAt: new Date().toISOString(), health, count: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
