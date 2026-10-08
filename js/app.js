// The front controller. boot() starts the app, render() draws the current page,
// and the onClick / onSubmit handlers are the only place that writes saved work.
// The address after #/ decides which screen route() returns.

import { createId, nowIso, parseHash, navigate, downloadJson, escapeHtml } from "./util.js";
import * as storage from "./storage.js?v=55";
import { loadConfig, loadLibrary, loadReading } from "./content.js?v=55";
import { validateScenario, formatValidationErrors } from "./validation.js";
import { layout, errorPage, roleLabel, bindReadinessGraph } from "./render.js?v=55";
import * as views from "./views.js?v=55";
import * as auth from "./auth.js?v=55";
import { buildCriterionResults, scoreObjectiveQuestion } from "./scoring.js";
import { runVerification } from "./tests.js?v=55";

const appRoot = document.getElementById("app");
// Live page data. It is rebuilt from localStorage on every render.
const state = {
  config: null,             // data/config.json
  scenarios: [],            // bundled files plus any local imports
  attempts: [],             // every colleague's attempts in this browser
  evidence: [],             // workplace ticket write-ups
  proposals: [],            // suggested scenarios
  directory: [],            // people who can sign in
  role: "",                 // engineer, assessor, or administrator
  person: null,             // the signed-in colleague, or null
  readinessConfig: null,    // gates behind a Ready recommendation
  flash: "",                // one-line message for the next Access page draw
  entraEnabled: false,      // Microsoft sign-in is configured in config.json
  authError: "",            // last Entra error shown on the sign-in page
  reading: null,            // data/reading.json catalog
  readingProgress: {}       // opened / read ticks for Reading
};

// Match the saved session id to a colleague. A stale id is cleared.
function syncSession() {
  state.directory = storage.ensureDirectory(state.config.demoPeople);
  const person = state.directory.find((item) => item.id === storage.getSessionId()) || null;
  if (!person && storage.getSessionId()) storage.setSessionId("");
  state.person = person;
  state.role = person?.role || "";
}

// First page after sign-in. Users land on the dashboard.
function homeFor(role) {
  if (role === "assessor") return "#/assessor";
  if (role === "administrator") return "#/admin";
  return "#/dashboard";
}

// Reload scenarios and saved records, then refresh who is signed in.
async function refreshLibrary() {
  state.scenarios = await loadLibrary(state.config);
  state.attempts = storage.getAttempts();
  state.evidence = storage.getEvidence();
  state.proposals = storage.getProposals();
  state.readinessConfig = storage.getReadinessConfig(state.config.readinessCriteria);
  state.reading = await loadReading();
  state.readingProgress = storage.getReadingProgress();
  state.attempts
    .filter((item) => item.status === "in-progress")
    .forEach((item) => ensureWrittenAttempt(item));
  syncSession();
}

// Load config, wire the hash and form events, and draw the first page. Shows a server hint if fetch fails.
async function boot() {
  try {
    state.config = await loadConfig();
    const authResult = await auth.initAuth(state.config);
    state.entraEnabled = Boolean(authResult.enabled);
    state.authError = authResult.error || "";
    if (authResult.person) {
      storage.upsertPerson(authResult.person);
      storage.setSessionId(authResult.person.id);
    }
    await refreshLibrary();
    if (!location.hash) location.hash = "#/dashboard";
    window.addEventListener("hashchange", render);
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", pauseOpenTimer);
    render();
    if (authResult.fromRedirect && authResult.person) {
      navigate(homeFor(authResult.person.role));
    }
  } catch (error) {
    appRoot.innerHTML = `
      <div class="app-main">
        <h1>Incident Lab could not start</h1>
        <p>Serve this folder over HTTP so the scenario JSON files can load. Example:</p>
        <p><code>python -m http.server 8080</code> then open <code>http://localhost:8080</code></p>
        <p>${String(error.message || error)}</p>
      </div>`;
  }
}

// Redraw the whole shell. Signed-out visitors always get the sign-in screen.
let rendering = false;
function render() {
  if (rendering) return;
  rendering = true;
  try {
  pauseOpenTimer();
  syncSession();
  state.attempts = storage.getAttempts();
  state.evidence = storage.getEvidence();
  state.proposals = storage.getProposals();
  state.readinessConfig = storage.getReadinessConfig(state.config.readinessCriteria);
  state.readingProgress = storage.getReadingProgress();
  const { parts, path } = parseHash();
  const body = state.person ? route(parts) : views.signInView(state);
  state.flash = "";
  appRoot.innerHTML = layout({
    config: state.config,
    role: state.role,
    path: state.person ? path : "/sign-in",
    body,
    person: state.person,
    theme: document.documentElement.dataset.theme || storage.getTheme(),
    entraEnabled: state.entraEnabled
  });
  bindReadinessGraph();
  bindPageFilters();
  bindAttemptTimer();
  const main = document.getElementById("main");
  if (main && document.activeElement === document.body) {
    main.focus({ preventScroll: true });
  }
  } finally {
    rendering = false;
  }
}

// Map #/area/id/extra to one view. Access checks run first.
function route(parts) {
  const [area, id, extra] = parts; // #/area/id/extra
  const denied = deny(area, id);
  if (denied) return denied;
  // Home depends on role. The hash can still say /dashboard.
  if (!area || area === "dashboard") {
    if (state.role === "assessor") return views.assessorQueueView(state);
    if (state.role === "administrator") return views.adminScenariosView(state);
    return views.dashboardView(state);
  }
  if (area === "library" && id === "spoke") return views.librarySpokeView(state, extra);
  if (area === "library") return views.libraryView(state);
  if (area === "reading" && (!id || id === "")) return views.readingView(state);
  if (area === "reading" && id === "shelf") return views.readingShelfView(state, extra);
  if (area === "reading" && id === "page") {
    storage.markReadingOpened(extra);
    state.readingProgress = storage.getReadingProgress();
    return views.readingPageView(state, extra);
  }
  if (area === "scenario") return views.scenarioIntroView(state, findScenario(id));
  if (area === "assess") return views.workspaceView(state, ensureWrittenAttempt(storage.getAttempt(id)));
  if (area === "review") return views.reviewAnswersView(ensureWrittenAttempt(storage.getAttempt(id)));
  if (area === "submitted") return views.submittedView(storage.getAttempt(id));
  if (area === "feedback") return views.feedbackView(state, storage.getAttempt(id));
  if (area === "readiness") return views.readinessView(state);
  if (area === "evidence" && (!id || id === "")) return views.evidenceLogView(state);
  if (area === "evidence" && id === "new") return views.evidenceFormView(state, null);
  if (area === "evidence") return views.evidenceFormView(state, storage.getEvidenceEntry(id));
  if (area === "propose") return views.proposeView();
  if (area === "assessor" && !id) return views.assessorQueueView(state);
  if (area === "assessor" && id === "people") return views.assessorPeopleView(state);
  if (area === "assessor" && id === "person") return views.assessorPersonView(state, extra);
  if (area === "assessor" && id === "evidence") return views.evidenceReviewView(state, storage.getEvidenceEntry(extra));
  if (area === "assessor" && id === "review") return views.assessorReviewView(state, storage.getAttempt(extra));
  if (area === "admin" && !id) return views.adminScenariosView(state);
  if (area === "admin" && id === "author") return views.adminAuthorView(state);
  if (area === "admin" && id === "import") return views.adminImportView(null);
  if (area === "admin" && id === "scenario") return views.adminImportView(findScenario(extra));
  if (area === "admin" && id === "proposals") return views.adminProposalsView(state);
  if (area === "admin" && id === "criteria") return views.adminCriteriaView(state);
  if (area === "admin" && id === "access") return views.accessView(state);
  if (area === "verify") return verificationView();
  return errorPage("Page not found", "That route is not part of the Incident Lab prototype.");
}

// Block a page the signed-in role should not open, including another colleague's attempt.
function deny(area, id) {
  const role = state.role;
  // Content and the directory are administrator-only.
  if ((area === "admin" || area === "verify") && role !== "administrator") {
    return errorPage("Administrator access required", "Scenario management, verification, and the colleague directory are limited to administrators.");
  }
  // Only an assessor opens another person's submission.
  if (area === "assessor" && role !== "assessor") {
    return errorPage("Assessor access required", "Reviewing another colleague's submission is an assessor task. Users see their own feedback after it is released.");
  }
  // Taking a scenario or logging a ticket is a user task.
  if ((area === "assess" || area === "review" || area === "submitted" || area === "propose" || (area === "evidence" && (id === "new" || !id))) && role !== "engineer") {
    return errorPage("This page is for a user", "Users take scenarios, log workplace tickets, and propose new ones. Assessors use the review queue. Administrators manage scenarios and access.");
  }
  if (area === "evidence" && id && id !== "new") {
    const entry = storage.getEvidenceEntry(id);
    if (role === "administrator") {
      return errorPage("Administrator access does not review tickets", "An assessor scores workplace evidence.");
    }
    if (entry && role === "engineer" && entry.engineerId !== state.person.id) {
      return errorPage("That write-up belongs to another colleague", "Open Evidence from the sidebar and add your own ticket.");
    }
  }
  // A user can open only their own attempt, including released feedback.
  if (area === "assess" || area === "review" || area === "submitted" || area === "feedback") {
    const attempt = storage.getAttempt(id);
    if (attempt && role === "engineer" && attempt.engineerId !== state.person.id) {
      return errorPage("That attempt belongs to another colleague", "Open a scenario from your library, or wait for feedback on your own submission.");
    }
  }
  return null;
}

// Look up a scenario in the merged library.
function findScenario(id) {
  return state.scenarios.find((item) => item.id === id) || null;
}

// Deep copy so a snapshot is not the same object as the library scenario.
function cloneScenario(scenario) {
  return typeof structuredClone === "function"
    ? structuredClone(scenario)
    : JSON.parse(JSON.stringify(scenario));
}

// Handle data-action buttons: theme, sign-in, sign-out, attempt flow, and admin actions.
function onClick(event) {
  const publishBtn = event.target.closest("[data-review-mode], [data-import-mode], [data-evidence-mode], [data-evidence-review-mode]");
  if (publishBtn) {
    const form = publishBtn.closest("form");
    if (form) {
      form.dataset.activeMode = publishBtn.getAttribute("data-review-mode")
        || publishBtn.getAttribute("data-import-mode")
        || publishBtn.getAttribute("data-evidence-mode")
        || publishBtn.getAttribute("data-evidence-review-mode");
    }
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.getAttribute("data-action");
  const attemptId = button.getAttribute("data-attempt-id");

  if (action === "sign-out") {
    storage.setSessionId("");
    auth.signOutEntra().then((leftForMicrosoft) => {
      if (!leftForMicrosoft) navigate("#/dashboard");
    }).catch(() => navigate("#/dashboard"));
    return;
  }
  if (action === "entra-sign-in") {
    state.authError = "";
    auth.signInWithEntra().catch((error) => {
      state.authError = error.message || String(error);
      render();
    });
    return;
  }
  if (action === "sign-in") {
    const person = state.directory.find((item) => item.id === button.getAttribute("data-person-id"));
    if (!person) return;
    storage.setSessionId(person.id);
    navigate(homeFor(person.role));
    return;
  }
  if (action === "remove-person") {
    if (state.role !== "administrator") return;
    const personId = button.getAttribute("data-person-id");
    const people = storage.getDirectory();
    const target = people.find((item) => item.id === personId);
    if (!target) return;
    const admins = people.filter((item) => item.role === "administrator");
    if (target.source === "entra") {
      state.flash = "Remove ignitemyfire.co.uk colleagues on the Incident Lab enterprise application in Entra ID.";
      render();
      return;
    }
    if (target.role === "administrator" && admins.length < 2) {
      state.flash = "Keep at least one administrator.";
      render();
      return;
    }
    storage.saveDirectory(people.filter((item) => item.id !== personId));
    if (personId === state.person.id) {
      storage.setSessionId("");
      navigate("#/dashboard");
      return;
    }
    state.flash = `${target.name} removed from the directory. Saved attempts in this browser are unchanged.`;
    render();
    return;
  }
  if (action === "toggle-theme") {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    storage.setTheme(next);
    const sw = button.closest(".theme-switch") || button;
    const light = next === "light";
    sw.setAttribute("aria-checked", light ? "true" : "false");
    sw.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    return;
  }
  if (action === "toggle-sidebar") {
    document.querySelector(".app-shell")?.classList.toggle("sidebar-open");
    return;
  }
  if (action === "reading-open") {
    const href = button.getAttribute("data-reading-href") || "";
    const readingId = button.getAttribute("data-reading-id") || "";
    storage.markReadingOpened(readingId);
    if (/^https:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
    render();
    return;
  }
  if (action === "reading-done") {
    storage.markReadingRead(button.getAttribute("data-reading-id") || "");
    render();
    return;
  }
  if (action === "dash-range") {
    document.querySelectorAll("[data-action='dash-range']").forEach((item) => {
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    });
    applyPageFilters();
    return;
  }
  if (action === "start-scenario") {
    if (state.role !== "engineer") return;
    const attempt = startAttempt(button.getAttribute("data-scenario-id"));
    navigate(`#/assess/${attempt.id}`);
    return;
  }
  if (action === "resume-attempt") {
    if (state.role !== "engineer") return;
    navigate(`#/assess/${attemptId}`);
    return;
  }
  if (action === "goto-question") {
    event.preventDefault();
    const attempt = readAnswersFromDom(attemptId) || storage.getAttempt(attemptId);
    attempt.currentQuestionIndex = Number(button.getAttribute("data-index"));
    storage.saveAttempt(attempt);
    navigate(`#/assess/${attemptId}`);
    return;
  }
  if (action === "save-progress") {
    const attempt = readAnswersFromDom(attemptId);
    if (attempt) {
      storage.saveAttempt(attempt);
      const status = document.querySelector("[data-save-status]");
      if (status) status.textContent = "Progress saved in this browser.";
    }
    return;
  }
  if (action === "download-scenario") {
    const scenario = findScenario(button.getAttribute("data-scenario-id"));
    if (!scenario) return;
    const file = { ...scenario };
    delete file.origin;
    delete file.validation;
    delete file.evidence;
    downloadJson(`${file.id || "scenario"}.json`, file);
    return;
  }
  if (action === "submit-attempt") {
    submitAttempt(attemptId);
    return;
  }
  if (action === "reset-demo") {
    if (confirm("Clear attempts, workplace tickets, proposals, custom scenarios, and readiness edits stored in this browser?")) {
      storage.resetDemoData();
      refreshLibrary().then(() => navigate("#/admin"));
    }
    return;
  }
  if (action === "toggle-publish") {
    const scenario = findScenario(button.getAttribute("data-scenario-id"));
    if (!scenario) return;
    const next = { ...scenario, status: scenario.status === "published" ? "draft" : "published" };
    const check = validateScenario(next);
    if (next.status === "published" && !check.ok) {
      alert("Cannot publish until validation passes:\n" + formatValidationErrors(check.errors));
      return;
    }
    storage.saveCustomScenario(next);
    refreshLibrary().then(render);
    return;
  }
  if (action === "close-proposal") {
    const proposal = state.proposals.find((item) => item.id === button.getAttribute("data-proposal-id"));
    if (!proposal) return;
    proposal.status = "reviewed";
    storage.saveProposal(proposal);
    refreshLibrary().then(render);
    return;
  }
  if (action === "export-store") {
    downloadJson("incident-lab-store.json", storage.exportStore());
    return;
  }
  if (action === "add-author-question") {
    event.preventDefault();
    appendAuthorBlock("[data-author-questions]", "author-question-template", "[data-author-question]", 12);
    return;
  }
  if (action === "add-author-criterion") {
    event.preventDefault();
    appendAuthorBlock("[data-author-criteria]", "author-criterion-template", "[data-author-criterion]", 12);
    return;
  }
}

// File import, answer edits, and access-role dropdowns.
function onChange(event) {
  const fileInput = event.target.closest("#scenario-file");
  if (fileInput?.files?.[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      const area = document.getElementById("scenario-json");
      if (area) area.value = String(reader.result);
    };
    reader.readAsText(fileInput.files[0]);
  }
  const input = event.target.closest("[data-question-id]");
  if (input) persistAnswerInput(input);
  const roleSelect = event.target.closest("[data-person-role]");
  if (roleSelect && state.role === "administrator") updatePersonRole(roleSelect.getAttribute("data-person-role"), roleSelect.value);
}

// Save a text answer while the person is still typing, without a status message.
function onInput(event) {
  const input = event.target.closest("[data-question-id]");
  if (input) persistAnswerInput(input, true);
}

// Read the current answer from the page and store the attempt.
function persistAnswerInput(input, quiet = false) {
  const attemptId = input.getAttribute("data-attempt-id");
  const attempt = readAnswersFromDom(attemptId);
  if (!attempt) return;
  storage.saveAttempt(attempt);
  if (!quiet) {
    const status = document.querySelector("[data-save-status]");
    if (status) status.textContent = "Saved.";
  }
}

// Send a form to the matching saver. The browser's normal submit is cancelled.
function onSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.getAttribute("data-form");
  if (type === "propose") return submitProposal(form);
  if (type === "import-scenario") return importScenario(form);
  if (type === "author-scenario") return authorScenario(form);
  if (type === "criteria") return saveCriteria(form);
  if (type === "review") return saveReview(form);
  if (type === "add-person") return addPerson(form);
  if (type === "evidence") return saveEvidenceForm(form);
  if (type === "evidence-review") return saveEvidenceReview(form);
}

// Append a colleague. Only an administrator can do this.
function addPerson(form) {
  if (state.role !== "administrator") return;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const roleTitle = String(data.get("roleTitle") || "").trim();
  const role = String(data.get("role") || "engineer");
  const status = form.querySelector("[data-form-status]");
  if (!name) {
    if (status) status.textContent = "Enter a name.";
    return;
  }
  if (!storage.isAccessRole(role)) return;
  const people = storage.getDirectory();
  people.push({ id: uniquePersonId(name, people), name, roleTitle, role });
  storage.saveDirectory(people);
  state.flash = `${name} added as ${roleLabel(role)}. They can sign in on this browser.`;
  render();
}

// Change one person's role. The last administrator cannot be demoted.
function updatePersonRole(personId, role) {
  if (!storage.isAccessRole(role)) return;
  const people = storage.getDirectory();
  const target = people.find((item) => item.id === personId);
  if (!target || target.role === role) return;
  if (target.source === "entra") {
    state.flash = "Entra ID assigns this role. Change it on the Incident Lab enterprise application.";
    render();
    return;
  }
  const admins = people.filter((item) => item.role === "administrator");
  if (target.role === "administrator" && role !== "administrator" && admins.length < 2) {
    state.flash = "Keep at least one administrator.";
    render();
    return;
  }
  target.role = role;
  storage.saveDirectory(people);
  syncSession();
  state.flash = `${target.name} is now ${roleLabel(role)}.`;
  if (personId === state.person?.id) {
    navigate(homeFor(role));
    return;
  }
  render();
}

// Make a stable id from the name, adding -2, -3, … when the name is already used.
function uniquePersonId(name, people) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "colleague";
  let id = base;
  let n = 2;
  while (people.some((item) => item.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

// Begin a new attempt and snapshot the scenario as written questions.
function startAttempt(scenarioId) {
  const scenario = writtenScenario(findScenario(scenarioId));
  const previous = state.attempts.filter((item) => item.scenarioId === scenarioId && item.engineerId === state.person.id);
  const attempt = {
    id: createId("attempt"),
    engineerId: state.person.id,
    engineerName: state.person.name,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    scenarioSnapshot: cloneScenario(scenario),
    status: "in-progress",
    answers: {},
    currentQuestionIndex: 0,
    attemptNumber: previous.length + 1,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    timerElapsedMs: 0,
    timerRunningSince: null,
    ui: {}
  };
  storage.saveAttempt(attempt);
  state.attempts = storage.getAttempts();
  return attempt;
}

// Copy a scenario and force every question to a text answer.
function writtenScenario(scenario) {
  if (!scenario) return scenario;
  const copy = cloneScenario(scenario);
  copy.questions = (copy.questions || []).map(writtenQuestion);
  return copy;
}

// Drop option lists so the engineer writes instead of picking.
function writtenQuestion(question) {
  if (question.type === "written" && !question.options) return question;
  const { options, partialCreditRules, ...rest } = question;
  return { ...rest, type: "written" };
}

// Refresh an in-progress attempt if the library scenario has moved on (new version or fewer questions).
function ensureWrittenAttempt(attempt) {
  if (!attempt || attempt.status !== "in-progress") return attempt;
  const current = findScenario(attempt.scenarioId);
  const questions = attempt.scenarioSnapshot?.questions || [];
  const hasChoices = questions.some((question) => question.type !== "written" || question.options);
  const libraryChanged = Boolean(
    current
    && (
      current.version !== attempt.scenarioVersion
      || (current.questions || []).length !== questions.length
    )
  );
  if (!hasChoices && !libraryChanged) return attempt;
  const currentWritten = current?.questions?.length
    && current.questions.every((question) => question.type === "written" && !question.options);
  const next = currentWritten ? writtenScenario(current) : writtenScenario(attempt.scenarioSnapshot);
  const answers = {};
  for (const question of next.questions || []) {
    const previous = attempt.answers?.[question.id];
    if (typeof previous === "string" && previous.trim().length > 12) answers[question.id] = previous;
  }
  attempt.scenarioSnapshot = cloneScenario(next);
  attempt.scenarioVersion = currentWritten ? current.version : attempt.scenarioVersion;
  attempt.answers = answers;
  attempt.currentQuestionIndex = 0;
  storage.saveAttempt(attempt);
  state.attempts = storage.getAttempts();
  return attempt;
}

// Copy the visible answer fields back onto the attempt object.
function readAnswersFromDom(attemptId) {
  const attempt = storage.getAttempt(attemptId);
  if (!attempt) return null;
  const written = document.querySelector("textarea[data-question-id]");
  if (written) attempt.answers[written.getAttribute("data-question-id")] = written.value;
  const radios = [...document.querySelectorAll("input[data-answer-type='single']")];
  if (radios.length) {
    const selected = radios.find((item) => item.checked);
    attempt.answers[radios[0].getAttribute("data-question-id")] = selected ? selected.value : attempt.answers[radios[0].getAttribute("data-question-id")];
  }
  const checks = [...document.querySelectorAll("input[data-answer-type='multiple']")];
  if (checks.length) {
    attempt.answers[checks[0].getAttribute("data-question-id")] = checks.filter((item) => item.checked).map((item) => item.value);
  }
  attempt.updatedAt = nowIso();
  return attempt;
}

// Lock the attempt as submitted and record objective credits where a question still has them.
function submitAttempt(attemptId) {
  pauseOpenTimer();
  const attempt = readAnswersFromDom(attemptId) || storage.getAttempt(attemptId);
  attempt.status = "submitted";
  attempt.submittedAt = nowIso();
  attempt.updatedAt = nowIso();
  attempt.objectiveSummary = attempt.scenarioSnapshot.questions.map((question) => ({
    questionId: question.id,
    ...scoreObjectiveQuestion(question, attempt.answers?.[question.id])
  }));
  attempt.review = attempt.review || { criterionScores: {} };
  storage.saveAttempt(attempt);
  navigate(`#/submitted/${attempt.id}`);
}

// Save a scenario suggestion for an administrator.
function submitProposal(form) {
  const data = new FormData(form);
  storage.saveProposal({
    id: createId("proposal"),
    title: String(data.get("title") || ""),
    summary: String(data.get("summary") || ""),
    questions: String(data.get("questions") || ""),
    domains: String(data.get("domains") || ""),
    authorId: state.person.id,
    authorName: state.person.name,
    status: "open",
    createdAt: nowIso()
  });
  const status = form.querySelector("[data-form-status]");
  if (status) status.textContent = "Proposal saved for administrator review in this browser.";
  form.reset();
}

// Parse, validate, and store scenario JSON as draft or published.
function importScenario(form) {
  const errorEl = form.querySelector("[data-import-error]");
  errorEl.textContent = "";
  let parsed;
  try {
    parsed = JSON.parse(form.json.value);
  } catch {
    errorEl.textContent = "JSON could not be parsed. Check commas and quotes.";
    return;
  }
  parsed.status = form.dataset.activeMode === "published" ? "published" : "draft";
  const check = validateScenario(parsed);
  if (!check.ok) {
    errorEl.textContent = formatValidationErrors(check.errors);
    return;
  }
  storage.saveCustomScenario(parsed);
  refreshLibrary().then(() => navigate("#/admin"));
}

// Save the readiness gates from the administrator form.
function saveCriteria(form) {
  const data = new FormData(form);
  storage.saveReadinessConfig({
    oneScenarioPerSpoke: data.get("oneScenarioPerSpoke") === "on",
    allRequiredReviewed: data.get("allRequiredReviewed") === "on",
    mandatoryCriterionMinimum: Number(data.get("mandatoryCriterionMinimum") || 2),
    notes: String(data.get("notes") || "")
  });
  const status = form.querySelector("[data-form-status]");
  if (status) status.textContent = "Saved in this browser.";
  refreshLibrary();
}

// Save or release an assessor review. Releasing is what the engineer is allowed to see.
function saveReview(form) {
  const attempt = storage.getAttempt(form.getAttribute("data-attempt-id"));
  const data = new FormData(form);
  const errorEl = form.querySelector("[data-review-error]");
  errorEl.textContent = "";
  const criterionScores = {};
  const autoBaseline = buildCriterionResults(attempt.scenarioSnapshot, attempt.answers, null);
  const mode = form.dataset.activeMode || "save";
  for (const criterion of attempt.scenarioSnapshot.scoringCriteria) {
    const scoreRaw = data.get(`crit-${criterion.id}`);
    const score = scoreRaw === "" || scoreRaw == null ? null : Number(scoreRaw);
    const adjustmentExplanation = String(data.get(`adj-${criterion.id}`) || "").trim();
    const auto = autoBaseline.find((item) => item.id === criterion.id);
    if (
      mode === "release" &&
      auto?.source === "objective" &&
      score != null &&
      auto.score != null &&
      Number(score) !== Number(auto.score) &&
      !adjustmentExplanation
    ) {
      errorEl.textContent = `Record an explanation before adjusting the automated score for “${criterion.label}”.`;
      return;
    }
    criterionScores[criterion.id] = {
      score,
      evidence: String(data.get(`ev-${criterion.id}`) || ""),
      adjustmentExplanation
    };
  }
  if (mode === "release") {
    const preview = buildCriterionResults(attempt.scenarioSnapshot, attempt.answers, { criterionScores });
    const stillPending = preview.filter((item) => item.pendingReview);
    if (stillPending.length && !confirm("Some written criteria are still pending review. They will appear as pending, not as zero. Release anyway?")) {
      return;
    }
  }
  attempt.review = {
    assessorId: state.person.id,
    assessorName: state.person.name,
    criterionScores,
    strengths: String(data.get("strengths") || ""),
    developmentAreas: String(data.get("developmentAreas") || ""),
    developmentActions: String(data.get("developmentActions") || ""),
    overallCommentary: String(data.get("overallCommentary") || ""),
    readinessRecommendation: String(data.get("readinessRecommendation") || "") || null,
    updatedAt: nowIso(),
    releasedAt: mode === "release" ? nowIso() : attempt.review?.releasedAt || null
  };
  if (mode === "release") attempt.status = "released";
  storage.saveAttempt(attempt);
  navigate(mode === "release" ? "#/assessor" : `#/assessor/review/${attempt.id}`);
}

// Run tests.js and show pass or fail. A thrown check must not wipe the rest of the app.
function verificationView() {
  let results = [];
  let crashed = "";
  try {
    results = runVerification(state.reading);
  } catch (error) {
    crashed = String(error?.message || error);
  }
  const failed = results.filter((item) => !item.ok);
  return `
    <div class="page-header">
      <h1>Core verification</h1>
      <p class="lede">${crashed
        ? "The checks stopped early. Scoring and persistence rules are still the ones used on attempts."
        : `Checks scoring, pending written answers, persistence, and scenario validation in this browser. ${failed.length ? failed.length + " failed." : "All checks passed."}`}</p>
    </div>
    ${crashed ? `<p class="error-msg">${escapeHtml(crashed)}</p>` : ""}
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
        <tbody>
          ${results.length
            ? results.map((item) => `<tr><td>${item.name}</td><td>${item.ok ? "Pass" : "Fail"}</td><td>${item.detail || ""}</td></tr>`).join("")
            : `<tr><td colspan="3">${crashed ? "No checks completed." : "No checks ran."}</td></tr>`}
        </tbody>
      </table>
    </div>
    <p class="btn-row"><button class="btn secondary" data-action="export-store">Export local store</button></p>
  `;
}

boot();

// Wire the sidebar search box after each page draw. The old node is gone with the redraw.
function bindPageFilters() {
  const input = document.querySelector("[data-global-search]");
  if (input) {
    input.addEventListener("input", applyPageFilters);
  }
}

// Hide rows and cards that do not match the sidebar search or the dashboard date pills.
function applyPageFilters() {
  const query = (document.querySelector("[data-global-search]")?.value || "").trim().toLowerCase();
  const pressed = document.querySelector("[data-action='dash-range'][aria-pressed='true']");
  const range = pressed?.getAttribute("data-range") || "all";
  const windowMs = range === "7" ? 7 * 86400000 : range === "30" ? 30 * 86400000 : 0;
  const now = Date.now();
  document.querySelectorAll("[data-search], [data-started]").forEach((el) => {
    const hay = (el.getAttribute("data-search") || el.textContent || "").toLowerCase();
    const matchesSearch = !query || hay.includes(query);
    let matchesRange = true;
    if (windowMs && el.hasAttribute("data-started")) {
      const started = Date.parse(el.getAttribute("data-started"));
      matchesRange = Number.isFinite(started) && now - started <= windowMs;
    }
    el.hidden = !(matchesSearch && matchesRange);
  });
}

let timerHandle = null;

// Fold the running workspace clock into timerElapsedMs so a refresh does not lose seconds.
function elapsedMs(attempt) {
  const base = Number(attempt.timerElapsedMs) || 0;
  if (!attempt.timerRunningSince) return base;
  const started = Date.parse(attempt.timerRunningSince);
  if (!Number.isFinite(started)) return base;
  return base + Math.max(0, Date.now() - started);
}

// Stop the ticking clock and store elapsed time before the page redraws or unloads.
function pauseOpenTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  const el = document.querySelector("[data-attempt-timer]");
  if (!el) return;
  const attempt = storage.getAttempt(el.getAttribute("data-attempt-id"));
  if (!attempt || attempt.status !== "in-progress") return;
  attempt.timerElapsedMs = elapsedMs(attempt);
  attempt.timerRunningSince = null;
  storage.saveAttempt(attempt);
}

// Tick the suggested-time remaining label. Overtime is allowed; submit stays available.
function bindAttemptTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  const el = document.querySelector("[data-attempt-timer]");
  if (!el) return;
  const label = el.querySelector("strong") || el;
  const attemptId = el.getAttribute("data-attempt-id");
  const limitMin = Number(el.getAttribute("data-limit-minutes")) || 30;
  const limitMs = limitMin * 60 * 1000;
  const attempt = storage.getAttempt(attemptId);
  if (!attempt || attempt.status !== "in-progress") return;
  attempt.timerRunningSince = nowIso();
  storage.saveAttempt(attempt);
  let lastPersist = Date.now();
  const tick = () => {
    const current = storage.getAttempt(attemptId);
    if (!current || current.status !== "in-progress") return;
    const elapsed = elapsedMs(current);
    const remain = limitMs - elapsed;
    const overtime = remain < 0;
    const abs = Math.abs(remain);
    const m = Math.floor(abs / 60000);
    const s = Math.floor((abs % 60000) / 1000);
    const text = overtime ? `Over by ${m}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")} remaining`;
    label.textContent = text;
    el.classList.toggle("overtime", overtime);
    el.setAttribute("aria-label", `Suggested time ${limitMin} minutes. ${text}. You can still submit.`);
    if (Date.now() - lastPersist > 15000) {
      lastPersist = Date.now();
      current.timerElapsedMs = elapsed;
      current.timerRunningSince = nowIso();
      storage.saveAttempt(current);
    }
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}

// Add another question or criterion row on Create Scenario, up to the max.
function appendAuthorBlock(hostSel, templateId, itemSel, max) {
  const host = document.querySelector(hostSel);
  const tpl = document.getElementById(templateId);
  if (!host || !tpl) return;
  const index = host.querySelectorAll(itemSel).length;
  if (index >= max) return;
  const html = tpl.innerHTML.replaceAll("__INDEX__", String(index)).replaceAll("__N__", String(index + 1));
  host.insertAdjacentHTML("beforeend", html);
}

// Save a workplace ticket as a draft or submit it for assessor review.
function saveEvidenceForm(form) {
  if (state.role !== "engineer") return;
  const data = new FormData(form);
  const status = form.querySelector("[data-form-status]");
  const id = form.getAttribute("data-evidence-id") || createId("ticket");
  const existing = storage.getEvidenceEntry(id);
  const mode = form.dataset.activeMode || "draft";
  const entry = {
    id,
    engineerId: state.person.id,
    engineerName: state.person.name,
    ticketRef: String(data.get("ticketRef") || "").trim(),
    occurredOn: String(data.get("occurredOn") || "").trim(),
    roleOnCall: String(data.get("roleOnCall") || "other"),
    domainId: String(data.get("domainId") || ""),
    checked: String(data.get("checked") || "").trim(),
    involved: String(data.get("involved") || "").trim(),
    didNotChange: String(data.get("didNotChange") || "").trim(),
    notes: String(data.get("notes") || "").trim(),
    status: mode === "submitted" ? "submitted" : "draft",
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    submittedAt: mode === "submitted" ? nowIso() : existing?.submittedAt || null,
    review: existing?.review || null
  };
  if (entry.ticketRef.length < 3) {
    if (status) status.textContent = "Enter a sanitised ticket reference.";
    return;
  }
  if (mode === "submitted" && (entry.checked.length < 20 || entry.involved.length < 20 || entry.didNotChange.length < 20)) {
    if (status) status.textContent = "Write at least a short paragraph for what you checked, who you involved, and what you did not change.";
    return;
  }
  storage.saveEvidence(entry);
  navigate(`#/evidence/${entry.id}`);
}

// Save or release an assessor score on a workplace ticket.
function saveEvidenceReview(form) {
  if (state.role !== "assessor") return;
  const entry = storage.getEvidenceEntry(form.getAttribute("data-evidence-id"));
  if (!entry) return;
  const data = new FormData(form);
  const status = form.querySelector("[data-form-status]");
  const mode = form.dataset.activeMode || "save";
  const scoreRaw = data.get("score");
  const score = scoreRaw === "" || scoreRaw == null ? null : Number(scoreRaw);
  if (mode === "release" && (score == null || Number.isNaN(score))) {
    if (status) status.textContent = "Choose a 0–3 score before releasing.";
    return;
  }
  entry.review = {
    assessorId: state.person.id,
    assessorName: state.person.name,
    score,
    overallCommentary: String(data.get("overallCommentary") || ""),
    developmentActions: String(data.get("developmentActions") || ""),
    updatedAt: nowIso(),
    releasedAt: mode === "release" ? nowIso() : entry.review?.releasedAt || null
  };
  if (mode === "release") entry.status = "released";
  entry.updatedAt = nowIso();
  storage.saveEvidence(entry);
  navigate(mode === "release" ? "#/assessor" : `#/assessor/evidence/${entry.id}`);
}

// Build scenario JSON from the Create Scenario form, validate it, then save and download it.
function authorScenario(form) {
  if (state.role !== "administrator") return;
  const status = form.querySelector("[data-form-status]");
  if (status) status.textContent = "";
  const data = new FormData(form);
  const questions = [...form.querySelectorAll("[data-author-question]")].map((block, i) => {
    const index = block.getAttribute("data-index");
    const help = String(data.get(`q-help-${index}`) || "").trim();
    const question = {
      id: `q${i + 1}`,
      type: "written",
      prompt: String(data.get(`q-prompt-${index}`) || "").trim(),
      capabilityDomainIds: data.getAll(`q-domains-${index}`).map(String),
      assessorGuidance: String(data.get(`q-guide-${index}`) || "").trim()
    };
    if (help) question.helpText = help;
    return question;
  });
  const scoringCriteria = [...form.querySelectorAll("[data-author-criterion]")].map((block, i) => {
    const index = block.getAttribute("data-index");
    const questionIds = String(data.get(`c-questions-${index}`) || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return {
      id: `c${i + 1}`,
      label: String(data.get(`c-label-${index}`) || "").trim(),
      domainId: String(data.get(`c-domain-${index}`) || ""),
      maxScore: 3,
      mandatory: data.get(`c-mandatory-${index}`) === "on",
      safetyCritical: data.get(`c-safety-${index}`) === "on",
      questionIds
    };
  });
  const spokeId = String(data.get("spokeId") || "").trim();
  const spokeNumber = Number(data.get("spokeNumber") || 0);
  const spokeName = (state.config.capabilityDomains || []).find((item) => item.id === spokeId)?.name || spokeId;
  const parsed = {
    id: String(data.get("id") || "").trim(),
    version: "1.0.0",
    status: form.dataset.activeMode === "published" ? "published" : "draft",
    title: `${spokeName} ${spokeNumber}`.trim(),
    spokeId,
    spokeNumber,
    description: String(data.get("description") || "").trim(),
    scope: String(data.get("scope") || "").trim(),
    difficulty: String(data.get("difficulty") || "foundation"),
    estimatedMinutes: Number(data.get("estimatedMinutes") || 0),
    mandatory: false,
    illustrativeDisclaimer: String(data.get("illustrativeDisclaimer") || "").trim(),
    assessorGuidance: "Reward sound investigation order and appropriate escalation.",
    acceptableAlternativeApproaches: ["Document-led investigation before platform changes."],
    documentationReferences: [{ title: "Illustrative runbook title", note: "Confirm locally." }],
    initialIncident: {
      callSummary: String(data.get("callSummary") || "").trim(),
      serviceNow: {
        incidentNumber: String(data.get("incidentNumber") || "").trim(),
        priority: String(data.get("priority") || "").trim(),
        assignmentGroup: String(data.get("assignmentGroup") || "").trim(),
        opened: String(data.get("opened") || "").trim(),
        caller: String(data.get("caller") || "").trim(),
        affectedCI: String(data.get("affectedCI") || "").trim(),
        shortDescription: String(data.get("shortDescription") || "").trim(),
        description: String(data.get("snowDescription") || "").trim()
      },
      impact: {
        customers: String(data.get("impactUsers") || "").trim(),
        colleagues: String(data.get("impactColleagues") || "").trim(),
        business: String(data.get("impactBusiness") || "").trim()
      }
    },
    questions,
    scoringCriteria
  };
  const check = validateScenario(parsed);
  if (!check.ok) {
    if (status) status.textContent = formatValidationErrors(check.errors);
    return;
  }
  storage.saveCustomScenario(parsed);
  downloadJson(`${parsed.id}.json`, parsed);
  refreshLibrary().then(() => navigate("#/admin"));
}
