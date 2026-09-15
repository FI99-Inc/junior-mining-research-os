import type {
  AdapterStatus,
  CompanyCandidate,
  EvidenceCategoryStatus,
  EvidenceCollectionStatus,
  EvidenceFact,
  EvidenceFactCategory,
  SourceDocument
} from "./types";
import { existsSync } from "node:fs";
import type { Browser } from "playwright";
import { sourceAdapterStatuses } from "./sourceAdapters";

const retrievedAt = () => new Date().toISOString();
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_URL = (cik: string) => `https://data.sec.gov/submissions/CIK${cik}.json`;
const SEDAR_SEARCH_URL = "https://www.sedarplus.ca/";
const GLOBENEWSWIRE_RSS_URL = "https://www.globenewswire.com/rss/news-releases.xml";

const CATEGORY_LABELS: Record<EvidenceFactCategory, string> = {
  technical_report: "Technical report / project disclosure",
  drill_results: "Drill results",
  resource_estimate: "Resource estimate",
  metallurgy: "Metallurgy",
  infrastructure: "Infrastructure",
  permitting: "Permitting",
  cash_balance: "Cash balance",
  burn_rate: "Burn rate",
  cash_runway: "Cash runway",
  basic_shares: "Basic shares",
  fully_diluted_shares: "Fully diluted shares",
  warrants_options: "Warrants and options",
  recent_financing: "Recent financing",
  insider_ownership: "Insider ownership",
  management_biography: "Management biography",
  prior_outcomes: "Prior outcomes",
  capital_allocation: "Capital allocation history"
};

const FACT_PATTERNS: Array<{ category: EvidenceFactCategory; pattern: RegExp; confidence: EvidenceFact["confidence"] }> = [
  { category: "technical_report", pattern: /technical report|project disclosure|s-k 1300|ni 43-101/i, confidence: "medium" },
  { category: "drill_results", pattern: /drill results?|drilling/i, confidence: "medium" },
  { category: "resource_estimate", pattern: /resource estimate|mineral resource|measured|indicated|inferred/i, confidence: "medium" },
  { category: "metallurgy", pattern: /metallurg|recovery/i, confidence: "medium" },
  { category: "infrastructure", pattern: /infrastructure|road|power|access|water/i, confidence: "medium" },
  { category: "permitting", pattern: /permit|permitting|environmental|land tenure|baseline/i, confidence: "medium" },
  { category: "cash_balance", pattern: /cash balance|cash and cash equivalents|working capital/i, confidence: "medium" },
  { category: "burn_rate", pattern: /burn rate|operating expense|exploration spend/i, confidence: "low" },
  { category: "cash_runway", pattern: /runway|months of runway|planned work program/i, confidence: "low" },
  { category: "basic_shares", pattern: /shares outstanding|basic shares/i, confidence: "medium" },
  { category: "fully_diluted_shares", pattern: /fully diluted/i, confidence: "medium" },
  { category: "warrants_options", pattern: /warrants?|options?|option grants/i, confidence: "medium" },
  { category: "recent_financing", pattern: /private placement|financing|offering|use of proceeds/i, confidence: "medium" },
  { category: "insider_ownership", pattern: /insider ownership|beneficial ownership|form 4|sedi|insider/i, confidence: "medium" },
  { category: "management_biography", pattern: /management biography|director|chief executive|ceo|cfo|president/i, confidence: "medium" },
  { category: "prior_outcomes", pattern: /prior discoveries?|discoveries|mine builds?|mine development|past projects|track record|acquired|acquisition/i, confidence: "low" },
  { category: "capital_allocation", pattern: /capital allocation|financing history|public-company financings?|financings?|private placements?|transactions?|acquisition/i, confidence: "low" }
];

export interface EvidenceCollectionResult {
  sources: SourceDocument[];
  facts: EvidenceFact[];
  status: EvidenceCollectionStatus;
  gaps: string[];
}

interface EvidenceOptions {
  fetcher?: typeof fetch;
  browserFetcher?: BrowserPageFetcher;
  fetchTimeoutMs?: number;
  signal?: AbortSignal;
  now?: () => string;
}

type Fetcher = typeof fetch;
type AdapterEvidenceResult = { sources: SourceDocument[]; adapters: AdapterStatus[] };

export function createTimeoutFetcher(fetcher: Fetcher, timeoutMs = 8000, signal?: AbortSignal): Fetcher {
  return async (input, init) => {
    const signals = [signal, input instanceof Request ? input.signal : undefined, init?.signal]
      .filter((candidate): candidate is AbortSignal => Boolean(candidate));
    // Keep the deadline attached to the response body, not just the header request.
    const combined = AbortSignal.any([...signals, AbortSignal.timeout(timeoutMs)]);
    combined.throwIfAborted();
    return fetcher(input, { ...init, signal: combined });
  };
}

export interface BrowserPageResult {
  url: string;
  finalUrl: string;
  title: string;
  html: string;
  text: string;
  links: Array<{ href: string; title: string }>;
  mode: "playwright" | "fetch";
  ok: boolean;
  error?: string;
}

export type BrowserPageFetcher = ((url: string, options?: { timeoutMs?: number }) => Promise<BrowserPageResult>) & {
  close?: () => Promise<void>;
};

function cachedBrowserFetcher(fetcher: BrowserPageFetcher): BrowserPageFetcher {
  const cache = new Map<string, Promise<BrowserPageResult>>();
  const cached: BrowserPageFetcher = (url, options = {}) => {
    const key = url.replace(/\/$/, "").toLowerCase();
    const existing = cache.get(key);
    if (existing) return existing;
    const request = fetcher(url, options);
    cache.set(key, request);
    return request;
  };
  cached.close = fetcher.close;
  return cached;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "source";
}

function absoluteUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function linkTitle(value: string) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&ldquo;|&#8220;/gi, "\"")
    .replace(/&rdquo;|&#8221;/gi, "\"");
}

function withoutScriptsAndStyles(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
}

async function safeText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function extractAnchorLinks(pageHtml: string, baseUrl: string) {
  return Array.from(pageHtml.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)).map((match) => ({
    href: absoluteUrl(baseUrl, match[1]),
    title: linkTitle(match[2]) || match[1]
  }));
}

function sameOriginUrl(baseUrl: string, href: string) {
  try {
    const base = new URL(baseUrl);
    const target = new URL(href, base);
    return target.origin === base.origin ? target.toString() : undefined;
  } catch {
    return undefined;
  }
}

function browserUnavailable() {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}

export function createPlaywrightBrowserFetcher(): BrowserPageFetcher | undefined {
  if (browserUnavailable()) return undefined;

  let browserPromise: Promise<Browser> | undefined;

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = import("playwright").then(async ({ chromium }) => {
        const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        const launchOptions = existsSync(chromePath) ? { headless: true, executablePath: chromePath } : { headless: true };
        return chromium.launch(launchOptions);
      });
    }
    return browserPromise;
  }

  const fetchPage: BrowserPageFetcher = async (url, options = {}) => {
    const timeoutMs = options.timeoutMs ?? 8000;
    try {
      const browser = await getBrowser();
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(timeoutMs);
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        const title = await page.title().catch(() => "");
        const html = await page.content().catch(() => "");
        const text = (await page.locator("body").allTextContents().catch(() => [])).join(" ").replace(/\s+/g, " ").trim();
        const links = await page
          .evaluate(() =>
            Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
              href: (anchor as HTMLAnchorElement).href,
              title: (anchor.textContent ?? "").replace(/\s+/g, " ").trim()
            }))
          )
          .catch(() => []);
        return {
          url,
          finalUrl: page.url(),
          title,
          html,
          text,
          links,
          mode: "playwright" as const,
          ok: Boolean(response?.ok() ?? html)
        };
      } finally {
        await context.close().catch(() => undefined);
      }
    } catch (error) {
      return {
        url,
        finalUrl: url,
        title: "",
        html: "",
        text: "",
        links: [],
        mode: "playwright" as const,
        ok: false,
        error: error instanceof Error ? error.message : "Playwright page fetch failed"
      };
    }
  };
  fetchPage.close = async () => {
    const browser = await browserPromise?.catch(() => undefined);
    browserPromise = undefined;
    await browser?.close().catch(() => undefined);
  };
  return fetchPage;
}

type IssuerTeamGroup = "executive" | "board" | "technical" | "advisor" | "project_lead";

interface IssuerTeamPerson {
  name: string;
  role: string;
  bio: string;
  group: IssuerTeamGroup;
  imageUrl?: string;
}

const TEAM_LINK_PATTERN =
  /technical|report|presentation|investor|news|drill|resource|sedar|pdf|corporate|about|management|leadership|team|board|governance|advisor|director|executive|linkedin\.com\/in/i;
const NEWS_LINK_PATTERN =
  /news|press|release|media|announces?|drill|results?|financing|private placement|resource|permit|metallurg|update|corporate update/i;
const NEWS_ARTICLE_ACTION_PATTERN =
  /\b(announces?|intersects?|drills?|starts?|commences?|closes?|appoints?|results?|updates?|files?|publishes?|receives?|completes?|launches?|meeting|corporate update|private placement|financing|drill program|exploration program)\b/i;
const NEWS_DATE_PATTERN = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},\s+20\d{2}\b|\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/i;
const GENERIC_NEWS_PAGE_PATTERN =
  /\b(presentations?|corporate presentations?|technical reports?|resource statement|reserves? & resources?|mineral reserves?|mineral resources?|community media|news & media|created by exploration sites|explore timely updates)\b/i;
const GENERIC_NEWS_TITLE_PATTERN =
  /^(news|news releases?|press releases?|media|news & media|updates?|investors?|read more|learn more|view all|presentations?|corporate presentations?|technical reports?|reserves? & resources?|mineral reserves? and resources?|resources?|community media|created by .*|20\d{2})$/i;
const LEADERSHIP_ROLE_PATTERN =
  /\b(chair|chairman|director|president|ceo|chief|cfo|coo|vice president|vp|corporate secretary|advisor|qualified person|technical|exploration|general manager)\b/i;

function teamSectionType(url: string, title = ""): IssuerTeamGroup | undefined {
  const text = `${url} ${title}`.toLowerCase();
  if (/board|director/.test(text)) return "board";
  if (/advisor|advisory/.test(text)) return "advisor";
  if (/technical|geolog|qualified-person|qualified person/.test(text)) return "technical";
  if (/corporate|about|management|leadership|executive|our-team|team|governance/.test(text)) return "executive";
  return undefined;
}

function inferTeamGroup(role: string, fallback: IssuerTeamGroup): IssuerTeamGroup {
  if (/chief|ceo|cfo|coo|president|vp|vice president|secretary|general manager/i.test(role)) return "executive";
  if (/geolog|technical|qualified person|exploration|qp|mining|metallurgy/i.test(role) && !/board/i.test(role)) return "technical";
  if (/advisor|consultant/i.test(role)) return "advisor";
  if (/chair|director|board/i.test(role)) return "board";
  return fallback;
}

function plausiblePersonName(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 70) return false;
  if (
    !/[A-Z]/.test(clean) ||
    /[.,()&]|\d|@|TSX|OTC|About Us|Sign up|Subscribe|Management|Board of Directors|Our Team|Technical Team|Recent News|News|Team|President|Chief|Officer|Director|Chairman|Advisor|Vice|Corporate|Exploration|Geology|PhD|Ph\.D|B\.Sc|M\.Sc|P\.Geo|CPA|CA \(ICAS\)/i.test(clean)
  ) return false;
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 5;
}

function canonicalPersonName(value: string) {
  const clean = stripTags(value)
    .split(",")[0]
    .replace(/\b(MSc|BSc|PGeo|PhD|CPA|CA|Hon)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plausiblePersonName(clean) ? clean : undefined;
}

function isPlausibleLeadershipRole(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 140) return false;
  if (/^(technical team|management team|board of directors)$/i.test(clean)) return false;
  if (/united states|canada|province|territory|project|deposit|mine|resource estimate|technical report|presentation|overview|B\.Sc|M\.Sc|Ph\.D|P\.Geo|CPA|CA \(ICAS\)/i.test(clean)) return false;
  return LEADERSHIP_ROLE_PATTERN.test(clean);
}

function cleanRole(value: string) {
  return stripTags(value)
    .split("|")[0]
    .replace(/\b(MSc|BSc|MBA|PGeo|P\.Geo\.?|P\.Eng\.?|PhD|Ph\.D\.?|CPA|CA|Hon)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstImageUrl(blockHtml: string, baseUrl: string) {
  const match = blockHtml.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
  return match?.[1] ? absoluteUrl(baseUrl, match[1]) : undefined;
}

function cleanBio(value: string) {
  return stripTags(value)
    .replace(/\bImage:\s*[A-Z][A-Za-z .'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function classBlockPattern(className: string) {
  return new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
}

function classBlockText(blockHtml: string, className: string) {
  return cleanBio(blockHtml.match(classBlockPattern(className))?.[2] ?? "");
}

function likelyCompanyTeamLinks(baseUrl: string) {
  return [
    ["Corporate", "/corporate/"],
    ["Company", "/company/"],
    ["Company Leadership", "/company/leadership/"],
    ["Company Team", "/company/our-team/"],
    ["About", "/about/"],
    ["About Overview", "/about/overview/"],
    ["About Management", "/about/management/"],
    ["About Board of Directors", "/about/board-of-directors/"],
    ["About Us", "/about-us/"],
    ["Leadership", "/leadership/"],
    ["Management", "/management/"],
    ["Team", "/team/"],
    ["Our Team", "/our-team/"],
    ["Board of Directors", "/board-of-directors/"],
    ["Governance", "/governance/"],
    ["Corporate Management", "/corporate/management/"],
    ["Corporate Team", "/corporate/our-team/"]
  ].map(([title, href]) => ({ title, href: absoluteUrl(baseUrl, href) }));
}

function likelyCompanyNewsLinks(baseUrl: string) {
  return [
    ["News", "/news/"],
    ["News Releases", "/news-releases/"],
    ["Press Releases", "/press-releases/"],
    ["Media", "/media/"],
    ["Investors News", "/investors/news/"],
    ["Investor News", "/investor/news/"],
    ["Investors News Releases", "/investors/news-releases/"],
    ["Investors Press Releases", "/investors/press-releases/"],
    ["Latest News", "/latest-news/"]
  ].map(([title, href]) => ({ title, href: absoluteUrl(baseUrl, href) }));
}

function dedupeLinks<T extends { href: string }>(links: T[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.href.replace(/#.*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function elementorTokens(pageHtml: string) {
  const html = withoutScriptsAndStyles(pageHtml);
  const tokenPattern =
    /<(?:h[1-6]|div)[^>]*class=["'][^"']*elementor-heading-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|div)>|<div[^>]*data-widget_type=["'](?:text-editor|theme-post-content)\.default["'][^>]*>([\s\S]*?)<\/div>/gi;
  return Array.from(html.matchAll(tokenPattern))
    .map((match) => ({
      type: match[1] !== undefined ? ("heading" as const) : ("bio" as const),
      text: cleanBio(match[1] ?? match[2] ?? "")
    }))
    .filter((token) => token.text);
}

function extractElementorTeamPeople(pageHtml: string, sourceUrl: string, sectionType: IssuerTeamGroup): IssuerTeamPerson[] {
  const tokens = elementorTokens(pageHtml);
  const people: IssuerTeamPerson[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const nameToken = tokens[index];
    if (nameToken?.type !== "heading" || !plausiblePersonName(nameToken.text)) continue;
    let roleIndex = index + 1;
    if (tokens[roleIndex]?.type === "heading" && !isPlausibleLeadershipRole(tokens[roleIndex].text)) roleIndex += 1;
    const roleToken = tokens[roleIndex];
    const role = cleanRole(roleToken?.text ?? "");
    if ((roleToken?.type !== "heading" && roleToken?.type !== "bio") || !isPlausibleLeadershipRole(role) || role.length > 160) continue;
    const bioToken = tokens.slice(roleIndex + 1).find((token) => token.type === "bio" && token.text.length >= 40);
    if (!bioToken) continue;
    people.push({
      name: nameToken.text,
      role,
      bio: bioToken.text.slice(0, 900),
      group: inferTeamGroup(role, sectionType),
      imageUrl: firstImageUrl(pageHtml.slice(0, pageHtml.indexOf(nameToken.text)), sourceUrl)
    });
  }
  return people;
}

function extractBioCardPeople(pageHtml: string, sourceUrl: string, sectionType: IssuerTeamGroup): IssuerTeamPerson[] {
  return Array.from(
    withoutScriptsAndStyles(pageHtml).matchAll(
      /<div[^>]*class=["'][^"']*body__name[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*body__title[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<p[^>]*>([\s\S]*?)<\/p>/gi
    )
  )
    .map((match): IssuerTeamPerson | undefined => {
      const name = canonicalPersonName(match[1]);
      const role = cleanRole(match[2]);
      const bio = cleanBio(match[3]);
      if (!name || !isPlausibleLeadershipRole(role) || bio.length < 40) return undefined;
      return {
        name,
        role,
        bio,
        group: inferTeamGroup(role, sectionType),
        imageUrl: firstImageUrl(pageHtml.slice(Math.max(0, (match.index ?? 0) - 600), match.index ?? 0), sourceUrl)
      };
    })
    .filter((person): person is IssuerTeamPerson => Boolean(person));
}

function extractWebflowLeaderPeople(pageHtml: string, sourceUrl: string, sectionType: IssuerTeamGroup): IssuerTeamPerson[] {
  return Array.from(withoutScriptsAndStyles(pageHtml).matchAll(/<div[^>]*class=["'][^"']*leader_item[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'][^"']*leader_item|\s*$)/gi))
    .map((match): IssuerTeamPerson | undefined => {
      const blockHtml = match[1];
      const name = canonicalPersonName(classBlockText(blockHtml, "leadership_names"));
      const titleBlock = blockHtml.match(classBlockPattern("leader_titles"))?.[2] ?? "";
      const titleCandidates = Array.from(titleBlock.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)).map((item) => cleanBio(item[1]));
      const role = cleanRole(titleCandidates.find((item) => isPlausibleLeadershipRole(item)) ?? cleanBio(titleBlock));
      const bio = classBlockText(blockHtml, "leader_bio") || cleanBio(blockHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
      if (!name || !isPlausibleLeadershipRole(role) || bio.length < 40) return undefined;
      return {
        name,
        role,
        bio,
        group: inferTeamGroup(role, sectionType),
        imageUrl: firstImageUrl(blockHtml, sourceUrl)
      };
    })
    .filter((person): person is IssuerTeamPerson => Boolean(person));
}

function extractTeamMemberPeople(pageHtml: string, sourceUrl: string, sectionType: IssuerTeamGroup): IssuerTeamPerson[] {
  const html = withoutScriptsAndStyles(pageHtml);
  return Array.from(html.matchAll(/<h3[^>]*class=["'][^"']*team-member__name[^"']*["'][^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*class=["'][^"']*team-member__position[^"']*["'][^>]*>([\s\S]*?)<\/p>[\s\S]*?<div[^>]*class=["'][^"']*team-member__bio[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'][^"']*team-member\s|$)/gi))
    .map((match): IssuerTeamPerson | undefined => {
      const priorHtml = html.slice(Math.max(0, (match.index ?? 0) - 1200), match.index ?? 0);
      const name = canonicalPersonName(match[1]);
      const role = cleanRole(match[2]);
      const bio = cleanBio(match[3]);
      if (!name || !isPlausibleLeadershipRole(role) || bio.length < 40) return undefined;
      return {
        name,
        role,
        bio,
        group: inferTeamGroup(role, sectionType),
        imageUrl: firstImageUrl(priorHtml, sourceUrl)
      };
    })
    .filter((person): person is IssuerTeamPerson => Boolean(person));
}

function extractPersonnelPeople(pageHtml: string, sourceUrl: string, sectionType: IssuerTeamGroup): IssuerTeamPerson[] {
  return Array.from(withoutScriptsAndStyles(pageHtml).matchAll(/<div[^>]*class=["'][^"']*info[^"']*["'][^>]*>\s*<h4[^>]*>([\s\S]*?)<\/h4>\s*<h5[^>]*>([\s\S]*?)<\/h5>([\s\S]*?)<\/div>/gi))
    .map((match): IssuerTeamPerson | undefined => {
      const blockHtml = match[0];
      const name = canonicalPersonName(match[1]);
      const role = cleanRole(match[2]);
      const bio = cleanBio(Array.from(match[3].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)).map((item) => item[1]).join(" "));
      if (!name || !isPlausibleLeadershipRole(role) || bio.length < 40) return undefined;
      return {
        name,
        role,
        bio,
        group: inferTeamGroup(role, sectionType),
        imageUrl: firstImageUrl(blockHtml, sourceUrl)
      };
    })
    .filter((person): person is IssuerTeamPerson => Boolean(person));
}

export function extractIssuerTeamPeople(pageHtml: string, sourceUrl: string, sectionType: IssuerTeamGroup = "executive"): IssuerTeamPerson[] {
  const html = withoutScriptsAndStyles(pageHtml);
  const headingPattern = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = Array.from(html.matchAll(headingPattern)).map((match) => ({
    level: Number(match[1]),
    raw: match[0],
    text: stripTags(match[2]),
    index: match.index ?? 0
  }));
  const people: IssuerTeamPerson[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const nameHeading = headings[index];
    const roleHeading = headings[index + 1];
    if (!nameHeading || !roleHeading) continue;
    if (nameHeading.level > 3 || roleHeading.level <= nameHeading.level || !plausiblePersonName(nameHeading.text)) continue;
    const role = cleanRole(roleHeading.text);
    if (!isPlausibleLeadershipRole(role) || /overview|our team|governance|contact|subscribe/i.test(role)) continue;
    const nextPeer = headings.find((candidate, candidateIndex) => candidateIndex > index + 1 && candidate.level <= nameHeading.level);
    const blockEnd = nextPeer?.index ?? html.length;
    const blockHtml = html.slice(roleHeading.index + roleHeading.raw.length, blockEnd);
    const bio = cleanBio(blockHtml);
    if (bio.length < 40) continue;
    people.push({
      name: nameHeading.text,
      role,
      bio,
      group: inferTeamGroup(role, sectionType),
      imageUrl: firstImageUrl(blockHtml, sourceUrl)
    });
  }

  const seen = new Set<string>();
  return [
    ...people,
    ...extractElementorTeamPeople(pageHtml, sourceUrl, sectionType),
    ...extractBioCardPeople(pageHtml, sourceUrl, sectionType),
    ...extractWebflowLeaderPeople(pageHtml, sourceUrl, sectionType),
    ...extractTeamMemberPeople(pageHtml, sourceUrl, sectionType),
    ...extractPersonnelPeople(pageHtml, sourceUrl, sectionType)
  ].filter((person) => {
    const key = person.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 24);
}

function excerptsFromRetrievedDocument(rawDocument: string) {
  const text = stripTags(rawDocument).replace(/\s+/g, " ").trim();
  if (text.length < 20) return [];
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const relevant = sentences.filter((sentence) => FACT_PATTERNS.some((factPattern) => factPattern.pattern.test(sentence)));
  return (relevant.length ? relevant : sentences).slice(0, 6).map((sentence) => sentence.slice(0, 900));
}

async function collectSecEvidence(company: CompanyCandidate, fetcher: Fetcher, now: string): Promise<AdapterEvidenceResult> {
  const sources: SourceDocument[] = [];
  const adapters: AdapterStatus[] = [];
  if (company.country !== "US") return { sources, adapters };

  try {
    const tickersResponse = await fetcher(SEC_TICKERS_URL);
    if (!tickersResponse.ok) throw new Error("SEC ticker lookup failed");
    const tickers = (await tickersResponse.json()) as Record<string, { cik_str?: number; ticker?: string; title?: string }>;
    const match = Object.values(tickers).find((item) => item.ticker?.toUpperCase() === company.ticker.toUpperCase());
    if (!match?.cik_str) throw new Error("CIK not found");
    const cik = String(match.cik_str).padStart(10, "0");
    const submissionsUrl = SEC_SUBMISSIONS_URL(cik);
    const submissionsResponse = await fetcher(submissionsUrl);
    if (!submissionsResponse.ok) throw new Error("SEC submissions lookup failed");
    const submissions = (await submissionsResponse.json()) as {
      filings?: { recent?: { accessionNumber?: string[]; primaryDocument?: string[]; form?: string[]; filingDate?: string[] } };
    };
    const recent = submissions.filings?.recent;
    const forms = recent?.form ?? [];
    const accessions = recent?.accessionNumber ?? [];
    const documents = recent?.primaryDocument ?? [];
    const filingDates = recent?.filingDate ?? [];

    for (const [index, form] of forms.slice(0, 8).entries()) {
      const accession = accessions[index];
      const document = documents[index];
      if (!accession || !document) continue;
      const accessionPath = accession.replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${Number(match.cik_str)}/${accessionPath}/${document}`;
      let excerpts: string[] = [];
      try {
        const documentResponse = await fetcher(url);
        if (documentResponse.ok) excerpts = excerptsFromRetrievedDocument(await safeText(documentResponse));
      } catch {
        excerpts = [];
      }
      if (!excerpts.length) continue;
      sources.push({
        id: `sec-${company.id}-${slug(form)}-${index}`,
        title: `${form} filing${filingDates[index] ? ` filed ${filingDates[index]}` : ""}`,
        sourceType: "filing",
        publisher: form === "4" || form === "3" || form === "5" ? "SEC EDGAR Insider Ownership" : "SEC EDGAR",
        url,
        retrievedAt: now,
        excerpts
      });
    }
    adapters.push({
      id: "sec-edgar-live",
      name: "SEC EDGAR automated discovery",
      status: "configured",
      note: `Resolved CIK and retrieved ${sources.length} recent SEC filing document${sources.length === 1 ? "" : "s"} through official SEC endpoints.`,
      contributes: ["CIK resolution", "retrieved filing documents", "insider filing documents when available"],
      missing: sources.length ? ["structured filing table extraction", "S-K 1300 table parsing"] : ["retrievable filing document bodies"]
    });
  } catch {
    adapters.push({
      id: "sec-edgar-live",
      name: "SEC EDGAR automated discovery",
      status: "needs_key",
      note: "SEC discovery did not return usable live filing data for this run.",
      contributes: ["official U.S. filing discovery"],
      missing: ["CIK resolution", "recent filing URLs", "insider ownership forms"]
    });
  }
  return { sources, adapters };
}

async function collectSedarEvidence(company: CompanyCandidate, fetcher: Fetcher): Promise<AdapterEvidenceResult> {
  if (company.country !== "CA") return { sources: [] as SourceDocument[], adapters: [] as AdapterStatus[] };
  try {
    const response = await fetcher(SEDAR_SEARCH_URL);
    if (!response.ok) throw new Error("SEDAR+ unavailable");
    return {
      sources: [],
      adapters: [
        {
          id: "sedar-plus-live",
          name: "SEDAR+ automated discovery",
          status: "configured" as const,
          note: "SEDAR+ was reachable, but no issuer document was retrieved during this run, so no SEDAR+ evidence was added.",
          contributes: ["Canadian disclosure portal availability"],
          missing: ["issuer-specific document discovery", "document-level SEDAR+ download", "NI 43-101 PDF parsing"]
        }
      ]
    };
  } catch {
    return {
      sources: [] as SourceDocument[],
      adapters: [
        {
          id: "sedar-plus-live",
          name: "SEDAR+ automated discovery",
          status: "needs_key" as const,
          note: "SEDAR+ direct discovery was not available through fetch; browser-assisted discovery should be used later.",
          contributes: ["Canadian disclosure discovery path"],
          missing: ["technical reports", "MD&A", "financial statements", "management circulars"]
        }
      ]
    };
  }
}

async function collectCompanyWebsiteEvidence(
  company: CompanyCandidate,
  fetcher: Fetcher,
  now: string,
  browserFetcher?: BrowserPageFetcher
): Promise<AdapterEvidenceResult> {
  if (!company.websiteUrl) return { sources: [] as SourceDocument[], adapters: [] as AdapterStatus[] };
  try {
    let homepageHtml = "";
    let homepageLinks: Array<{ href: string; title: string }> = [];
    let homepageMode: BrowserPageResult["mode"] = "fetch";
    let usedBrowser = false;
    let usedFetchFallback = false;
    let browserFailures = 0;

    if (browserFetcher) {
      const browserHomepage = await browserFetcher(company.websiteUrl, { timeoutMs: 8000 });
      if (browserHomepage.ok && browserHomepage.html) {
        usedBrowser = true;
        homepageMode = "playwright";
        homepageHtml = browserHomepage.html;
        homepageLinks = browserHomepage.links
          .map((link) => ({ ...link, href: sameOriginUrl(company.websiteUrl!, link.href) ?? "" }))
          .filter((link) => link.href);
      } else {
        browserFailures += 1;
      }
    }

    if (!homepageHtml) {
      const response = await fetcher(company.websiteUrl);
      if (!response.ok) throw new Error("Company website unavailable");
      homepageHtml = await safeText(response);
      homepageLinks = extractAnchorLinks(homepageHtml, company.websiteUrl);
      usedFetchFallback = Boolean(browserFetcher);
      homepageMode = "fetch";
    }

    const discoveredLinks = [...homepageLinks, ...extractAnchorLinks(homepageHtml, company.websiteUrl)]
      .map((link) => ({ href: absoluteUrl(company.websiteUrl!, link.href), title: link.title || link.href }))
      .filter((link) => sameOriginUrl(company.websiteUrl!, link.href))
      .filter((link) => TEAM_LINK_PATTERN.test(`${link.href} ${link.title}`));
    const homeTeamType = teamSectionType(company.websiteUrl, "Company homepage leadership scan");
    const homepageTeamLink = homeTeamType ? [{ href: company.websiteUrl, title: "Company homepage leadership scan" }] : [];
    const links = dedupeLinks([...homepageTeamLink, ...discoveredLinks, ...likelyCompanyTeamLinks(company.websiteUrl)]).slice(0, 20);
    const sources: SourceDocument[] = [];
    const teamLinks: Array<{ href: string; title: string; sectionType: IssuerTeamGroup }> = links
      .map((link) => ({ ...link, sectionType: teamSectionType(link.href, link.title) }))
      .filter((link): link is { href: string; title: string; sectionType: IssuerTeamGroup } => Boolean(link.sectionType))
      .slice(0, 12);
    const teamPageResults: Array<{
      link: { href: string; title: string; sectionType: IssuerTeamGroup };
      people: IssuerTeamPerson[];
      mode: BrowserPageResult["mode"];
    }> = [];
    for (const link of teamLinks) {
      if (browserFetcher) {
        const browserPage = await browserFetcher(link.href, { timeoutMs: 8000 });
        if (browserPage.ok && browserPage.html) {
          usedBrowser = true;
          teamPageResults.push({
            link,
            people: extractIssuerTeamPeople(browserPage.html, browserPage.finalUrl || link.href, link.sectionType),
            mode: "playwright"
          });
          continue;
        }
        browserFailures += 1;
      }

      try {
        const pageResponse = await fetcher(link.href);
        if (!pageResponse.ok) throw new Error("Team page unavailable");
        const pageHtml = await safeText(pageResponse);
        usedFetchFallback = usedFetchFallback || Boolean(browserFetcher);
        teamPageResults.push({ link, people: extractIssuerTeamPeople(pageHtml, link.href, link.sectionType), mode: "fetch" });
      } catch {
        teamPageResults.push({ link, people: [] as IssuerTeamPerson[], mode: homepageMode });
      }
    }
    const issuerTeamSources = teamPageResults.flatMap((result, pageIndex) =>
      result.people.map((person, personIndex): SourceDocument => ({
        id: `issuer-team-${company.id}-${pageIndex}-${personIndex}-${slug(person.name)}`,
        title: `${person.name} - ${person.role}`,
        sourceType: "manual",
        publisher: "Issuer team page",
        url: result.link.href,
        retrievedAt: now,
        excerpts: [`${person.name} ${person.role}`, person.bio],
        imageUrl: person.imageUrl,
        managementGroup: person.group
      }))
    ).filter((source, index, allSources) => allSources.findIndex((candidate) => candidate.title.toLowerCase() === source.title.toLowerCase()) === index);
    sources.push(...issuerTeamSources);
    const peopleFound = issuerTeamSources.length;
    const pagesFound = teamPageResults.filter((result) => result.people.length).length;
    const collectionLabel = usedBrowser
      ? usedFetchFallback
        ? "Playwright-rendered issuer website search ran; fetch fallback used for unavailable pages"
        : "Playwright-rendered issuer website search ran"
      : usedFetchFallback
        ? "Playwright unavailable; fetch fallback used"
        : "Plain fetch issuer website search ran";
    return {
      sources,
      adapters: [
        {
          id: "company-website",
          name: "Company website browser crawler",
          status: "configured" as const,
          note: links.length
            ? `${collectionLabel}. Searched ${teamLinks.length} likely issuer leadership/team page${teamLinks.length === 1 ? "" : "s"}, discovered ${links.length} relevant issuer document link${links.length === 1 ? "" : "s"}, and extracted ${peopleFound} issuer team profile${peopleFound === 1 ? "" : "s"} from ${pagesFound} parsed page${pagesFound === 1 ? "" : "s"}.`
            : `${collectionLabel}. Company site loaded but no relevant document links were found.`,
          contributes: ["issuer presentations", "technical report links", "company news links", "management and governance links"],
          missing: links.length
            ? [
                "PDF text extraction for discovered links",
                peopleFound ? "LinkedIn reconciliation for issuer-sourced people" : "parseable management or board profile pages",
                ...(browserFailures ? [`${browserFailures} rendered page fetch attempt${browserFailures === 1 ? "" : "s"} failed`] : [])
              ]
            : ["issuer document links", "management and governance links"]
        }
      ]
    };
  } catch {
    return {
      sources: [] as SourceDocument[],
      adapters: [
        {
          id: "company-website",
          name: "Company website crawler",
          status: "needs_key" as const,
          note: "Company website could not be fetched during this run.",
          contributes: ["issuer presentations", "technical reports", "company news"],
          missing: ["website document discovery"]
        }
      ]
    };
  }
}

async function collectManagementDiscoveryEvidence(company: CompanyCandidate): Promise<AdapterEvidenceResult> {
  const people = company.management ?? [];

  return {
    sources: [],
    adapters: [
      {
        id: "management-roster",
        name: "Management roster context",
        status: "manual",
        note: people.length
          ? `${people.length} registry profile${people.length === 1 ? "" : "s"} remain available as matching context only; they do not create evidence or affect evidence confidence.`
          : "No structured management roster is available yet for this company.",
        contributes: ["matching context for retrieved issuer pages", "management diligence prompts"],
        missing: people.length
          ? ["document-backed roster verification", "full board and project-team extraction", "appointment-date extraction"]
          : ["executive roster", "board roster", "technical and project-lead roster"]
      },
      {
        id: "linkedin-candidate-discovery",
        name: "LinkedIn candidate discovery",
        status: people.some((person) => person.linkedInUrl && person.sourceUrl) ? "configured" : "manual",
        note:
          "LinkedIn profiles use a three-tier status: Verified, Likely match, or Needs review. Likely matches can display for coverage but remain conservative in scoring.",
        contributes: ["verified profile display", "likely profile coverage", "needs-review profile gaps"],
        missing: ["live LinkedIn candidate search at app runtime", "runtime Composio or LinkedIn provider configuration"]
      },
      {
        id: "composio-management-search",
        name: "Composio public management search",
        status: "needs_key",
        note:
          "Backend adapter boundary is reserved for Composio web search, but runtime provider credentials are not configured in this app process yet.",
        contributes: ["public web discovery for leadership, board, LinkedIn, and prior outcomes"],
        missing: ["runtime Composio API credential", "search-result persistence", "candidate review queue"]
      }
    ]
  };
}

function companySearchTerms(company: CompanyCandidate) {
  const tickerRoot = company.ticker.replace(/\.(v|to)$/i, "");
  return [company.name, tickerRoot, ...(company.aliases ?? [])]
    .map((term) => term.toLowerCase().replace(/\.(v|to)$/i, "").trim())
    .filter((term, index, allTerms) => term.length >= 2 && allTerms.indexOf(term) === index);
}

function newsArticleTitle(title: string, href: string) {
  const cleanTitle = title
    .replace(/\.[a-z0-9_-]+\s*\{[^}]*\}/gi, " ")
    .replace(/\s*\{[^}]*\}\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanTitle && !GENERIC_NEWS_TITLE_PATTERN.test(cleanTitle) && cleanTitle.length >= 12) return cleanTitle.slice(0, 180);
  const segments = href
    .replace(/[#?].*$/, "")
    .split("/")
    .filter(Boolean);
  const last = segments.at(-1) ?? cleanTitle;
  return decodeURIComponent(last.replace(/[-_]+/g, " ")).replace(/\s+/g, " ").trim().slice(0, 180);
}

function isLikelyNewsArticleLink(link: { href: string; title: string }, company: CompanyCandidate) {
  const haystack = `${link.href} ${link.title}`.toLowerCase();
  if (!NEWS_LINK_PATTERN.test(haystack)) return false;
  if (/\.(pdf|jpg|jpeg|png|webp|gif|zip)$/i.test(link.href)) return false;
  const title = newsArticleTitle(link.title, link.href);
  if (GENERIC_NEWS_TITLE_PATTERN.test(title)) return false;
  if (/^explore timely updates/i.test(title)) return false;
  if (GENERIC_NEWS_PAGE_PATTERN.test(title) && !NEWS_DATE_PATTERN.test(title) && !NEWS_ARTICLE_ACTION_PATTERN.test(title)) return false;
  if (!NEWS_ARTICLE_ACTION_PATTERN.test(title) && !NEWS_DATE_PATTERN.test(title) && !/\/20\d{2}[/-]/.test(link.href)) return false;
  const terms = companySearchTerms(company);
  return terms.some((term) => haystack.includes(term)) || /drill|result|financing|resource|permit|technical|metallurg|corporate update|announces?/i.test(haystack);
}

function sourceExcerptFromNewsPage(page: BrowserPageResult, company: CompanyCandidate) {
  const text = (page.text || stripTags(page.html)).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const terms = companySearchTerms(company);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const relevant = sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return terms.some((term) => lower.includes(term)) || NEWS_LINK_PATTERN.test(sentence);
  });
  return (relevant.length ? relevant : sentences).slice(0, 3).join(" ").slice(0, 700);
}

async function collectIssuerNewsEvidence(
  company: CompanyCandidate,
  fetcher: Fetcher,
  now: string,
  browserFetcher?: BrowserPageFetcher
): Promise<AdapterEvidenceResult> {
  if (!company.websiteUrl) return { sources: [], adapters: [] };
  const sources: SourceDocument[] = [];
  let browserFailures = 0;
  let usedBrowser = false;
  let usedFetchFallback = false;

  try {
    const discoveryPages = dedupeLinks([{ title: "Company homepage", href: company.websiteUrl }, ...likelyCompanyNewsLinks(company.websiteUrl)]).slice(0, 8);
    const articleCandidates: Array<{ href: string; title: string }> = [];

    for (const pageLink of discoveryPages) {
      let page: BrowserPageResult | undefined;
      if (browserFetcher) {
        const rendered = await browserFetcher(pageLink.href, { timeoutMs: 8000 });
        if (rendered.ok && rendered.html) {
          usedBrowser = true;
          page = rendered;
        } else {
          browserFailures += 1;
        }
      }

      if (!page) {
        try {
          const response = await fetcher(pageLink.href);
          if (!response.ok) continue;
          const html = await safeText(response);
          usedFetchFallback = usedFetchFallback || Boolean(browserFetcher);
          page = {
            url: pageLink.href,
            finalUrl: pageLink.href,
            title: pageLink.title,
            html,
            text: stripTags(html),
            links: extractAnchorLinks(html, pageLink.href),
            mode: "fetch",
            ok: true
          };
        } catch {
          continue;
        }
      }

      articleCandidates.push(
        ...page.links
          .map((link) => ({ href: sameOriginUrl(company.websiteUrl!, link.href) ?? "", title: link.title || link.href }))
          .filter((link) => link.href)
          .filter((link) => isLikelyNewsArticleLink(link, company))
      );
    }

    const articleLinks = dedupeLinks(articleCandidates).slice(0, 8);
    for (const [index, link] of articleLinks.entries()) {
      let page: BrowserPageResult | undefined;
      if (browserFetcher) {
        const rendered = await browserFetcher(link.href, { timeoutMs: 8000 });
        if (rendered.ok && rendered.html) {
          usedBrowser = true;
          page = rendered;
        } else {
          browserFailures += 1;
        }
      }

      if (!page) {
        try {
          const response = await fetcher(link.href);
          if (!response.ok) continue;
          const html = await safeText(response);
          usedFetchFallback = usedFetchFallback || Boolean(browserFetcher);
          page = {
            url: link.href,
            finalUrl: link.href,
            title: link.title,
            html,
            text: stripTags(html),
            links: extractAnchorLinks(html, link.href),
            mode: "fetch",
            ok: true
          };
        } catch {
          continue;
        }
      }

      const title = newsArticleTitle(page.title || link.title, page.finalUrl || link.href);
      const excerpt = sourceExcerptFromNewsPage(page, company);
      if (GENERIC_NEWS_TITLE_PATTERN.test(title)) continue;
      if (/^explore timely updates/i.test(title)) continue;
      if (GENERIC_NEWS_PAGE_PATTERN.test(`${title} ${excerpt}`) && !NEWS_DATE_PATTERN.test(`${title} ${excerpt}`) && !NEWS_ARTICLE_ACTION_PATTERN.test(title)) continue;
      if (!NEWS_ARTICLE_ACTION_PATTERN.test(`${title} ${excerpt}`) && !NEWS_DATE_PATTERN.test(`${title} ${excerpt}`)) continue;
      if (!title || !excerpt || !NEWS_LINK_PATTERN.test(`${title} ${excerpt}`)) continue;
      sources.push({
        id: `issuer-news-${company.id}-${index}-${slug(title)}`,
        title,
        sourceType: "news",
        publisher: "Issuer website news",
        url: page.finalUrl || link.href,
        retrievedAt: now,
        excerpts: [excerpt]
      });
    }

    const modeLabel = usedBrowser
      ? usedFetchFallback
        ? "Playwright-rendered issuer news search ran; fetch fallback used for unavailable pages"
        : "Playwright-rendered issuer news search ran"
      : usedFetchFallback
        ? "Playwright unavailable; fetch fallback used"
        : "Plain fetch issuer news search ran";
    return {
      sources: sources.filter((source, index, allSources) => allSources.findIndex((candidate) => candidate.url === source.url) === index),
      adapters: [
        {
          id: "issuer-news-browser",
          name: "Issuer website news browser crawler",
          status: "configured",
          note: `${modeLabel}. Checked ${discoveryPages.length} issuer news/home page${discoveryPages.length === 1 ? "" : "s"} and collected ${sources.length} article source${sources.length === 1 ? "" : "s"}.`,
          contributes: ["issuer news releases", "media posts", "drill result updates", "financing and project news"],
          missing: sources.length
            ? browserFailures
              ? [`${browserFailures} rendered news page fetch attempt${browserFailures === 1 ? "" : "s"} failed`]
              : []
            : ["issuer-specific rendered news articles"]
        }
      ]
    };
  } catch {
    return {
      sources: [],
      adapters: [
        {
          id: "issuer-news-browser",
          name: "Issuer website news browser crawler",
          status: "needs_key",
          note: "Issuer website news could not be collected during this run.",
          contributes: ["issuer news releases", "media posts"],
          missing: ["rendered issuer news discovery"]
        }
      ]
    };
  }
}

async function collectNewswireEvidence(company: CompanyCandidate, fetcher: Fetcher, now: string): Promise<AdapterEvidenceResult> {
  try {
    const response = await fetcher(GLOBENEWSWIRE_RSS_URL);
    if (!response.ok) throw new Error("Newswire feed unavailable");
    const rss = await safeText(response);
    const items = Array.from(rss.matchAll(/<item>([\s\S]*?)<\/item>/gi))
      .map((match) => {
        const body = match[1];
        const title = stripTags(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
        const link = stripTags(body.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
        const description = stripTags(body.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "");
        const date = stripTags(body.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
        return { title, link, description, date };
      })
      .filter((item) => {
        const haystack = `${item.title} ${item.description}`.toLowerCase();
        return [company.ticker, company.name, ...(company.aliases ?? [])].some((term) => haystack.includes(term.toLowerCase().replace(/\.(v|to)$/i, "")));
      })
      .slice(0, 6);
    const sources: SourceDocument[] = items.map((item, index) => ({
        id: `newswire-${company.id}-${index}-${slug(item.title)}`,
        title: item.title,
        sourceType: "news",
        publisher: "GlobeNewswire",
        url: item.link || GLOBENEWSWIRE_RSS_URL,
        retrievedAt: now,
        excerpts: [item.description || item.title, item.date ? `Published ${item.date}.` : "Newswire item discovered from RSS."]
      }));
    return {
      sources,
      adapters: [
        {
          id: "newswire-rss",
          name: "Newswire RSS discovery",
          status: "configured" as const,
          note: items.length ? `Matched ${items.length} issuer news item${items.length === 1 ? "" : "s"}.` : "Newswire feed loaded but no issuer-specific items matched.",
          contributes: ["drill result news", "financing announcements", "technical and permitting updates"],
          missing: items.length ? [] : ["issuer-specific news matches"]
        }
      ]
    };
  } catch {
    return {
      sources: [] as SourceDocument[],
      adapters: [
        {
          id: "newswire-rss",
          name: "Newswire RSS discovery",
          status: "needs_key" as const,
          note: "Newswire RSS could not be fetched during this run.",
          contributes: ["issuer news discovery"],
          missing: ["drill result news", "financing announcements", "technical updates"]
        }
      ]
    };
  }
}

function extractEvidenceFacts(sources: SourceDocument[], now: string): EvidenceFact[] {
  const used = new Set<string>();
  const facts: EvidenceFact[] = [];
  for (const source of sources) {
    for (const excerpt of source.excerpts) {
      for (const factPattern of FACT_PATTERNS) {
        const key = `${source.id}-${factPattern.category}`;
        if (used.has(key) || !factPattern.pattern.test(excerpt)) continue;
        used.add(key);
        facts.push({
          id: `fact-${source.id}-${factPattern.category}`,
          category: factPattern.category,
          label: CATEGORY_LABELS[factPattern.category],
          value: excerpt,
          sourceId: source.id,
          sourceUrl: source.url,
          sourceTitle: source.title,
          excerpt,
          confidence: factPattern.confidence,
          retrievedAt: now
        });
      }
    }
  }
  return facts;
}

function buildStatus(facts: EvidenceFact[], adapters: AdapterStatus[], now: string): EvidenceCollectionStatus {
  const categories = Object.entries(CATEGORY_LABELS).map(([id, label]): EvidenceCategoryStatus => {
    const count = facts.filter((fact) => fact.category === id).length;
    return { id: id as EvidenceFactCategory, label, status: count ? "found" : "missing", factCount: count };
  });
  const found = categories.filter((category) => category.status === "found").length;
  const gaps = categories.filter((category) => category.status === "missing").map((category) => category.label);
  return {
    mode: "automated",
    summary: `${found} of ${categories.length} evidence categories have cited automated evidence.`,
    adapters,
    categories,
    gaps,
    updatedAt: now
  };
}

function dedupeSources(sources: SourceDocument[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.publisher}-${source.url}-${source.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function collectEvidence(company: CompanyCandidate, options: EvidenceOptions = {}): Promise<EvidenceCollectionResult> {
  const fetcher = createTimeoutFetcher(options.fetcher ?? fetch, options.fetchTimeoutMs, options.signal);
  const ownedBrowserFetcher = options.browserFetcher ? undefined : createPlaywrightBrowserFetcher();
  const rawBrowserFetcher = options.browserFetcher ?? ownedBrowserFetcher;
  const browserFetcher = rawBrowserFetcher ? cachedBrowserFetcher(rawBrowserFetcher) : undefined;
  try {
    const now = options.now?.() ?? retrievedAt();
    // Let every adapter settle before closing the browser shared by this run.
    const results = await Promise.allSettled([
      collectSecEvidence(company, fetcher, now),
      collectSedarEvidence(company, fetcher),
      collectCompanyWebsiteEvidence(company, fetcher, now, browserFetcher),
      collectIssuerNewsEvidence(company, fetcher, now, browserFetcher),
      collectNewswireEvidence(company, fetcher, now),
      collectManagementDiscoveryEvidence(company)
    ]);
    const collected = results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    const sources = dedupeSources(collected.flatMap((result) => result.sources));
    const facts = extractEvidenceFacts(sources, now).filter((fact) => fact.sourceUrl && fact.excerpt);
    const adapters = [...sourceAdapterStatuses(company), ...collected.flatMap((result) => result.adapters)];
    const status = buildStatus(facts, adapters, now);
    return { sources, facts, status, gaps: status.gaps };
  } finally {
    await ownedBrowserFetcher?.close?.();
  }
}
