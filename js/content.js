import { validateScenario } from "./validation.js";
import { getCustomScenarios } from "./storage.js";

export async function loadConfig() {
  const response = await fetch("data/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load application configuration.");
  return response.json();
}

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

export function mergeScenarios(bundled, custom) {
  const map = new Map();
  bundled.forEach((scenario) => map.set(scenario.id, scenario));
  custom.forEach((scenario) => {
    map.set(scenario.id, { ...scenario, origin: scenario.origin || "custom" });
  });
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadLibrary(config) {
  const bundled = await loadBundledScenarios(config);
  return mergeScenarios(bundled, getCustomScenarios());
}

export function publishedScenarios(scenarios) {
  return scenarios.filter((scenario) => scenario.status === "published");
}
