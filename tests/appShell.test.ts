// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("application shell", () => {
  it("declares a local favicon so browsers do not request a missing default icon", () => {
    const html = readFileSync(resolve("index.html"), "utf8");

    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(existsSync(resolve("public/favicon.svg"))).toBe(true);
  });
});
