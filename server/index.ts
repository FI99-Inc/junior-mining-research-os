import { createApp } from "./app";
import { resolveServerRuntime } from "./runtimeConfig";

const { demoMode, host, port, staticDir } = resolveServerRuntime();

createApp({ demoMode, staticDir }).listen(port, host, () => {
  console.log(`Junior Mining Research OS running at http://${host}:${port} (${demoMode ? "demo" : "live"} mode)`);
});
