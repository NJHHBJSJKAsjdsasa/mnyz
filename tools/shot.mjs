#!/usr/bin/env node
// tools/shot.mjs — screenshot harness for pages that need a session.
//
// Why this exists (2026-10-30): the game pages (`/galaxy`, `/system/<n>`,
// `/planet/<name>`) refuse to render without a Flask session, and the economy
// shell only mounts on those pages. `msedge --screenshot` cannot carry a cookie,
// so every visual check of those screens was "tsc passed, hope it looks right".
//
// Uses `playwright-core` + the **installed** Edge (`channel: "msedge"`), so there
// is no 100 MB browser download — only the driver. Cookies are established the
// same way a player does it: POST /navigate, then follow the redirect.
//
//   node tools/shot.mjs --out D:/mni/.workbuddy/shots3
//   node tools/shot.mjs --base http://127.0.0.1:8080 --size 1440x900 --only planet
//
// Exit code is 0 unless the harness itself fails; individual shots report
// `skip`/`error` inline so one broken route does not hide the rest.

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "http://127.0.0.1:8080");
const OUT = resolve(arg("out", "D:/mni/.workbuddy/shots3"));
const [WIDTH, HEIGHT] = arg("size", "1440x900").split("x").map(Number);
const ONLY = arg("only", "");
const COORDS = arg("coords", "137,42,9");
const QUIET = arg("quiet", "6000"); // settle time after networkidle, ms

mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);

async function shot(page, name, route) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(Number(QUIET));
    await dismissGates(page);
    // The landing page plays a warp-in intro after the gate; without this the
    // shot is a rectangle of starfield with nothing on it.
    if (route === "/") await page.waitForTimeout(16000);
    const path = `${OUT}/${name}.png`;
    await page.screenshot({ path, fullPage: false });
    const title = await page.title();
    log(`  [ok]   ${name.padEnd(14)} ${route}  ·  ${title.slice(0, 48)}`);
    return true;
  } catch (error) {
    log(`  [err]  ${name.padEnd(14)} ${route}  ·  ${String(error).split("\n")[0].slice(0, 110)}`);
    return false;
  }
}

/** Clear the photosensitivity gate and any auto-opened login dialog, so a shot
 *  shows the page rather than a black overlay. Both are conditional: a page
 *  without them must not lose a click. */
async function dismissGates(page) {
  for (const text of ["继续进入", "继续"]) {
    const button = page.locator(`button:has-text("${text}")`).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(900);
      break;
    }
  }
  const login = page.locator('text=服务器账号').first();
  if (await login.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
// Skip the 10s photosensitivity countdown on every page: the pref key is the
// same one the warning writes, so this is "a returning player who already chose
// full effects", not a bypass added for screenshots.
await context.addInitScript(() => {
  try {
    localStorage.setItem("atlas_photosensitivity_mode", "false");
  } catch {
    /* storage disabled — the gate will just show and the shot waits it out */
  }
});

const page = await context.newPage();

const want = (key) => !ONLY || ONLY.split(",").includes(key);

try {
  // ---------------------------------------------------------------- public
  if (want("public") || want("all")) {
    log("public pages");
    await shot(page, "01-home", "/");
    await shot(page, "02-faq", "/universe-faq");
    await shot(page, "03-multiverse", "/multiverse");
    await shot(page, "04-onboarding", "/onboarding");
  }

  // ------------------------------------------------------------ with session
  if (want("game") || want("panel") || want("all")) {
    log("establishing session (POST /navigate)");
    const [x, y, z] = COORDS.split(",");
    const nav = await context.request.post(`${BASE}/navigate`, {
      form: { x, y, z, system: "1" },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    log(`  /navigate -> ${nav.status()}`);
    if (nav.status() >= 400) throw new Error(`navigate failed: ${nav.status()}`);

    if (want("game") || want("all")) {
      log("game pages");
      await shot(page, "05-galaxy", "/galaxy");
      await shot(page, "06-system", "/system/1");

      // The planet name is only knowable from the page: it is generated from the
      // seed, and PlanetNavigation navigates with `window.location`, so there is
      // no <a href> to read. The server embeds the whole system as JSON in
      // `#system-data`; take the first planet from there.
      try {
        await page.goto(`${BASE}/system/1`, { waitUntil: "networkidle", timeout: 45000 });
        const name = await page.evaluate(() => {
          const node = document.getElementById("system-data");
          if (!node) return null;
          const data = JSON.parse(node.textContent || "{}");
          return data?.planets?.[0]?.name ?? null;
        });
        if (!name) throw new Error("no planet in #system-data");
        await shot(page, "07-planet", `/planet/${encodeURIComponent(name)}`);
        log(`  planet route: /planet/${name}`);
      } catch (error) {
        log(`  [skip] 07-planet      ${String(error).split("\n")[0].slice(0, 110)}`);
      }
    }

    if (want("panel") || want("all")) {
      log("economy shell (hash routes on /system/1)");
      const panels = [
        ["08-panel-assets", "#assets"],
        ["09-panel-bank", "#bank"],
        ["10-panel-market", "#market"],
        ["11-panel-company", "#company"],
        ["12-panel-legal", "#legal"],
        ["13-panel-log", "#log"],
      ];
      for (const [name, hash] of panels) {
        await shot(page, name, `/system/1${hash}`);
      }
    }
  }
} finally {
  await context.close();
  await browser.close();
}

log(`\nwrote ${OUT}`);
