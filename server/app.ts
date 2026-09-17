import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import path from "node:path";
import { searchCompanies, resolveCompany } from "../src/domain/companyResolver";
import { createReportStore } from "../src/domain/reportStore";
import { createResearchRun } from "../src/domain/researchEngine";
import { collectEvidence } from "../src/domain/evidencePipeline";
import { collectMarketData } from "../src/domain/sourceAdapters";
import type { SourceDocument, SourceType } from "../src/domain/types";
import { createDemoResearchRun, DEMO_NOTICE, resolveDemoCompany, searchDemoCompanies } from "./demoFixture";

const allowedSourceTypes: SourceType[] = ["filing", "presentation", "news", "market_data", "regulatory_search", "manual"];

function isEnabledEnvironmentFlag(value: string | undefined) {
  return /^(1|true|yes)$/i.test(value?.trim() ?? "");
}

function isHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const handleJsonError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.type === "entity.too.large" && error?.status === 413) {
    res.status(413).json({ error: "JSON request body exceeds the 100kb limit." });
    return;
  }
  if (error?.type === "entity.parse.failed" && error?.status === 400) {
    res.status(400).json({ error: "Malformed JSON request body." });
    return;
  }
  next(error);
};

const handleResearchError: ErrorRequestHandler = (_error, _req, res, _next) => {
  res.status(500).json({ error: "Unable to create research run." });
};

function normalizeManualSources(value: unknown): SourceDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): SourceDocument | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const raw = item as Record<string, unknown>;
      const title = String(raw.title ?? "").trim();
      const publisher = String(raw.publisher ?? "Issuer document import").trim() || "Issuer document import";
      const url = String(raw.url ?? "").trim();
      const sourceType = allowedSourceTypes.includes(raw.sourceType as SourceType) ? (raw.sourceType as SourceType) : "manual";
      const excerpts = Array.isArray(raw.excerpts)
        ? raw.excerpts.map((excerpt) => String(excerpt).trim()).filter(Boolean)
        : String(raw.excerptText ?? "")
            .split(/\n{2,}/)
            .map((excerpt) => excerpt.trim())
            .filter(Boolean);

      if (!title || !isHttpUrl(url) || excerpts.length === 0) return undefined;
      return {
        id: `manual-${Date.now()}-${index}`,
        title,
        sourceType,
        publisher,
        url,
        retrievedAt: new Date().toISOString(),
        excerpts
      };
    })
    .filter((source): source is SourceDocument => Boolean(source));
}

export function createApp(options: { demoMode?: boolean; staticDir?: string } = {}) {
  const app = express();
  const store = createReportStore();
  const demoMode = options.demoMode ?? process.env.DEMO_MODE === "1";

  app.use(express.json());
  app.use(handleJsonError);

  app.get("/api/health", (_req, res) => {
    res.json(demoMode ? { status: "ok", mode: "demo", demoNotice: DEMO_NOTICE } : { status: "ok", mode: "live" });
  });

  app.get("/api/companies", (req, res) => {
    const query = String(req.query.q ?? "");
    res.json(demoMode ? searchDemoCompanies(query) : searchCompanies(query));
  });

  app.get("/api/research-runs", (_req, res) => {
    res.json(store.listAll());
  });

  app.post("/api/research-runs", async (req: Request, res: Response) => {
    if (typeof req.body?.query !== "string" || !req.body.query.trim()) {
      res.status(400).json({ error: "Query must be a non-empty string." });
      return;
    }
    const query = req.body.query.trim();
    const company = demoMode ? resolveDemoCompany(query) : resolveCompany(query);
    if (!company) {
      res.status(404).json({ error: demoMode ? "Company not found in the fictional demo universe." : "Company not found in the V1 Canada/US junior-mining universe." });
      return;
    }

    if (demoMode) {
      const run = createDemoResearchRun();
      store.save(run);
      res.json(run);
      return;
    }

    const manualSources = normalizeManualSources(req.body?.manualSources);
    const [evidence, { marketSnapshot, supplemental }] = await Promise.all([
      collectEvidence(company, {
        secUserAgent: process.env.SEC_USER_AGENT,
        renderedCrawling: !isEnabledEnvironmentFlag(process.env.DISABLE_RENDERED_CRAWLING),
        browserExecutablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      }),
      collectMarketData(company)
    ]);
    const run = createResearchRun(
      {
        ...company,
        marketSnapshot,
        analystForecast: supplemental.analystForecast,
        financialSnapshot: supplemental.financialSnapshot,
        shareStructure: supplemental.shareStructure ?? company.shareStructure
      },
      [...evidence.sources, ...manualSources],
      query,
      { facts: evidence.facts, status: evidence.status }
    );
    store.save(run);
    res.json({ ...run, adapters: evidence.status.adapters });
  }, handleResearchError);

  const staticDir = options.staticDir;
  if (staticDir) {
    app.use(express.static(staticDir, { index: false }));
    app.get(/^(?!\/(?:api|assets)(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}
