import { describe, expect, it } from "vitest";
import { managementHighlights } from "../src/domain/managementHighlights";
import type { ManagementPerson } from "../src/domain/types";

describe("managementHighlights", () => {
  it("summarizes experience, credentials, and specialty without duplicating profile text", () => {
    const person: ManagementPerson = {
      name: "Alex Morgan",
      role: "Chief Geologist",
      bio: "Alex has over 20 years of exploration experience and earned an M.Sc. from University of British Columbia.",
      experience: ["Led gold exploration and resource drilling programs."],
      group: "technical"
    };

    expect(managementHighlights(person)).toEqual([
      { label: "Experience", value: "Over 20 years in mining, resources, or public-company execution" },
      { label: "Credential", value: "M.Sc., University of British Columbia" },
      { label: "Specialty", value: "Exploration and geology focus" }
    ]);
  });

  it("falls back to a complete first sentence when structured highlights are unavailable", () => {
    const person: ManagementPerson = {
      name: "Jordan Lee",
      role: "Corporate Administrator",
      bio: "Jordan supports the issuer's reporting program. Additional history requires verification.",
      experience: []
    };

    expect(managementHighlights(person)).toEqual([
      { label: "Profile", value: "Jordan supports the issuer's reporting program." }
    ]);
  });
});
