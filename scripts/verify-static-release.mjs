import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const build = new URL("../apps/web/.next/", import.meta.url);
const html = await readFile(new URL("server/app/index.html", build), "utf8");
const scripts = [
  ...new Set(
    [...html.matchAll(/src="(\/_next\/static\/[^"?]+\.js)"/g)].map(
      (match) => match[1],
    ),
  ),
];
assert.ok(
  scripts.length > 0,
  "The release needs a prerendered document with its application scripts.",
);
const sizes = await Promise.all(
  scripts.map(async (src) => ({
    src,
    gzipBytes: gzipSync(
      await readFile(new URL(src.replace("/_next/", ""), build)),
    ).length,
  })),
);
const gzipJavascriptBytes = sizes.reduce(
  (sum, script) => sum + script.gzipBytes,
  0,
);
assert.ok(
  gzipJavascriptBytes <= 300_000,
  `Initial JavaScript is ${gzipJavascriptBytes} gzip bytes (budget: 300000). Check client runtime imports before raising the budget.`,
);
console.log(
  JSON.stringify(
    { gzipJavascriptBytes, budget: 300_000, scripts: sizes },
    null,
    2,
  ),
);
