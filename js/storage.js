// Everything this prototype remembers lives in localStorage under "incident-lab:".
// A shared Incident Lab would replace this file with a server. The rest of the app
// should keep calling these functions rather than touching localStorage itself.

const ROOT = "incident-lab";
const KEYS = {
  attempts: `${ROOT}:attempts`,
  customScenarios: `${ROOT}:custom-scenarios`,
  proposals: `${ROOT}:proposals`,
  readinessConfig: `${ROOT}:readiness-config`,
  reviews: `${ROOT}:reviews`, // leftover key; still cleared on reset so old browsers drop it
  theme: `${ROOT}:theme`,
  directory: `${ROOT}:directory`,
  session: `${ROOT}:session`,
  evidence: `${ROOT}:evidence`,
  reading: `${ROOT}:reading`
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

// Seed the three local practice profiles. Existing browsers pick up name changes for those ids.
export function ensureDirectory(demoPeople) {
  const seeded = ["engineer", "assessor", "administrator"].map((role) => ({
    id: demoPeople[role].id,
    name: demoPeople[role].name,
    roleTitle: demoPeople[role].roleTitle,
    role
  }));
  const existing = read(KEYS.directory, null);
  if (!Array.isArray(existing) || !existing.length) {
    write(KEYS.directory, seeded);
    return seeded;
  }
  const byId = new Map(seeded.map((item) => [item.id, item]));
  let changed = false;
  const merged = existing.map((person) => {
    const update = byId.get(person.id);
    if (!update || person.source === "entra") return person;
    if (person.name === update.name && person.roleTitle === update.roleTitle && person.role === update.role) {
      return person;
    }
    changed = true;
    return { ...person, name: update.name, roleTitle: update.roleTitle, role: update.role };
  });
  seeded.forEach((item) => {
    if (!merged.some((person) => person.id === item.id)) {
      merged.push(item);
      changed = true;
    }
  });
  if (changed) write(KEYS.directory, merged);
  return merged;
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

// Insert or update one colleague by id. Entra sign-in uses this after a successful token.
export function upsertPerson(person) {
  const people = getDirectory();
  const index = people.findIndex((item) => item.id === person.id);
  if (index >= 0) people[index] = { ...people[index], ...person };
  else people.push(person);
  return saveDirectory(people);
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

// Workplace tickets written by engineers and scored by assessors.
export function getEvidence() {
  return read(KEYS.evidence, []);
}

// Insert or replace one ticket write-up.
export function saveEvidence(entry) {
  const list = getEvidence();
  const index = list.findIndex((item) => item.id === entry.id);
  if (index >= 0) list[index] = entry;
  else list.push(entry);
  write(KEYS.evidence, list);
  return entry;
}

// One ticket write-up, or null.
export function getEvidenceEntry(id) {
  return getEvidence().find((item) => item.id === id) || null;
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
  const saved = read(KEYS.readinessConfig, null);
  return { ...(fallback || {}), ...(saved || {}) };
}

// Store the readiness gates edited on the administrator page.
export function saveReadinessConfig(config) {
  write(KEYS.readinessConfig, config);
  return config;
}

// Opened and finished Reading articles for this browser.
export function getReadingProgress() {
  const saved = read(KEYS.reading, {});
  return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
}

// First time a card is opened, stamp openedAt. Later opens keep the original time.
export function markReadingOpened(id) {
  if (!id) return getReadingProgress();
  const all = getReadingProgress();
  const prev = all[id] || {};
  const now = new Date().toISOString();
  all[id] = { ...prev, openedAt: prev.openedAt || now };
  write(KEYS.reading, all);
  return all;
}

// Mark a card as finished. Also sets openedAt if that was missing.
export function markReadingRead(id) {
  if (!id) return getReadingProgress();
  const all = getReadingProgress();
  const prev = all[id] || {};
  const now = new Date().toISOString();
  all[id] = { ...prev, openedAt: prev.openedAt || now, readAt: now };
  write(KEYS.reading, all);
  return all;
}

// Clear attempts, imports, proposals, ticket write-ups, readiness edits, and reading ticks. The colleague directory and the signed-in person stay.
export function resetDemoData() {
  [KEYS.attempts, KEYS.customScenarios, KEYS.proposals, KEYS.readinessConfig, KEYS.reviews, KEYS.evidence, KEYS.reading].forEach((key) => {
    localStorage.removeItem(key);
  });
}

// A snapshot of local data for the Verification page download.
export function exportStore() {
  return {
    attempts: getAttempts(),
    evidence: getEvidence(),
    customScenarios: getCustomScenarios(),
    proposals: getProposals(),
    readinessConfig: getReadinessConfig(null),
    readingProgress: getReadingProgress(),
    exportedAt: new Date().toISOString()
  };
}

export { KEYS };
