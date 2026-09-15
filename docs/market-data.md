# Market data

Yahoo Finance, accessed through the server-side `yahoo-finance2` package, is the application's only market-data provider. No Codex MCP connection or market-data API key is required by the app.

- Quotes supply price, daily change, market cap, volume, 52-week range, and outstanding shares when available.
- Yahoo summary modules supply financials, analyst targets, float, and holder percentages.
- Existing Yahoo-compatible Canadian suffixes and alternate listing discovery are retained.
- Missing fields stay unavailable. A provider failure produces a `not_sourced` snapshot without contacting a second provider.
- Issuer websites, SEC/SEDAR disclosure discovery, and news feeds remain separate evidence sources. Yahoo summaries do not establish fully diluted ownership, warrant schedules, technical reports, or management track records.

Market data is separate from research evidence. Regulatory, issuer, management, and news claims enter a report only when the current run retrieves the supporting document or the user explicitly supplies a source. Portal availability and discovered links remain collection status until document content is available.

The Mermaid architecture source and its PNG/SVG exports reflect the current provider inventory.
