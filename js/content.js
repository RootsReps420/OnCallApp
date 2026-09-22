// Loads config.json and the scenario files, then merges any scenarios
// an administrator has saved in this browser on top of the bundled ones.

import { validateScenario } from "./validation.js";
import { getCustomScenarios } from "./storage.js";

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
export function isNewerVersion(a, b) {
  const left = String(a || "0").split(".").map((part) => Number(part) || 0);
  const right = String(b || "0").split(".").map((part) => Number(part) || 0);
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return false;
}

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

// One group per spoke so the library can grow without a flat pile of incident titles.
export function groupScenariosBySpoke(scenarios, domains = []) {
  const known = new Set(domains.map((domain) => domain.id));
  const groups = domains
    .map((domain) => ({
      id: domain.id,
      name: domain.name,
      items: scenarios.filter((item) => item.spokeId === domain.id)
    }))
    .filter((group) => group.items.length);
  const other = scenarios.filter((item) => !known.has(item.spokeId));
  if (other.length) groups.push({ id: "other", name: "Ungrouped", items: other });
  return groups;
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
