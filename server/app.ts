import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { searchCompanies, resolveCompany } from "../src/domain/companyResolver";
import { createReportStore } from "../src/domain/reportStore";
import { createResearchRun } from "../src/domain/researchEngine";
import { collectEvidence } from "../src/domain/evidencePipeline";
import { collectMarketData } from "../src/domain/sourceAdapters";
import type { SourceDocument, SourceType } from "../src/domain/types";

const allowedSourceTypes: SourceType[] = ["filing", "presentation", "news", "market_data", "regulatory_search", "manual"];

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

export function createApp() {
  const app = express();
  const store = createReportStore();

  app.use(express.json());
  app.use(handleJsonError);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/companies", (req, res) => {
    res.json(searchCompanies(String(req.query.q ?? "")));
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
    const company = resolveCompany(query);
    if (!company) {
      res.status(404).json({ error: "Company not found in the V1 Canada/US junior-mining universe." });
      return;
    }

    const manualSources = normalizeManualSources(req.body?.manualSources);
    const [evidence, { marketSnapshot, supplemental }] = await Promise.all([
      collectEvidence(company),
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

  return app;
}
