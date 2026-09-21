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

// Custom scenarios with the same id replace the bundled file in this browser only.
export function mergeScenarios(bundled, custom) {
  const map = new Map();
  bundled.forEach((scenario) => map.set(scenario.id, scenario));
  custom.forEach((scenario) => {
    map.set(scenario.id, { ...scenario, origin: scenario.origin || "custom" });
  });
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

// Bundled files first, then anything saved locally.
export async function loadLibrary(config) {
  const bundled = await loadBundledScenarios(config);
  return mergeScenarios(bundled, getCustomScenarios());
}

// Drafts stay out of the engineer library.
export function publishedScenarios(scenarios) {
  return scenarios.filter((scenario) => scenario.status === "published");
}
