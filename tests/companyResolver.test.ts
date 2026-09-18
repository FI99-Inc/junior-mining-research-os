import { describe, expect, it } from "vitest";
import { COMPANY_UNIVERSE, resolveCompany, searchCompanies } from "../src/domain/companyResolver";

describe("resolveCompany", () => {
  it("resolves exact tickers, Canadian suffixes, OTC aliases, and company name searches", () => {
    expect(resolveCompany("USGO")?.ticker).toBe("USGO");
    expect(resolveCompany("GMIN.V")).toMatchObject({ ticker: "GMIN.TO", exchange: "TSX" });
    expect(resolveCompany("G Mining Ventures")?.ticker).toBe("GMIN.TO");
    expect(resolveCompany("snowline")?.ticker).toBe("SGD.TO");
    expect(resolveCompany("ISO.V")).toMatchObject({ ticker: "ISO.TO", exchange: "TSX" });
  });

  it("does not treat the acquired and delisted ASCU security as an active company", () => {
    expect(resolveCompany("ASCU.TO")).toBeUndefined();
    expect(resolveCompany("Arizona Sonoran")).toBeUndefined();
  });

  it("returns undefined for unsupported searches", () => {
    expect(resolveCompany("not-a-real-miner")).toBeUndefined();
  });

  it("orders typeahead suggestions by strongest ticker and name matches", () => {
    const suggestions = searchCompanies("u");

    expect(suggestions[0].ticker).toBe("USGO");
    expect(suggestions.map((company) => company.ticker)).toContain("FUU.V");
  });

  it("provides enough companies for exploration cards", () => {
    expect(COMPANY_UNIVERSE.length).toBeGreaterThanOrEqual(10);
  });
});
