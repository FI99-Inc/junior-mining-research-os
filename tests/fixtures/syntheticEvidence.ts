import type { SourceDocument } from "../../src/domain/types";

export function syntheticResearchSources(): SourceDocument[] {
  const retrievedAt = "2026-06-29T12:00:00.000Z";
  return [
    {
      id: "test-sec-usgo-10k",
      title: "Synthetic SEC annual filing",
      sourceType: "filing",
      publisher: "Test fixture",
      url: "https://example.com/test-usgo-10k",
      retrievedAt,
      excerpts: [
        "The company is an exploration-stage issuer focused on the Whistler gold-copper project in Alaska.",
        "The company reported no revenue from mining operations and expects to need additional financing."
      ]
    },
    {
      id: "test-usgo-presentation",
      title: "Synthetic corporate presentation",
      sourceType: "presentation",
      publisher: "Test fixture",
      url: "https://example.com/test-usgo-presentation",
      retrievedAt,
      excerpts: [
        "Management highlights district-scale exploration potential and proximity to existing infrastructure.",
        "Upcoming catalysts include drilling results and updated technical work."
      ]
    },
    {
      id: "test-usgo-drill-news",
      title: "Synthetic exploration update",
      sourceType: "news",
      publisher: "Test fixture",
      url: "https://example.com/test-usgo-drill-news",
      retrievedAt,
      excerpts: [
        "The company reported drilling-focused exploration updates at the Whistler project.",
        "The update frames drill results and technical work as near-term catalysts for evaluating project scale."
      ]
    },
    {
      id: "test-tim-smith-linkedin",
      title: "Synthetic Tim Smith public profile result",
      sourceType: "manual",
      publisher: "Issuer profile link test fixture",
      url: "https://www.linkedin.com/in/timsmith",
      retrievedAt,
      excerpts: ["Tim Smith Chief Executive Officer mining executive profile"]
    }
  ];
}
