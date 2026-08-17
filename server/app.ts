import express from "express";
import { searchCompanies, resolveCompany } from "../src/domain/companyResolver";
import { createReportStore } from "../src/domain/reportStore";
import { createResearchRun } from "../src/domain/researchEngine";
import { collectEvidence } from "../src/domain/evidencePipeline";
import { collectMarketData } from "../src/domain/sourceAdapters";
import type { SourceDocument, SourceType } from "../src/domain/types";

const allowedSourceTypes: SourceType[] = ["filing", "presentation", "news", "market_data", "regulatory_search", "manual"];

function normalizeManualSources(value: unknown): SourceDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): SourceDocument | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const raw = item as Record<string, unknown>;
      const title = String(raw.title ?? "").trim();
      const publisher = String(raw.publisher ?? "Issuer document import").trim() || "Issuer document import";
      const url = String(raw.url ?? "").trim() || "Manual source";
      const sourceType = allowedSourceTypes.includes(raw.sourceType as SourceType) ? (raw.sourceType as SourceType) : "manual";
      const excerpts = Array.isArray(raw.excerpts)
        ? raw.excerpts.map((excerpt) => String(excerpt).trim()).filter(Boolean)
        : String(raw.excerptText ?? "")
            .split(/\n{2,}/)
            .map((excerpt) => excerpt.trim())
            .filter(Boolean);

      if (!title || excerpts.length === 0) return undefined;
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

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/companies", (req, res) => {
    res.json(searchCompanies(String(req.query.q ?? "")));
  });

  app.get("/api/research-runs", (_req, res) => {
    res.json(store.listAll());
  });

  app.post("/api/research-runs", async (req, res) => {
    const query = String(req.body?.query ?? "").trim();
    const company = resolveCompany(query);
    if (!company) {
      res.status(404).json({ error: "Company not found in the V1 Canada/US junior-mining universe." });
      return;
    }

    const manualSources = normalizeManualSources(req.body?.manualSources);
    const evidence = await collectEvidence(company);
    const { marketSnapshot, supplemental } = await collectMarketData(company);
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
  });

  return app;
}
