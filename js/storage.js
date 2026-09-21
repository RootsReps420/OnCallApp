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

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const ACCESS_ROLES = new Set(["engineer", "assessor", "administrator"]);

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

export function getDirectory() {
  return read(KEYS.directory, []);
}

export function saveDirectory(people) {
  write(KEYS.directory, people);
  return people;
}

export function getSessionId() {
  return localStorage.getItem(KEYS.session) || "";
}

export function setSessionId(id) {
  if (id) localStorage.setItem(KEYS.session, id);
  else localStorage.removeItem(KEYS.session);
}

export function isAccessRole(role) {
  return ACCESS_ROLES.has(role);
}

export function getTheme() {
  return localStorage.getItem(KEYS.theme) === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  localStorage.setItem(KEYS.theme, next);
  document.documentElement.dataset.theme = next;
  return next;
}

export function getAttempts() {
  return read(KEYS.attempts, []);
}

export function saveAttempt(attempt) {
  const attempts = getAttempts();
  const index = attempts.findIndex((item) => item.id === attempt.id);
  if (index >= 0) attempts[index] = attempt;
  else attempts.push(attempt);
  write(KEYS.attempts, attempts);
  return attempt;
}

export function getAttempt(id) {
  return getAttempts().find((item) => item.id === id) || null;
}

export function getCustomScenarios() {
  return read(KEYS.customScenarios, []);
}

export function saveCustomScenario(scenario) {
  const list = getCustomScenarios();
  const index = list.findIndex((item) => item.id === scenario.id);
  if (index >= 0) list[index] = scenario;
  else list.push(scenario);
  write(KEYS.customScenarios, list);
  return scenario;
}

export function getProposals() {
  return read(KEYS.proposals, []);
}

export function saveProposal(proposal) {
  const list = getProposals();
  const index = list.findIndex((item) => item.id === proposal.id);
  if (index >= 0) list[index] = proposal;
  else list.push(proposal);
  write(KEYS.proposals, list);
  return proposal;
}

export function getReadinessConfig(fallback) {
  return read(KEYS.readinessConfig, fallback);
}

export function saveReadinessConfig(config) {
  write(KEYS.readinessConfig, config);
  return config;
}

export function resetDemoData() {
  [KEYS.attempts, KEYS.customScenarios, KEYS.proposals, KEYS.readinessConfig, KEYS.reviews].forEach((key) => {
    localStorage.removeItem(key);
  });
}

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
