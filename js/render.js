import { escapeHtml, formatDateTime, nl, percent } from "./util.js";
import { readinessCopy, scoreLabel } from "./scoring.js";

export function roleLabel(role) {
  if (role === "administrator") return "Administrator";
  if (role === "assessor") return "Assessor";
  return "User";
}

export function layout({ config, role, path, body, theme = "dark", person = null }) {
  const nav = person ? navFor(role, path) : "";
  const light = theme === "light";
  return `
    <div class="app-shell">
      <header class="app-header">
        <div class="header-inner">
          <a class="brand" href="#/dashboard">
            <img class="brand-logo" src="assets/lloyds-horse.svg" width="36" height="36" alt="">
            <span class="brand-text">
              <span class="brand-org">Virtual Team</span>
              <span class="brand-title">Incident Lab</span>
            </span>
          </a>
          <nav class="primary-nav" aria-label="Primary">${nav}</nav>
          <div class="role-switcher">
            <button type="button" class="theme-toggle" data-action="toggle-theme" aria-pressed="${light}" aria-label="${light ? "Switch to dark mode" : "Switch to light mode"}">${light ? "Dark" : "Light"}</button>
            ${person ? `
              <p class="account-meta">
                <span class="role-user">${escapeHtml(person.name)}</span>
                <span class="role-caption">${roleLabel(person.role)}</span>
              </p>
              <button type="button" class="theme-toggle" data-action="sign-out">Sign out</button>
            ` : ""}
          </div>
        </div>
      </header>
      <div class="disclaimer-bar">
        <p>${escapeHtml(config.illustrativeNotice)}</p>
      </div>
      <main id="main" class="app-main" tabindex="-1">${body}</main>
      <footer class="app-footer">
        <div class="footer-inner">
          <a class="footer-brand" href="#/dashboard">
            <img class="brand-logo" src="assets/lloyds-horse.svg" width="40" height="40" alt="">
            <span>
              <strong>Virtual Team</strong>
              <span>Incident Lab</span>
            </span>
          </a>
          <p class="footer-note">${escapeHtml(config.prototypeNotice)}</p>
        </div>
      </footer>
    </div>
  `;
}

function navFor(role, path) {
  const items = {
    engineer: [
      ["#/dashboard", "Dashboard"],
      ["#/library", "Scenario library"],
      ["#/readiness", "Readiness summary"],
      ["#/propose", "Propose a scenario"]
    ],
    assessor: [
      ["#/assessor", "Review queue"],
      ["#/library", "Scenario library"],
      ["#/readiness", "Readiness summary"]
    ],
    administrator: [
      ["#/admin", "Scenario management"],
      ["#/admin/proposals", "Proposals"],
      ["#/admin/criteria", "Readiness criteria"],
      ["#/admin/access", "Access"],
      ["#/library", "Scenario library"],
      ["#/verify", "Verification"]
    ]
  }[role];
  return items.map(([href, label]) => {
    const hrefPath = href.slice(1);
    const current = isCurrentNav(hrefPath, path);
    return `<a href="${href}" ${current ? 'aria-current="page"' : ""}>${label}</a>`;
  }).join("");
}

function isCurrentNav(hrefPath, path) {
  if (path === hrefPath) return true;
  if (hrefPath === "/assessor" && path.startsWith("/assessor/")) return true;
  if (hrefPath === "/admin" && (path.startsWith("/admin/import") || path.startsWith("/admin/scenario/"))) return true;
  if (hrefPath === "/admin/access" && path.startsWith("/admin/access")) return true;
  return false;
}

export function pillsForScenario(scenario, attempt) {
  const bits = [
    `<span class="pill ${scenario.mandatory ? "required" : "optional"}">${scenario.mandatory ? "Required" : "Optional"}</span>`,
    `<span class="pill">${escapeHtml(scenario.difficulty)}</span>`,
    `<span class="pill">${scenario.estimatedMinutes} min</span>`
  ];
  if (attempt) bits.push(`<span class="pill ${statusClass(attempt.status)}">${statusLabel(attempt.status)}</span>`);
  return `<div class="meta-row">${bits.join("")}</div>`;
}

export function statusLabel(status) {
  return {
    "in-progress": "In progress",
    submitted: "Awaiting review",
    released: "Feedback released",
    draft: "Draft",
    published: "Published"
  }[status] || status;
}

export function statusClass(status) {
  return {
    "in-progress": "progress",
    submitted: "review",
    released: "released",
    draft: "draft",
    published: "released"
  }[status] || "";
}

export function snowCard(snow) {
  return `
    <div class="card">
      <h3>Mock ServiceNow incident</h3>
      <p class="subtle">Illustrative ticket for practice only. Not a live record.</p>
      <dl class="snow-ticket">
        <dt>Number</dt><dd>${escapeHtml(snow.incidentNumber)}</dd>
        <dt>Priority</dt><dd>${escapeHtml(snow.priority)}</dd>
        <dt>Opened</dt><dd>${escapeHtml(snow.opened)}</dd>
        <dt>Caller</dt><dd>${escapeHtml(snow.caller)}</dd>
        <dt>Assignment</dt><dd>${escapeHtml(snow.assignmentGroup)}</dd>
        <dt>Affected CI</dt><dd>${escapeHtml(snow.affectedCI)}</dd>
        <dt>Short description</dt><dd>${escapeHtml(snow.shortDescription)}</dd>
        <dt>Description</dt><dd>${nl(snow.description)}</dd>
      </dl>
    </div>
  `;
}

export function evidenceBlock(item, selected = true) {
  if (!item) return `<div class="empty-state">No evidence selected.</div>`;
  return `
    <div class="evidence-panel" ${selected ? "" : "hidden"}>
      <div class="meta">${escapeHtml(item.type || "Evidence")} · ${escapeHtml(item.title)} · illustrative</div>
      ${escapeHtml(item.content)}
    </div>
  `;
}

export function domainBars(summaries, { compact = false } = {}) {
  return `
    <div class="domain-list ${compact ? "compact" : ""}">
      ${summaries.map((domain) => {
        const value = domain.percentage == null ? 0 : domain.percentage;
        const scoreText = domain.percentage == null ? (compact ? "—" : "Not scored yet") : `${domain.percentage}%`;
        return `
          <div>
            <div class="domain-row">
              <strong>${escapeHtml(domain.name)}</strong>
              <span>${escapeHtml(scoreText)}</span>
              <div class="progress-bar" aria-hidden="true"><span style="width:${value}%"></span></div>
              ${compact ? "" : `<span class="subtle">${escapeHtml(domain.coverageLabel)}</span>`}
            </div>
            ${domain.mandatoryUnmet.length ? `<p class="error-msg">A mandatory criterion in this domain is not yet met.</p>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

export function readinessBanner(value) {
  const copy = readinessCopy(value);
  const cls = value === "ready" ? "ready" : value === "ready-with-development" ? "develop" : value === "not-yet-ready" ? "not-ready" : "progress";
  return `
    <div class="callout ${value === "not-yet-ready" ? "warn" : ""}">
      <p><span class="pill ${cls}">${escapeHtml(copy.label)}</span></p>
      <p>${escapeHtml(copy.detail)}</p>
      <p class="subtle">Completion of scenarios is not a certification and does not by itself mean an engineer is ready for the rota.</p>
    </div>
  `;
}

export function criterionTable(results, { showAssessorHints = false, domains = [] } = {}) {
  const names = Object.fromEntries((domains || []).map((item) => [item.id, item.name]));
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Criterion</th>
            <th>Domain</th>
            <th>Status</th>
            <th>Score</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((item) => `
            <tr>
              <td>
                ${escapeHtml(item.label)}
                ${item.mandatory ? `<span class="pill required">Mandatory</span>` : ""}
                ${item.safetyCritical ? `<span class="pill critical">Safety-critical</span>` : ""}
              </td>
              <td>${escapeHtml(names[item.domainId] || item.domainId)}</td>
              <td>${escapeHtml(statusForCriterion(item))}</td>
              <td>${item.score == null ? "—" : `${item.score} / ${item.maxScore}<br><span class="subtle">${escapeHtml(scoreLabel(Math.round(item.score)))}</span>`}</td>
              <td>${item.evidence.map((line) => escapeHtml(line)).join("<br>") || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${showAssessorHints ? `<p class="coverage-note">Unanswered and unreviewed criteria are listed separately from a score of zero. Written answers stay pending until you review them.</p>` : ""}
  `;
}

function statusForCriterion(item) {
  if (item.unanswered) return "Not yet answered";
  if (item.status === "pending-review") return "Pending assessor review";
  if (item.status === "partial-pending") return "Part-scored; written review pending";
  if (item.status === "auto-scored") return "Auto-scored from configured mapping";
  if (item.status === "reviewed") return "Assessor reviewed";
  return "Unreviewed";
}

export function docsList(refs = []) {
  if (!refs.length) return "";
  return `
    <div class="card">
      <h3>Documentation references</h3>
      <p class="subtle">Illustrative titles only. Confirm the current approved runbook before operational use.</p>
      <ul>
        ${refs.map((ref) => `<li><strong>${escapeHtml(ref.title)}</strong> — ${escapeHtml(ref.note)}</li>`).join("")}
      </ul>
    </div>
  `;
}

export function errorPage(title, message) {
  return `
    <div class="page-header">
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${nl(message)}</p>
      <p><a class="btn secondary" href="#/dashboard">Return to dashboard</a></p>
    </div>
  `;
}

export function formatAttemptMeta(attempt) {
  return `Started ${formatDateTime(attempt.startedAt)}${attempt.submittedAt ? ` · Submitted ${formatDateTime(attempt.submittedAt)}` : ""}${attempt.review?.releasedAt ? ` · Released ${formatDateTime(attempt.review.releasedAt)}` : ""}`;
}
