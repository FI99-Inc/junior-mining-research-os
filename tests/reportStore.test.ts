import { describe, expect, it } from "vitest";
import { createReportStore } from "../src/domain/reportStore";
import { createResearchRun } from "../src/domain/researchEngine";
import type { CompanyCandidate } from "../src/domain/types";

const company: CompanyCandidate = {
  id: "snowline",
  name: "Snowline Gold Corp.",
  ticker: "SGD.V",
  exchange: "TSXV",
  country: "CA",
  commodityFocus: ["Gold"]
};

describe("createReportStore", () => {
  it("saves refreshed reports and records score changes between runs", () => {
    const store = createReportStore();
    const first = createResearchRun(company, [], "SGD.V");
    store.save(first);

    const refreshed = createResearchRun(
      company,
      [
        {
          id: "drill-results",
          title: "Exploration Update",
          sourceType: "news",
          publisher: "Company",
          url: "https://example.com/news",
          retrievedAt: "2026-06-29T12:00:00.000Z",
          excerpts: ["Upcoming catalysts include drilling results and updated technical work."]
        }
      ],
      "SGD.V"
    );
    store.save(refreshed);

    const history = store.listByCompany(company.id);
    expect(history).toHaveLength(2);
    expect(store.getLatest(company.id)?.id).toBe(refreshed.id);
    expect(store.compare(first.id, refreshed.id)?.overallDelta).not.toBe(0);
  });
});
