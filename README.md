# Junior Mining Research OS

A private, browser-based research guide for Canada- and U.S.-listed junior mining companies. Enter a supported ticker or company name to generate a sourced report covering investment quality, market perspectives, management, risks, news, share structure, financials, and evidence provenance.

The application is a research aid, not a buy/sell recommendation. Unsupported facts remain unavailable rather than being inferred.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- Google Chrome or Playwright Chromium for rendered issuer-site collection

## Local development

Install dependencies:

```powershell
pnpm.cmd install
```

Start the API in one terminal:

```powershell
pnpm.cmd server
```

Start the web app in a second terminal:

```powershell
pnpm.cmd dev
```

Open `http://127.0.0.1:5173/`. The Vite server proxies `/api` requests to the Express API at `http://127.0.0.1:4173/`.

The optional `PORT` setting changes the API port from `4173`. If changed, update the Vite proxy in `vite.config.ts` to match. No market-data API key is required.

## Two-minute offline demo

The demo uses one clearly fictional company and makes no Yahoo Finance, SEC, SEDAR+, newswire, issuer-site, or Playwright requests.

1. Install dependencies with `pnpm.cmd install`.
2. Start the fictional API fixture in one terminal:

   ```powershell
   pnpm.cmd server:demo
   ```

3. Start the web app in a second terminal:

   ```powershell
   pnpm.cmd dev
   ```

4. Open `http://127.0.0.1:5173/`, confirm the persistent **Demo data — fictional and not investment research** banner, and select `AEON.V`.
5. Review Investment Quality, Market Perspectives, Management, Risks, News, Shares, Financials, and Sources. Every company, person, value, event, and `example.invalid` link in this mode is fictional.

The equivalent configuration flag is `DEMO_MODE=1`; in PowerShell, run `$env:DEMO_MODE = "1"` before `pnpm.cmd server`. Restart with `pnpm.cmd server` and no demo flag to use normal live research. Demo mode is read-only and isolated: it exposes only the fictional issuer and ignores imported evidence. Live mode never exposes the demo issuer or fixture.

## Quality commands

```powershell
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd check
```

`check` runs strict typechecking, the complete Vitest suite, and the production build.

## Architecture

- `src/App.tsx`: report workspace and interaction state.
- `src/api/researchApi.ts`: typed browser API requests and response-error handling.
- `src/domain/companyResolver.ts`: supported company registry and search.
- `src/domain/sourceAdapters.ts`: Yahoo Finance market, financial, forecast, and available ownership data.
- `src/domain/evidencePipeline.ts`: SEC, SEDAR+, issuer-site, management, and news evidence collection.
- `src/domain/researchEngine.ts`: evidence-aware scoring and report generation.
- `server/app.ts`: Express routes and research-run orchestration.
- `server/demoFixture.ts`: deterministic fictional data used only when demo mode is explicitly active.
- `tests/`: API, domain, evidence, adapter, and rendered-component coverage.

Research runs are stored in process memory and are cleared when the API restarts. Issuer websites and public data providers can be unavailable, stale, or incomplete; the UI preserves those gaps for diligence. See [market-data.md](docs/market-data.md) and [cleanup-audit.md](docs/cleanup-audit.md) for provider and maintenance details.

Visual asset provenance and third-party attributions are documented in [ASSET-LICENSES.md](ASSET-LICENSES.md). The application does not hotlink portraits or background images.

## Evidence provenance

- Automated evidence is accepted only after the referenced document or page is retrieved during the current research run.
- Regulatory portal availability and discovered-but-unretrieved links are reported as adapter status or missing-data gaps, not evidence.
- Manual evidence is included only when supplied explicitly in the research request with a source URL and excerpts.
- Registry company and management fields provide search and display context; they do not create evidence, citations, or evidence-confidence gains by themselves.
- Test-only synthetic evidence lives under `tests/` and is never imported by the application or server runtime.
- The separate fictional demo fixture is reachable only through explicit demo mode, is visibly labeled, and cannot enter live research or live scoring.
