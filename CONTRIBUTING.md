# Contributing

Thank you for improving Junior Mining Research OS. Keep changes focused, evidence-aware, and explicit about unavailable data.

## Development setup

Requirements:

- Node.js 22 or newer
- pnpm 11.19.0, as declared in `package.json`

Install dependencies and run the quality gate:

```sh
pnpm install --frozen-lockfile
pnpm check
```

For rendered issuer-site collection, install Playwright Chromium:

```sh
pnpm exec playwright install chromium
```

Linux users can install Chromium and its required system packages together:

```sh
pnpm exec playwright install --with-deps chromium
```

On Windows PowerShell, use `pnpm.cmd` if the `pnpm` shim is not resolved directly.

## Making changes

1. Create a focused branch from the current default branch.
2. Preserve unavailable facts as unavailable; do not add fabricated, seeded, or uncited investment evidence to live research.
3. Never commit credentials, `.env` files, downloaded provider responses, production data, or private profile content.
4. Add or update tests for behavior changes.
5. Run `pnpm check` and `git diff --check` before opening a pull request.

Pull requests should explain the user-visible effect, verification performed, external-provider assumptions, and any remaining limitations. Dependency major versions must be treated as migrations with release-note review and targeted tests.

## Research and data integrity

This project is a research guide, not financial advice. Contributions must preserve source provenance, uncertainty, and provider failure states. External market data, filings, issuer material, and linked content remain subject to their owners' terms and are not relicensed by this repository.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE) and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
