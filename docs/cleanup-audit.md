# Project Cleanup Audit

Audit date: 2026-09-10. Scope: local repository and local application; no publication, deployment, credential changes, or production-data edits.

## Baseline (before implementation)

- Clean Git working tree. React 19 + Vite 7 frontend, Express 5 API, TypeScript, Vitest, Playwright issuer crawler, and Yahoo/YFinance market data.
- Eight report views: Investment Quality, Market Perspectives, Management, Risks, News, Shares, Financials, Sources. Home has ticker suggestions, exploration buttons, and manual excerpt import. Research history lives in a process-local Map, not a database.
- `pnpm.cmd test`: 7 files / 58 tests pass. `pnpm.cmd build`: passes; client JS 252.52 kB (76.57 kB gzip), CSS 29.39 kB (5.94 kB gzip).
- `pnpm.cmd exec tsc --noEmit --noUnusedLocals --noUnusedParameters`: fails on one unused argument and one unused management fallback function.
- `pnpm.cmd audit --json`: 28 advisories (12 high, 15 moderate, 1 low), primarily transitive packages and development tooling. An advisory is not proof of an exploitable application path.
- No README, CONTRIBUTING, AGENTS, environment example, CI workflow, lint script, or standalone typecheck command was present. Existing architecture diagrams distinguish proposed capabilities from implemented features.
- Local homepage renders. Mobile has no initial horizontal page overflow at 390px, but fixed sticky offsets do not match actual header height, search consumes considerable vertical space, and every financial metric collapses into a single column.

## Confirmed cleanup targets

1. The evidence collector creates a browser per run without closing it; asynchronous process-exit callbacks cannot provide reliable cleanup. Fetch fallback has no consistent timeout.
2. API research failures fall through to Express HTML errors; query types are coerced rather than validated. Evidence and market requests run sequentially despite being independent.
3. Explore buttons remain clickable during research, allowing concurrent requests to replace each other's results. A history-fetch failure is handled as a research failure after a successful report. Report refresh errors are hidden on the home-only form.
4. Suggestions have listbox roles but no arrow-key selection, active descendant, or Escape behavior. Navigation lacks programmatic current-section state. Sticky offsets, long content wrapping, focus indicators, and reduced-motion support need attention.
5. Two compiler-confirmed dead-code items, duplicated adapter types, missing setup documentation, and lack of repeatable quality commands make maintenance harder.

## Ordered implementation plan

1. Backend lifecycle, timeout, request validation and error-contract fixes with regression tests.
2. Frontend request lifecycle, accessible suggestions, navigation, mobile density and sticky alignment with UI tests and rendered checks.
3. Remove verified dead code, introduce focused lint/typecheck commands, document runtime/configuration limitations, and update only compatible dependencies justified by advisories.
4. Run full tests/build/lint/typecheck, dependency audit, all-company deterministic workflow coverage, and live browser smoke checks on desktop/mobile. Record external-source limitations separately.

## Constraints and known uncertainties

- This is a private loopback-only app with no login, durable database, production deployment configuration, or implemented progressive job API. Preserve that boundary.
- Source freshness, third-party availability, financial correctness, biography matching, and model calibration cannot be certified by UI/build tests. Live provider failures must remain visible as missing evidence.
- No credentials or environment files were read. Configuration documentation will come from source variable names and runtime behavior.
- Investor and management portraits are not shipped or hotlinked. The application uses neutral framework icons, management initials, and a CSS-authored hero treatment; retained visual provenance is recorded in `ASSET-LICENSES.md`.

## Implementation and final verification

- API calls and response-error parsing were moved out of the main React component into a typed client module.
- Management highlight derivation was moved into a focused domain utility, with direct coverage for credentials, experience, specialties, and fallback summaries.
- The unused direct `zod` dependency was removed. The transitive version required by `yahoo-finance2` remains managed by that package.
- Added `typecheck` and `check` scripts and a concise README covering setup, architecture, commands, and known limitations.
- Final command outcomes are recorded in the implementation report for this change.

## Evidence provenance checkpoint

- Removed fixed-date evidence, example URLs, and narrative source excerpts from production adapters.
- SEC filing records become evidence only after the filing document body is retrieved with a configured declared user agent. SEDAR+ is a manual public-disclosure reference; the app does not claim portal reachability or automated filing discovery.
- Issuer links discovered during crawling remain status metadata until their pages are retrieved and parsed.
- Registry management entries remain unverified display context and cannot raise management evidence confidence or scoring without current issuer, filing, or user-supplied support.
- Reusable synthetic research scenarios are isolated under `tests/fixtures/`.

## External integration hardening checkpoint

- SEC access now requires `SEC_USER_AGENT`, uses a shared conservative request gate, and retries only rate limits and temporary failures with bounded backoff.
- Issuer and GlobeNewswire requests are time-bounded and request-limited; blocked, timed-out, and unavailable states are distinct from missing configuration.
- SEDAR+ is labeled as a public research link, Composio is absent from runtime adapter output, and LinkedIn URLs are described as supplied or discovered public profile links rather than live verification.
- Yahoo Finance remains best-effort and non-filing-backed. Missing fields stay unavailable, and downloaded Yahoo responses are not committed or used as demo fixtures.
