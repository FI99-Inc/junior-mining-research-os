import { createApp } from "./app";

const port = Number(process.env.PORT ?? 4173);
const demoMode = process.argv.includes("--demo") || process.env.DEMO_MODE === "1";

createApp({ demoMode }).listen(port, "127.0.0.1", () => {
  console.log(`Junior Mining Research OS API running at http://127.0.0.1:${port} (${demoMode ? "demo" : "live"} mode)`);
});
