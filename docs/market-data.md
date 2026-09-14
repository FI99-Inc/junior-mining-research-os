# Market data

Yahoo Finance, accessed through the server-side `yahoo-finance2` package, is the application's only market-data provider. No Codex MCP connection or market-data API key is required by the app.

- Quotes supply price, daily change, market cap, volume, 52-week range, and outstanding shares when available.
- Yahoo summary modules supply financials, analyst targets, float, and holder percentages.
- Existing Yahoo-compatible Canadian suffixes and alternate listing discovery are retained.
- Missing fields stay unavailable. A provider failure produces a `not_sourced` snapshot without contacting a second provider.
- Issuer websites, SEC/SEDAR disclosure discovery, and news feeds remain separate evidence sources. Yahoo summaries do not establish fully diluted ownership, warrant schedules, technical reports, or management track records.

The previous secondary provider was removed from the application on 2026-09-13, including its fallback requests, credential lookup, seeded source, and adapter status. External Codex configuration and credentials were not modified. Previously generated in-memory reports retain their original provenance until a new research run is created.

The Mermaid architecture source and its PNG/SVG exports reflect the current provider inventory.
