import { createApp } from "./app";

const port = Number(process.env.PORT ?? 4173);

createApp().listen(port, "127.0.0.1", () => {
  console.log(`Junior Mining Research OS API running at http://127.0.0.1:${port}`);
});
