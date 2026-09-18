import { existsSync } from "node:fs";
import path from "node:path";

type RuntimeEnvironment = Partial<Record<"HOST" | "PORT" | "DEMO_MODE", string>>;

export function resolveServerRuntime(
  env: RuntimeEnvironment = process.env,
  argv = process.argv,
  cwd = process.cwd(),
  fileExists: (filePath: string) => boolean = existsSync
) {
  const staticDir = path.resolve(cwd, "dist");
  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: Number(env.PORT ?? 4173),
    demoMode: argv.includes("--demo") || env.DEMO_MODE === "1",
    staticDir: fileExists(path.join(staticDir, "index.html")) ? staticDir : undefined
  };
}
