# Junior Mining Research OS

A browser-based research guide for Canada- and U.S.-listed junior mining companies. Enter a supported ticker or company name to generate a sourced report covering investment quality, market perspectives, management, risks, news, share structure, financials, and evidence provenance.

The application is a research aid, not financial advice or a buy/sell recommendation. Unsupported facts remain unavailable rather than being inferred. Independently verify all material facts before making an investment decision.

## Requirements

- Node.js 22 or newer
- pnpm 11.19.0 (declared by the `packageManager` field)
- Playwright-managed Chromium for optional rendered issuer-site collection

## Live mode and local development

Install dependencies:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

On Linux, install Chromium and its required system packages together:

```sh
pnpm exec playwright install --with-deps chromium
```

Start the API in one terminal:

```sh
pnpm server
```

Start the web app in a second terminal:

```sh
pnpm dev
```

Open `http://127.0.0.1:5173/`. The Vite server proxies `/api` requests to the Express API at `http://127.0.0.1:4173/`.

Live mode is the default. It makes best-effort external requests when a research run starts and displays unavailable providers or missing evidence rather than replacing them with fixture data.

The optional `PORT` setting changes the API port from `4173`. If changed, update the Vite proxy in `vite.config.ts` to match. No market-data API key is required.

Playwright uses its managed Chromium build by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when the deployment must use a specific Chromium-compatible executable. Set `DISABLE_RENDERED_CRAWLING=1` to skip Playwright and use the bounded plain-fetch fallback. If Chromium is absent or cannot launch, the research run continues with plain fetch and reports actionable setup guidance in the adapter status.

On Windows PowerShell, use the `.cmd` shim if `pnpm` is not resolved directly, for example `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd exec playwright install chromium`, `pnpm.cmd server`, and `pnpm.cmd dev`.

Automated SEC EDGAR retrieval is optional and requires a declared application contact. Set `SEC_USER_AGENT` in the shell that starts the API, using the format `Application Name contact@example.org`. Do not commit personal contact details to `.env.example` or source files. Without this setting, SEC collection is skipped and shown as needing configuration; the rest of the research run continues normally.

## Two-minute offline demo

The demo uses one clearly fictional company and makes no Yahoo Finance, SEC, SEDAR+, newswire, issuer-site, or Playwright requests.

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Start the fictional API fixture in one terminal:

   ```sh
   pnpm server:demo
   ```

3. Start the web app in a second terminal:

   ```sh
   pnpm dev
   ```

4. Open `http://127.0.0.1:5173/`, confirm the persistent **Demo data — fictional and not investment research** banner, and select `AEON.V`.
5. Review Investment Quality, Market Perspectives, Management, Risks, News, Shares, Financials, and Sources. Every company, person, value, event, and `example.invalid` link in this mode is fictional.

The equivalent configuration flag is `DEMO_MODE=1`; in PowerShell, run `$env:DEMO_MODE = "1"` before `pnpm.cmd server`. Restart without the demo flag to use normal live research. Demo mode is read-only and isolated: it exposes only the fictional issuer and ignores imported evidence. Live mode never exposes the demo issuer or fixture.

## Optional Render deployment

The repository includes a Docker-based [Render Blueprint](render.yaml). It runs the Vite frontend and Express API from one process, uses `/api/health` for health checks, and includes Playwright-managed Chromium in the image.

The Blueprint deliberately starts in fictional demo mode with rendered crawling disabled. This is the safe public default because the application does not yet have authentication, authorization, or per-user rate limits. Do not expose live research mode to untrusted traffic until those controls are added.

To review the deployment without creating it:

1. Open Render's **New Blueprint Instance** flow and select this repository.
2. Confirm the service, region, compute plan, and environment variables from `render.yaml`.
3. Keep `DEMO_MODE=1` for a public demonstration.
4. Deploy only after reviewing Render's current pricing and free-instance limitations.

Render supplies `PORT` automatically. `HOST=0.0.0.0` allows the service to accept Render traffic. The free plan can spin down and has limited memory; keep `DISABLE_RENDERED_CRAWLING=1` there. On an adequately sized paid service, set it to `0` to enable the bundled Chromium collector. Live mode also requires changing `DEMO_MODE` to `0`; configure `SEC_USER_AGENT` in Render's environment settings if SEC retrieval is needed. Never commit that contact value or any future credential.

The production server can also be exercised locally after a build:

```sh
pnpm build
HOST=0.0.0.0 PORT=4173 pnpm start
```

PowerShell equivalent:

```powershell
pnpm.cmd build
$env:HOST = "0.0.0.0"
$env:PORT = "4173"
pnpm.cmd start
```

Open `http://127.0.0.1:4173/` and check `http://127.0.0.1:4173/api/health`. Research history remains process-local and is cleared by restarts, redeploys, or free-service spin-downs.

## Quality commands

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`check` runs strict typechecking, the complete Vitest suite, and the production build.

## Optional live freshness audit

Run the supported market and financial freshness audit with:

```sh
pnpm audit:freshness
```

This optional command starts a temporary local API and contacts the live external providers for every supported company. It can take time, and its results vary as provider data and availability change. Structured JSON is written to stdout, while progress is written to stderr. Provider and company-request failures are reported explicitly and cause a nonzero exit code rather than being hidden. The audit is not part of `pnpm check` or CI, and its output is not investment advice.

## Architecture

- `src/App.tsx`: report workspace and interaction state.
- `src/api/researchApi.ts`: typed browser API requests and response-error handling.
- `src/domain/companyResolver.ts`: supported company registry and search.
- `src/domain/sourceAdapters.ts`: Yahoo Finance market, financial, forecast, and available ownership data.
- `src/domain/evidencePipeline.ts`: optional SEC retrieval, SEDAR+ reference status, and bounded issuer-site, management, and news collection.
- `src/domain/researchEngine.ts`: evidence-aware scoring and report generation.
- `server/app.ts`: Express routes and research-run orchestration.
- `server/demoFixture.ts`: deterministic fictional data used only when demo mode is explicitly active.
- `tests/`: API, domain, evidence, adapter, and rendered-component coverage.

Research runs are stored in process memory and are cleared when the API restarts. Issuer websites and public data providers can be blocked, unavailable, stale, incomplete, or structurally changed; the UI preserves those gaps for diligence. See [external-integrations.md](docs/external-integrations.md), [market-data.md](docs/market-data.md), and [dependency-security.md](docs/dependency-security.md) for provider, market-data, and dependency-security details.

Visual asset provenance and third-party attributions are documented in [ASSET-LICENSES.md](ASSET-LICENSES.md). The application does not hotlink portraits or background images.

## External network calls

Live research can contact the following public services:

- Yahoo Finance through `yahoo-finance2` for best-effort market, forecast, financial, and available ownership fields.
- SEC EDGAR when a valid `SEC_USER_AGENT` is configured.
- Issuer websites through bounded Playwright or plain-fetch collection for management and news evidence.
- GlobeNewswire RSS for matching public news releases.
- SEDAR+ and other research resources as outbound reference links only where document-level automation is not implemented.

Third-party services can rate-limit, block, remove, or change data without notice. No downloaded Yahoo data is committed or redistributed as a fixture. Provider behavior, request limits, and fallback semantics are documented in [external-integrations.md](docs/external-integrations.md).

## Limitations

- The supported issuer universe is curated rather than comprehensive.
- Live reports depend on external data quality and may contain stale, partial, delayed, or unavailable fields.
- SEDAR+ is currently a public disclosure link, not automated document retrieval.
- Research history is process-local and is lost when the API restarts.
- The app has no authentication or authorization layer and is intended for local or privately controlled use. Add access controls before exposing it to untrusted networks.
- Scores and analytical frameworks are research aids, not predictions, endorsements, or investment recommendations.

## Evidence provenance

- Automated evidence is accepted only after the referenced document or page is retrieved during the current research run.
- Regulatory portal availability and discovered-but-unretrieved links are reported as adapter status or missing-data gaps, not evidence.
- Manual evidence is included only when supplied explicitly in the research request with a source URL and excerpts.
- Registry company and management fields provide search and display context; they do not create evidence, citations, or evidence-confidence gains by themselves.
- Test-only synthetic evidence lives under `tests/` and is never imported by the application or server runtime.
- The separate fictional demo fixture is reachable only through explicit demo mode, is visibly labeled, and cannot enter live research or live scoring.

## Project governance

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull-request expectations, [SECURITY.md](SECURITY.md) for private vulnerability reporting, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards. The latest dependency advisory review is recorded in [docs/dependency-security.md](docs/dependency-security.md).

## License

Project-authored source code is available under the [MIT License](LICENSE). Third-party dependencies and assets remain subject to their own licenses, as documented in [ASSET-LICENSES.md](ASSET-LICENSES.md). External market data, regulatory filings, issuer materials, and linked third-party content are not redistributed or relicensed under the project's MIT License.
