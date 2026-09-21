import { createId, nowIso, parseHash, navigate, downloadJson } from "./util.js";
import * as storage from "./storage.js";
import { loadConfig, loadLibrary } from "./content.js";
import { validateScenario, formatValidationErrors } from "./validation.js";
import { layout, errorPage, roleLabel } from "./render.js";
import * as views from "./views.js";
import { buildCriterionResults, scoreObjectiveQuestion } from "./scoring.js";
import { runVerification } from "./tests.js";

const appRoot = document.getElementById("app");
const state = {
  config: null,
  scenarios: [],
  attempts: [],
  proposals: [],
  directory: [],
  role: "",
  person: null,
  readinessConfig: null,
  flash: ""
};

function syncSession() {
  state.directory = storage.ensureDirectory(state.config.demoPeople);
  const person = state.directory.find((item) => item.id === storage.getSessionId()) || null;
  if (!person && storage.getSessionId()) storage.setSessionId("");
  state.person = person;
  state.role = person?.role || "";
}

function homeFor(role) {
  if (role === "assessor") return "#/assessor";
  if (role === "administrator") return "#/admin";
  return "#/dashboard";
}

async function refreshLibrary() {
  state.scenarios = await loadLibrary(state.config);
  state.attempts = storage.getAttempts();
  state.proposals = storage.getProposals();
  state.readinessConfig = storage.getReadinessConfig(state.config.readinessCriteria);
  syncSession();
}

async function boot() {
  try {
    state.config = await loadConfig();
    await refreshLibrary();
    if (!location.hash) location.hash = "#/dashboard";
    window.addEventListener("hashchange", render);
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("submit", onSubmit);
    render();
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

function render() {
  syncSession();
  state.attempts = storage.getAttempts();
  state.proposals = storage.getProposals();
  state.readinessConfig = storage.getReadinessConfig(state.config.readinessCriteria);
  const { parts, path } = parseHash();
  const body = state.person ? route(parts) : views.signInView(state);
  state.flash = "";
  appRoot.innerHTML = layout({
    config: state.config,
    role: state.role,
    path: state.person ? path : "/sign-in",
    body,
    person: state.person,
    theme: document.documentElement.dataset.theme || storage.getTheme()
  });
  const main = document.getElementById("main");
  if (main && document.activeElement === document.body) {
    main.focus({ preventScroll: true });
  }
}

function route(parts) {
  const [area, id, extra] = parts;
  const denied = deny(area, id);
  if (denied) return denied;
  if (!area || area === "dashboard") {
    if (state.role === "assessor") return views.assessorQueueView(state);
    if (state.role === "administrator") return views.adminScenariosView(state);
    return views.dashboardView(state);
  }
  if (area === "library") return views.libraryView(state);
  if (area === "scenario") return views.scenarioIntroView(state, findScenario(id));
  if (area === "assess") return views.workspaceView(state, storage.getAttempt(id));
  if (area === "review") return views.reviewAnswersView(storage.getAttempt(id));
  if (area === "submitted") return views.submittedView(storage.getAttempt(id));
  if (area === "feedback") return views.feedbackView(state, storage.getAttempt(id));
  if (area === "readiness") return views.readinessView(state);
  if (area === "propose") return views.proposeView();
  if (area === "assessor" && !id) return views.assessorQueueView(state);
  if (area === "assessor" && id === "review") return views.assessorReviewView(state, storage.getAttempt(extra));
  if (area === "admin" && !id) return views.adminScenariosView(state);
  if (area === "admin" && id === "import") return views.adminImportView(null);
  if (area === "admin" && id === "scenario") return views.adminImportView(findScenario(extra));
  if (area === "admin" && id === "proposals") return views.adminProposalsView(state);
  if (area === "admin" && id === "criteria") return views.adminCriteriaView(state);
  if (area === "admin" && id === "access") return views.accessView(state);
  if (area === "verify") return verificationView();
  return errorPage("Page not found", "That route is not part of the Incident Lab prototype.");
}

function deny(area, id) {
  const role = state.role;
  if ((area === "admin" || area === "verify") && role !== "administrator") {
    return errorPage("Administrator access required", "Scenario management, verification, and the colleague directory are limited to administrators.");
  }
  if (area === "assessor" && role !== "assessor") {
    return errorPage("Assessor access required", "Reviewing another colleague's submission is an assessor task. Users see their own feedback after it is released.");
  }
  if ((area === "assess" || area === "review" || area === "submitted" || area === "propose") && role !== "engineer") {
    return errorPage("This page is for a user", "Users take scenarios and propose new ones. Assessors use the review queue. Administrators manage scenarios and access.");
  }
  if (area === "assess" || area === "review" || area === "submitted" || area === "feedback") {
    const attempt = storage.getAttempt(id);
    if (attempt && role === "engineer" && attempt.engineerId !== state.person.id) {
      return errorPage("That attempt belongs to another colleague", "Open a scenario from your library, or wait for feedback on your own submission.");
    }
  }
  return null;
}

function findScenario(id) {
  return state.scenarios.find((item) => item.id === id) || null;
}

function cloneScenario(scenario) {
  return typeof structuredClone === "function"
    ? structuredClone(scenario)
    : JSON.parse(JSON.stringify(scenario));
}

function onClick(event) {
  const publishBtn = event.target.closest("[data-review-mode], [data-import-mode]");
  if (publishBtn) {
    const form = publishBtn.closest("form");
    if (form) form.dataset.activeMode = publishBtn.getAttribute("data-review-mode") || publishBtn.getAttribute("data-import-mode");
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.getAttribute("data-action");
  const attemptId = button.getAttribute("data-attempt-id");

  if (action === "sign-out") {
    storage.setSessionId("");
    navigate("#/dashboard");
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
    render();
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
  if (action === "select-evidence") {
    const attempt = storage.getAttempt(attemptId);
    attempt.ui = { ...(attempt.ui || {}), evidenceId: button.getAttribute("data-evidence-id") };
    readAnswersFromDom(attemptId);
    storage.saveAttempt(attempt);
    render();
    return;
  }
  if (action === "submit-attempt") {
    submitAttempt(attemptId);
    return;
  }
  if (action === "reset-demo") {
    if (confirm("Clear attempts, proposals, custom scenarios, and readiness edits stored in this browser?")) {
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
  }
}

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

function onInput(event) {
  const input = event.target.closest("[data-question-id]");
  if (input) persistAnswerInput(input, true);
}

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

function onSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.getAttribute("data-form");
  if (type === "propose") return submitProposal(form);
  if (type === "import-scenario") return importScenario(form);
  if (type === "criteria") return saveCriteria(form);
  if (type === "review") return saveReview(form);
  if (type === "add-person") return addPerson(form);
}

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

function updatePersonRole(personId, role) {
  if (!storage.isAccessRole(role)) return;
  const people = storage.getDirectory();
  const target = people.find((item) => item.id === personId);
  if (!target || target.role === role) return;
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

function startAttempt(scenarioId) {
  const scenario = findScenario(scenarioId);
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
    ui: {}
  };
  storage.saveAttempt(attempt);
  state.attempts = storage.getAttempts();
  return attempt;
}

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

function submitAttempt(attemptId) {
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

function saveCriteria(form) {
  const data = new FormData(form);
  storage.saveReadinessConfig({
    requiredMandatoryScenarios: data.get("requiredMandatoryScenarios") === "on",
    allRequiredReviewed: data.get("allRequiredReviewed") === "on",
    mandatoryCriterionMinimum: Number(data.get("mandatoryCriterionMinimum") || 2),
    notes: String(data.get("notes") || "")
  });
  const status = form.querySelector("[data-form-status]");
  if (status) status.textContent = "Saved in this browser.";
  refreshLibrary();
}

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

function verificationView() {
  const results = runVerification();
  const failed = results.filter((item) => !item.ok);
  return `
    <div class="page-header">
      <h1>Core verification</h1>
      <p class="lede">Checks scoring, pending written answers, persistence, and scenario validation in this browser. ${failed.length ? failed.length + " failed." : "All checks passed."}</p>
    </div>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
        <tbody>
          ${results.map((item) => `<tr><td>${item.name}</td><td>${item.ok ? "Pass" : "Fail"}</td><td>${item.detail || ""}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="btn-row"><button class="btn secondary" data-action="export-store" id="export-store">Export local store</button></p>
  `;
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#export-store")) {
    downloadJson("incident-lab-store.json", storage.exportStore());
  }
});

boot();
