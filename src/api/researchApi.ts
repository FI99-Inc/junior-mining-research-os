import type { AdapterStatus, CompanyCandidate, ResearchRun, SourceDocument } from "../domain/types";

export type ResearchRunResponse = ResearchRun & { adapters?: AdapterStatus[] };
export type ManualSourceDraft = Pick<SourceDocument, "title" | "sourceType" | "publisher" | "url" | "excerpts">;

const RESEARCH_FAILURE_MESSAGE = "Research failed. The service is temporarily unavailable; please try again.";

async function serverErrorMessage(response: Response) {
  const body = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
  return typeof body?.error === "string" ? body.error : RESEARCH_FAILURE_MESSAGE;
}

export async function fetchResearchHistory(signal?: AbortSignal): Promise<ResearchRun[]> {
  const response = await fetch("/api/research-runs", { signal });
  if (!response.ok) throw new Error("Unable to load research history.");
  return response.json() as Promise<ResearchRun[]>;
}

export async function searchCompanyCandidates(query: string, signal?: AbortSignal): Promise<CompanyCandidate[]> {
  const response = await fetch(`/api/companies?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  return response.json() as Promise<CompanyCandidate[]>;
}

export async function requestResearchRun(
  query: string,
  manualSources: ManualSourceDraft[],
  signal?: AbortSignal
): Promise<ResearchRunResponse> {
  const response = await fetch("/api/research-runs", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, manualSources })
  });
  if (!response.ok) throw new Error(await serverErrorMessage(response));
  return response.json() as Promise<ResearchRunResponse>;
}
