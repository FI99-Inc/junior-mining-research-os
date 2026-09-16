# Dependency Security Audit

Audit date: 2026-09-16

`pnpm audit --json` initially reported 28 advisories: 12 high, 15 moderate, one low, and no critical advisories. An advisory indicates a vulnerable dependency version; it does not by itself prove that this application's usage is exploitable. The table maps every baseline advisory to the direct dependency path that introduced it.

| Advisory | Severity | Package | Direct dependency path |
| --- | --- | --- | --- |
| [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | High | `fast-uri` | `yahoo-finance2 > @modelcontextprotocol/sdk > ajv` |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | Moderate | `postcss` | `vite`; `@vitejs/plugin-react > vite`; `vitest > vite` |
| [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | High | `fast-uri` | `yahoo-finance2 > @modelcontextprotocol/sdk > ajv` |
| [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr) | High | `ip-address` | `yahoo-finance2 > @modelcontextprotocol/sdk > express-rate-limit` |
| [GHSA-4xrf-jv44-h6hh](https://github.com/advisories/GHSA-4xrf-jv44-h6hh) | Moderate | `ip-address` | `yahoo-finance2 > @modelcontextprotocol/sdk > express-rate-limit` |
| [GHSA-22jq-vg5j-6vgg](https://github.com/advisories/GHSA-22jq-vg5j-6vgg) | Moderate | `ip-address` | `yahoo-finance2 > @modelcontextprotocol/sdk > express-rate-limit` |
| [GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239) | Moderate | `hono` | `yahoo-finance2 > @modelcontextprotocol/sdk` |
| [GHSA-f23p-vx2j-j53r](https://github.com/advisories/GHSA-f23p-vx2j-j53r) | Moderate | `hono` | `yahoo-finance2 > @modelcontextprotocol/sdk` |
| [GHSA-79qm-7rj5-m7r9](https://github.com/advisories/GHSA-79qm-7rj5-m7r9) | Low | `hono` | `yahoo-finance2 > @modelcontextprotocol/sdk` |
| [GHSA-54fx-42gc-7vw4](https://github.com/advisories/GHSA-54fx-42gc-7vw4) | Moderate | `hono` | `yahoo-finance2 > @modelcontextprotocol/sdk` |
| [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | High | `nanoid` | `vite > postcss`; `@vitejs/plugin-react > vite`; `vitest > vite` |
| [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9) | Moderate | `@hono/node-server` | `yahoo-finance2 > @modelcontextprotocol/sdk` |
| [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | High | `nanoid` | `vite > postcss`; `@vitejs/plugin-react > vite`; `vitest > vite` |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | High | `postcss` | `vite`; `@vitejs/plugin-react > vite`; `vitest > vite` |
| [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | High | `browserslist` | `@vitejs/plugin-react > Babel` |
| [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | High | `browserslist` | `@vitejs/plugin-react > Babel` |
| [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | Moderate | `qs` | `express`; `yahoo-finance2 > @modelcontextprotocol/sdk > express` |
| [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | Moderate | `qs` | `express`; `yahoo-finance2 > @modelcontextprotocol/sdk > express` |
| [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8) | High | `fast-uri` | `yahoo-finance2 > @modelcontextprotocol/sdk > ajv` |
| [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | High | `fast-uri` | `yahoo-finance2 > @modelcontextprotocol/sdk > ajv` |
| [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) | High | `fast-uri` | `yahoo-finance2 > @modelcontextprotocol/sdk > ajv` |
| [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | High | `fast-uri` | `yahoo-finance2 > @modelcontextprotocol/sdk > ajv` |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) (`vitest`) | Moderate | `vitest` | `vitest` |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) (`@vitest/mocker`) | Moderate | `@vitest/mocker` | `vitest > @vitest/mocker` |
| [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | Moderate | `baseline-browser-mapping` | `@vitejs/plugin-react > Babel > browserslist` |
| [GHSA-gqvv-2mrq-wpjv](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv) | Moderate | `hono` | `yahoo-finance2 > @modelcontextprotocol/sdk` |
| [GHSA-g6gw-c38x-mqfc](https://github.com/advisories/GHSA-g6gw-c38x-mqfc) | Moderate | `hono` | `yahoo-finance2 > @modelcontextprotocol/sdk` |
| [GHSA-crvj-82cr-hjcx](https://github.com/advisories/GHSA-crvj-82cr-hjcx) | Moderate | `hono` | `yahoo-finance2 > @modelcontextprotocol/sdk` |

## Remediation result

Compatible dependency updates refreshed the Vite, Babel, React, Playwright, TSX, testing, and transitive dependency chains. `yahoo-finance2` 3.x to 4.0.2 was handled as a separate migration after reviewing its Node.js requirement and running focused adapter/API tests. The project already requires Node.js 22 or newer.

A post-update `pnpm audit --json` completed with exit code 0 and reported zero known advisories. No residual advisories were accepted in this checkpoint. This is a point-in-time result, not a guarantee that dependencies are free from undisclosed or future vulnerabilities.

Major upgrades not required for remediation remain deferred for separate compatibility work. Dependabot monitors npm and GitHub Actions updates; each major update still requires release-note review and targeted verification.
