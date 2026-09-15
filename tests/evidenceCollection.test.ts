// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPANY_UNIVERSE, resolveCompany } from "../src/domain/companyResolver";
import { collectEvidence, createTimeoutFetcher, extractIssuerTeamPeople } from "../src/domain/evidencePipeline";
import type { CompanyCandidate } from "../src/domain/types";

const { launchBrowser } = vi.hoisted(() => ({ launchBrowser: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launch: launchBrowser } }));

const html = (body: string) => new Response(body, { headers: { "Content-Type": "text/html" } });
const json = (body: unknown) => Response.json(body);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  launchBrowser.mockReset();
});

describe("available source providers", () => {
  it.each(COMPANY_UNIVERSE)("$ticker reports Yahoo/YFinance as its only market-data adapter", async (company) => {
    const evidence = await collectEvidence(company, {
      fetcher: async () => new Response("", { status: 503 })
    });
    expect(evidence.status.adapters.filter((adapter) => adapter.id === "market-data")).toEqual([
      expect.objectContaining({ name: "Yahoo/YFinance market data" })
    ]);
  });
});

describe("evidence resource lifecycle", () => {
  const company: CompanyCandidate = {
    id: "lifecycle-test",
    name: "Test Mining",
    ticker: "TEST",
    exchange: "TSX",
    country: "CA",
    commodityFocus: ["Gold"],
    websiteUrl: "https://example.com/"
  };
  const unavailable = async () => new Response("", { status: 404 });

  function mockOwnedBrowser() {
    vi.stubEnv("NODE_ENV", "production");
    const close = vi.fn(async () => undefined);
    launchBrowser.mockResolvedValue({
      close,
      newContext: vi.fn(async () => { throw new Error("Rendered page unavailable"); })
    });
    return close;
  }

  it("closes each owned browser without accumulating process exit listeners", async () => {
    const close = mockOwnedBrowser();
    const listeners = process.listenerCount("exit");
    await collectEvidence(company, { fetcher: unavailable });
    await collectEvidence(company, { fetcher: unavailable });
    expect(close).toHaveBeenCalledTimes(2);
    expect(process.listenerCount("exit")).toBe(listeners);
  });

  it("closes an owned browser when another adapter unexpectedly rejects", async () => {
    const close = mockOwnedBrowser();
    const failure = new Error("Roster unavailable");
    const brokenCompany = { ...company, get management(): never { throw failure; } };
    await expect(collectEvidence(brokenCompany, { fetcher: unavailable })).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });

  it("waits for in-flight adapters before closing after an unexpected rejection", async () => {
    const close = mockOwnedBrowser();
    const failure = new Error("Roster unavailable");
    const brokenCompany = { ...company, get management(): never { throw failure; } };
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = async () => {
      started();
      await gate;
      return unavailable();
    };
    const rejected = expect(collectEvidence(brokenCompany, { fetcher })).rejects.toBe(failure);
    await waiting;
    expect(close).not.toHaveBeenCalled();
    release();
    await rejected;
    expect(close).toHaveBeenCalledOnce();
  });

  it("preserves caller-owned browser lifecycle on success and failure", async () => {
    const close = vi.fn(async () => undefined);
    const browserFetcher = Object.assign(async (url: string) => ({
      url, finalUrl: url, title: "", html: "", text: "", links: [], mode: "playwright" as const, ok: false
    }), { close });
    await collectEvidence(company, { fetcher: unavailable, browserFetcher });
    const failure = new Error("Roster unavailable");
    const brokenCompany = { ...company, get management(): never { throw failure; } };
    await expect(collectEvidence(brokenCompany, { fetcher: unavailable, browserFetcher })).rejects.toBe(failure);
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps browser launch and close failures non-fatal", async () => {
    const close = mockOwnedBrowser();
    close.mockRejectedValueOnce(new Error("Browser already disconnected"));
    await expect(collectEvidence(company, { fetcher: unavailable })).resolves.toHaveProperty("status");
    launchBrowser.mockRejectedValueOnce(new Error("Browser missing"));
    await expect(collectEvidence(company, { fetcher: unavailable })).resolves.toHaveProperty("status");
  });

  it("times out stalled fetch fallbacks and returns partial evidence", async () => {
    const browserFetcher = async (url: string) => ({
      url, finalUrl: url, title: "", html: "", text: "", links: [], mode: "playwright" as const, ok: false
    });
    const signals: AbortSignal[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      expect(init?.signal).toBeTruthy();
      const signal = init!.signal!;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
    const result = await collectEvidence(company, { fetcher, browserFetcher, fetchTimeoutMs: 5 });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(result.status.adapters.find((adapter) => adapter.id === "company-website")?.status).toBe("needs_key");
  });
});

describe("createTimeoutFetcher", () => {
  it("bounds response body reads after headers have arrived", async () => {
    const caller = new AbortController();
    const request = new AbortController();
    const init = new AbortController();
    const fetcher: typeof fetch = async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true });
      }
    }));
    const response = await createTimeoutFetcher(fetcher, 5, caller.signal)(
      new Request("https://example.com/", { signal: request.signal }),
      { signal: init.signal }
    );
    await expect(response.text()).rejects.toMatchObject({ name: "TimeoutError" });
    expect([caller, request, init].every((controller) => !controller.signal.aborted)).toBe(true);
  });

  it.each(["collection", "request", "init"] as const)("preserves cancellation from the %s signal", async (origin) => {
    const collection = new AbortController();
    const request = new AbortController();
    const init = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async () => html("ok"));
    const input = new Request("https://example.com/", { signal: request.signal });
    await createTimeoutFetcher(fetcher, 8000, collection.signal)(input, { signal: init.signal, headers: { Accept: "text/html" } });
    const combined = fetcher.mock.calls[0][1]!.signal!;
    const reason = new Error(`${origin} cancelled`);
    ({ collection, request, init })[origin].abort(reason);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe(reason);
    expect(fetcher).toHaveBeenCalledWith(input, expect.objectContaining({ headers: { Accept: "text/html" } }));
  });

  it("does not start a fetch when the caller is already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("Cancelled before collection");
    controller.abort(reason);
    const fetcher = vi.fn(async () => html("ok"));
    await expect(createTimeoutFetcher(fetcher, 8000, controller.signal)("https://example.com/")).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("collectEvidence", () => {
  it("extracts Faraday-style management people from issuer team pages", () => {
    const people = extractIssuerTeamPeople(
      `
        <main>
          <h1>Management</h1>
          <section>
            <h3>Paul Harbidge</h3>
            <h4>President, CEO & Director</h4>
            <img src="/wp-content/uploads/paul.jpg" alt="Paul Harbidge" />
            <p>Paul Harbidge is a geologist with more than 30 years of experience in exploration, mine development, and public-company leadership. He has led discoveries and acquisition outcomes across several mining companies.</p>
          </section>
          <section>
            <h3>Graham Richardson</h3>
            <h4>Chief Financial Officer</h4>
            <p>Graham Richardson has senior finance experience with public mining issuers, financings, reporting, and capital markets transactions.</p>
          </section>
        </main>
      `,
      "https://faradaycopper.com/about-us/our-team/management/",
      "executive"
    );

    expect(people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Paul Harbidge",
          role: "President, CEO & Director",
          group: "executive",
          imageUrl: "https://faradaycopper.com/wp-content/uploads/paul.jpg",
          bio: expect.stringContaining("30 years")
        }),
        expect.objectContaining({
          name: "Graham Richardson",
          role: "Chief Financial Officer",
          group: "executive",
          bio: expect.stringContaining("capital markets")
        })
      ])
    );
  });

  it("extracts issuer board pages as board members", () => {
    const people = extractIssuerTeamPeople(
      `
        <h1>Board of Directors</h1>
        <h3>Russell Ball</h3>
        <h4>Chair & Independent Director</h4>
        <p>Russell Ball is a mining executive and director with mine operations, development, acquisition, and capital allocation experience.</p>
      `,
      "https://faradaycopper.com/about-us/our-team/board-of-directors/",
      "board"
    );

    expect(people).toEqual([
      expect.objectContaining({
        name: "Russell Ball",
        role: "Chair & Independent Director",
        group: "board",
        bio: expect.stringContaining("capital allocation")
      })
    ]);
  });

  it("does not extract project or location heading blocks as management people", () => {
    const people = extractIssuerTeamPeople(
      `
        <main>
          <h2>Projects</h2>
          <h3>Black Pine</h3>
          <h4>Idaho, United States</h4>
          <p>Black Pine is an oxide gold project with infrastructure, metallurgical, permitting, and exploration information for investors.</p>
          <h3>Whistler</h3>
          <h4>Alaska, United States</h4>
          <p>Whistler is a gold-copper exploration project with technical reports and district-scale targets.</p>
        </main>
      `,
      "https://example.com/projects/",
      "executive"
    );

    expect(people).toEqual([]);
  });

  it("extracts Liberty-style Elementor leadership sections with board, management, and advisors", () => {
    const people = extractIssuerTeamPeople(
      `
        <main>
          <h2>Our Leadership</h2>
          <div class="elementor-heading-title elementor-size-default">Greg Etter</div>
          <div class="elementor-heading-title elementor-size-default">B.S. Geology, J.D.</div>
          <div class="elementor-heading-title elementor-size-default">Chair of the Board</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Mr. Etter has broad experience in the natural resources sector, including more than two decades with international mining companies.</div></div>
          <div class="elementor-heading-title elementor-size-default">Jon Gilligan</div>
          <div class="elementor-heading-title elementor-size-default">B.Sc. (Hons.), Ph.D.</div>
          <div class="elementor-heading-title elementor-size-default">President, CEO and Director</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Dr. Gilligan is a senior mining executive with over 35 years of multi-commodity experience across technical services, capital projects, mine construction and operations.</div></div>
          <div class="elementor-heading-title elementor-size-default">Joanna Bailey</div>
          <div class="elementor-heading-title elementor-size-default">B.Sc. Ph.D., CA (ICAS)</div>
          <div class="elementor-heading-title elementor-size-default">Chief Financial Officer and Corporate Secretary</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Dr. Bailey is a Chartered Accountant with experience in accounting and financial reporting in Canada and the UK.</div></div>
          <div class="elementor-heading-title elementor-size-default">Moira Smith</div>
          <div class="elementor-heading-title elementor-size-default">B.Sc. Ph.D., P.Geo.</div>
          <div class="elementor-heading-title elementor-size-default">Corporate Technical Advisor</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Dr. Smith was instrumental in identifying gold exploration opportunities and advancing Long Canyon, Fronteer Gold's flagship project.</div></div>
          <div class="elementor-heading-title elementor-size-default">Rob Pease</div>
          <div class="elementor-heading-title elementor-size-default">Corporate Advisor</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Mr. Pease was previously president and CEO of Sabina Gold and Silver and was a Strategic Advisor and Director of Richfield Ventures until its acquisition by New Gold.</div></div>
        </main>
      `,
      "https://libertygold.ca/corporate/#leadership",
      "executive"
    );

    expect(people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Greg Etter",
          role: "Chair of the Board",
          group: "board",
          bio: expect.stringContaining("natural resources")
        }),
        expect.objectContaining({
          name: "Jon Gilligan",
          role: "President, CEO and Director",
          group: "executive",
          bio: expect.stringContaining("35 years")
        }),
        expect.objectContaining({
          name: "Moira Smith",
          role: "Corporate Technical Advisor",
          group: "technical",
          bio: expect.stringContaining("Long Canyon")
        }),
        expect.objectContaining({
          name: "Rob Pease",
          role: "Corporate Advisor",
          group: "advisor",
          bio: expect.stringContaining("Richfield")
        })
      ])
    );
  });

  it("extracts U.S. GoldMining-style bio cards without treating credentials as names", () => {
    const people = extractIssuerTeamPeople(
      `
        <h3>Management</h3>
        <div class="bmcl-bios-1">
          <div class="bio">
            <div class="body">
              <div class="body__name">Tim Smith, MSc (Hon), PGeo</div>
              <div class="body__title">President & CEO</div>
              <p>Mr. Smith was appointed as the Chief Executive Officer and President of the Company. Mr. Smith has more than 25 years mineral industry exploration and mining experience and a track record of discovery.</p>
            </div>
          </div>
          <div class="bio">
            <div class="body">
              <div class="body__name">Alastair Still, MSc, PGeo</div>
              <div class="body__title">Director and Chairman of the Board of Directors</div>
              <p>Mr. Still is co-founder of U.S. GoldMining and is an experienced mining industry professional with over 25 years of experience.</p>
            </div>
          </div>
        </div>
      `,
      "https://www.usgoldmining.us/corporate/our-team/",
      "executive"
    );

    expect(people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Tim Smith",
          role: "President & CEO",
          group: "executive",
          bio: expect.stringContaining("25 years")
        }),
        expect.objectContaining({
          name: "Alastair Still",
          role: "Director and Chairman of the Board of Directors",
          group: "board",
          bio: expect.stringContaining("co-founder")
        })
      ])
    );
    expect(people.map((person) => person.name)).not.toEqual(expect.arrayContaining([expect.stringContaining("MSc")]));
  });

  it("extracts Webflow leadership cards with names, titles, images, and bios", () => {
    const people = extractIssuerTeamPeople(
      `
        <div role="listitem" class="leader_item w-dyn-item">
          <div class="leader_container">
            <div class="leadership_names">Scott Berdahl</div>
            <div class="leader_titles"><div>CEO &amp; Director</div><div>|</div><div>MSc, MBA, P.Geo.</div></div>
            <img src="/scott.avif" class="leader_headshot" />
          </div>
          <div class="leader_bio-container">
            <div class="leader_bio"><p>Mr. Berdahl is a geologist and mining executive with Yukon exploration and public-company leadership experience.</p></div>
          </div>
        </div>
      `,
      "https://snowlinegold.com/leadership/",
      "executive"
    );

    expect(people).toEqual([
      expect.objectContaining({
        name: "Scott Berdahl",
        role: "CEO & Director",
        group: "executive",
        imageUrl: "https://snowlinegold.com/scott.avif",
        bio: expect.stringContaining("Yukon exploration")
      })
    ]);
  });

  it("extracts WordPress team-member cards without using credential suffixes as names", () => {
    const people = extractIssuerTeamPeople(
      `
        <div class="team-member fade-in">
          <img src="/randy.jpg" alt="Randy Reichert" />
          <div class="team-member__details">
            <h3 class="team-member__name">Randy Reichert, M.Sc. Eng., P.Eng.</h3>
            <p class="team-member__position">President, Chief Executive Officer &amp; Director</p>
          </div>
          <div class="team-member__bio">
            <p>Mr. Reichert has leadership experience in the mining industry and has advanced development-stage resource projects.</p>
          </div>
        </div>
      `,
      "https://skeenagoldsilver.com/company/leadership/",
      "executive"
    );

    expect(people).toEqual([
      expect.objectContaining({
        name: "Randy Reichert",
        role: "President, Chief Executive Officer & Director",
        group: "executive",
        imageUrl: "https://skeenagoldsilver.com/randy.jpg",
        bio: expect.stringContaining("resource projects")
      })
    ]);
  });

  it("extracts personnel cards used by issuer management and board pages", () => {
    const people = extractIssuerTeamPeople(
      `
        <div class="personnel-item no-photo">
          <div class="info">
            <h4>Richard Patricio</h4>
            <h5>Chairman</h5>
            <p>Mr. Patricio has built a number of mining companies with global operations and held senior officer and director positions.</p>
          </div>
        </div>
      `,
      "https://www.isoenergy.ca/about/board-of-directors/",
      "board"
    );

    expect(people).toEqual([
      expect.objectContaining({
        name: "Richard Patricio",
        role: "Chairman",
        group: "board",
        bio: expect.stringContaining("mining companies")
      })
    ]);
  });

  it("extracts Elementor heading and text-editor cards when the role is not a heading", () => {
    const people = extractIssuerTeamPeople(
      `
        <div class="wcg-person">
          <img src="/sandeep.jpg" alt="Sandeep Singh" />
          <h2 class="elementor-heading-title elementor-size-default">Sandeep Singh</h2>
          <div data-widget_type="text-editor.default">President &amp; CEO, Director</div>
          <div data-widget_type="theme-post-content.default">
            <p>Sandeep Singh joined Western Copper and Gold as CEO after senior leadership roles in mining royalties and capital markets.</p>
          </div>
        </div>
      `,
      "https://www.westerncopperandgold.com/about/",
      "executive"
    );

    expect(people).toEqual([
      expect.objectContaining({
        name: "Sandeep Singh",
        role: "President & CEO, Director",
        group: "executive",
        imageUrl: "https://www.westerncopperandgold.com/sandeep.jpg",
        bio: expect.stringContaining("capital markets")
      })
    ]);
  });

  it("tries likely corporate leadership URLs when homepage links are incomplete", async () => {
    const company = {
      ...resolveCompany("LGD.TO")!,
      websiteUrl: "https://libertygold.ca/"
    };
    const fetched: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetched.push(url);
      if (url === company.websiteUrl) {
        return html(`
          <h1>Liberty Gold</h1>
          <a href="/investors/presentation/">Presentation</a>
        `);
      }
      if (url === "https://libertygold.ca/corporate/") {
        return html(`
          <h2>Our Leadership</h2>
          <div class="elementor-heading-title elementor-size-default">Jon Gilligan</div>
          <div class="elementor-heading-title elementor-size-default">B.Sc. (Hons.), Ph.D.</div>
          <div class="elementor-heading-title elementor-size-default">President, CEO and Director</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Dr. Gilligan is a senior mining executive with over 35 years of mine construction and operations experience.</div></div>
          <div class="elementor-heading-title elementor-size-default">Joanna Bailey</div>
          <div class="elementor-heading-title elementor-size-default">B.Sc. Ph.D., CA (ICAS)</div>
          <div class="elementor-heading-title elementor-size-default">Chief Financial Officer and Corporate Secretary</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Dr. Bailey has accounting and financial reporting experience in Canada and the UK.</div></div>
        `);
      }
      if (url.includes("sedarplus.ca")) return html("<html>SEDAR+</html>");
      return new Response("", { status: 404 });
    });

    const result = await collectEvidence(company, { fetcher });

    expect(fetched).toContain("https://libertygold.ca/corporate/");
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ publisher: "Issuer team page", title: expect.stringContaining("Jon Gilligan") }),
        expect.objectContaining({ publisher: "Issuer team page", title: expect.stringContaining("Joanna Bailey") })
      ])
    );
    expect(result.status.adapters.find((adapter) => adapter.id === "company-website")?.note).toMatch(/searched/i);
  });

  it("uses rendered browser pages before plain fetch for issuer management discovery", async () => {
    const company = {
      ...resolveCompany("LGD.TO")!,
      websiteUrl: "https://libertygold.ca/"
    };
    const browserUrls: string[] = [];
    const fetched: string[] = [];
    const browserFetcher = vi.fn(async (url: string) => {
      browserUrls.push(url);
      if (url === company.websiteUrl) {
        return {
          url,
          finalUrl: url,
          title: "Liberty Gold",
          html: `
            <a href="/corporate/#leadership">Leadership</a>
          `,
          text: "Leadership",
          links: [{ href: "https://libertygold.ca/corporate/#leadership", title: "Leadership" }],
          mode: "playwright" as const,
          ok: true
        };
      }
      if (url === "https://libertygold.ca/corporate/#leadership") {
        return {
          url,
          finalUrl: url,
          title: "Leadership",
          html: `
            <h2>Our Leadership</h2>
            <div class="elementor-heading-title elementor-size-default">Jon Gilligan</div>
            <div class="elementor-heading-title elementor-size-default">B.Sc. (Hons.), Ph.D.</div>
            <div class="elementor-heading-title elementor-size-default">President, CEO and Director</div>
            <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Dr. Gilligan is a senior mining executive with over 35 years of mine construction and operations experience.</div></div>
          `,
          text: "Our Leadership Jon Gilligan President CEO Director",
          links: [],
          mode: "playwright" as const,
          ok: true
        };
      }
      return { url, finalUrl: url, title: "", html: "", text: "", links: [], mode: "playwright" as const, ok: false };
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetched.push(url);
      if (url.includes("sedarplus.ca")) return html("<html>SEDAR+</html>");
      return html("<h1>Static fallback should not be used for leadership extraction</h1>");
    });

    const result = await collectEvidence(company, { fetcher, browserFetcher });

    expect(browserUrls[0]).toBe(company.websiteUrl);
    expect(browserUrls).toContain("https://libertygold.ca/corporate/#leadership");
    expect(fetched).not.toContain("https://libertygold.ca/corporate/#leadership");
    expect(result.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ publisher: "Issuer team page", title: expect.stringContaining("Jon Gilligan") })])
    );
    expect(result.status.adapters.find((adapter) => adapter.id === "company-website")?.note).toMatch(/Playwright-rendered/i);
  });

  it("falls back to plain fetch when rendered browser management pages fail", async () => {
    const company = {
      ...resolveCompany("LGD.TO")!,
      websiteUrl: "https://libertygold.ca/"
    };
    const browserFetcher = vi.fn(async (url: string) => ({
      url,
      finalUrl: url,
      title: "",
      html: "",
      text: "",
      links: [],
      mode: "playwright" as const,
      ok: false,
      error: "Browser timeout"
    }));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === company.websiteUrl) return html("<a href=\"/corporate/\">Corporate</a>");
      if (url === "https://libertygold.ca/corporate/") {
        return html(`
          <div class="elementor-heading-title elementor-size-default">Joanna Bailey</div>
          <div class="elementor-heading-title elementor-size-default">B.Sc. Ph.D., CA (ICAS)</div>
          <div class="elementor-heading-title elementor-size-default">Chief Financial Officer and Corporate Secretary</div>
          <div data-widget_type="text-editor.default"><div class="elementor-widget-container">Dr. Bailey has accounting and financial reporting experience in Canada and the UK.</div></div>
        `);
      }
      if (url.includes("sedarplus.ca")) return html("<html>SEDAR+</html>");
      return new Response("", { status: 404 });
    });

    const result = await collectEvidence(company, { fetcher, browserFetcher });

    expect(browserFetcher).toHaveBeenCalled();
    expect(result.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ publisher: "Issuer team page", title: expect.stringContaining("Joanna Bailey") })])
    );
    expect(result.status.adapters.find((adapter) => adapter.id === "company-website")?.note).toMatch(/fetch fallback used/i);
  });

  it("collects rendered issuer website news releases with excerpts", async () => {
    const company = {
      ...resolveCompany("USGO")!,
      websiteUrl: "https://www.usgoldmining.us/"
    };
    const browserFetcher = vi.fn(async (url: string) => {
      if (url === company.websiteUrl) {
        return {
          url,
          finalUrl: url,
          title: "US GoldMining",
          html: "<a href=\"/news/\">News</a>",
          text: "News",
          links: [{ href: "https://www.usgoldmining.us/news/", title: "News" }],
          mode: "playwright" as const,
          ok: true
        };
      }
      if (url === "https://www.usgoldmining.us/news/") {
        return {
          url,
          finalUrl: url,
          title: "News",
          html: "<a href=\"/news/us-goldmining-announces-drill-results\">US GoldMining announces drill results</a>",
          text: "US GoldMining announces drill results",
          links: [
            {
              href: "https://www.usgoldmining.us/news/us-goldmining-announces-drill-results",
              title: "US GoldMining announces drill results"
            }
          ],
          mode: "playwright" as const,
          ok: true
        };
      }
      if (url === "https://www.usgoldmining.us/news/us-goldmining-announces-drill-results") {
        return {
          url,
          finalUrl: url,
          title: "US GoldMining announces drill results",
          html: "<article><h1>US GoldMining announces drill results</h1><p>US GoldMining reported new drill results from the Whistler project and outlined follow-up exploration work.</p></article>",
          text: "US GoldMining announces drill results US GoldMining reported new drill results from the Whistler project and outlined follow-up exploration work.",
          links: [],
          mode: "playwright" as const,
          ok: true
        };
      }
      return { url, finalUrl: url, title: "", html: "", text: "", links: [], mode: "playwright" as const, ok: false };
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("company_tickers.json")) {
        return json({ 0: { cik_str: 1947244, ticker: "USGO", title: "US GOLDMINING INC." } });
      }
      if (url.includes("data.sec.gov/submissions/CIK0001947244.json")) {
        return json({ filings: { recent: { accessionNumber: [], primaryDocument: [], form: [], filingDate: [] } } });
      }
      if (url.includes("globenewswire.com")) return html("<rss><channel></channel></rss>");
      return html("<h1>Static fallback</h1>");
    });

    const result = await collectEvidence(company, { fetcher, browserFetcher });

    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publisher: "Issuer website news",
          sourceType: "news",
          title: "US GoldMining announces drill results",
          excerpts: expect.arrayContaining([expect.stringContaining("Whistler project")])
        })
      ])
    );
    expect(result.status.adapters.find((adapter) => adapter.id === "issuer-news-browser")?.note).toMatch(/Playwright-rendered/i);
  });

  it("does not collect generic issuer document pages as rendered news", async () => {
    const company = {
      ...resolveCompany("WRN")!,
      websiteUrl: "https://www.westerncopperandgold.com/"
    };
    const browserFetcher = vi.fn(async (url: string) => {
      if (url === company.websiteUrl || url.endsWith("/news/")) {
        return {
          url,
          finalUrl: url,
          title: "Western Copper and Gold",
          html: `
            <a href="/investors/presentations/">Presentations</a>
            <a href="/projects/reserves-resources/">Reserves & Resources</a>
            <a href="/media/">News & Media</a>
            <a href="/technical-reports-resource-statement/">U.S. GoldMining - Technical Reports & Resource Statement</a>
            <a href="/news/2026/">2026</a>
          `,
          text: "Presentations Reserves & Resources News & Media Technical Reports 2026",
          links: [
            { href: "https://www.westerncopperandgold.com/investors/presentations/", title: "Presentations" },
            { href: "https://www.westerncopperandgold.com/projects/reserves-resources/", title: "Reserves & Resources" },
            { href: "https://www.westerncopperandgold.com/media/", title: "News & Media" },
            { href: "https://www.westerncopperandgold.com/technical-reports-resource-statement/", title: "U.S. GoldMining - Technical Reports & Resource Statement" },
            { href: "https://www.westerncopperandgold.com/news/2026/", title: "2026" }
          ],
          mode: "playwright" as const,
          ok: true
        };
      }
      return {
        url,
        finalUrl: url,
        title: "Presentations",
        html: "<main><h1>Presentations</h1><p>Corporate presentation archive and technical report links.</p></main>",
        text: "Presentations Corporate presentation archive and technical report links.",
        links: [],
        mode: "playwright" as const,
        ok: true
      };
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("globenewswire.com")) return html("<rss><channel></channel></rss>");
      return html("<h1>Static fallback</h1>");
    });

    const result = await collectEvidence(company, { fetcher, browserFetcher });

    expect(result.sources.filter((source) => source.publisher === "Issuer website news")).toEqual([]);
  });

  it("collects retrieved SEC, issuer-team, newswire, and insider evidence for a U.S. issuer", async () => {
    const company = resolveCompany("USGO");
    if (!company) throw new Error("Missing test company");

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("company_tickers.json")) {
        return json({ 0: { cik_str: 1947244, ticker: "USGO", title: "US GOLDMINING INC." } });
      }
      if (url.includes("data.sec.gov/submissions/CIK0001947244.json")) {
        return json({
          filings: {
            recent: {
              accessionNumber: ["0001947244-26-000001", "0001947244-26-000002"],
              primaryDocument: ["usgo-10k.htm", "usgo-form4.xml"],
              form: ["10-K", "4"],
              filingDate: ["2026-03-30", "2026-04-02"]
            }
          }
        });
      }
      if (url.endsWith("/usgo-10k.htm")) {
        return html(`
          <main>
            <p>The filing includes an S-K 1300 technical report summary, mineral resource estimate, metallurgy, infrastructure, and permitting disclosure.</p>
            <p>The filing reports the cash balance, working capital, shares outstanding, and financing requirements.</p>
          </main>
        `);
      }
      if (url.endsWith("/usgo-form4.xml")) {
        return html("<ownershipDocument><remarks>Insider ownership and reportable transactions are disclosed for the reporting owner.</remarks></ownershipDocument>");
      }
      if (url === company.websiteUrl) {
        return html(`
          <a href="/technical-report.pdf">Whistler technical report</a>
          <a href="/investors/presentation.pdf">Investor presentation</a>
          <a href="/news/drill-results">Drill results</a>
          <a href="/company/management">Management and board</a>
        `);
      }
      if (url.endsWith("/company/management")) {
        return html(`
          <h1>Management and Board</h1>
          <h3>Jane Doe</h3>
          <h4>Vice President, Exploration</h4>
          <p>Jane Doe is a geologist with project development, discovery, mine build, acquisition, and public-company financing experience.</p>
        `);
      }
      if (url.includes("globenewswire.com")) {
        return html(`
          <rss><channel>
            <item>
              <title>US GoldMining announces drill results and permitting update</title>
              <link>https://www.globenewswire.com/news-release/usgo-drill</link>
              <description>Drill results, resource estimate work, metallurgy, infrastructure and permitting timeline were updated.</description>
              <pubDate>Fri, 03 Jul 2026 12:00:00 GMT</pubDate>
            </item>
          </channel></rss>
        `);
      }
      return new Response("", { status: 404 });
    });

    const result = await collectEvidence(company, { fetcher });

    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ publisher: "SEC EDGAR", sourceType: "filing" }),
        expect.objectContaining({ publisher: "Issuer team page", title: expect.stringContaining("Jane Doe") }),
        expect.objectContaining({ publisher: "GlobeNewswire", sourceType: "news" }),
        expect.objectContaining({ publisher: "SEC EDGAR Insider Ownership", sourceType: "filing" })
      ])
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "technical_report", confidence: "medium" }),
        expect.objectContaining({ category: "drill_results" }),
        expect.objectContaining({ category: "management_biography", confidence: "medium" }),
        expect.objectContaining({ category: "prior_outcomes", sourceTitle: expect.stringContaining("Jane Doe") }),
        expect.objectContaining({ category: "capital_allocation", sourceTitle: expect.stringContaining("Jane Doe") }),
        expect.objectContaining({ category: "insider_ownership", sourceUrl: expect.stringContaining("Archives/edgar") })
      ])
    );
    expect(result.status.categories.find((item) => item.id === "technical_report")?.status).toBe("found");
    expect(result.status.categories.find((item) => item.id === "insider_ownership")?.status).toBe("found");
    expect(result.status.adapters.find((adapter) => adapter.id === "sec-edgar-live")?.status).toBe("configured");
    expect(result.status.adapters.find((adapter) => adapter.id === "management-roster")?.status).toBe("manual");
    expect(result.status.adapters.find((adapter) => adapter.id === "company-website")?.note).toMatch(/issuer team profile/i);
    expect(result.status.adapters.find((adapter) => adapter.id === "linkedin-candidate-discovery")?.note).toMatch(/three-tier status/i);
    expect(result.status.adapters.find((adapter) => adapter.id === "composio-management-search")?.status).toBe("needs_key");
  });

  it("records Canadian SEDAR+ discovery gaps without inventing unsupported facts", async () => {
    const company = resolveCompany("SGD.V");
    if (!company) throw new Error("Missing test company");

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === company.websiteUrl) return html("<h1>Snowline Gold</h1>");
      return new Response("", { status: 404 });
    });

    const result = await collectEvidence(company, { fetcher });

    expect(result.status.adapters.find((adapter) => adapter.id === "sedar-plus-live")?.status).toBe("needs_key");
    expect(result.status.categories.find((item) => item.id === "fully_diluted_shares")?.status).toBe("missing");
    expect(result.facts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "fully_diluted_shares" })])
    );
    expect(result.gaps).toEqual(expect.arrayContaining([expect.stringMatching(/fully diluted/i)]));
  });
});
