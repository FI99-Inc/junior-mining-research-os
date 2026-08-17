import type { ReportComparison, ResearchRun } from "./types";

export interface ReportStore {
  save(run: ResearchRun): void;
  getLatest(companyId: string): ResearchRun | undefined;
  listByCompany(companyId: string): ResearchRun[];
  listAll(): ResearchRun[];
  compare(fromId: string, toId: string): ReportComparison | undefined;
}

export function createReportStore(initialRuns: ResearchRun[] = []): ReportStore {
  const runs = [...initialRuns];

  return {
    save(run) {
      runs.push(run);
    },
    getLatest(companyId) {
      return runs.filter((run) => run.company.id === companyId).at(-1);
    },
    listByCompany(companyId) {
      return runs.filter((run) => run.company.id === companyId);
    },
    listAll() {
      return [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    compare(fromId, toId) {
      const from = runs.find((run) => run.id === fromId);
      const to = runs.find((run) => run.id === toId);
      if (!from || !to) return undefined;

      const changedCategories = to.scorecard.categories
        .map((toCategory) => {
          const fromCategory = from.scorecard.categories.find((item) => item.key === toCategory.key);
          return {
            key: toCategory.key,
            label: toCategory.label,
            delta: toCategory.score - (fromCategory?.score ?? 0)
          };
        })
        .filter((item) => item.delta !== 0);

      return {
        fromId,
        toId,
        overallDelta: to.scorecard.overall - from.scorecard.overall,
        changedCategories
      };
    }
  };
}
