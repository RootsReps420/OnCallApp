// Loads config.json and the scenario files, then merges any scenarios
// an administrator has saved in this browser on top of the bundled ones.

import { validateScenario, validateReadingCatalog, validateSandboxCatalog } from "./validation.js?v=58";
import { getCustomScenarios } from "./storage.js?v=58";

// Fetch data/config.json. cache: no-store so a refresh sees file edits.
export async function loadConfig() {
  const response = await fetch("data/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load application configuration.");
  return response.json();
}

// Fetch every scenario path listed in config. A file that fails validation is still returned, with the errors attached, so an administrator can see them.
export async function loadBundledScenarios(config) {
  const results = await Promise.all(
    config.bundledScenarioFiles.map(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load ${path}.`);
      const scenario = await response.json();
      const check = validateScenario(scenario);
      if (!check.ok) {
        console.warn(`Bundled scenario ${path} failed validation`, check.errors);
      }
      return { ...scenario, origin: "bundled", validation: check };
    })
  );
  return results;
}

// Custom scenarios with the same id replace the bundled file in this browser only,
// unless the bundled file is a newer version.
// Compare version strings like 1.2.0. True when a is higher than b.
export function isNewerVersion(a, b) {
  const left = String(a || "0").split(".").map((part) => Number(part) || 0);
  const right = String(b || "0").split(".").map((part) => Number(part) || 0);
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return false;
}

// Put custom copies on top of bundled files, unless the bundled file is a newer version.
export function mergeScenarios(bundled, custom) {
  const map = new Map();
  bundled.forEach((scenario) => map.set(scenario.id, scenario));
  custom.forEach((scenario) => {
    const existing = map.get(scenario.id);
    if (existing && isNewerVersion(existing.version, scenario.version)) return;
    map.set(scenario.id, { ...scenario, origin: scenario.origin || "custom" });
  });
  return [...map.values()];
}

// Library order follows the readiness map, then the number within that spoke.
export function sortScenarios(scenarios, domains = []) {
  const order = new Map(domains.map((domain, index) => [domain.id, index]));
  return [...scenarios].sort((a, b) => {
    const leftSpoke = order.has(a.spokeId) ? order.get(a.spokeId) : 1000;
    const rightSpoke = order.has(b.spokeId) ? order.get(b.spokeId) : 1000;
    if (leftSpoke !== rightSpoke) return leftSpoke - rightSpoke;
    const leftNumber = Number(a.spokeNumber) || 0;
    const rightNumber = Number(b.spokeNumber) || 0;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

// Bundled files first, then anything saved locally.
export async function loadLibrary(config) {
  const bundled = await loadBundledScenarios(config);
  return sortScenarios(mergeScenarios(bundled, getCustomScenarios()), config.capabilityDomains);
}

// Drafts stay out of the engineer library.
export function publishedScenarios(scenarios) {
  return scenarios.filter((scenario) => scenario.status === "published");
}

// Fallback catalog if reading.json cannot be fetched (for example file:// instead of HTTP).
const EMPTY_READING = {
  disclaimer: "Reading catalog could not be loaded. Serve data/reading.json over HTTP.",
  collections: [],
  articles: []
};

// Fetch the Reading room catalog. A broken file still returns an object so the app can boot.
export async function loadReading() {
  try {
    const response = await fetch("data/reading.json?v=61", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load reading catalog.");
    const catalog = await response.json();
    const check = validateReadingCatalog(catalog);
    if (!check.ok) console.warn("Reading catalog failed validation", check.errors);
    return { ...catalog, validation: check };
  } catch (error) {
    console.warn(error);
    return { ...EMPTY_READING, validation: { ok: false, errors: [{ path: "reading.json", message: String(error.message || error) }] } };
  }
}

// Shelf list from the Reading catalog.
export function readingCollections(catalog) {
  return catalog?.collections || [];
}

// Every Reading card, across all shelves.
export function readingArticles(catalog) {
  return catalog?.articles || [];
}

// One shelf by id, or null.
export function findReadingCollection(catalog, id) {
  return readingCollections(catalog).find((item) => item.id === id) || null;
}

// One Reading card by id, or null.
export function findReadingArticle(catalog, id) {
  return readingArticles(catalog).find((item) => item.id === id) || null;
}

// Cards that belong on one shelf.
export function articlesForCollection(catalog, collectionId) {
  return readingArticles(catalog).filter((item) => item.collectionId === collectionId);
}

// Live destination buttons for a card. Prefers labelled `links`, else a single `href`.
export function articleLinks(article) {
  const listed = Array.isArray(article?.links) ? article.links : [];
  const fromLinks = listed
    .map((link) => ({
      label: String(link?.label || "").trim() || "Open page",
      href: String(link?.href || "").trim()
    }))
    .filter((link) => /^https:\/\//i.test(link.href));
  if (fromLinks.length) return fromLinks;
  const href = String(article?.href || "").trim();
  if (/^https:\/\//i.test(href)) {
    return [{ label: String(article?.sourceLabel || "Open page").trim() || "Open page", href }];
  }
  return [];
}

// True when the card has no live URL yet, or is marked work-in-progress.
export function articleIsWip(article) {
  return Boolean(article?.wip) || articleLinks(article).length === 0;
}

// True when the shelf itself is WIP, empty, or still has a card without a URL.
export function collectionIsIncomplete(collection, articles) {
  return Boolean(collection?.wip) || !articles.length || articles.some(articleIsWip);
}

// First unread live page, then any unread card, otherwise the one opened most recently.
export function continueReading(catalog, progress = {}) {
  const articles = readingArticles(catalog);
  const live = articles.filter((item) => !articleIsWip(item));
  const unreadLive = live.find((item) => !progress[item.id]?.readAt);
  if (unreadLive) return unreadLive;
  const unread = articles.find((item) => !progress[item.id]?.readAt);
  if (unread) return unread;
  return articles
    .slice()
    .sort((a, b) => String(progress[b.id]?.openedAt || "").localeCompare(String(progress[a.id]?.openedAt || "")))[0] || null;
}

const EMPTY_SANDBOX = {
  disclaimer: "Sandbox catalog could not be loaded. Serve data/sandbox.json over HTTP.",
  tickets: []
};

// Fetch the Incident Sandbox tickets. A broken file still returns an object so the app can boot.
export async function loadSandbox() {
  try {
    const response = await fetch("data/sandbox.json?v=60", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load sandbox catalog.");
    const catalog = await response.json();
    const check = validateSandboxCatalog(catalog);
    if (!check.ok) console.warn("Sandbox catalog failed validation", check.errors);
    return { ...catalog, validation: check };
  } catch (error) {
    console.warn(error);
    return { ...EMPTY_SANDBOX, validation: { ok: false, errors: [{ path: "sandbox.json", message: String(error.message || error) }] } };
  }
}
