import type { ManagementPerson } from "./types";

export interface ManagementHighlight {
  label: "Experience" | "Credential" | "Specialty" | "Profile";
  value: string;
}

const CREDENTIAL_LABELS: Record<string, string> = {
  BSC: "B.Sc.",
  MSC: "M.Sc.",
  MBA: "MBA",
  PGEO: "P.Geo.",
  PENG: "P.Eng.",
  CPA: "CPA",
  CA: "CA",
  CFA: "CFA",
  PHD: "Ph.D.",
  JD: "J.D."
};

function firstSentence(value?: string) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? normalized;
}

function managementSpecialty(person: ManagementPerson) {
  const text = `${person.role} ${person.bio} ${person.experience.join(" ")} ${person.trackRecord?.join(" ") ?? ""}`.toLowerCase();

  if (/(chief financial|cfo|finance|capital markets|accounting|treasury|financing|audit)/.test(text)) {
    return "Finance and capital markets oversight";
  }
  if (/(geolog|exploration|resource|discovery|drill|technical report|p\.?geo)/.test(text)) {
    return "Exploration and geology focus";
  }
  if (/(metallurg|engineering|mine build|construction|operations|p\.?eng)/.test(text)) {
    return "Technical execution and operations";
  }
  if (/(permitting|environment|sustainability|community|first nations|government)/.test(text)) {
    return "Permitting, sustainability, and stakeholder work";
  }
  if (/(director|board|governance|committee)/.test(text) || person.group === "board") {
    return "Board governance and oversight";
  }
  if (/(chief executive|ceo|president|founder|executive chair|leadership)/.test(text)) {
    return "Corporate leadership and strategy";
  }
  return "";
}

function normalizeCredential(value: string) {
  const compact = value.replace(/[\s.]+/g, "").toUpperCase();
  return CREDENTIAL_LABELS[compact] ?? value.trim();
}

function managementCredentialSummary(source: string) {
  const credentials = source.match(/\b(?:B\.?\s?Sc\.?|M\.?\s?Sc\.?|MBA|P\.?\s?Geo\.?|P\.?\s?Eng\.?|CPA|CA|CFA|Ph\.?\s?D\.?|J\.?\s?D\.?)\b/gi) ?? [];
  const universities = source.match(/\bUniversity of [A-Z][A-Za-z'&-]*(?:\s+[A-Z][A-Za-z'&-]*){0,5}(?=[.,;]|$)/g) ?? [];
  return Array.from(new Set([...credentials.map(normalizeCredential), ...universities.map((item) => item.trim())]))
    .slice(0, 3)
    .join(", ");
}

function managementExperienceSummary(source: string) {
  const match = source.match(/\b(?:(?:more than|over|nearly|approximately|around)\s+)?(?:\d{1,2}\+?\s+years|two decades|three decades|four decades|decades)\b/i)?.[0];
  if (!match) return "";
  return `${match.charAt(0).toUpperCase()}${match.slice(1)} in mining, resources, or public-company execution`;
}

export function managementHighlights(person: ManagementPerson): ManagementHighlight[] {
  const source = `${person.bio} ${person.experience.join(" ")} ${person.trackRecord?.join(" ") ?? ""}`;
  const highlights: ManagementHighlight[] = [];
  const experience = managementExperienceSummary(source);
  const credentials = managementCredentialSummary(source);
  const specialty = managementSpecialty(person);

  if (experience) highlights.push({ label: "Experience", value: experience });
  if (credentials) highlights.push({ label: "Credential", value: credentials });
  if (specialty) highlights.push({ label: "Specialty", value: specialty });
  if (!highlights.length) {
    const fallback = firstSentence(person.bio);
    if (fallback) highlights.push({ label: "Profile", value: fallback });
  }

  return highlights
    .filter((item, index, list) => list.findIndex((candidate) => candidate.label === item.label && candidate.value === item.value) === index)
    .slice(0, 3);
}
