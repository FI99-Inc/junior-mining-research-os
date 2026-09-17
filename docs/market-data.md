# Market data

Yahoo Finance, accessed through the server-side `yahoo-finance2` package, is the application's only market-data provider. No Codex MCP connection or market-data API key is required by the app. This is a best-effort, unofficial data path that can change or become unavailable without notice; it is not filing-backed.

- Quotes supply price, daily change, market cap, volume, 52-week range, and outstanding shares when available.
- Yahoo summary modules supply financials, analyst targets, float, and holder percentages.
- Existing Yahoo-compatible Canadian suffixes and alternate listing discovery are retained.
- Missing fields stay unavailable. A provider failure produces a `not_sourced` snapshot without contacting a second provider.
- Issuer websites, optional SEC retrieval, the SEDAR+ public reference, and retrieved news documents remain separate from market data. Yahoo summaries do not establish fully diluted ownership, warrant schedules, technical reports, or management track records.

Market data is separate from research evidence. Regulatory, issuer, management, and news claims enter a report only when the current run retrieves the supporting document or the user explicitly supplies a source. Portal availability and discovered links remain collection status until document content is available. Downloaded Yahoo responses are not stored in the repository or redistributed as fixtures.

The Mermaid architecture source and its PNG/SVG exports reflect the current provider inventory.

## September 2026 financial-module evaluation

The 12-issuer live baseline was compared field by field with Yahoo's `fundamentalsTimeSeries` endpoint before changing production behavior. A full replacement was not shipped:

- `fundamentalsTimeSeries` supplied a usable operating-expense value for 11 issuers, improving that one field.
- The replacement lost ten revenue values and two gross-profit values in the remaining active universe because Yahoo omitted zero-value exploration-stage rows from the time-series response.
- Annual time-series values also differed materially from current-summary values for EBITDA, cash flow, cash, and debt. Those periods are not interchangeable.
- Arizona Sonoran returned no current time-series or quote route because Hudbay completed its acquisition and the ASCU shares were delisted in June 2026.

The application therefore retains its current Yahoo summary and legacy statement request. A future narrowly scoped fallback may use `fundamentalsTimeSeries` only when it can preserve currency and period provenance without replacing a newer valid value. Live comparison output is intentionally not committed or redistributed as fixture data.

## Current Canadian symbol routes

The active company registry uses the current TSX Yahoo routes `GMIN.TO`, `SGD.TO`, and `ISO.TO`. Historical Venture symbols remain aliases so existing searches still resolve to the same issuer. These routes are supported by the issuers or exchange notices:

- [G Mining Ventures TSX listing](https://www.tsx.com/en/news/new-company-listings?id=1719&lang=en)
- [Snowline TSX graduation](https://www.snowlinegold.com/news/snowline-announces-graduation-to-the-toronto-stock-exchange)
- [IsoEnergy TSX graduation](https://www.isoenergy.ca/news-media/news/isoenergy-announces-final-tsx-listing-approval-to-graduate--to-the-toronto-stock-exchange)
- [Hudbay completion of the Arizona Sonoran acquisition](https://hudbay.com/investors/press-releases/press-release-details/2026/Hudbay-Completes-Acquisition-of-Arizona-Sonoran-to-Create-the-Third-Largest-Copper-District-in-North-America/default.aspx)

ASCU is no longer included in the active tradable universe. The application does not substitute Hudbay or the former OTC security for ASCU because those are different securities.
