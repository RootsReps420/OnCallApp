// Everything this prototype remembers lives in localStorage under "incident-lab:".
// A shared Incident Lab would replace this file with a server. The rest of the app
// should keep calling these functions rather than touching localStorage itself.

const ROOT = "incident-lab";
const KEYS = {
  attempts: `${ROOT}:attempts`,
  customScenarios: `${ROOT}:custom-scenarios`,
  proposals: `${ROOT}:proposals`,
  readinessConfig: `${ROOT}:readiness-config`,
  reviews: `${ROOT}:reviews`,
  theme: `${ROOT}:theme`,
  directory: `${ROOT}:directory`,
  session: `${ROOT}:session`
};

// Parse a JSON value from localStorage. A corrupt value falls back instead of breaking the page.
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Store a JSON value. Session and theme are plain strings and do not use this helper.
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const ACCESS_ROLES = new Set(["engineer", "assessor", "administrator"]);

// Create Alex, Jordan, and Sam the first time the app runs. Later visits keep the saved directory.
export function ensureDirectory(demoPeople) {
  const existing = read(KEYS.directory, null);
  if (Array.isArray(existing) && existing.length) return existing;
  const seeded = ["engineer", "assessor", "administrator"].map((role) => ({
    id: demoPeople[role].id,
    name: demoPeople[role].name,
    roleTitle: demoPeople[role].roleTitle,
    role
  }));
  write(KEYS.directory, seeded);
  return seeded;
}

// Everyone who can sign in on this browser.
export function getDirectory() {
  return read(KEYS.directory, []);
}

// Replace the whole colleague list after an add, role change, or removal.
export function saveDirectory(people) {
  write(KEYS.directory, people);
  return people;
}

// Id of the signed-in colleague, or an empty string.
export function getSessionId() {
  return localStorage.getItem(KEYS.session) || "";
}

// Sign in by storing an id. Sign out by deleting it. This is not a password.
export function setSessionId(id) {
  if (id) localStorage.setItem(KEYS.session, id);
  else localStorage.removeItem(KEYS.session);
}

// True only for engineer, assessor, or administrator.
export function isAccessRole(role) {
  return ACCESS_ROLES.has(role);
}

// Dark unless the saved choice is exactly light.
export function getTheme() {
  return localStorage.getItem(KEYS.theme) === "light" ? "light" : "dark";
}

// Save the theme and set data-theme on <html> so CSS variables switch immediately.
export function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  localStorage.setItem(KEYS.theme, next);
  document.documentElement.dataset.theme = next;
  return next;
}

// Every saved attempt in this browser, for every colleague.
export function getAttempts() {
  return read(KEYS.attempts, []);
}

// Insert or replace one attempt by id.
export function saveAttempt(attempt) {
  const attempts = getAttempts();
  const index = attempts.findIndex((item) => item.id === attempt.id);
  if (index >= 0) attempts[index] = attempt;
  else attempts.push(attempt);
  write(KEYS.attempts, attempts);
  return attempt;
}

// One attempt, or null.
export function getAttempt(id) {
  return getAttempts().find((item) => item.id === id) || null;
}

// Scenarios an administrator imported. They override bundled files with the same id.
export function getCustomScenarios() {
  return read(KEYS.customScenarios, []);
}

// Insert or replace one imported scenario.
export function saveCustomScenario(scenario) {
  const list = getCustomScenarios();
  const index = list.findIndex((item) => item.id === scenario.id);
  if (index >= 0) list[index] = scenario;
  else list.push(scenario);
  write(KEYS.customScenarios, list);
  return scenario;
}

// Scenario ideas sent by users.
export function getProposals() {
  return read(KEYS.proposals, []);
}

// Insert or replace one proposal.
export function saveProposal(proposal) {
  const list = getProposals();
  const index = list.findIndex((item) => item.id === proposal.id);
  if (index >= 0) list[index] = proposal;
  else list.push(proposal);
  write(KEYS.proposals, list);
  return proposal;
}

// Assessor gates. Falls back to the copy in config.json until someone saves a change.
export function getReadinessConfig(fallback) {
  return read(KEYS.readinessConfig, fallback);
}

// Store the readiness gates edited on the administrator page.
export function saveReadinessConfig(config) {
  write(KEYS.readinessConfig, config);
  return config;
}

// Clear attempts, imports, proposals, and readiness edits. The colleague directory and the signed-in person stay.
export function resetDemoData() {
  [KEYS.attempts, KEYS.customScenarios, KEYS.proposals, KEYS.readinessConfig, KEYS.reviews].forEach((key) => {
    localStorage.removeItem(key);
  });
}

// A snapshot of local data for the Verification page download.
export function exportStore() {
  return {
    attempts: getAttempts(),
    customScenarios: getCustomScenarios(),
    proposals: getProposals(),
    readinessConfig: getReadinessConfig(null),
    exportedAt: new Date().toISOString()
  };
}

export { KEYS };
