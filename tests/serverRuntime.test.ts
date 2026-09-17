import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveServerRuntime } from "../server/runtimeConfig";

describe("resolveServerRuntime", () => {
  it("uses deployment host and port while serving an existing production build", () => {
    const cwd = path.resolve("render-app");
    const exists = vi.fn((candidate: string) => candidate === path.join(cwd, "dist", "index.html"));

    expect(resolveServerRuntime(
      { HOST: "0.0.0.0", PORT: "10000", DEMO_MODE: "0" },
      ["node", "server/index.ts"],
      cwd,
      exists
    )).toEqual({
      host: "0.0.0.0",
      port: 10000,
      demoMode: false,
      staticDir: path.join(cwd, "dist")
    });
  });

  it("keeps local defaults and omits static serving before the app is built", () => {
    expect(resolveServerRuntime({}, ["node", "server/index.ts"], path.resolve("local-app"), () => false)).toEqual({
      host: "127.0.0.1",
      port: 4173,
      demoMode: false,
      staticDir: undefined
    });
  });

  it("preserves both supported demo-mode activation paths", () => {
    expect(resolveServerRuntime({ DEMO_MODE: "1" }, [], process.cwd(), () => false).demoMode).toBe(true);
    expect(resolveServerRuntime({}, ["node", "server/index.ts", "--demo"], process.cwd(), () => false).demoMode).toBe(true);
  });
});
