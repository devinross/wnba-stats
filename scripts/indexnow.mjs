// ---------------------------------------------------------------------------
// IndexNow: tell Bing (and the other IndexNow engines — Yandex, Seznam, Naver,
// Yep) which pages just changed, instead of waiting for them to recrawl.
//
// Bing revisits this site rarely enough that its reports can lag the live pages
// by weeks. The nightly refresh runs this after it pushes, so every night's new
// numbers are submitted the moment they are live.
//
// It reads the URL list from the *live* sitemap, not a local build: the nightly
// job never builds (Vercel does), and pinging before the deploy lands would
// just get the old pages recrawled. `--wait` holds until the live
// /data/index.json matches the one in this checkout, which is the sign that the
// deploy carrying it is being served.
//
// Only the live season's pages are sent by default — a finished season never
// changes, and re-submitting unchanged URLs every night is what IndexNow asks
// you not to do.
//
//   npm run indexnow                  live season's pages
//   npm run indexnow -- --wait        …once the checked-out data is live
//   npm run indexnow -- --all         every page in the sitemap
//   npm run indexnow -- --dry-run     list what would be sent, send nothing
//
// The key is public by design: the engines verify it by fetching
// /<KEY>.txt from this host, so public/<KEY>.txt has to be deployed before a
// submission will be accepted.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SITE_URL } from "../src/pageMeta.js";

const KEY = "86bd1ab028baa99a90cf53e50b767959";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10000; // per request, per the protocol

const WAIT_EVERY_MS = 20_000;
const WAIT_FOR_MS = 20 * 60_000;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const all = args.has("--all");
const dryRun = args.has("--dry-run");

const fail = (msg) => {
  console.error(`indexnow: ${msg}`);
  process.exit(1);
};

// Cache-busted so neither Vercel's edge nor anything in between can answer
// with the copy from before the deploy.
async function fetchLive(path) {
  const res = await fetch(`${SITE_URL}${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.text();
}

// --- the key file ------------------------------------------------------------

const keyFile = resolve(root, "public", `${KEY}.txt`);
if (!existsSync(keyFile) || readFileSync(keyFile, "utf8").trim() !== KEY) {
  fail(`public/${KEY}.txt must exist and contain exactly the key.`);
}

// --- wait for the deploy -----------------------------------------------------

if (args.has("--wait")) {
  const local = readFileSync(resolve(root, "public/data/index.json"), "utf8").trim();
  const deadline = Date.now() + WAIT_FOR_MS;
  for (;;) {
    const live = await fetchLive("/data/index.json").catch(() => "");
    if (live.trim() === local) break;
    if (Date.now() > deadline) {
      fail(`the live /data/index.json still doesn't match this checkout after ${WAIT_FOR_MS / 60_000} minutes — did the deploy fail?`);
    }
    console.log("indexnow: waiting for the deploy to go live…");
    await new Promise((r) => setTimeout(r, WAIT_EVERY_MS));
  }
}

// Every submission would come back 403 without it, so say so plainly instead.
const liveKey = await fetchLive(`/${KEY}.txt`).catch(() => "");
if (liveKey.trim() !== KEY) {
  const msg = `${SITE_URL}/${KEY}.txt isn't being served yet — deploy public/${KEY}.txt first.`;
  if (!dryRun) fail(msg);
  console.warn(`indexnow: ${msg}`);
}

// --- the URL list ------------------------------------------------------------

const sitemap = await fetchLive("/sitemap.xml").catch((e) => fail(`couldn't read the live sitemap: ${e.message}`));
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!locs.length) fail("the live sitemap lists no URLs.");

// Archived seasons live under /<year>/ (see seasonPrefix in src/routes.js);
// the live season is unprefixed.
const isArchive = (url) => /^\/\d{4}(\/|$)/.test(new URL(url).pathname);
const urls = all ? locs : locs.filter((u) => !isArchive(u));

console.log(`indexnow: ${urls.length} of ${locs.length} sitemap URLs${all ? "" : " (live season only)"}`);
if (dryRun) {
  urls.forEach((u) => console.log(`  ${u}`));
  process.exit(0);
}

// --- submit ------------------------------------------------------------------

const host = new URL(SITE_URL).host;
for (let i = 0; i < urls.length; i += MAX_URLS) {
  const urlList = urls.slice(i, i + MAX_URLS);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: KEY, keyLocation: `${SITE_URL}/${KEY}.txt`, urlList }),
  });
  // 200 = accepted; 202 = accepted, key verification still pending (normal on
  // the first submission from a new key).
  if (res.status !== 200 && res.status !== 202) {
    fail(`${ENDPOINT} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  console.log(`indexnow: submitted ${urlList.length} URLs (${res.status})`);
}
