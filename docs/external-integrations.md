# External integrations

Every external integration is optional. A provider failure leaves affected fields or evidence unavailable; it does not create replacement facts.

## SEC EDGAR

Automated SEC filing retrieval is enabled only when `SEC_USER_AGENT` contains an application name followed by a contact email address. The value is sent as the declared `User-Agent` header and is not a secret.

PowerShell example:

```powershell
$env:SEC_USER_AGENT = "Your Application Name contact@example.org"
pnpm.cmd server
```

The adapter serializes requests at a maximum target of eight requests per second, below the SEC's [published ten-request-per-second ceiling](https://www.sec.gov/about/webmaster-frequently-asked-questions). It makes at most three attempts for HTTP `408`, `425`, `429`, and temporary `5xx` responses, honors `Retry-After` up to five seconds, and applies an eight-second timeout to each attempt. Missing configuration is reported separately from temporary unavailability. The public submissions endpoints do not require an API key; see the [SEC EDGAR API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).

## SEDAR+

SEDAR+ is an outbound public disclosure reference only. The application does not currently perform issuer-specific SEDAR+ filing search, retrieval, or parsing. Portal reachability is not presented as evidence or automated discovery.

## Yahoo Finance

Yahoo Finance is accessed through `yahoo-finance2` as the only market-data provider. It is best-effort, may change or become unavailable without notice, and is not a substitute for issuer or regulatory filings. Missing values remain unavailable. The repository does not contain downloaded Yahoo responses or redistribute Yahoo data as demo fixtures; the offline demo is independently authored fictional data under `example.invalid` URLs.

## Issuer websites

Issuer management and news pages are collected with Playwright first and bounded plain-fetch fallback. Each attempt has an eight-second timeout. A run considers at most 12 team pages, eight news discovery pages, and eight news articles; failed browser pages receive at most one plain-fetch fallback. Sites may block automation, load content in unsupported ways, or change structure, and those outcomes are reported as unavailable or partial rather than inferred.

## GlobeNewswire

The public RSS request has an eight-second timeout, at most two attempts for temporary failures, and returns at most six matching items. GlobeNewswire can block requests or change its feed structure. Failures are reported as unavailable and do not create news evidence.

## Public profile and news reference links

LinkedIn URLs are supplied registry links or links discovered in retrieved public pages. The app does not log into LinkedIn, query a live LinkedIn integration, or verify current profile content. Composio is not a runtime adapter.

Junior Mining Network, MINING.com, TMX Newsfile, Kitco Mining, and Canadian Mining Report are optional outbound research references. They are not connected feeds and do not contribute evidence unless a future adapter retrieves a specific document.
