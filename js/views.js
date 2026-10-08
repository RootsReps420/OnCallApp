// One function per screen. Each function returns an HTML string.
// Clicks are handled in app.js by looking for data-action on the element.

import { escapeHtml, formatDateTime, formatDate, nl } from "./util.js";
import {
  pillsForScenario,
  snowCard,
  incidentReportCard,
  domainBars,
  kpiCard,
  capabilityLineChart,
  coverageDonut,
  readinessBanner,
  readinessNetwork,
  criterionTable,
  docsList,
  statusLabel,
  statusClass,
  errorPage,
  formatAttemptMeta,
  roleLabel
} from "./render.js";
import { SCORE_SCALE, buildCriterionResults, summariseDomains, attemptOutcomeHints, applyEvidenceWeight, listDevelopmentActions, gateMinScore, spokeGateStatus, spokeGateComplete, isAttemptSatisfactory } from "./scoring.js";
import { publishedScenarios, readingCollections, readingArticles, findReadingCollection, findReadingArticle, articlesForCollection, continueReading, articleLinks, articleIsWip, collectionIsIncomplete } from "./content.js?v=57";

// Newest attempt for one scenario, by start time.
function latestAttempt(attempts, scenarioId) {
  return attempts
    .filter((item) => item.scenarioId === scenarioId)
    .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""))[0];
}

// Attempts that belong to one colleague.
function attemptsFor(attempts, engineerId) {
  return attempts.filter((item) => item.engineerId === engineerId);
}

// Demonstrated line from administrator criteria (usually 2).
function readinessMinScore(state) {
  return gateMinScore(state.readinessConfig);
}

// One row per spoke for the Ready gate list on Overview and Readiness.
function spokeRowsFor(state, attempts) {
  const min = readinessMinScore(state);
  const requireSatisfactory = state.readinessConfig?.allRequiredReviewed !== false;
  return spokeGateStatus(state.config.capabilityDomains, publishedScenarios(state.scenarios), attempts, min, requireSatisfactory);
}

// Where a spoke row should go: the counted case, a start case, or the library.
function spokeHref(row, attempts, { assessor = false } = {}) {
  const scenarioId = row.countedId || row.startId;
  if (!scenarioId) return "#/library";
  if (assessor) {
    const attemptId = row.countedAttemptId;
    if (attemptId) return `#/assessor/review/${attemptId}`;
    const latest = latestAttempt(attempts, scenarioId);
    if (latest && (latest.status === "submitted" || latest.status === "released")) {
      return `#/assessor/review/${latest.id}`;
    }
  }
  return `#/scenario/${encodeURIComponent(scenarioId)}`;
}

// HTML list of the seven spokes with a status pill on each.
function spokeGateListHtml(rows, attempts, { assessor = false } = {}) {
  return rows.map((row) => {
    const extra = row.met && row.countedTitle ? ` · ${escapeHtml(row.countedTitle)}` : "";
    return `<li><a href="${spokeHref(row, attempts, { assessor })}"><span>${escapeHtml(row.name)}${extra}</span><span class="pill ${row.progressStatus || ""}">${escapeHtml(row.progressLabel)}</span></a></li>`;
  }).join("");
}

// One-line reminder under the Ready gate.
function spokeGateNote(complete) {
  return complete
    ? "One scenario in each spoke has been released at Demonstrated or above."
    : "Ready needs one scenario per spoke, released at Demonstrated or above. Any numbered scenario in that spoke can count.";
}

// User home: KPI cards, capability charts, recent activity, and the Ready gate.
export function dashboardView(state) {
  const { config, attempts, person } = state;
  const mine = attemptsFor(attempts, person.id);
  const spokeRows = spokeRowsFor(state, mine);
  const awaiting = mine.filter((item) => item.status === "submitted");
  const released = mine.filter((item) => item.status === "released");
  const inProgress = mine.filter((item) => item.status === "in-progress");
  const domainSummaries = aggregateReleasedDomains(state);

  const greetingName = person.source === "entra"
    ? (person.name.split(/\s+/)[0] || person.name)
    : person.name;
  const gaps = areasToImprove(domainSummaries);
  const scored = domainSummaries.filter((item) => item.percentage != null);
  const average = scored.length
    ? Math.round(scored.reduce((sum, item) => sum + item.percentage, 0) / scored.length)
    : null;
  const recent = mine
    .slice()
    .sort((a, b) => String(b.updatedAt || b.startedAt || "").localeCompare(String(a.updatedAt || a.startedAt || "")))
    .slice(0, 8);
  return `
    <section class="dash-hero">
      <div>
        <p class="eyebrow">Welcome back, ${escapeHtml(greetingName)}</p>
        <h1>Dashboard Overview</h1>
        <p class="lede">Track your SevA practice and readiness for ${escapeHtml(config.serviceName)} in real time.</p>
      </div>
      <div class="btn-row">
        <a class="btn" href="#/library">Open scenario library</a>
        <a class="btn secondary" href="#/reading">Reading · WIP</a>
      </div>
    </section>
    <div class="filter-row">
      <div class="range-pills" role="group" aria-label="Activity range">
        <button type="button" data-action="dash-range" data-range="all" aria-pressed="true">All</button>
        <button type="button" data-action="dash-range" data-range="7">Last 7 days</button>
        <button type="button" data-action="dash-range" data-range="30">Last 30 days</button>
      </div>
    </div>
    <div class="kpi-grid">
      ${kpiCard({
        label: "In progress",
        value: inProgress.length,
        hint: inProgress.length ? `<span class="delta up">Resume a saved attempt</span>` : "No open attempts",
        href: "#/library"
      })}
      ${kpiCard({
        label: "Awaiting review",
        value: awaiting.length,
        hint: awaiting.length ? `<span class="delta down">With an assessor</span>` : "Nothing waiting",
        href: "#/library"
      })}
      ${kpiCard({
        label: "Feedback released",
        value: released.length,
        hint: released.length ? `<span class="delta up">Notes ready to read</span>` : "No released notes yet",
        href: "#/readiness"
      })}
      ${kpiCard({
        label: "Capability average",
        value: average == null ? "—" : `${average}%`,
        hint: gaps.length
          ? `<span class="delta down">${gaps.length} gap${gaps.length === 1 ? "" : "s"} to close</span>`
          : `<span class="delta up">No scored gaps yet</span>`,
        href: "#/readiness"
      })}
    </div>
    <div class="dash-charts">
      <section class="card chart-card">
        <div class="card-head">
          <div>
            <h2>Capability profile</h2>
            <p class="subtle">Released scores across the seven domains</p>
          </div>
        </div>
        ${capabilityLineChart(domainSummaries)}
      </section>
      <section class="card chart-card">
        <div class="card-head">
          <div>
            <h2>Coverage</h2>
            <p class="subtle">Where evidence is still missing</p>
          </div>
        </div>
        ${coverageDonut(domainSummaries)}
      </section>
    </div>
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Recent activity</h2>
          <p class="subtle">Latest attempts in this browser</p>
        </div>
        <a href="#/library">View all</a>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Scenario</th><th>Status</th><th>Started</th><th>Version</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${recent.length ? recent.map((item) => {
              const href = item.status === "in-progress"
                ? `#/assess/${item.id}`
                : item.status === "released"
                  ? `#/feedback/${item.id}`
                  : `#/scenario/${encodeURIComponent(item.scenarioId)}`;
              const action = item.status === "in-progress" ? "Resume" : item.status === "released" ? "Open" : "View";
              return `
                <tr data-search="${escapeHtml(item.scenarioSnapshot.title)} ${escapeHtml(statusLabel(item.status))}" data-started="${escapeHtml(item.startedAt || "")}">
                  <td>${escapeHtml(item.scenarioSnapshot.title)}</td>
                  <td><span class="pill ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
                  <td>${formatDateTime(item.startedAt)}</td>
                  <td>${escapeHtml(item.scenarioVersion)}</td>
                  <td><a class="btn ghost" href="${href}">${action}</a></td>
                </tr>`;
            }).join("") : `<tr><td colspan="5" class="muted">No attempts yet. Open the library to start a scenario.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
    <div class="grid grid-2 dash-lower">
      <section class="card">
        <div class="card-head">
          <h2>Ready gate</h2>
          <a href="#/library">All scenarios</a>
        </div>
        <ul class="work-list">
          ${spokeGateListHtml(spokeRows, mine)}
        </ul>
        <p class="subtle">${spokeGateNote(spokeGateComplete(state.readinessConfig, spokeRows))}</p>
      </section>
      <section class="card">
        <h2>Development actions</h2>
        ${actionListHtml(listDevelopmentActions(mine, state.evidence || [], person.id), { role: "engineer" })}
      </section>
    </div>
  `;
}

// Short tab labels and colours for the Scenario Library. The full spoke name sits on the tiles.
const LIBRARY_SPOKE_META = {
  "avd-infrastructure": { spine: "AVD", folio: "01", tone: "platform" },
  "networking": { spine: "Network", folio: "02", tone: "path" },
  "trm-escalation-ops": { spine: "TRM", folio: "03", tone: "ops" },
  "proxy-solution": { spine: "Proxy", folio: "04", tone: "identity" },
  "vendor-management": { spine: "Vendors", folio: "05", tone: "vendor" },
  "platform-troubleshooting": { spine: "Platform", folio: "06", tone: "fix" },
  "m365-stack": { spine: "M365", folio: "07", tone: "ops" },
  "other": { spine: "Other", folio: "—", tone: "path" }
};

// Published cases (or all, for an administrator) grouped into the seven spokes.
function libraryCatalog(state) {
  const visible = state.role === "administrator" ? state.scenarios : publishedScenarios(state.scenarios);
  const domains = state.config.capabilityDomains || [];
  const spokes = domains.map((domain) => {
    const meta = LIBRARY_SPOKE_META[domain.id] || { spine: domain.name, folio: "—", tone: "ops" };
    return {
      id: domain.id,
      name: domain.name,
      summary: domain.summary || "",
      items: visible.filter((item) => item.spokeId === domain.id),
      ...meta
    };
  });
  const known = new Set(domains.map((domain) => domain.id));
  const other = visible.filter((item) => !known.has(item.spokeId));
  if (other.length) {
    spokes.push({
      id: "other",
      name: "Ungrouped",
      summary: "Scenarios that are not on a readiness spoke yet.",
      items: other,
      ...LIBRARY_SPOKE_META.other
    });
  }
  return { visible, spokes };
}

// Progress bar: how many cases in this list already have a satisfactory attempt.
function libraryMeter(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `
    <div class="reading-meter" role="img" aria-label="${total ? `${done} of ${total} scenarios with a satisfactory attempt` : "No scenarios in this spoke yet"}">
      <span class="reading-meter-track"><span class="reading-meter-fill" style="width:${pct}%"></span></span>
      <strong>${total ? `${done} of ${total}` : "—"}</strong>
      <span>${total ? "satisfactory" : "no scenarios yet"}</span>
    </div>
  `;
}

// Next case to point at: resume an open attempt, else the first not yet satisfactory.
function continueLibrary(scenarios, mine) {
  const inProgress = mine.find((item) => item.status === "in-progress" && scenarios.some((scenario) => scenario.id === item.scenarioId));
  if (inProgress) {
    const scenario = scenarios.find((item) => item.id === inProgress.scenarioId);
    if (scenario) return { scenario, kind: "resume" };
  }
  const next = scenarios.find((scenario) => {
    const attempt = latestAttempt(mine, scenario.id);
    return !attempt || !isAttemptSatisfactory(attempt);
  });
  if (next) return { scenario: next, kind: "next" };
  return scenarios[0] ? { scenario: scenarios[0], kind: "open" } : null;
}

// Short status for a case card (not started, in progress, satisfactory, and so on).
function libraryCaseStatus(attempt) {
  if (!attempt) return { label: "Not started", cls: "" };
  if (attempt.status === "in-progress") return { label: "In progress", cls: "progress" };
  if (attempt.status === "submitted") return { label: "Awaiting review", cls: "review" };
  if (isAttemptSatisfactory(attempt)) return { label: "Satisfactory", cls: "released" };
  if (attempt.status === "released") return { label: "Feedback released", cls: "released" };
  return { label: statusLabel(attempt.status), cls: statusClass(attempt.status) };
}

// One spoke card on the library home. Opens that spoke's case list.
function librarySpokeTile(spoke, mine) {
  const done = spoke.items.filter((scenario) => isAttemptSatisfactory(latestAttempt(mine, scenario.id))).length;
  return `
    <a class="library-tile" data-tone="${escapeHtml(spoke.tone)}" href="#/library/spoke/${encodeURIComponent(spoke.id)}" data-search="${escapeHtml(`${spoke.name} ${spoke.summary} ${spoke.items.map((item) => item.title).join(" ")}`)}">
      <span class="library-folio" aria-hidden="true">${escapeHtml(spoke.folio)}</span>
      <p class="eyebrow">${spoke.items.length} case${spoke.items.length === 1 ? "" : "s"}</p>
      <h2>${escapeHtml(spoke.name)}</h2>
      <p>${escapeHtml(spoke.summary)}</p>
      <span class="library-tile-foot">
        <span class="reading-dots" aria-hidden="true">${spoke.items.map((item) => {
          const attempt = latestAttempt(mine, item.id);
          const cls = isAttemptSatisfactory(attempt) ? "is-read" : attempt?.status === "in-progress" ? "is-open" : "";
          return `<i class="${cls}"></i>`;
        }).join("")}</span>
        <span>${spoke.items.length ? (done ? `${done} satisfactory` : "Not started") : "Empty spoke"}</span>
      </span>
    </a>
  `;
}

// One practice case. Opens the scenario intro.
function libraryCaseCard(scenario, spoke, attempt, { compact = false } = {}) {
  const status = libraryCaseStatus(attempt);
  const mark = scenario.spokeNumber ? `${spoke?.spine || "Case"} ${scenario.spokeNumber}` : (spoke?.spine || "Case");
  return `
    <a class="library-case ${compact ? "is-compact" : ""}" data-tone="${escapeHtml(spoke?.tone || "ops")}" href="#/scenario/${encodeURIComponent(scenario.id)}" data-search="${escapeHtml(`${scenario.title} ${scenario.description} ${scenario.scope || ""} ${spoke?.name || ""}`)}">
      <span class="library-case-mark">${escapeHtml(mark)}</span>
      <h3>${escapeHtml(scenario.title)}</h3>
      <p>${escapeHtml(scenario.description)}</p>
      <span class="library-case-meta">
        ${scenario.status === "draft" ? `<span class="pill draft">Draft</span>` : ""}
        <span class="pill">${scenario.estimatedMinutes} min</span>
        ${attempt?.status === "in-progress" ? `<span class="pill progress">Resume</span>` : `<span class="pill ${status.cls}">${escapeHtml(status.label)}</span>`}
      </span>
    </a>
  `;
}

// Published scenarios as case files, grouped by readiness spoke. Administrators also see drafts.
export function libraryView(state) {
  const { visible, spokes } = libraryCatalog(state);
  const mine = attemptsFor(state.attempts, state.person.id);
  const done = visible.filter((scenario) => isAttemptSatisfactory(latestAttempt(mine, scenario.id))).length;
  const next = continueLibrary(visible, mine);
  const nextSpoke = next ? spokes.find((spoke) => spoke.id === next.scenario.spokeId) : null;
  const continueCopy = next?.kind === "resume"
    ? `Resume <a href="#/scenario/${encodeURIComponent(next.scenario.id)}">${escapeHtml(next.scenario.title)}</a>`
    : next
      ? `Continue with <a href="#/scenario/${encodeURIComponent(next.scenario.id)}">${escapeHtml(next.scenario.title)}</a> in ${escapeHtml(nextSpoke?.name || "the library")}`
      : "";
  return `
    <section class="library-hero">
      <div>
        <p class="eyebrow">Practice incidents · Seven spokes</p>
        <h1>Scenario library</h1>
        <p class="lede">Prior SevA cases arranged by readiness spoke. Open a spoke, then a case. Ready needs one satisfactory scenario per spoke — not a named file. Docs sit under <a href="#/reading">Reading</a>.</p>
        ${libraryMeter(done, visible.length)}
        ${continueCopy ? `<p class="reading-continue">${continueCopy}.</p>` : ""}
      </div>
      <div class="library-tabs" role="navigation" aria-label="Spokes">
        ${spokes.map((spoke) => {
          const complete = spoke.items.length && spoke.items.every((item) => isAttemptSatisfactory(latestAttempt(mine, item.id)));
          return `<a class="library-tab ${complete ? "is-done" : ""}" data-tone="${escapeHtml(spoke.tone)}" href="#/library/spoke/${encodeURIComponent(spoke.id)}" data-search="${escapeHtml(spoke.name)}"><span class="library-tab-folio">${escapeHtml(spoke.folio)}</span><span>${escapeHtml(spoke.spine)}</span></a>`;
        }).join("")}
      </div>
    </section>
    <p class="reading-disclaimer">Any numbered scenario in a spoke can count on the Ready gate. Workplace tickets cannot replace a spoke.</p>
    <div class="library-grid">
      ${spokes.map((spoke) => librarySpokeTile(spoke, mine)).join("") || `<div class="empty-state">No scenarios available.</div>`}
    </div>
  `;
}

// Cases inside one readiness spoke.
export function librarySpokeView(state, spokeId) {
  const { spokes } = libraryCatalog(state);
  const spoke = spokes.find((item) => item.id === spokeId);
  if (!spoke) return errorPage("Spoke not found", "That readiness spoke is not in the library.");
  const mine = attemptsFor(state.attempts, state.person.id);
  const done = spoke.items.filter((scenario) => isAttemptSatisfactory(latestAttempt(mine, scenario.id))).length;
  return `
    <p class="crumb"><a href="#/library">Scenario library</a> / ${escapeHtml(spoke.name)}</p>
    <section class="library-hero is-spoke" data-tone="${escapeHtml(spoke.tone)}">
      <div>
        <p class="eyebrow">Spoke ${escapeHtml(spoke.folio)}</p>
        <h1>${escapeHtml(spoke.name)}</h1>
        <p class="lede">${escapeHtml(spoke.summary)}</p>
        ${libraryMeter(done, spoke.items.length)}
      </div>
    </section>
    <p class="reading-disclaimer">Any of these can satisfy this spoke on the Ready gate.</p>
    <div class="library-shelf">
      ${spoke.items.map((scenario) => libraryCaseCard(scenario, spoke, latestAttempt(mine, scenario.id))).join("") || `<div class="empty-state">No scenarios in this spoke yet.</div>`}
    </div>
  `;
}

// The page before an attempt starts. Only a user sees the start button.
export function scenarioIntroView(state, scenario) {
  if (!scenario) return errorPage("Scenario not found", "That scenario id is not in the library.");
  if (scenario.status !== "published" && state.role !== "administrator") {
    return errorPage("Not published", "This scenario is not available for assessment yet.");
  }
  const mine = attemptsFor(state.attempts, state.person.id).filter((item) => item.scenarioId === scenario.id);
  const active = mine.find((item) => item.status === "in-progress");
  const spoke = (state.config.capabilityDomains || []).find((item) => item.id === scenario.spokeId);
  return `
    <p class="crumb"><a href="#/library">Scenario library</a>${spoke ? ` / <a href="#/library/spoke/${encodeURIComponent(spoke.id)}">${escapeHtml(spoke.name)}</a>` : ""} / ${escapeHtml(scenario.title)}</p>
    <div class="page-header">
      ${pillsForScenario(scenario, active)}
      <h1>${escapeHtml(scenario.title)}</h1>
      <p class="lede">${escapeHtml(scenario.description)}</p>
    </div>
    <div class="callout warn">
      <p>${escapeHtml(scenario.illustrativeDisclaimer)}</p>
    </div>
    <div class="grid grid-2">
      ${incidentReportCard(scenario.initialIncident, { title: "Initial support call" })}
      <div class="stack">
        <section class="card">
          <h2>Known impact</h2>
          <ul>
            <li><strong>Users:</strong> ${escapeHtml(scenario.initialIncident.impact.customers)}</li>
            <li><strong>Colleagues:</strong> ${escapeHtml(scenario.initialIncident.impact.colleagues)}</li>
            <li><strong>Business:</strong> ${escapeHtml(scenario.initialIncident.impact.business)}</li>
          </ul>
        </section>
        ${snowCard(scenario.initialIncident.serviceNow)}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:1rem">
      ${docsList(scenario.documentationReferences)}
      <section class="card">
        <h2>How this assessment works</h2>
        <ul>
          <li>One written response covering the whole incident. Answer in your own words.</li>
          <li>The initial report stays beside your answer.</li>
          <li>You can save and resume. Review before submitting.</li>
          <li>An assessor scores the write-up. Nothing is marked by keyword matching.</li>
          <li>Retries create a new attempt and keep earlier ones.</li>
        </ul>
        <div class="btn-row">
          ${state.role === "engineer"
            ? `${active
              ? `<button class="btn" data-action="resume-attempt" data-attempt-id="${active.id}">Resume saved attempt</button>`
              : `<button class="btn" data-action="start-scenario" data-scenario-id="${escapeHtml(scenario.id)}">${mine.length ? "Start a new attempt" : "Start assessment"}</button>`}
            ${active
              ? `<button class="btn secondary" data-action="start-scenario" data-scenario-id="${escapeHtml(scenario.id)}">Start a separate attempt</button>`
              : ""}`
            : `<p class="muted">Starting an attempt is for users. Assessors review submitted work, and administrators publish scenarios.</p>`}
        </div>
        ${mine.length ? `<h3>Previous attempts</h3><ul>${mine.map((item) => `<li>${statusLabel(item.status)} · ${formatAttemptMeta(item)} · version ${escapeHtml(item.scenarioVersion)}</li>`).join("")}</ul>` : ""}
      </section>
    </div>
  `;
}

// The write-up sits beside the incident report.
export function workspaceView(state, attempt) {
  if (!attempt) return errorPage("Attempt not found", "That assessment could not be opened.");
  if (attempt.status !== "in-progress") {
    return errorPage("Attempt locked", "This attempt has been submitted. Open feedback or start a new attempt.");
  }
  const scenario = attempt.scenarioSnapshot;
  const index = attempt.currentQuestionIndex || 0;
  const question = scenario.questions[index];
  const answer = attempt.answers?.[question.id];
  const single = scenario.questions.length === 1;

  return `
    <div class="page-header">
      <p class="subtle">Assessed attempt · scenario version ${escapeHtml(attempt.scenarioVersion)} · model guidance is withheld until an assessor releases feedback</p>
      <h1>${escapeHtml(scenario.title)}</h1>
      ${single ? `<p>Walk through the whole incident in one response.</p>` : `<p>Question ${index + 1} of ${scenario.questions.length}</p>`}
    </div>
    ${attemptTimerHtml(attempt, scenario.estimatedMinutes)}
    ${single ? "" : `
    <div class="question-nav" role="navigation" aria-label="Questions">
      ${scenario.questions.map((item, i) => `
        <button type="button" class="${i === index ? "current" : ""} ${hasAnswer(attempt.answers?.[item.id]) ? "answered" : ""}"
          data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${i}"
          aria-current="${i === index ? "step" : "false"}">${i + 1}<span class="sr-only"> ${escapeHtml(item.prompt.slice(0, 40))}</span></button>
      `).join("")}
    </div>`}
    <div class="workspace">
      <section class="card">
        <h2>${single ? "Your response" : "Question"}</h2>
        <p>${escapeHtml(question.prompt)}</p>
        ${question.helpText ? `<p class="hint muted">${escapeHtml(question.helpText)}</p>` : ""}
        <ul class="answer-cues" aria-label="Cover these in your answer">
          <li>What you would check, and in what order</li>
          <li>Who you would involve</li>
          <li>What you would not change</li>
          <li>How you would update people and confirm recovery</li>
        </ul>
        ${renderAnswerInput(question, answer, attempt.id)}
        <p class="subtle">Write through the whole incident. A few paragraphs is fine.</p>
        <p class="status-msg" data-save-status aria-live="polite"></p>
        <div class="btn-row">
          <button class="btn secondary" data-action="save-progress" data-attempt-id="${attempt.id}">Save progress</button>
          ${single ? "" : `
          <button class="btn ghost" ${index === 0 ? "disabled" : ""} data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${index - 1}">Previous</button>
          <button class="btn ghost" ${index >= scenario.questions.length - 1 ? "disabled" : ""} data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${index + 1}">Next</button>`}
          <a class="btn" href="#/review/${attempt.id}">Review and submit</a>
        </div>
      </section>
      <aside class="stack">
        ${incidentReportCard(scenario.initialIncident)}
        ${snowCard(scenario.initialIncident.serviceNow)}
      </aside>
    </div>
  `;
}

// True when the saved answer has text or at least one selected option.
function hasAnswer(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// The answer box. Older choice questions are shown as a text box too.
function renderAnswerInput(question, answer, attemptId) {
  const text = typeof answer === "string" && answer.trim().length > 12 ? answer : "";
  return `
    <div class="field">
      <label for="answer-${question.id}">Your answer</label>
      <textarea id="answer-${question.id}" class="answer-box" name="answer" data-attempt-id="${attemptId}" data-question-id="${question.id}" data-answer-type="written" placeholder="Walk through the whole incident in your own words.">${escapeHtml(text)}</textarea>
    </div>
  `;
}

// Read-only check before submit.
export function reviewAnswersView(attempt) {
  if (!attempt) return errorPage("Attempt not found", "Nothing to review.");
  const scenario = attempt.scenarioSnapshot;
  const missing = scenario.questions.filter((q) => !hasAnswer(attempt.answers?.[q.id]));
  return `
    <div class="page-header">
      <h1>Review your answers</h1>
      <p class="lede">Check your write-up before submitting. You can still go back and edit. After you submit, an assessor reads it. This attempt keeps scenario version ${escapeHtml(attempt.scenarioVersion)}.</p>
    </div>
    ${missing.length ? `<div class="callout warn"><p>This response is still empty. You can still submit, but unanswered criteria will show as not answered rather than zero.</p></div>` : ""}
    <div class="stack">
      ${scenario.questions.map((question, index) => `
        <section class="card">
          <h2>${scenario.questions.length === 1 ? "Your response" : `Question ${index + 1}`}</h2>
          <p>${escapeHtml(question.prompt)}</p>
          <p><strong>Your answer</strong><br>${formatAnswer(question, attempt.answers?.[question.id])}</p>
          <p><a href="#/assess/${attempt.id}" data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${index}">Edit this response</a></p>
        </section>
      `).join("")}
    </div>
    <div class="btn-row">
      <a class="btn secondary" href="#/assess/${attempt.id}">Back to workspace</a>
      <button class="btn" data-action="submit-attempt" data-attempt-id="${attempt.id}">Submit for review</button>
    </div>
  `;
}

// Render a written answer, or the text of selected options on an old attempt.
function formatAnswer(question, answer) {
  if (!hasAnswer(answer)) return "<span class='muted'>Not answered</span>";
  if (question.type === "written") return nl(answer);
  const ids = Array.isArray(answer) ? answer : [answer];
  return `<ul>${ids.map((id) => {
    const option = question.options?.find((item) => item.id === id);
    return `<li>${escapeHtml(option?.text || id)}</li>`;
  }).join("")}</ul>`;
}

// Confirmation that the attempt is waiting for an assessor.
export function submittedView(attempt) {
  if (!attempt) return errorPage("Attempt not found", "Submission not found.");
  return `
    <div class="page-header">
      <h1>Submitted</h1>
      <p class="lede">Thank you. Your assessment for <strong>${escapeHtml(attempt.scenarioSnapshot.title)}</strong> is with an assessor. Your words stay as you wrote them. Scores and commentary appear when feedback is released.</p>
    </div>
    <div class="card">
      <p>Submitted ${formatDateTime(attempt.submittedAt)} · Scenario version ${escapeHtml(attempt.scenarioVersion)}</p>
      <div class="btn-row">
        <a class="btn" href="#/dashboard">Return to dashboard</a>
        <a class="btn secondary" href="#/library">Scenario library</a>
      </div>
    </div>
  `;
}

// Released feedback: commentary, bars, then the engineer's own words beside the notes.
export function feedbackView(state, attempt) {
  if (!attempt) return errorPage("Attempt not found", "Feedback is not available.");
  if (attempt.status !== "released") {
    return `
      <div class="page-header">
        <h1>Feedback not released</h1>
        <p class="lede">This attempt is ${escapeHtml(statusLabel(attempt.status))}. Scores and model guidance stay with the assessor until they release feedback.</p>
        <a class="btn" href="#/dashboard">Dashboard</a>
      </div>
    `;
  }
  const scenario = attempt.scenarioSnapshot;
  const results = buildCriterionResults(scenario, attempt.answers, attempt.review);
  const domains = summariseDomains(state.config.capabilityDomains, results, readinessMinScore(state));
  return `
    <div class="page-header">
      <h1>Feedback · ${escapeHtml(scenario.title)}</h1>
      <p class="subtle">${formatAttemptMeta(attempt)} · version ${escapeHtml(attempt.scenarioVersion)}</p>
    </div>
    ${readinessBanner(attempt.review?.readinessRecommendation)}
    <div class="card">
      <h2>Assessor commentary</h2>
      <p>${nl(attempt.review?.overallCommentary || "No overall commentary recorded.")}</p>
      <h3>Strengths demonstrated</h3>
      <p>${nl(attempt.review?.strengths || "None recorded on this attempt.")}</p>
      <h3>Development areas</h3>
      <p>${nl(attempt.review?.developmentAreas || "None recorded on this attempt.")}</p>
      <h3>Agreed development actions</h3>
      ${actionListHtml(listDevelopmentActions([attempt], [], attempt.engineerId), { role: "engineer", empty: "None recorded on this attempt." })}
    </div>
    <div class="card" style="margin-top:1rem">
      <h2>Scores by capability domain</h2>
      ${domainBars(domains)}
      ${criterionTable(results, { domains: state.config.capabilityDomains })}
    </div>
    <div class="card" style="margin-top:1rem">
      <h2>Your words and how they were read</h2>
      ${scenario.questions.map((question, index) => {
        const linked = results.filter((item) => item.questionIds.includes(question.id));
        return `
          <article class="reflection">
            <div>
              <h3>${scenario.questions.length === 1 ? "Your response" : `Question ${index + 1}`}</h3>
              <p>${escapeHtml(question.prompt)}</p>
              <p class="subtle">What you wrote</p>
              <blockquote>${formatAnswer(question, attempt.answers?.[question.id])}</blockquote>
            </div>
            <div>
              <p class="subtle">How it was read</p>
              ${linked.length ? linked.map((item) => {
                const note = usefulNote(attempt.review?.criterionScores?.[item.id]?.evidence);
                const weak = item.score != null && item.score < 2;
                return `
                  <div class="read-note">
                    <p>
                      <span class="pill ${weak ? "not-ready" : item.score == null ? "progress" : "ready"}">${item.score == null ? "Not scored" : `${item.score} / ${item.maxScore}`}</span>
                      ${escapeHtml(item.label)}
                    </p>
                    ${weak ? `<p class="subtle">Area to improve</p>` : ""}
                    ${note ? `<p>${nl(note)}</p>` : `<p class="subtle">No note was added for this score.</p>`}
                  </div>
                `;
              }).join("") : `<p class="muted">This answer was not linked to a scored criterion.</p>`}
            </div>
          </article>
        `;
      }).join("")}
    </div>
    <p class="btn-row"><a class="btn secondary" href="#/scenario/${encodeURIComponent(scenario.id)}">Retry as a new attempt</a></p>
  `;
}

// Personal summary. It is not a certificate and it does not compare colleagues.
export function readinessView(state) {
  const mine = attemptsFor(state.attempts, state.person.id);
  const min = readinessMinScore(state);
  const spokeRows = spokeRowsFor(state, mine);
  const requiredComplete = spokeGateComplete(state.readinessConfig, spokeRows);
  const released = mine.filter((item) => item.status === "released");
  const allResults = released.flatMap((item) => buildCriterionResults(item.scenarioSnapshot, item.answers, item.review));
  const domains = applyEvidenceWeight(
    summariseDomains(state.config.capabilityDomains, allResults, min),
    (state.evidence || []).filter((item) => item.engineerId === state.person.id)
  );
  const countingResults = spokeRows.flatMap((row) => {
    if (!row.met || !row.countedAttemptId) return [];
    const attempt = mine.find((item) => item.id === row.countedAttemptId);
    if (!attempt) return [];
    return buildCriterionResults(attempt.scenarioSnapshot, attempt.answers, attempt.review);
  });
  const hints = attemptOutcomeHints(requiredComplete ? countingResults : allResults, domains, requiredComplete, min);
  const latestRec = released
    .slice()
    .sort((a, b) => (a.review?.releasedAt || "").localeCompare(b.review?.releasedAt || ""))
    .map((item) => item.review?.readinessRecommendation)
    .filter(Boolean)
    .at(-1);

  return `
    <div class="page-header">
      <h1>Readiness summary</h1>
      <p class="lede">A live map of your capability areas. Bright nodes are covered. Pulsing nodes are gaps from released feedback. Click a node to inspect it. This is not a certificate — an assessor still makes the recommendation.</p>
    </div>
    ${latestRec ? readinessBanner(latestRec) : `<div class="callout warn"><p>No assessor recommendation has been released yet. Incomplete evidence is not the same as a score of zero, and completing scenarios does not by itself mean ready.</p></div>`}
    ${readinessNetwork(domains, { personName: state.person?.name || "You" })}
    <div class="card" style="margin-top:1rem">
      <h2>Ready gate</h2>
      <ul class="work-list">
        ${spokeGateListHtml(spokeRows, mine)}
      </ul>
      <p class="subtle">${spokeGateNote(requiredComplete)}</p>
      ${(state.evidence || []).filter((item) => item.engineerId === state.person.id).length
        ? `<p class="subtle"><a href="#/evidence">Workplace tickets</a> can thicken a spoke. They cannot replace a spoke on the Ready gate or cancel a mandatory gap.</p>`
        : `<p class="subtle">Add prior tickets on <a href="#/evidence">Evidence</a> if you have workplace examples for a thin spoke.</p>`}
      ${hints.mandatoryUnmet.length
        ? `<p class="error-msg">Unmet mandatory criteria stay visible even if some nodes look strong:</p><ul>${hints.mandatoryUnmet.map((item) => `<li>${escapeHtml(item.label)} (${item.score}/${item.maxScore})</li>`).join("")}</ul>`
        : `<p class="subtle">No scored mandatory criterion is currently below Demonstrated (${min}) on the counting attempts.${hints.hasIncompleteEvidence ? " Incomplete evidence is still present." : ""}</p>`}
    </div>
  `;
}

// Form for suggesting a new practice scenario.
export function proposeView() {
  return `
    <div class="page-header">
      <h1>Propose a scenario</h1>
      <p class="lede">Suggest a new Sev1 OOH practice scenario. An administrator will review it before publication. Do not include live incident data, personal data, or unapproved policy.</p>
    </div>
    <form class="card" data-form="propose">
      <div class="field">
        <label for="p-title">Title</label>
        <input id="p-title" name="title" type="text" required minlength="8">
      </div>
      <div class="field">
        <label for="p-summary">Incident outline</label>
        <textarea id="p-summary" name="summary" required minlength="30"></textarea>
        <span class="hint">Fictionalised situation, impact, and why it would help OOH readiness.</span>
      </div>
      <div class="field">
        <label for="p-questions">Draft questions or learning points</label>
        <textarea id="p-questions" name="questions" required></textarea>
      </div>
      <div class="field">
        <label for="p-domains">Capability domains this would exercise</label>
        <input id="p-domains" name="domains" type="text">
      </div>
      <button class="btn" type="submit">Send for review</button>
      <p class="status-msg" data-form-status></p>
    </form>
  `;
}

// Assessor home: queue KPIs and the submitted / released table.
export function assessorQueueView(state) {
  const queue = state.attempts.filter((item) => item.status === "submitted" || item.status === "released");
  const submitted = queue.filter((item) => item.status === "submitted");
  const released = queue.filter((item) => item.status === "released");
  const tickets = (state.evidence || []).filter((item) => item.status === "submitted" || item.status === "released");
  const ticketQueue = tickets.filter((item) => item.status === "submitted");
  const people = peopleForAssessor(state);
  return `
    <section class="dash-hero">
      <div>
        <p class="eyebrow">Assessor</p>
        <h1>Dashboard Overview</h1>
        <p class="lede">Score written responses and workplace tickets against the rubric, then open a person page for the rota conversation.</p>
      </div>
      <a class="btn" href="#/assessor/people">Open people</a>
    </section>
    <div class="kpi-grid">
      ${kpiCard({ label: "In queue", value: submitted.length, hint: submitted.length ? `<span class="delta down">Waiting on a review</span>` : "Queue is clear", href: "#/assessor" })}
      ${kpiCard({ label: "Tickets to review", value: ticketQueue.length, hint: ticketQueue.length ? `<span class="delta down">Workplace evidence</span>` : "No tickets waiting", href: "#/assessor" })}
      ${kpiCard({ label: "Released", value: released.length, hint: "Feedback already sent", href: "#/assessor" })}
      ${kpiCard({ label: "People", value: people.length, hint: "Engineers in this store", href: "#/assessor/people" })}
    </div>
    <div class="card table-wrap">
      <div class="card-head">
        <div>
          <h2>Review queue</h2>
          <p class="subtle">Submitted and released attempts</p>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>Engineer</th><th>Scenario</th><th>Version</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
        <tbody>
          ${queue.length ? queue.map((item) => `
            <tr data-search="${escapeHtml(item.engineerName)} ${escapeHtml(item.scenarioSnapshot.title)}">
              <td><a href="#/assessor/person/${encodeURIComponent(item.engineerId)}">${escapeHtml(item.engineerName)}</a></td>
              <td>${escapeHtml(item.scenarioSnapshot.title)}</td>
              <td>${escapeHtml(item.scenarioVersion)}</td>
              <td><span class="pill ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
              <td>${formatDateTime(item.submittedAt)}</td>
              <td><a class="btn secondary" href="#/assessor/review/${item.id}">Open</a></td>
            </tr>
          `).join("") : `<tr><td colspan="6">No submitted attempts yet. A user completes a scenario, then an assessor opens it here.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="card table-wrap" style="margin-top:1rem">
      <div class="card-head">
        <div>
          <h2>Workplace tickets</h2>
          <p class="subtle">Prior-incident write-ups awaiting a 0–3 score</p>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>Engineer</th><th>Ticket</th><th>Spoke</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${tickets.length ? tickets.map((item) => `
            <tr data-search="${escapeHtml(item.engineerName)} ${escapeHtml(item.ticketRef)}">
              <td><a href="#/assessor/person/${encodeURIComponent(item.engineerId)}">${escapeHtml(item.engineerName)}</a></td>
              <td>${escapeHtml(item.ticketRef)}</td>
              <td>${escapeHtml(domainName(state, item.domainId))}</td>
              <td><span class="pill ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
              <td><a class="btn secondary" href="#/assessor/evidence/${item.id}">Open</a></td>
            </tr>
          `).join("") : `<tr><td colspan="5">No workplace tickets in this browser yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// Score each criterion beside the question it first belongs to.
export function assessorReviewView(state, attempt) {
  if (!attempt) return errorPage("Attempt not found", "Nothing to review.");
  const scenario = attempt.scenarioSnapshot;
  const review = attempt.review || {};
  const results = buildCriterionResults(scenario, attempt.answers, review);
  const domains = summariseDomains(state.config.capabilityDomains, results, readinessMinScore(state));
  const hints = attemptOutcomeHints(results, domains, true, readinessMinScore(state));
  return `
    <div class="page-header">
      <h1>Review · ${escapeHtml(scenario.title)}</h1>
      <p class="subtle">${escapeHtml(attempt.engineerName)} · version ${escapeHtml(attempt.scenarioVersion)} · ${formatAttemptMeta(attempt)}</p>
    </div>
    ${hints.safetyFlags.length ? `<div class="callout danger"><p><strong>Safety-critical criteria need attention.</strong> ${hints.safetyFlags.map((item) => escapeHtml(item.label)).join("; ")}</p></div>` : ""}
    <div class="card">
      <h2>Coverage</h2>
      ${domainBars(domains)}
      <p class="coverage-note">Do not let a high average hide an unmet mandatory criterion. Unreviewed written criteria are pending, not zero.</p>
    </div>
    <form data-form="review" data-attempt-id="${attempt.id}">
      ${scenario.questions.map((question, index) => {
        const owned = results.filter((item) => primaryQuestion(item, scenario.questions)?.id === question.id);
        const shared = results.filter((item) => item.questionIds.includes(question.id) && primaryQuestion(item, scenario.questions)?.id !== question.id);
        return `
          <section class="card question-review">
            <div>
              <h2>${scenario.questions.length === 1 ? "Response" : `Question ${index + 1}`}${question.type === "written" || scenario.questions.length === 1 ? "" : ` · ${escapeHtml(question.type)}`}</h2>
              <p>${escapeHtml(question.prompt)}</p>
              <p class="subtle">What they wrote</p>
              <blockquote>${formatAnswer(question, attempt.answers?.[question.id])}</blockquote>
              ${question.assessorGuidance ? `<details class="guidance"><summary>Assessor guidance</summary><p>${escapeHtml(question.assessorGuidance)}</p></details>` : ""}
              ${question.acceptableApproaches ? `<p class="subtle">Acceptable approaches: ${escapeHtml((question.acceptableApproaches || []).join(" · "))}</p>` : ""}
              ${shared.map((item) => {
                const home = primaryQuestion(item, scenario.questions);
                const homeIndex = scenario.questions.findIndex((entry) => entry.id === home?.id);
                return `<p class="subtle">Also read for “${escapeHtml(item.label)}”, scored beside question ${homeIndex + 1}.</p>`;
              }).join("")}
            </div>
            <div class="question-scores">
              ${owned.length ? owned.map((item) => scoreControl(item, review, state)).join("") : `<p class="muted">No criterion is scored from this question alone. It still informs the scores named on the left.</p>`}
            </div>
          </section>
        `;
      }).join("")}
      ${results.filter((item) => !primaryQuestion(item, scenario.questions)).map((item) => `
        <section class="card">${scoreControl(item, review, state)}</section>
      `).join("")}
      <section class="card">
        <div class="field">
          <label for="strengths">Strengths demonstrated</label>
          <textarea id="strengths" name="strengths">${escapeHtml(review.strengths || "")}</textarea>
        </div>
        <div class="field">
          <label for="developmentAreas">Specific development areas</label>
          <textarea id="developmentAreas" name="developmentAreas">${escapeHtml(review.developmentAreas || "")}</textarea>
        </div>
        <div class="field">
          <label for="developmentActions">Suggested next steps</label>
          <textarea id="developmentActions" name="developmentActions" placeholder="One action per line. Example: review the illustrative connectivity runbook">${escapeHtml(review.developmentActions || "")}</textarea>
          <span class="hint">These become a list on the engineer dashboard and the person page.</span>
        </div>
        <div class="field">
          <label for="overallCommentary">Overall constructive commentary</label>
          <textarea id="overallCommentary" name="overallCommentary">${escapeHtml(review.overallCommentary || "")}</textarea>
        </div>
        <div class="field">
          <label for="readinessRecommendation">Readiness recommendation</label>
          <select id="readinessRecommendation" name="readinessRecommendation">
            <option value="">Not set — do not imply readiness from completion</option>
            <option value="ready" ${review.readinessRecommendation === "ready" ? "selected" : ""}>Ready</option>
            <option value="ready-with-development" ${review.readinessRecommendation === "ready-with-development" ? "selected" : ""}>Ready with development areas</option>
            <option value="not-yet-ready" ${review.readinessRecommendation === "not-yet-ready" ? "selected" : ""}>Not yet ready</option>
          </select>
        </div>
        <p class="error-msg" data-review-error></p>
        <div class="btn-row">
          <button class="btn secondary" type="submit" data-review-mode="save">Save review</button>
          <button class="btn" type="submit" data-review-mode="release">Save and release to engineer</button>
        </div>
      </section>
    </form>
  `;
}

// Microsoft sign-in for ignitemyfire.co.uk, plus a local name list for practice on this browser.
export function signInView(state) {
  const people = (state.directory || []).filter((person) => person.source !== "entra");
  const entra = state.entraEnabled;
  return `
    <div class="page-header">
      <h1>Sign in</h1>
      ${entra ? `
        <p class="lede">Use your ignitemyfire.co.uk account for authentication.</p>
      ` : `
        <p class="lede">Choose your name. This browser keeps a local session in place of Microsoft Entra ID. There is no password here, because a password stored in the browser would not be a real control.</p>
        <p class="lede">An administrator assigns User, Assessor, or Administrator before you arrive. Signing in does not let you pick a different role.</p>
      `}
    </div>
    ${entra ? `
      <div class="entra-panel">
        <button type="button" class="btn" data-action="entra-sign-in">Sign in with Microsoft</button>
        ${state.authError ? `<p class="error-msg">${escapeHtml(state.authError)}</p>` : ""}
      </div>
      <details class="local-practice">
        <summary>Practice on this browser</summary>
        <p class="lede">These names stay on this machine only. They do not prove an ignitemyfire.co.uk identity.</p>
        <div class="people-grid">
          ${people.map((person) => personCard(person)).join("")}
        </div>
      </details>
    ` : `
      <div class="people-grid">
        ${people.map((person) => personCard(person)).join("")}
      </div>
    `}
  `;
}

// Local practice profile button on the sign-in page.
function personCard(person) {
  return `
    <button type="button" class="person-card" data-action="sign-in" data-person-id="${escapeHtml(person.id)}">
      <strong>${escapeHtml(person.name)}</strong>
      <span>${escapeHtml(roleLabel(person.role))}</span>
    </button>
  `;
}

// Administrator page for adding colleagues and changing the one role each person has.
export function accessView(state) {
  const people = state.directory || [];
  const adminCount = people.filter((person) => person.role === "administrator").length;
  return `
    <div class="page-header">
      <h1>Role Access</h1>
      <p class="lede">ignitemyfire.co.uk colleagues receive User, Assessor, or Administrator from the Incident Lab enterprise application in Entra ID. The names below that are only for this browser can still be added and changed here. Attempts stay in this browser.</p>
      ${state.flash ? `<p class="status-msg">${escapeHtml(state.flash)}</p>` : ""}
    </div>
    <div class="card table-wrap access-table">
      <table>
        <thead><tr><th>Colleague</th><th>Account</th><th>Access</th><th></th></tr></thead>
        <tbody>
          ${people.map((person) => {
            const entra = person.source === "entra";
            return `
            <tr>
              <td>${escapeHtml(person.name)}${entra ? `<span class="subtle"> · Entra</span>` : ""}</td>
              <td>${escapeHtml(person.email || person.roleTitle || "—")}</td>
              <td>
                ${entra ? `<span>${roleLabel(person.role)}</span>` : `
                <select data-person-role="${escapeHtml(person.id)}" aria-label="Access for ${escapeHtml(person.name)}">
                  ${["engineer", "assessor", "administrator"].map((role) => `
                    <option value="${role}" ${person.role === role ? "selected" : ""}>${roleLabel(role)}</option>
                  `).join("")}
                </select>`}
              </td>
              <td>
                <button type="button" class="btn ghost" data-action="remove-person" data-person-id="${escapeHtml(person.id)}" ${entra || (person.role === "administrator" && adminCount < 2) ? "disabled" : ""}>Remove</button>
              </td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
    </div>
    <form class="card" data-form="add-person" style="margin-top:1rem">
      <h2>Add a colleague</h2>
      <div class="field">
        <label for="person-name">Name</label>
        <input id="person-name" name="name" type="text" required autocomplete="name">
      </div>
      <div class="field">
        <label for="person-title">Job title</label>
        <input id="person-title" name="roleTitle" type="text" placeholder="VDI Platform Engineer">
      </div>
      <div class="field">
        <label for="person-role">Access</label>
        <select id="person-role" name="role">
          <option value="engineer">User</option>
          <option value="assessor">Assessor</option>
          <option value="administrator">Administrator</option>
        </select>
      </div>
      <button class="btn" type="submit">Add colleague</button>
      <p class="status-msg" data-form-status></p>
    </form>
  `;
}

// File steps for adding a scenario to the shared library, not only this browser.
function howToAddScenarioHtml() {
  return `
    <section class="card">
      <h2>Add a scenario everyone can see</h2>
      <p class="subtle">The Create Scenario form and Import page only save in this browser. The live library is the JSON files listed in <code>data/config.json</code>.</p>
      <ol>
        <li>Copy <code>data/scenarios/_template.json</code> to a new file, for example <code>data/scenarios/pega-bridge.json</code>.</li>
        <li>Give it a unique <code>id</code> (lowercase, hyphens). Leave <code>mandatory</code> as <code>false</code> — Ready is one satisfactory scenario per spoke, not a flag on a file.</li>
        <li>Set <code>spokeId</code> to that spoke and <code>spokeNumber</code> to the next free number (1, then 2, and so on). The <code>title</code> is the spoke name plus that number, for example <code>Networking 2</code>.</li>
        <li>Rewrite the description, short call summary, labelled facts, mock ServiceNow ticket, the one response prompt, and scoring criteria. Facts are what they would hear on the first call — not who to engage or the smoking gun. A short hint on the question is enough.</li>
        <li>Spoke ids for <code>capabilityDomainIds</code> and <code>domainId</code> must be one of: <code>avd-infrastructure</code>, <code>networking</code>, <code>trm-escalation-ops</code>, <code>proxy-solution</code>, <code>vendor-management</code>, <code>platform-troubleshooting</code>, <code>m365-stack</code>.</li>
        <li>Add the new path to <code>bundledScenarioFiles</code> in <code>data/config.json</code>.</li>
        <li>Check it locally, then ask for the live site to be published. Saving here is not enough.</li>
      </ol>
      <p class="subtle">One written prompt is enough. Each scoring criterion uses maxScore 3 and must list the question id (q1).</p>
    </section>
  `;
}

// Administrator home: library KPIs, publish, unpublish, and reset local demo data.
export function adminScenariosView(state) {
  const published = state.scenarios.filter((item) => item.status === "published").length;
  const drafts = state.scenarios.filter((item) => item.status !== "published").length;
  const openProposals = (state.proposals || []).filter((item) => item.status === "open").length;
  return `
    <section class="dash-hero">
      <div>
        <p class="eyebrow">Administrator</p>
        <h1>Dashboard Overview</h1>
        <p class="lede">Create or import JSON, validate, and publish. Bundled sample scenarios can be overridden in this browser without changing the source files until you export.</p>
      </div>
      <a class="btn" href="#/admin/author">Create scenario</a>
    </section>
    <div class="kpi-grid">
      ${kpiCard({ label: "Scenarios", value: state.scenarios.length, hint: "In this library" })}
      ${kpiCard({ label: "Published", value: published, hint: `<span class="delta up">Live for users</span>` })}
      ${kpiCard({ label: "Drafts", value: drafts, hint: drafts ? `<span class="delta down">Not yet live</span>` : "None" })}
      ${kpiCard({ label: "Open proposals", value: openProposals, hint: "Awaiting review", href: "#/admin/proposals" })}
    </div>
    <div class="btn-row">
      <a class="btn secondary" href="#/admin/import">Import JSON</a>
      <button class="btn danger" data-action="reset-demo">Reset demo data</button>
    </div>
    <div class="card table-wrap" style="margin-top:1rem">
      <table class="data-table">
        <thead><tr><th>Title</th><th>Id / version</th><th>Status</th><th>Spoke</th><th></th></tr></thead>
        <tbody>
          ${state.scenarios.map((item) => `
            <tr data-search="${escapeHtml(item.title)} ${escapeHtml(item.id)}">
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.id)} · ${escapeHtml(item.version)}</td>
              <td><span class="pill ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
              <td>${escapeHtml(item.spokeId || "—")}</td>
              <td>
                <a href="#/admin/scenario/${encodeURIComponent(item.id)}">Edit</a>
                · <button class="btn ghost" data-action="download-scenario" data-scenario-id="${escapeHtml(item.id)}">Download JSON</button>
                · <button class="btn ghost" data-action="toggle-publish" data-scenario-id="${escapeHtml(item.id)}">${item.status === "published" ? "Unpublish" : "Publish"}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Paste or upload scenario JSON. It is validated before it is stored.
export function adminImportView(scenario) {
  const json = scenario ? JSON.stringify(scenario, null, 2) : sampleTemplate();
  return `
    <div class="page-header">
      <h1>${scenario ? "Edit scenario JSON" : "Import or create a scenario"}</h1>
      <p class="lede">Prefer the <a href="#/admin/author">Create Scenario form</a> for a new incident. This page still accepts a JSON file or paste. JSON is validated before it is stored.</p>
    </div>
    <form class="card" data-form="import-scenario">
      <div class="field">
        <label for="scenario-file">Optional file import</label>
        <input id="scenario-file" type="file" accept="application/json,.json">
      </div>
      <div class="field">
        <label for="scenario-json">Scenario JSON</label>
        <textarea id="scenario-json" name="json" class="json-editor" required>${escapeHtml(json)}</textarea>
      </div>
      <p class="error-msg" data-import-error></p>
      <div class="btn-row">
        <button class="btn secondary" type="submit" data-import-mode="draft">Validate and save draft</button>
        <button class="btn" type="submit" data-import-mode="published">Validate and publish</button>
      </div>
    </form>
  `;
}

// Ideas sent from Propose a scenario.
export function adminProposalsView(state) {
  return `
    <div class="page-header">
      <h1>Scenario proposals</h1>
      <p class="lede">Engineer suggestions await review. Publishing still requires valid scenario JSON.</p>
    </div>
    <div class="stack">
      ${(state.proposals || []).length ? state.proposals.map((item) => `
        <article class="card">
          <p class="subtle">${escapeHtml(item.authorName)} · ${formatDateTime(item.createdAt)} · ${escapeHtml(item.status)}</p>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${nl(item.summary)}</p>
          <p><strong>Draft questions</strong><br>${nl(item.questions)}</p>
          <p><strong>Domains</strong> ${escapeHtml(item.domains || "—")}</p>
          ${item.status === "open" ? `<button class="btn secondary" data-action="close-proposal" data-proposal-id="${item.id}">Mark reviewed</button>` : ""}
        </article>
      `).join("") : `<div class="empty-state">No proposals yet.</div>`}
    </div>
  `;
}

// Edit the gates that sit behind a Ready recommendation.
export function adminCriteriaView(state) {
  const cfg = state.readinessConfig;
  return `
    <div class="page-header">
      <h1>On-Call Criteria</h1>
      <p class="lede">These gates support the assessor. They do not auto-certify anyone.</p>
    </div>
    <form class="card" data-form="criteria">
      <div class="field">
        <label>
          <input type="checkbox" name="oneScenarioPerSpoke" ${cfg.oneScenarioPerSpoke !== false ? "checked" : ""}>
          One scenario per spoke must be released at Demonstrated (or the minimum below)
        </label>
      </div>
      <div class="field">
        <label>
          <input type="checkbox" name="allRequiredReviewed" ${cfg.allRequiredReviewed !== false ? "checked" : ""}>
          Mandatory and safety-critical criteria on that attempt must meet the minimum before the spoke counts
        </label>
      </div>
      <div class="field">
        <label for="mandatoryCriterionMinimum">Minimum score for mandatory and safety-critical criteria (0–3)</label>
        <input id="mandatoryCriterionMinimum" name="mandatoryCriterionMinimum" type="number" min="0" max="3" step="1" value="${escapeHtml(cfg.mandatoryCriterionMinimum)}">
      </div>
      <div class="field">
        <label for="notes">Assessor notes</label>
        <textarea id="notes" name="notes">${escapeHtml(cfg.notes || "")}</textarea>
      </div>
      <button class="btn" type="submit">Save criteria</button>
      <p class="status-msg" data-form-status></p>
    </form>
  `;
}

// Starter JSON for a new written scenario.
function sampleTemplate() {
  return JSON.stringify({
    id: "vdi-custom-001",
    version: "1.0.0",
    status: "draft",
    title: "Networking 2",
    spokeId: "networking",
    spokeNumber: 2,
    description: "Describe the Sev1 OOH situation in at least twenty characters.",
    scope: "Out-of-hours VDI practice scenario.",
    difficulty: "foundation",
    estimatedMinutes: 30,
    mandatory: false,
    illustrativeDisclaimer: "Illustrative content. Validate against approved operational sources before use.",
    assessorGuidance: "Reward sound investigation order and appropriate escalation.",
    acceptableAlternativeApproaches: ["Document-led investigation before platform changes."],
    documentationReferences: [{ title: "Illustrative runbook title", note: "Confirm locally." }],
    initialIncident: {
      callSummary: "Replace with a fictional support call summary for the engineer.",
      serviceNow: {
        incidentNumber: "INC0000000",
        priority: "1 — Critical",
        assignmentGroup: "VDI Platform Support (illustrative)",
        opened: "2026-01-01 00:00 UTC",
        caller: "Service Desk",
        affectedCI: "VDI-UK-PROD",
        shortDescription: "Short description",
        description: "Longer illustrative description."
      },
      impact: {
        customers: "Illustrative user impact.",
        colleagues: "Illustrative colleague impact.",
        business: "Illustrative business impact."
      }
    },
    questions: [
      {
        id: "q1",
        type: "written",
        prompt: "Walk through how you would handle this incident from the first call through to recovery. Write the full response in your own words.",
        capabilityDomainIds: ["platform-troubleshooting", "trm-escalation-ops"],
        assessorGuidance: "Reward a scoped investigation and an appropriate escalation. Do not score an unsafe production change as demonstrated."
      }
    ],
    scoringCriteria: [
      {
        id: "c1",
        label: "Establishes impact before changes",
        domainId: "platform-troubleshooting",
        maxScore: 3,
        mandatory: true,
        safetyCritical: false,
        questionIds: ["q1"]
      },
      {
        id: "c2",
        label: "Uses the support model",
        domainId: "trm-escalation-ops",
        maxScore: 3,
        mandatory: true,
        safetyCritical: true,
        questionIds: ["q1"]
      }
    ]
  }, null, 2);
}

// The first question a criterion is linked to. That is where the score controls are drawn.
function primaryQuestion(criterion, questions) {
  return (questions || []).find((question) => criterion.questionIds?.includes(question.id)) || null;
}

// Hide stock phrases so released feedback only quotes a note the assessor actually wrote.
function usefulNote(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (/awaiting assessor review/i.test(value)) return "";
  if (value === "Assessor score applied.") return "";
  if (value === "No linked question has been answered.") return "";
  return value;
}

// Capability areas below Demonstrated (under 67%) or with an unmet mandatory criterion.
function areasToImprove(domains) {
  return (domains || []).filter((domain) => domain.mandatoryUnmet?.length || (domain.percentage != null && domain.percentage < 67));
}

// The 0–3 radios and the note box for one criterion.
function scoreControl(item, review, state) {
  const saved = review.criterionScores?.[item.id] || {};
  const domain = state.config.capabilityDomains.find((entry) => entry.id === item.domainId);
  const autoVal = item.source === "objective" ? item.score : "";
  return `
    <fieldset class="review-block">
      <legend><strong>${escapeHtml(item.label)}</strong>
        ${item.mandatory ? `<span class="pill required">Mandatory</span>` : ""}
        ${item.safetyCritical ? `<span class="pill critical">Safety-critical</span>` : ""}
      </legend>
      <p class="subtle">${escapeHtml(domain?.name || item.domainId)}</p>
      <div class="score-scale">
        <label><input type="radio" name="crit-${item.id}" value="" ${saved.score == null || saved.score === "" ? "checked" : ""}> Leave unreviewed</label>
        ${SCORE_SCALE.map((scale) => `
          <label>
            <input type="radio" name="crit-${item.id}" value="${scale.value}" ${String(saved.score) === String(scale.value) ? "checked" : ""}>
            <span><strong>${scale.value} — ${escapeHtml(scale.label)}</strong></span>
          </label>
        `).join("")}
      </div>
      <div class="field">
        <label for="ev-${item.id}">What in their words supports this score</label>
        <textarea id="ev-${item.id}" name="ev-${item.id}">${escapeHtml(saved.evidence || "")}</textarea>
      </div>
      ${item.source === "objective" ? `
      <div class="field">
        <label for="adj-${item.id}">Explanation if you adjust an automated score</label>
        <textarea id="adj-${item.id}" name="adj-${item.id}">${escapeHtml(saved.adjustmentExplanation || "")}</textarea>
        <span class="hint">Required when changing a mapped result. Auto reference: ${autoVal === "" || autoVal == null ? "none" : autoVal}</span>
      </div>` : ""}
    </fieldset>
  `;
}

// Domain bars from this colleague's released attempts only.
function aggregateReleasedDomains(state, engineerId = state.person.id) {
  const mine = attemptsFor(state.attempts, engineerId).filter((item) => item.status === "released");
  const results = mine.flatMap((item) => buildCriterionResults(item.scenarioSnapshot, item.answers, item.review));
  const tickets = (state.evidence || []).filter((item) => item.engineerId === engineerId);
  return applyEvidenceWeight(summariseDomains(state.config.capabilityDomains, results, readinessMinScore(state)), tickets);
}

export { formatAnswer, hasAnswer };

// Suggested time remaining on the workspace. It does not lock submit.
function attemptTimerHtml(attempt, estimatedMinutes) {
  const minutes = Number(estimatedMinutes) || 30;
  return `
    <div class="attempt-timer" data-attempt-timer data-attempt-id="${escapeHtml(attempt.id)}" data-limit-minutes="${minutes}" role="timer" aria-live="polite">
      <span>Suggested time ${minutes} minutes</span>
      <strong>—</strong>
      <span class="subtle">The timer does not stop you submitting.</span>
    </div>
  `;
}

// Agreed next steps as a list, with a link back to the source review.
function actionListHtml(actions, { role = "engineer", empty = "No agreed actions yet. They appear when an assessor releases next steps." } = {}) {
  if (!actions.length) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `
    <ul class="action-list">
      ${actions.map((item) => {
        const href = item.attemptId
          ? (role === "assessor" ? `#/assessor/review/${item.attemptId}` : `#/feedback/${item.attemptId}`)
          : item.evidenceId
            ? (role === "assessor" ? `#/assessor/evidence/${item.evidenceId}` : `#/evidence/${item.evidenceId}`)
            : "";
        const label = item.scenarioTitle || item.ticketRef || "Review";
        return `
          <li>
            <span>${escapeHtml(item.text)}</span>
            <span class="subtle">${href ? `<a href="${href}">${escapeHtml(label)}</a>` : escapeHtml(label)}${item.at ? ` · ${formatDateTime(item.at)}` : ""}</span>
          </li>`;
      }).join("")}
    </ul>
  `;
}

// Capability name from config, or the raw id if it is unknown.
function domainName(state, domainId) {
  return state.config.capabilityDomains.find((item) => item.id === domainId)?.name || domainId;
}

// Engineers who have attempts, tickets, or an engineer role in the directory.
function peopleForAssessor(state) {
  const ids = new Set();
  (state.directory || []).filter((item) => item.role === "engineer").forEach((item) => ids.add(item.id));
  (state.attempts || []).forEach((item) => ids.add(item.engineerId));
  (state.evidence || []).forEach((item) => ids.add(item.engineerId));
  return [...ids].map((id) => {
    const person = (state.directory || []).find((item) => item.id === id);
    const name = person?.name || state.attempts.find((item) => item.engineerId === id)?.engineerName || state.evidence.find((item) => item.engineerId === id)?.engineerName || id;
    return { id, name, person };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// Role-on-call choices for a workplace ticket write-up.
const ROLE_ON_CALL = [
  ["primary", "Primary"],
  ["shadow", "Shadow"],
  ["bridge", "On the bridge"],
  ["other", "Other"]
];

// Tick-box list of capability areas for the authoring form.
function domainCheckboxes(domains, name, selected = []) {
  const chosen = selected.length ? selected : [];
  return `
    <div class="domain-checks">
      ${domains.map((domain) => `
        <label>
          <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(domain.id)}" ${chosen.includes(domain.id) ? "checked" : ""}>
          ${escapeHtml(domain.name)}
        </label>
      `).join("")}
    </div>
  `;
}

// User list of prior-ticket write-ups.
export function evidenceLogView(state) {
  const mine = (state.evidence || []).filter((item) => item.engineerId === state.person.id)
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  return `
    <div class="page-header">
      <h1>Evidence log</h1>
      <p class="lede">Write up a prior SevA you worked, then an assessor maps it to a spoke. Tickets cannot replace a spoke on the Ready gate or cancel a mandatory gap. Redact names, ticket bodies, and anything that could identify a customer.</p>
      <div class="btn-row">
        <a class="btn" href="#/evidence/new">Add a ticket</a>
      </div>
    </div>
    <div class="card table-wrap">
      <table class="data-table">
        <thead><tr><th>Ticket</th><th>Spoke</th><th>When</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${mine.length ? mine.map((item) => {
            const href = item.status === "draft" ? `#/evidence/${item.id}` : `#/evidence/${item.id}`;
            return `
              <tr data-search="${escapeHtml(item.ticketRef)} ${escapeHtml(domainName(state, item.domainId))}">
                <td>${escapeHtml(item.ticketRef)}</td>
                <td>${escapeHtml(domainName(state, item.domainId))}</td>
                <td>${formatDate(item.occurredOn)}</td>
                <td><span class="pill ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
                <td><a class="btn ghost" href="${href}">Open</a></td>
              </tr>`;
          }).join("") : `<tr><td colspan="5" class="muted">No tickets yet. Add a redacted write-up from a call you were on.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// Create or edit a draft ticket. Submitted entries are read-only for the engineer.
export function evidenceFormView(state, entry) {
  const domains = state.config.capabilityDomains;
  if (entry && state.role === "engineer" && entry.engineerId !== state.person.id) {
    return errorPage("That write-up belongs to another colleague", "Open Evidence from the sidebar and add your own ticket.");
  }
  if (entry && entry.status !== "draft") {
    return evidenceReadView(state, entry);
  }
  const create = !entry;
  const value = entry || {};
  return `
    <div class="page-header">
      <h1>${create ? "Add a workplace ticket" : "Edit draft ticket"}</h1>
      <p class="lede">Use a sanitised reference or write “illustrative / redacted”. Do not paste live dumps, customer names, or screenshots with PII.</p>
    </div>
    <div class="callout warn">
      <p>Redact first. This is workplace evidence for a readiness conversation, not a copy of ServiceNow.</p>
    </div>
    <form class="card" data-form="evidence" ${entry ? `data-evidence-id="${escapeHtml(entry.id)}"` : ""}>
      <div class="field">
        <label for="ticketRef">Sanitised ticket reference</label>
        <input id="ticketRef" name="ticketRef" type="text" required minlength="3" value="${escapeHtml(value.ticketRef || "")}" placeholder="INC-redacted or illustrative / redacted">
      </div>
      <div class="field">
        <label for="occurredOn">Date you were on the call</label>
        <input id="occurredOn" name="occurredOn" type="date" required value="${escapeHtml((value.occurredOn || "").slice(0, 10))}">
      </div>
      <div class="field">
        <label for="roleOnCall">Your role on the call</label>
        <select id="roleOnCall" name="roleOnCall" required>
          ${ROLE_ON_CALL.map(([id, label]) => `<option value="${id}" ${value.roleOnCall === id ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="domainId">Spoke this supports</label>
        <select id="domainId" name="domainId" required>
          ${domains.map((domain) => `<option value="${escapeHtml(domain.id)}" ${value.domainId === domain.id ? "selected" : ""}>${escapeHtml(domain.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="checked">What you checked</label>
        <textarea id="checked" name="checked" required minlength="20">${escapeHtml(value.checked || "")}</textarea>
      </div>
      <div class="field">
        <label for="involved">Who you involved</label>
        <textarea id="involved" name="involved" required minlength="20">${escapeHtml(value.involved || "")}</textarea>
      </div>
      <div class="field">
        <label for="didNotChange">What you did not change</label>
        <textarea id="didNotChange" name="didNotChange" required minlength="20">${escapeHtml(value.didNotChange || "")}</textarea>
      </div>
      <div class="field">
        <label for="notes">Anything else the assessor should know</label>
        <textarea id="notes" name="notes">${escapeHtml(value.notes || "")}</textarea>
      </div>
      <p class="error-msg" data-form-status></p>
      <div class="btn-row">
        <button class="btn secondary" type="submit" data-evidence-mode="draft">Save draft</button>
        <button class="btn" type="submit" data-evidence-mode="submitted">Submit for review</button>
      </div>
    </form>
  `;
}

// Engineer view of a submitted or released ticket.
function evidenceReadView(state, entry) {
  const score = entry.review?.score;
  return `
    <div class="page-header">
      <p class="subtle">${statusLabel(entry.status)}</p>
      <h1>${escapeHtml(entry.ticketRef)}</h1>
      <p class="lede">${escapeHtml(domainName(state, entry.domainId))} · ${formatDate(entry.occurredOn)} · ${ROLE_ON_CALL.find((item) => item[0] === entry.roleOnCall)?.[1] || entry.roleOnCall}</p>
    </div>
    <div class="card">
      <h2>What you wrote</h2>
      <h3>Checked</h3>
      <p>${nl(entry.checked)}</p>
      <h3>Involved</h3>
      <p>${nl(entry.involved)}</p>
      <h3>Did not change</h3>
      <p>${nl(entry.didNotChange)}</p>
      ${entry.notes ? `<h3>Notes</h3><p>${nl(entry.notes)}</p>` : ""}
    </div>
    ${entry.status === "released" ? `
      <div class="card" style="margin-top:1rem">
        <h2>Assessor score</h2>
        <p><span class="pill ${score != null && score < 2 ? "not-ready" : "ready"}">${score == null ? "Not scored" : `${score} / 3`}</span></p>
        <p>${nl(entry.review?.overallCommentary || "No commentary recorded.")}</p>
        ${entry.review?.developmentActions ? `<h3>Next steps</h3>${actionListHtml(listDevelopmentActions([], [entry], entry.engineerId), { role: "engineer" })}` : ""}
      </div>
    ` : `<div class="callout warn"><p>Waiting for an assessor. This is pending, not a score of zero.</p></div>`}
    <p class="btn-row"><a class="btn secondary" href="#/evidence">Back to evidence</a></p>
  `;
}

// Assessor scores a workplace ticket 0–3 against one spoke.
export function evidenceReviewView(state, entry) {
  if (!entry) return errorPage("Ticket not found", "That write-up is not in this browser.");
  const review = entry.review || {};
  return `
    <div class="page-header">
      <h1>Review ticket · ${escapeHtml(entry.ticketRef)}</h1>
      <p class="subtle"><a href="#/assessor/person/${encodeURIComponent(entry.engineerId)}">${escapeHtml(entry.engineerName)}</a> · ${escapeHtml(domainName(state, entry.domainId))} · ${formatDate(entry.occurredOn)}</p>
    </div>
    <div class="callout warn">
      <p>Score the write-up, not the live incident. A high ticket score cannot replace a spoke on the Ready gate or clear a mandatory gap.</p>
    </div>
    <div class="card">
      <p class="subtle">Role on the call: ${escapeHtml(ROLE_ON_CALL.find((item) => item[0] === entry.roleOnCall)?.[1] || entry.roleOnCall)}</p>
      <h2>What they checked</h2>
      <p>${nl(entry.checked)}</p>
      <h2>Who they involved</h2>
      <p>${nl(entry.involved)}</p>
      <h2>What they did not change</h2>
      <p>${nl(entry.didNotChange)}</p>
      ${entry.notes ? `<h2>Notes</h2><p>${nl(entry.notes)}</p>` : ""}
    </div>
    <form class="card" data-form="evidence-review" data-evidence-id="${escapeHtml(entry.id)}" style="margin-top:1rem">
      <fieldset class="review-block" style="border-top:0;margin-top:0;padding-top:0">
        <legend><strong>Score against ${escapeHtml(domainName(state, entry.domainId))}</strong></legend>
        <div class="score-scale">
          <label><input type="radio" name="score" value="" ${review.score == null || review.score === "" ? "checked" : ""}> Leave unreviewed</label>
          ${SCORE_SCALE.map((scale) => `
            <label>
              <input type="radio" name="score" value="${scale.value}" ${String(review.score) === String(scale.value) ? "checked" : ""}>
              <span><strong>${scale.value} — ${escapeHtml(scale.label)}</strong></span>
            </label>
          `).join("")}
        </div>
      </fieldset>
      <div class="field">
        <label for="overallCommentary">Commentary</label>
        <textarea id="overallCommentary" name="overallCommentary">${escapeHtml(review.overallCommentary || "")}</textarea>
      </div>
      <div class="field">
        <label for="developmentActions">Suggested next steps</label>
        <textarea id="developmentActions" name="developmentActions" placeholder="One action per line">${escapeHtml(review.developmentActions || "")}</textarea>
      </div>
      <p class="error-msg" data-form-status></p>
      <div class="btn-row">
        <button class="btn secondary" type="submit" data-evidence-review-mode="save">Save review</button>
        <button class="btn" type="submit" data-evidence-review-mode="release">Save and release</button>
      </div>
    </form>
  `;
}

// Table of engineers for the assessor.
export function assessorPeopleView(state) {
  const people = peopleForAssessor(state);
  return `
    <div class="page-header">
      <h1>People</h1>
      <p class="lede">Open one colleague for the map, Ready gate, tickets, and the last recommendation.</p>
    </div>
    <div class="card table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Attempts</th><th>Tickets</th><th>Last recommendation</th><th></th></tr></thead>
        <tbody>
          ${people.length ? people.map((item) => {
            const mine = attemptsFor(state.attempts, item.id);
            const tickets = (state.evidence || []).filter((entry) => entry.engineerId === item.id);
            const latestRec = mine.filter((entry) => entry.status === "released")
              .slice()
              .sort((a, b) => String(a.review?.releasedAt || "").localeCompare(String(b.review?.releasedAt || "")))
              .map((entry) => entry.review?.readinessRecommendation)
              .filter(Boolean)
              .at(-1);
            return `
              <tr data-search="${escapeHtml(item.name)}">
                <td>${escapeHtml(item.name)}</td>
                <td>${mine.length}</td>
                <td>${tickets.length}</td>
                <td>${latestRec ? escapeHtml(latestRec.replace(/-/g, " ")) : "—"}</td>
                <td><a class="btn secondary" href="#/assessor/person/${encodeURIComponent(item.id)}">Open</a></td>
              </tr>`;
          }).join("") : `<tr><td colspan="5" class="muted">No engineers in this store yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// One engineer: map, Ready gate, tickets, recommendation, actions.
export function assessorPersonView(state, personId) {
  const people = peopleForAssessor(state);
  const found = people.find((item) => item.id === personId);
  if (!found) return errorPage("Person not found", "That colleague is not in this browser's store.");
  const mine = attemptsFor(state.attempts, personId);
  const tickets = (state.evidence || []).filter((item) => item.engineerId === personId)
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const min = readinessMinScore(state);
  const spokeRows = spokeRowsFor(state, mine);
  const requiredComplete = spokeGateComplete(state.readinessConfig, spokeRows);
  const released = mine.filter((item) => item.status === "released");
  const domains = aggregateReleasedDomains(state, personId);
  const allResults = released.flatMap((item) => buildCriterionResults(item.scenarioSnapshot, item.answers, item.review));
  const countingResults = spokeRows.flatMap((row) => {
    if (!row.met || !row.countedAttemptId) return [];
    const attempt = mine.find((item) => item.id === row.countedAttemptId);
    if (!attempt) return [];
    return buildCriterionResults(attempt.scenarioSnapshot, attempt.answers, attempt.review);
  });
  const hints = attemptOutcomeHints(requiredComplete ? countingResults : allResults, domains, requiredComplete, min);
  const latestRec = released
    .slice()
    .sort((a, b) => String(a.review?.releasedAt || "").localeCompare(String(b.review?.releasedAt || "")))
    .map((item) => item.review?.readinessRecommendation)
    .filter(Boolean)
    .at(-1);
  const actions = listDevelopmentActions(mine, tickets, personId);
  return `
    <div class="page-header">
      <p class="subtle">Assessor · person view</p>
      <h1>${escapeHtml(found.name)}</h1>
      <p class="lede">Map, Ready gate, workplace tickets, and the last released recommendation. This is not a certificate.</p>
    </div>
    ${latestRec ? readinessBanner(latestRec) : `<div class="callout warn"><p>No assessor recommendation has been released yet.</p></div>`}
    ${hints.mandatoryUnmet.length ? `<div class="callout danger"><p>Mandatory gaps still stand, including any workplace tickets that scored well.</p><ul>${hints.mandatoryUnmet.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ul></div>` : ""}
    ${readinessNetwork(domains, { personName: found.name })}
    <div class="grid grid-2" style="margin-top:1rem">
      <section class="card">
        <h2>Ready gate</h2>
        <ul class="work-list">
          ${spokeGateListHtml(spokeRows, mine, { assessor: true })}
        </ul>
        <p class="subtle">${spokeGateNote(requiredComplete)}</p>
      </section>
      <section class="card">
        <h2>Development actions</h2>
        ${actionListHtml(actions, { role: "assessor" })}
      </section>
    </div>
    <section class="card" style="margin-top:1rem">
      <h2>Workplace tickets</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Ticket</th><th>Spoke</th><th>Status</th><th>Score</th><th></th></tr></thead>
          <tbody>
            ${tickets.length ? tickets.map((item) => `
              <tr>
                <td>${escapeHtml(item.ticketRef)}</td>
                <td>${escapeHtml(domainName(state, item.domainId))}</td>
                <td><span class="pill ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
                <td>${item.review?.score == null || item.review.score === "" ? "—" : item.review.score}</td>
                <td><a href="#/assessor/evidence/${item.id}">Open</a></td>
              </tr>
            `).join("") : `<tr><td colspan="5" class="muted">No tickets yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
    <p class="btn-row" style="margin-top:1rem"><a class="btn secondary" href="#/assessor/people">All people</a></p>
  `;
}

// Default write-up prompt used when an administrator adds a question on Create Scenario.
const AUTHOR_QUESTION_PROMPTS = [
  "Walk through how you would handle this incident from the first call through to recovery. Write the full response in your own words."
];

// Guided form that writes scenario JSON. Administrators can still paste JSON on Import.
export function adminAuthorView(state) {
  const domains = state.config.capabilityDomains;
  const defaultDisclaimer = "This scenario, its mock incident, runbook titles, product names, escalation routes, and organisational procedures are illustrative. Validate them against approved operational sources before use. They are not bank policy.";
  return `
    <div class="page-header">
      <h1>Create Scenario</h1>
      <p class="lede">Fill the form for a draft that stays in this browser. To put it in the library for everyone, download the JSON and follow the file steps below. You can still <a href="#/admin/import">paste JSON</a> if you already have a file.</p>
    </div>
    ${howToAddScenarioHtml()}
    <form class="card" data-form="author-scenario">
      <h2>Basics</h2>
      <div class="field">
        <label for="a-id">Scenario id</label>
        <input id="a-id" name="id" type="text" required minlength="4" placeholder="vdi-proxy-inspection-001">
        <span class="hint">Lowercase letters, numbers, and hyphens. Must be unique.</span>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label for="a-spoke">Readiness spoke</label>
          <select id="a-spoke" name="spokeId" required>
            ${domains.map((domain) => `<option value="${escapeHtml(domain.id)}">${escapeHtml(domain.name)}</option>`).join("")}
          </select>
          <span class="hint">The library groups scenarios under this spoke.</span>
        </div>
        <div class="field">
          <label for="a-spoke-number">Number on that spoke</label>
          <input id="a-spoke-number" name="spokeNumber" type="number" min="1" step="1" value="1" required>
          <span class="hint">Title becomes the spoke name plus this number, for example Networking 2.</span>
        </div>
      </div>
      <div class="field">
        <label for="a-description">Description</label>
        <textarea id="a-description" name="description" required minlength="20"></textarea>
      </div>
      <div class="field">
        <label for="a-scope">Scope</label>
        <input id="a-scope" name="scope" type="text" required value="Out-of-hours VDI practice scenario.">
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label for="a-difficulty">Difficulty</label>
          <select id="a-difficulty" name="difficulty">
            <option value="foundation">Foundation</option>
            <option value="intermediate" selected>Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div class="field">
          <label for="a-minutes">Suggested minutes</label>
          <input id="a-minutes" name="estimatedMinutes" type="number" min="5" step="5" value="40" required>
        </div>
      </div>
      <div class="field">
        <p class="subtle">Ready is one satisfactory scenario per spoke. This file does not need a required flag.</p>
      </div>
      <div class="field">
        <label for="a-disclaimer">Illustrative disclaimer</label>
        <textarea id="a-disclaimer" name="illustrativeDisclaimer" required minlength="20">${escapeHtml(defaultDisclaimer)}</textarea>
      </div>
      <h2>Initial report</h2>
      <div class="field">
        <label for="a-call">Call summary</label>
        <textarea id="a-call" name="callSummary" required minlength="20"></textarea>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label for="a-inc">Mock incident number</label>
          <input id="a-inc" name="incidentNumber" type="text" required value="INC0000000">
        </div>
        <div class="field">
          <label for="a-pri">Priority</label>
          <input id="a-pri" name="priority" type="text" required value="1 — Critical">
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label for="a-opened">Opened</label>
          <input id="a-opened" name="opened" type="text" required value="2026-01-01 00:00 UTC">
        </div>
        <div class="field">
          <label for="a-caller">Caller</label>
          <input id="a-caller" name="caller" type="text" required value="Service Desk">
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label for="a-assign">Assignment group</label>
          <input id="a-assign" name="assignmentGroup" type="text" required value="VDI Platform Support (illustrative)">
        </div>
        <div class="field">
          <label for="a-ci">Affected CI</label>
          <input id="a-ci" name="affectedCI" type="text" required value="VDI-UK-PROD">
        </div>
      </div>
      <div class="field">
        <label for="a-short">Short description</label>
        <input id="a-short" name="shortDescription" type="text" required>
      </div>
      <div class="field">
        <label for="a-long">Longer description</label>
        <textarea id="a-long" name="snowDescription" required minlength="8"></textarea>
      </div>
      <div class="field">
        <label for="a-users">User impact</label>
        <input id="a-users" name="impactUsers" type="text" required>
      </div>
      <div class="field">
        <label for="a-colleagues">Colleague impact</label>
        <input id="a-colleagues" name="impactColleagues" type="text" required>
      </div>
      <div class="field">
        <label for="a-business">Business impact</label>
        <input id="a-business" name="impactBusiness" type="text" required>
      </div>
      <h2>Response</h2>
      <p class="subtle">One written prompt covering the whole incident. An assessor scores the write-up against the criteria below.</p>
      <div data-author-questions>
        ${AUTHOR_QUESTION_PROMPTS.map((prompt, index) => authorQuestionBlock(domains, index, prompt)).join("")}
      </div>
      <p class="btn-row"><button type="button" class="btn ghost" data-action="add-author-question">Add a question</button></p>
      <template id="author-question-template">${authorQuestionBlock(domains, "__INDEX__", "")}</template>
      <h2>Scoring criteria</h2>
      <p class="subtle">Each criterion is 0–3 and must link to a question id such as q1.</p>
      <div data-author-criteria>
        ${authorCriterionBlock(domains, 0, { label: "Establishes impact before changes", domainId: "platform-troubleshooting", questionIds: "q1", mandatory: true, safety: false })}
        ${authorCriterionBlock(domains, 1, { label: "Uses the support model", domainId: "trm-escalation-ops", questionIds: "q1", mandatory: true, safety: true })}
      </div>
      <p class="btn-row"><button type="button" class="btn ghost" data-action="add-author-criterion">Add a criterion</button></p>
      <template id="author-criterion-template">${authorCriterionBlock(domains, "__INDEX__", { label: "", domainId: domains[0]?.id, questionIds: "q1", mandatory: false, safety: false })}</template>
      <p class="error-msg" data-form-status></p>
      <div class="btn-row">
        <button class="btn secondary" type="submit" data-import-mode="draft">Validate and save draft</button>
        <button class="btn" type="submit" data-import-mode="published">Validate and publish</button>
      </div>
    </form>
  `;
}

// One question block on the Create Scenario form.
function authorQuestionBlock(domains, index, prompt) {
  return `
    <fieldset class="author-block" data-author-question data-index="${index}">
      <legend>Question <span data-q-label>${typeof index === "number" ? index + 1 : "__N__"}</span></legend>
      <div class="field">
        <label>Prompt</label>
        <textarea name="q-prompt-${index}" required minlength="10">${escapeHtml(prompt || "")}</textarea>
      </div>
      <div class="field">
        <label>Help text (optional)</label>
        <input name="q-help-${index}" type="text">
      </div>
      <div class="field">
        <span class="label">Capability areas</span>
        ${domainCheckboxes(domains, `q-domains-${index}`, index === 1 ? ["avd-infrastructure", "networking"] : index === 2 || index === 3 ? ["trm-escalation-ops"] : ["platform-troubleshooting"])}
      </div>
      <div class="field">
        <label>Assessor guidance</label>
        <textarea name="q-guide-${index}">Reward a scoped investigation and an appropriate escalation. Do not use keyword matching.</textarea>
      </div>
    </fieldset>
  `;
}

// One scoring-criterion block on the Create Scenario form.
function authorCriterionBlock(domains, index, values) {
  return `
    <fieldset class="author-block" data-author-criterion data-index="${index}">
      <legend>Criterion <span data-c-label>${typeof index === "number" ? index + 1 : "__N__"}</span></legend>
      <div class="field">
        <label>Label</label>
        <input name="c-label-${index}" type="text" required value="${escapeHtml(values.label || "")}">
      </div>
      <div class="field">
        <label>Spoke</label>
        <select name="c-domain-${index}">
          ${domains.map((domain) => `<option value="${escapeHtml(domain.id)}" ${domain.id === values.domainId ? "selected" : ""}>${escapeHtml(domain.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Question ids (comma separated)</label>
        <input name="c-questions-${index}" type="text" required value="${escapeHtml(values.questionIds || "q1")}">
      </div>
      <div class="field">
        <label><input type="checkbox" name="c-mandatory-${index}" ${values.mandatory ? "checked" : ""}> Mandatory</label>
      </div>
      <div class="field">
        <label><input type="checkbox" name="c-safety-${index}" ${values.safety ? "checked" : ""}> Safety-critical</label>
      </div>
    </fieldset>
  `;
}

// Opened / read ticks for Reading, stored in this browser.
function readingProgressFor(state) {
  return state.readingProgress || {};
}

// Unread, opened, or read for one Reading card.
function articleStatus(progress, id) {
  const entry = progress[id] || {};
  if (entry.readAt) return { label: "Read", cls: "released" };
  if (entry.openedAt) return { label: "Opened", cls: "progress" };
  return { label: "Unread", cls: "" };
}

// Progress bar for how many live Reading pages are marked read.
function readingMeter(read, total) {
  const pct = total ? Math.round((read / total) * 100) : 0;
  return `
    <div class="reading-meter" role="img" aria-label="${total ? `${read} of ${total} pages marked read` : "No live pages on this shelf yet"}">
      <span class="reading-meter-track"><span class="reading-meter-fill" style="width:${pct}%"></span></span>
      <strong>${total ? `${read} of ${total}` : "—"}</strong>
      <span>${total ? "marked read" : "no live pages yet"}</span>
    </div>
  `;
}

// Catalog reminder that cards open the live wiki, they do not copy it.
function readingDisclaimer(catalog) {
  return `<p class="reading-disclaimer">${escapeHtml(catalog?.disclaimer || "")}</p>`;
}

// Small WIP stamp used on unfinished shelves and cards.
function readingWipChip() {
  return `<span class="reading-wip-chip">WIP</span>`;
}

// Yellow banner when a shelf still needs pages.
function readingWipBanner(message) {
  return `
    <div class="callout warn reading-wip" role="status">
      <p><strong>Work in progress.</strong> ${escapeHtml(message)}</p>
    </div>
  `;
}

// Pick a short venue label (Wiki, Files, Now, Azure) from the URL.
function readingLinkKind(href) {
  const url = String(href || "");
  if (/atlassian\.net/i.test(url)) return { kind: "confluence", venue: "Confluence", mark: "Wiki" };
  if (/sharepoint\.com/i.test(url)) return { kind: "sharepoint", venue: "SharePoint", mark: "Files" };
  if (/service-now\.com/i.test(url)) return { kind: "servicenow", venue: "ServiceNow", mark: "Now" };
  if (/portal\.azure\.com/i.test(url)) return { kind: "azure", venue: "Azure", mark: "Azure" };
  return { kind: "web", venue: "Web", mark: "Open" };
}

// Destination buttons on a Reading card. WIP cards show an awaiting note instead.
function readingOpenButtons(article) {
  const links = articleLinks(article);
  if (!links.length) {
    return `
      <div class="reading-awaiting">
        <p class="reading-wip-stamp">WIP</p>
        <p>This page is still to be added.</p>
      </div>
    `;
  }
  return `
    <div class="reading-open-stack">
      <p class="eyebrow">Open</p>
      ${links.map((link, index) => {
        const kind = readingLinkKind(link.href);
        const cls = index === 0 ? "btn reading-open" : "btn secondary reading-open";
        return `<button class="${cls}" type="button" data-action="reading-open" data-reading-id="${escapeHtml(article.id)}" data-reading-href="${escapeHtml(link.href)}"><span class="reading-open-mark" data-kind="${kind.kind}">${escapeHtml(kind.mark)}</span><span class="reading-open-copy"><strong>${escapeHtml(link.label)}</strong><em>${escapeHtml(kind.venue)}</em></span></button>`;
      }).join("")}
    </div>
  `;
}

// Haystack for the sidebar search box on Reading.
function articleSearchText(article, collection) {
  return [article.title, article.lede, article.source, article.sourceLabel, collection?.title, collection?.spine, ...(article.spokeIds || [])].join(" ");
}

// One shelf card on the Reading home.
function collectionTile(collection, articles, progress) {
  const read = articles.filter((item) => progress[item.id]?.readAt).length;
  const live = articles.filter((item) => !articleIsWip(item)).length;
  const incomplete = collectionIsIncomplete(collection, articles);
  const foot = incomplete
    ? (live ? `${live} live · rest to add` : "Awaiting pages")
    : (read ? `${read} read` : "Not started");
  return `
    <a class="reading-tile ${incomplete ? "is-wip" : ""}" data-tone="${escapeHtml(collection.tone)}" href="#/reading/shelf/${encodeURIComponent(collection.id)}" data-search="${escapeHtml(`${collection.title} ${collection.summary} ${articles.map((item) => item.title).join(" ")}`)}">
      <span class="reading-folio" aria-hidden="true">${escapeHtml(collection.folio)}</span>
      <p class="eyebrow">${articles.length} card${articles.length === 1 ? "" : "s"}${incomplete ? ` ${readingWipChip()}` : ""}</p>
      <h2>${escapeHtml(collection.title)}</h2>
      <p>${escapeHtml(collection.summary)}</p>
      <span class="reading-tile-foot">
        <span class="reading-dots" aria-hidden="true">${articles.map((item) => `<i class="${progress[item.id]?.readAt ? "is-read" : progress[item.id]?.openedAt ? "is-open" : articleIsWip(item) ? "is-wip" : ""}"></i>`).join("")}</span>
        <span>${foot}</span>
      </span>
    </a>
  `;
}

// One magazine-style card that opens a Reading page.
function articleCard(article, collection, progress, { compact = false } = {}) {
  const status = articleStatus(progress, article.id);
  const wip = articleIsWip(article);
  const links = articleLinks(article);
  const venues = [...new Set(links.map((link) => readingLinkKind(link.href).venue))];
  return `
    <a class="reading-issue ${compact ? "is-compact" : ""} ${wip ? "is-wip" : ""}" data-tone="${escapeHtml(collection?.tone || "ops")}" href="#/reading/page/${encodeURIComponent(article.id)}" data-search="${escapeHtml(articleSearchText(article, collection))}">
      <span class="reading-issue-mark">${escapeHtml(collection?.spine || "Note")}${wip ? readingWipChip() : ""}</span>
      <h3>${escapeHtml(article.title)}</h3>
      <p>${escapeHtml(article.lede)}</p>
      <span class="reading-issue-meta">
        ${wip
          ? `<span class="pill develop">Awaiting URL</span>`
          : `${venues.map((venue) => `<span class="pill">${escapeHtml(venue)}</span>`).join("")}${links.length > 1 ? `<span class="pill">${links.length} pages</span>` : ""}<span class="pill">${article.minutes} min</span>`}
        <span class="pill ${status.cls}">${escapeHtml(status.label)}</span>
      </span>
    </a>
  `;
}

// Reading room home: bookshelf of collections plus a continue strip.
export function readingView(state) {
  const catalog = state.reading || { collections: [], articles: [] };
  const progress = readingProgressFor(state);
  const collections = readingCollections(catalog);
  const articles = readingArticles(catalog);
  const liveArticles = articles.filter((item) => !articleIsWip(item));
  const read = liveArticles.filter((item) => progress[item.id]?.readAt).length;
  const next = continueReading(catalog, progress);
  const nextCollection = next ? findReadingCollection(catalog, next.collectionId) : null;
  const catalogIncomplete = collections.some((collection) => collectionIsIncomplete(collection, articlesForCollection(catalog, collection.id)));
  return `
    <section class="reading-hero">
      <div>
        <p class="eyebrow">Approved pages · ${catalogIncomplete ? "Still filling" : "Live"}</p>
        <h1>Reading</h1>
        ${catalogIncomplete ? `<p class="reading-wip-stamp" aria-hidden="true">WORK IN PROGRESS</p>` : ""}
        <p class="lede">Platform, troubleshooting, and on-call pages arranged as a shelf. Open a card, then use the buttons on the rail — not a list of URLs.</p>
        ${readingMeter(read, liveArticles.length)}
        ${next ? `<p class="reading-continue">Continue with <a href="#/reading/page/${encodeURIComponent(next.id)}">${escapeHtml(next.title)}</a> in ${escapeHtml(nextCollection?.title || "the shelf")}.</p>` : ""}
      </div>
      <div class="reading-spines" role="navigation" aria-label="Collections">
        ${collections.map((collection) => {
          const inShelf = articlesForCollection(catalog, collection.id);
          const done = inShelf.length && inShelf.every((item) => progress[item.id]?.readAt);
          const incomplete = collectionIsIncomplete(collection, inShelf);
          return `<a class="reading-spine ${done ? "is-read" : ""} ${incomplete ? "is-wip" : ""}" data-tone="${escapeHtml(collection.tone)}" href="#/reading/shelf/${encodeURIComponent(collection.id)}" data-search="${escapeHtml(collection.title)}"><span>${escapeHtml(collection.spine)}</span></a>`;
        }).join("")}
      </div>
    </section>
    ${catalogIncomplete ? readingWipBanner("Some shelves still need pages. Live cards open the approved wiki, SharePoint, ServiceNow, or Azure page from the rail.") : ""}
    ${readingDisclaimer(catalog)}
    <div class="reading-grid">
      ${collections.map((collection) => collectionTile(collection, articlesForCollection(catalog, collection.id), progress)).join("") || `<div class="empty-state">No reading collections loaded.</div>`}
    </div>
    <section class="reading-strip">
      <div class="card-head">
        <h2>On the rail</h2>
        <span class="subtle">Every card in the catalog</span>
      </div>
      <div class="reading-rail">
        ${articles.map((article) => articleCard(article, findReadingCollection(catalog, article.collectionId), progress, { compact: true })).join("")}
      </div>
    </section>
  `;
}

// One collection: large title, then the notes in that spine.
export function readingShelfView(state, collectionId) {
  const catalog = state.reading || {};
  const collection = findReadingCollection(catalog, collectionId);
  if (!collection) return errorPage("Shelf not found", "That reading collection is not in the catalog.");
  const progress = readingProgressFor(state);
  const articles = articlesForCollection(catalog, collection.id);
  const liveArticles = articles.filter((item) => !articleIsWip(item));
  const read = liveArticles.filter((item) => progress[item.id]?.readAt).length;
  const incomplete = collectionIsIncomplete(collection, articles);
  return `
    <p class="crumb"><a href="#/reading">Reading</a> / ${escapeHtml(collection.title)}</p>
    ${incomplete ? readingWipBanner("This shelf still needs pages. Add the approved URLs when you have them.") : ""}
    <section class="reading-hero is-shelf" data-tone="${escapeHtml(collection.tone)}">
      <div>
        <p class="eyebrow">Volume ${escapeHtml(collection.folio)}${incomplete ? ` ${readingWipChip()}` : ""}</p>
        <h1>${escapeHtml(collection.title)}</h1>
        ${incomplete ? `<p class="reading-wip-stamp" aria-hidden="true">WORK IN PROGRESS</p>` : ""}
        <p class="lede">${escapeHtml(collection.summary)}</p>
        ${readingMeter(read, liveArticles.length)}
      </div>
    </section>
    ${readingDisclaimer(catalog)}
    <div class="reading-shelf">
      ${articles.map((article) => articleCard(article, collection, progress)).join("") || `<div class="empty-state">No notes in this shelf yet.</div>`}
    </div>
  `;
}

// One centered sheet: large title, then the open buttons and status from the old rail.
export function readingPageView(state, articleId) {
  const catalog = state.reading || {};
  const article = findReadingArticle(catalog, articleId);
  if (!article) return errorPage("Note not found", "That reading item is not in the catalog.");
  const collection = findReadingCollection(catalog, article.collectionId);
  const progress = readingProgressFor(state);
  const status = articleStatus(progress, article.id);
  const siblings = articlesForCollection(catalog, article.collectionId);
  const index = siblings.findIndex((item) => item.id === article.id);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const shelfHref = `#/reading/shelf/${encodeURIComponent(collection?.id || "")}`;
  const spokes = (article.spokeIds || [])
    .map((id) => state.config.capabilityDomains.find((item) => item.id === id)?.name || id)
    .filter(Boolean);
  const wip = articleIsWip(article);
  return `
    <p class="crumb"><a href="#/reading">Reading</a> / <a href="${shelfHref}">${escapeHtml(collection?.title || "Shelf")}</a> / ${escapeHtml(article.title)}</p>
    ${wip ? readingWipBanner("This card is waiting for an approved URL.") : ""}
    <article class="reading-page" data-tone="${escapeHtml(collection?.tone || "ops")}">
      <div class="reading-sheet">
        <p class="eyebrow">${escapeHtml(collection?.spine || "Note")} · Volume ${escapeHtml(collection?.folio || "—")}${wip ? readingWipChip() : ""}</p>
        <h1>${escapeHtml(article.title)}</h1>
        <div class="reading-sheet-body">
          <p class="reading-sheet-source">${escapeHtml(article.sourceLabel)}</p>
          ${wip ? "" : `<p class="subtle">${article.minutes} min · ${escapeHtml(article.source)}</p>`}
          <p><span class="pill ${status.cls}">${escapeHtml(status.label)}</span></p>
          ${spokes.length ? `<p class="subtle">${spokes.map((name) => escapeHtml(name)).join(" · ")}</p>` : ""}
          ${readingOpenButtons(article)}
          ${status.label === "Read"
            ? `<p class="subtle">Marked read ${formatDateTime(progress[article.id].readAt)}</p>`
            : `<button class="btn secondary" type="button" data-action="reading-done" data-reading-id="${escapeHtml(article.id)}">Mark as read</button>`}
          <nav class="reading-pager" aria-label="More in this shelf">
            ${previous
              ? `<a class="btn ghost" href="#/reading/page/${encodeURIComponent(previous.id)}">Previous: ${escapeHtml(previous.title)}</a>`
              : `<a class="btn ghost" href="#/reading">Back to reading menu</a>`}
            ${next
              ? `<a class="btn ghost" href="#/reading/page/${encodeURIComponent(next.id)}">Next: ${escapeHtml(next.title)}</a>`
              : previous ? `<a class="btn ghost" href="#/reading">Back to reading menu</a>` : ""}
          </nav>
        </div>
      </div>
    </article>
  `;
}

