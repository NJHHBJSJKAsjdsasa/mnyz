// scripts/arecibo_check.mjs — diff the generator against scripts/arecibo_golden.txt.
//
// The golden was captured on the *fallback* path (`/api/arecibo` is a relative
// URL, so Node's fetch rejects and the generator falls back to its seeded
// drawing). That is exactly the path that must not drift: it owns all 4.3k lines
// of pixel code, while the browser path only substitutes real system data.
//
// Run via `npm run check:arecibo` (bundles the TS entry first).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GOLDEN = "scripts/arecibo_golden.txt";
const BUNDLE = ".tmp/arecibo.mjs";

let actual;
try {
  actual = execFileSync(process.execPath, [BUNDLE], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch (error) {
  console.error("[fail] 生成器运行失败：", error.message);
  process.exit(1);
}

const normalize = (text) =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join("\n");

const expected = normalize(readFileSync(GOLDEN, "utf8"));
const got = normalize(actual);

if (expected === got) {
  console.log(`[ok] Arecibo 指纹一致（${got.split("\n").length} 组）`);
  process.exit(0);
}

const expectedRows = expected.split("\n");
const gotRows = got.split("\n");
const drift = expectedRows.filter((row, index) => row !== gotRows[index]);
console.error(`[fail] Arecibo 输出漂移：${drift.length}/${expectedRows.length} 组不一致`);
for (const row of drift.slice(0, 6)) {
  const key = row.split(" ")[0];
  const now = gotRows.find((line) => line.startsWith(key + " ")) || "(缺失)";
  console.error(`  ${key}\n    期望 ${row.split(" ")[1]}\n    实际 ${now.split(" ")[1]}`);
}
process.exit(1);
