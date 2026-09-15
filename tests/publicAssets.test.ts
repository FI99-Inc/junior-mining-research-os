import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (path: string) => resolve(process.cwd(), path);

describe("public asset safety", () => {
  it("ships no unlicensed portrait files", async () => {
    const publicEntries = await readdir(projectFile("public"), { recursive: true });

    expect(publicEntries.filter((entry) => /\.(avif|gif|jpe?g|png|webp)$/i.test(entry))).toEqual([]);
  });

  it("does not hotlink images from application CSS or React", async () => {
    const [styles, app] = await Promise.all([
      readFile(projectFile("src/styles.css"), "utf8"),
      readFile(projectFile("src/App.tsx"), "utf8")
    ]);

    expect(styles).not.toMatch(/url\(["']?https?:\/\//i);
    expect(app).not.toMatch(/<img\s[^>]*src=\{(?:lens\.portraitUrl|person\.profileImageUrl)\}/i);
  });
});
