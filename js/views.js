// One function per screen. Each function returns an HTML string.
// Clicks are handled in app.js by looking for data-action on the element.

import { escapeHtml, formatDateTime, nl } from "./util.js";
import {
  pillsForScenario,
  snowCard,
  evidenceBlock,
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
import { SCORE_SCALE, buildCriterionResults, summariseDomains, attemptOutcomeHints } from "./scoring.js";
import { publishedScenarios } from "./content.js";

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

// User home: continue, required scenarios, development actions, and weak areas.
export function dashboardView(state) {
  const { config, scenarios, attempts, person } = state;
  const mine = attemptsFor(attempts, person.id);
  const published = publishedScenarios(scenarios);
  const required = published.filter((item) => item.mandatory);
  const awaiting = mine.filter((item) => item.status === "submitted");
  const released = mine.filter((item) => item.status === "released");
  const inProgress = mine.filter((item) => item.status === "in-progress");
  const domainSummaries = aggregateReleasedDomains(state);

  const firstName = person.name.split(" ")[0];
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
        <p class="eyebrow">Welcome back, ${escapeHtml(firstName)}</p>
        <h1>Dashboard Overview</h1>
        <p class="lede">Track your SevA practice and readiness for ${escapeHtml(config.serviceName)} in real time.</p>
      </div>
      <a class="btn" href="#/library">Open library</a>
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
            <p class="subtle">Released scores across the eight domains</p>
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
          <h2>Required scenarios</h2>
          <a href="#/library">All scenarios</a>
        </div>
        <ul class="work-list">
          ${required.map((scenario) => {
            const attempt = latestAttempt(mine, scenario.id);
            const label = attempt ? statusLabel(attempt.status) : "Not started";
            return `<li data-search="${escapeHtml(scenario.title)}"><a href="#/scenario/${encodeURIComponent(scenario.id)}"><span>${escapeHtml(scenario.title)}</span><span class="pill ${attempt ? statusClass(attempt.status) : ""}">${escapeHtml(label)}</span></a></li>`;
          }).join("") || `<li class="muted">No required scenarios.</li>`}
        </ul>
      </section>
      <section class="card">
        <h2>Development actions</h2>
        ${released.length ? released.slice(0, 3).map((item) => `
          <p><a href="#/feedback/${item.id}">${escapeHtml(item.scenarioSnapshot.title)}</a></p>
          <p class="subtle">${item.review?.developmentActions ? nl(item.review.developmentActions) : "No actions recorded."}</p>
        `).join("") : `<p class="muted">Released feedback will appear here.</p>`}
      </section>
    </div>
  `;
}

// Published scenarios. Administrators also see drafts.
export function libraryView(state) {
  const published = state.role === "administrator" ? state.scenarios : publishedScenarios(state.scenarios);
  const mine = attemptsFor(state.attempts, state.person.id);
  return `
    <div class="page-header">
      <h1>Scenario library</h1>
      <p class="lede">Collection of prior SevA incidents to practice and test your experience against, each test has a rough timer next to it with a series of questions. Tests can be resat once reviewed by an assessor.</p>
    </div>
    <div class="stack">
      ${published.map((scenario) => {
        const attempt = latestAttempt(mine, scenario.id);
        return `
          <article class="card" data-search="${escapeHtml(scenario.title)} ${escapeHtml(scenario.description)}">
            ${pillsForScenario(scenario, attempt, { difficulty: false })}
            <h2>${escapeHtml(scenario.title)}</h2>
            <p class="summary">${escapeHtml(scenario.description)}</p>
            <p class="subtle">${escapeHtml(scenario.scope)} · Version ${escapeHtml(scenario.version)}</p>
            <div class="btn-row">
              <a class="btn" href="#/scenario/${encodeURIComponent(scenario.id)}">View scenario</a>
              ${attempt?.status === "in-progress" ? `<a class="btn secondary" href="#/assess/${attempt.id}">Resume</a>` : ""}
            </div>
          </article>
        `;
      }).join("") || `<div class="empty-state">No scenarios available.</div>`}
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
  return `
    <div class="page-header">
      ${pillsForScenario(scenario, active)}
      <h1>${escapeHtml(scenario.title)}</h1>
      <p class="lede">${escapeHtml(scenario.description)}</p>
    </div>
    <div class="callout warn">
      <p>${escapeHtml(scenario.illustrativeDisclaimer)}</p>
    </div>
    <div class="grid grid-2">
      <section class="card">
        <h2>Initial support call</h2>
        <p>${nl(scenario.initialIncident.callSummary)}</p>
        <h3>Known impact</h3>
        <ul>
          <li><strong>Users:</strong> ${escapeHtml(scenario.initialIncident.impact.customers)}</li>
          <li><strong>Colleagues:</strong> ${escapeHtml(scenario.initialIncident.impact.colleagues)}</li>
          <li><strong>Business:</strong> ${escapeHtml(scenario.initialIncident.impact.business)}</li>
        </ul>
      </section>
      ${snowCard(scenario.initialIncident.serviceNow)}
    </div>
    <div class="grid grid-2" style="margin-top:1rem">
      ${docsList(scenario.documentationReferences)}
      <section class="card">
        <h2>How this assessment works</h2>
        <ul>
          <li>${scenario.questions.length} written questions. Answer in your own words.</li>
          <li>Further evidence is revealed as you progress.</li>
          <li>You can save and resume. Review your answers before submitting.</li>
          <li>An assessor scores each answer. Nothing is marked by keyword matching.</li>
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

// One question at a time, with the incident report and evidence beside the text box.
export function workspaceView(state, attempt) {
  if (!attempt) return errorPage("Attempt not found", "That assessment could not be opened.");
  if (attempt.status !== "in-progress") {
    return errorPage("Attempt locked", "This attempt has been submitted. Open feedback or start a new attempt.");
  }
  const scenario = attempt.scenarioSnapshot;
  const index = attempt.currentQuestionIndex || 0;
  const question = scenario.questions[index];
  const visibleEvidence = (scenario.evidence || []).filter((item) => (item.revealAfterQuestionIndex || 0) <= index);
  const selectedEvidenceId = attempt.ui?.evidenceId || visibleEvidence[0]?.id;
  const selectedEvidence = visibleEvidence.find((item) => item.id === selectedEvidenceId) || visibleEvidence[0];
  const answer = attempt.answers?.[question.id];

  return `
    <div class="page-header">
      <p class="subtle">Assessed attempt · scenario version ${escapeHtml(attempt.scenarioVersion)} · model guidance is withheld until an assessor releases feedback</p>
      <h1>${escapeHtml(scenario.title)}</h1>
      <p>Question ${index + 1} of ${scenario.questions.length}</p>
    </div>
    <div class="question-nav" role="navigation" aria-label="Questions">
      ${scenario.questions.map((item, i) => `
        <button type="button" class="${i === index ? "current" : ""} ${hasAnswer(attempt.answers?.[item.id]) ? "answered" : ""}"
          data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${i}"
          aria-current="${i === index ? "step" : "false"}">${i + 1}<span class="sr-only"> ${escapeHtml(item.prompt.slice(0, 40))}</span></button>
      `).join("")}
    </div>
    <div class="workspace">
      <section class="card">
        <h2>Question</h2>
        <p>${escapeHtml(question.prompt)}</p>
        ${question.helpText ? `<p class="hint muted">${escapeHtml(question.helpText)}</p>` : ""}
        <ul class="answer-cues" aria-label="Cover these in your answer">
          <li>What you would check</li>
          <li>Who you would involve</li>
          <li>What you would not change</li>
        </ul>
        ${renderAnswerInput(question, answer, attempt.id)}
        <p class="subtle">A short paragraph is enough.</p>
        <p class="status-msg" data-save-status aria-live="polite"></p>
        <div class="btn-row">
          <button class="btn secondary" data-action="save-progress" data-attempt-id="${attempt.id}">Save progress</button>
          <button class="btn ghost" ${index === 0 ? "disabled" : ""} data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${index - 1}">Previous</button>
          <button class="btn ghost" ${index >= scenario.questions.length - 1 ? "disabled" : ""} data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${index + 1}">Next</button>
          <a class="btn" href="#/review/${attempt.id}">Review answers</a>
        </div>
      </section>
      <aside class="stack">
        <section class="card">
          <h2>Initial report</h2>
          <p>${nl(scenario.initialIncident.callSummary)}</p>
        </section>
        <section class="card">
          <h2>Supporting evidence</h2>
          <p class="subtle">Additional panels appear as you move through the questions. All panels are illustrative.</p>
          <div class="evidence-tabs" role="tablist">
            ${visibleEvidence.map((item) => `
              <button type="button" role="tab" aria-selected="${item.id === selectedEvidence?.id}"
                data-action="select-evidence" data-attempt-id="${attempt.id}" data-evidence-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>
            `).join("")}
          </div>
          ${evidenceBlock(selectedEvidence)}
        </section>
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
      <textarea id="answer-${question.id}" class="answer-box" name="answer" data-attempt-id="${attemptId}" data-question-id="${question.id}" data-answer-type="written" placeholder="Write the approach you would take. Include what you would check, who you would involve, and what you would avoid.">${escapeHtml(text)}</textarea>
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
      <p class="lede">Check your responses before submitting. You can still go back and edit. After you submit, an assessor reads each answer. This attempt keeps scenario version ${escapeHtml(attempt.scenarioVersion)}.</p>
    </div>
    ${missing.length ? `<div class="callout warn"><p>${missing.length} question(s) have no answer yet. You can still submit, but unanswered criteria will show as not answered rather than zero.</p></div>` : ""}
    <div class="stack">
      ${scenario.questions.map((question, index) => `
        <section class="card">
          <h2>Question ${index + 1}</h2>
          <p>${escapeHtml(question.prompt)}</p>
          <p><strong>Your answer</strong><br>${formatAnswer(question, attempt.answers?.[question.id])}</p>
          <p><a href="#/assess/${attempt.id}" data-action="goto-question" data-attempt-id="${attempt.id}" data-index="${index}">Edit this answer</a></p>
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
  const domains = summariseDomains(state.config.capabilityDomains, results);
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
      <p>${nl(attempt.review?.developmentActions || "None recorded on this attempt.")}</p>
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
              <h3>Question ${index + 1}</h3>
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
  const published = publishedScenarios(state.scenarios);
  const required = published.filter((item) => item.mandatory);
  const requiredComplete = required.every((scenario) =>
    mine.some((item) => item.scenarioId === scenario.id && item.status === "released")
  );
  const released = mine.filter((item) => item.status === "released");
  const allResults = released.flatMap((item) => buildCriterionResults(item.scenarioSnapshot, item.answers, item.review));
  const domains = summariseDomains(state.config.capabilityDomains, allResults);
  const hints = attemptOutcomeHints(allResults, domains, requiredComplete);
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
      <h2>Required scenarios</h2>
      <ul class="work-list">
        ${required.map((scenario) => {
          const releasedAttempt = mine.find((item) => item.scenarioId === scenario.id && item.status === "released");
          const other = latestAttempt(mine, scenario.id);
          const label = releasedAttempt ? "Reviewed and released" : other ? statusLabel(other.status) : "Not started";
          return `<li><a href="#/scenario/${encodeURIComponent(scenario.id)}"><span>${escapeHtml(scenario.title)}</span><span class="pill ${releasedAttempt ? "released" : other ? statusClass(other.status) : ""}">${escapeHtml(label)}</span></a></li>`;
        }).join("")}
      </ul>
      <p class="subtle">${requiredComplete ? "Required scenarios have released reviews." : "Required scenarios are not all reviewed yet — treat readiness evidence as incomplete."}</p>
      ${hints.mandatoryUnmet.length
        ? `<p class="error-msg">Unmet mandatory criteria stay visible even if some nodes look strong:</p><ul>${hints.mandatoryUnmet.map((item) => `<li>${escapeHtml(item.label)} (${item.score}/${item.maxScore})</li>`).join("")}</ul>`
        : `<p class="subtle">No scored mandatory criterion is currently below Demonstrated (2) in released attempts.${hints.hasIncompleteEvidence ? " Incomplete evidence is still present." : ""}</p>`}
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

// Submitted and released attempts stored in this browser.
export function assessorQueueView(state) {
  const queue = state.attempts.filter((item) => item.status === "submitted" || item.status === "released");
  const submitted = queue.filter((item) => item.status === "submitted");
  const released = queue.filter((item) => item.status === "released");
  return `
    <section class="dash-hero">
      <div>
        <p class="eyebrow">Assessor</p>
        <h1>Dashboard Overview</h1>
        <p class="lede">Score written responses against the rubric and release feedback. This prototype shows attempts stored in this browser only.</p>
      </div>
    </section>
    <div class="kpi-grid">
      ${kpiCard({ label: "In queue", value: submitted.length, hint: submitted.length ? `<span class="delta down">Waiting on a review</span>` : "Queue is clear", href: "#/assessor" })}
      ${kpiCard({ label: "Released", value: released.length, hint: "Feedback already sent", href: "#/assessor" })}
      ${kpiCard({ label: "Library", value: state.scenarios.filter((item) => item.status === "published").length, hint: "Published scenarios", href: "#/library" })}
      ${kpiCard({ label: "Readiness", value: "Open", hint: "Capability map", href: "#/readiness" })}
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
              <td>${escapeHtml(item.engineerName)}</td>
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
  `;
}

// Score each criterion beside the question it first belongs to.
export function assessorReviewView(state, attempt) {
  if (!attempt) return errorPage("Attempt not found", "Nothing to review.");
  const scenario = attempt.scenarioSnapshot;
  const review = attempt.review || {};
  const results = buildCriterionResults(scenario, attempt.answers, review);
  const domains = summariseDomains(state.config.capabilityDomains, results);
  const hints = attemptOutcomeHints(results, domains, true);
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
              <h2>Question ${index + 1}${question.type === "written" ? "" : ` · ${escapeHtml(question.type)}`}</h2>
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
          <textarea id="developmentActions" name="developmentActions" placeholder="Example: review the illustrative connectivity runbook; shadow a Sev1; discuss an escalation route with a mentor.">${escapeHtml(review.developmentActions || "")}</textarea>
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

function personCard(person) {
  return `
    <button type="button" class="person-card" data-action="sign-in" data-person-id="${escapeHtml(person.id)}">
      <strong>${escapeHtml(person.name)}</strong>
      <span>${escapeHtml(person.roleTitle || roleLabel(person.role))}</span>
      <span>${roleLabel(person.role)}</span>
    </button>
  `;
}

// Administrator page for adding colleagues and changing the one role each person has.
export function accessView(state) {
  const people = state.directory || [];
  const adminCount = people.filter((person) => person.role === "administrator").length;
  return `
    <div class="page-header">
      <h1>Access</h1>
      <p class="lede">ignitemyfire.co.uk colleagues receive User, Assessor, or Administrator from the Incident Lab enterprise application in Entra ID. The names below that are only for this browser can still be added and changed here. Attempts stay in this browser until a shared service exists.</p>
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

// Publish, unpublish, and reset local demo data.
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
      <a class="btn" href="#/admin/import">Import or create JSON</a>
    </section>
    <div class="kpi-grid">
      ${kpiCard({ label: "Scenarios", value: state.scenarios.length, hint: "In this library" })}
      ${kpiCard({ label: "Published", value: published, hint: `<span class="delta up">Live for users</span>` })}
      ${kpiCard({ label: "Drafts", value: drafts, hint: drafts ? `<span class="delta down">Not yet live</span>` : "None" })}
      ${kpiCard({ label: "Open proposals", value: openProposals, hint: "Awaiting review", href: "#/admin/proposals" })}
    </div>
    <div class="btn-row">
      <button class="btn danger" data-action="reset-demo">Reset demo data</button>
    </div>
    <div class="card table-wrap" style="margin-top:1rem">
      <table class="data-table">
        <thead><tr><th>Title</th><th>Id / version</th><th>Status</th><th>Mandatory</th><th></th></tr></thead>
        <tbody>
          ${state.scenarios.map((item) => `
            <tr data-search="${escapeHtml(item.title)} ${escapeHtml(item.id)}">
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.id)} · ${escapeHtml(item.version)}</td>
              <td><span class="pill ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
              <td>${item.mandatory ? "Yes" : "No"}</td>
              <td>
                <a href="#/admin/scenario/${encodeURIComponent(item.id)}">Edit</a>
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
      <p class="lede">JSON is validated before it is stored. User-entered content is escaped when rendered. Keep illustrative disclaimers on every scenario.</p>
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
      <h1>Readiness criteria</h1>
      <p class="lede">These gates support the assessor. They do not auto-certify anyone.</p>
    </div>
    <form class="card" data-form="criteria">
      <div class="field">
        <label>
          <input type="checkbox" name="requiredMandatoryScenarios" ${cfg.requiredMandatoryScenarios ? "checked" : ""}>
          Required scenarios must have released reviews
        </label>
      </div>
      <div class="field">
        <label>
          <input type="checkbox" name="allRequiredReviewed" ${cfg.allRequiredReviewed ? "checked" : ""}>
          Capability criteria on those attempts should be reviewed before a Ready outcome
        </label>
      </div>
      <div class="field">
        <label for="mandatoryCriterionMinimum">Minimum score for mandatory criteria (0–3)</label>
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
    title: "Custom illustrative scenario title",
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
    evidence: [{ id: "e1", title: "Sample evidence", type: "Notes", revealAfterQuestionIndex: 0, content: "Illustrative panel." }],
    questions: [
      {
        id: "q1",
        type: "written",
        prompt: "What would you check first, and why?",
        capabilityDomainIds: ["platform-troubleshooting"],
        assessorGuidance: "Reward a scoped first check before any platform change. Do not score an unsafe first action as demonstrated."
      },
      {
        id: "q2",
        type: "written",
        prompt: "What fault domains would you consider, and which would you set aside?",
        capabilityDomainIds: ["avd-infrastructure", "networking"],
        assessorGuidance: "Look for more than one relevant fault domain, and for the engineer setting aside an unsupported one."
      },
      {
        id: "q3",
        type: "written",
        prompt: "When would you engage Microsoft or another team?",
        capabilityDomainIds: ["trm-escalation-ops"],
        assessorGuidance: "Written answers require assessor review. Do not use keyword matching."
      },
      {
        id: "q4",
        type: "written",
        prompt: "How would you confirm service recovery?",
        capabilityDomainIds: ["trm-escalation-ops"],
        assessorGuidance: "Expect user confirmation plus telemetry. Closing from a green portal tile alone is not enough."
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
        questionIds: ["q3"]
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
function aggregateReleasedDomains(state) {
  const mine = attemptsFor(state.attempts, state.person.id).filter((item) => item.status === "released");
  const results = mine.flatMap((item) => buildCriterionResults(item.scenarioSnapshot, item.answers, item.review));
  return summariseDomains(state.config.capabilityDomains, results);
}

export { formatAnswer, hasAnswer };
