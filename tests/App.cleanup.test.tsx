import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { COMPANY_UNIVERSE, resolveCompany } from "../src/domain/companyResolver";
import { createResearchRun } from "../src/domain/researchEngine";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const company = resolveCompany("USGO")!;
const run = createResearchRun(company, [], "USGO");

describe("Research workflow resilience", () => {
  it("blocks duplicate research while pending and presents a readable server failure", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { finish = resolve; });
      return Promise.resolve(Response.json(String(input).includes("companies") ? [company] : []));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Research USGO" }));
    expect(screen.getByRole("button", { name: "Research SGD.TO" })).toBeDisabled();
    await act(async () => finish(new Response("<html>Gateway unavailable</html>", { status: 502 })));
    expect(await screen.findByRole("alert")).toHaveTextContent(/research.*failed|unavailable/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/JSON|<html>/i);
    expect(screen.getByRole("button", { name: "Research SGD.TO" })).toBeEnabled();
  });

  it("keeps a successful report when history cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json(run);
      throw new Error("History offline");
    }));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Research USGO" }));
    expect(await screen.findByRole("heading", { name: company.name })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Investment Quality" })).toHaveAttribute("aria-current", "page");
  });

  it("supports arrow selection, Enter, and Escape in ticker suggestions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => Response.json(String(input).includes("companies") ? [company] : [])));
    render(<App />);
    const input = screen.getAllByLabelText("Ticker or company")[0];
    await userEvent.clear(input);
    await userEvent.type(input, "U");
    await screen.findByRole("option", { name: /USGO/ });
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant");
    expect(screen.getByRole("option", { name: /USGO/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    expect(input).toHaveValue("USGO");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.type(input, " ");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it.each(COMPANY_UNIVERSE.map((item) => [item.ticker, item] as const))(
    "%s renders every report section with missing provider data",
    async (ticker, issuer) => {
      const report = createResearchRun(issuer, [], ticker);
      vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => Response.json(init?.method === "POST" ? report : [])));
      render(<App />);
      await userEvent.click(screen.getByRole("button", { name: `Research ${ticker}` }));
      await screen.findByRole("heading", { name: issuer.name });
      for (const label of ["Market Perspectives", "Management", "Risks", "News", "Share structure", "Financials", "Sources", "Investment Quality"]) {
        const button = screen.getByRole("button", { name: label });
        await userEvent.click(button);
        expect(button).toHaveAttribute("aria-current", "page");
      }
      await userEvent.click(screen.getByRole("button", { name: "Home" }));
      await waitFor(() => expect(screen.getByRole("region", { name: "Explore companies" })).toBeVisible());
    }
  );
});
