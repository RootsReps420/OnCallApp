// Shared pieces of HTML: the sidebar, top bar, status pills, evidence, and charts.
// Page-specific screens live in views.js. This file does not change stored data.

import { escapeHtml, formatDateTime, nl, percent } from "./util.js";
import { readinessCopy, scoreLabel } from "./scoring.js";

// Screen name for a stored role. engineer is shown as User.
export function roleLabel(role) {
  if (role === "administrator") return "Administrator";
  if (role === "assessor") return "Assessor";
  return "User";
}

// Two letters for the sidebar avatar, from the signed-in name.
function initialsOf(name) {
  const letters = String(name || "?")
    .split(/\s+/)
    .map((part) => (part.replace(/[^A-Za-z]/g, "")[0] || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 2);
  return letters.join("") || "?";
}

// Small stroke icons for the sidebar and search field.
function icon(name, size = 18) {
  const common = `class="nav-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const shapes = {
    overview: `<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`,
    library: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`,
    readiness: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
    propose: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>`,
    queue: `<path d="M16 4h2a2 2 0 0 1 2 2v14H4V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>`,
    manage: `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
    proposals: `<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`,
    criteria: `<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`,
    access: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    evidence: `<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14H4V6a2 2 0 0 1 2-2h2"/><path d="M8 10h8M8 14h8M8 18h5"/>`,
    people: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    author: `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>`,
    verify: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
    reading: `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/>`,
    bell: `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`,
    sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`,
    moon: `<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/>`,
    menu: `<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>`
  };
  return `<svg ${common}>${shapes[name] || ""}</svg>`;
}

// Wrap a page in the sidebar dashboard chrome, top bar, and main column.
export function layout({ config, role, path, body, theme = "dark", person = null, entraEnabled = false }) {
  const nav = person ? navFor(role, path) : `<p class="nav-empty">Sign in to open practice, review, and admin tools.</p>`;
  const light = theme === "light";
  const showMicrosoft = entraEnabled && (!person || person.source !== "entra");
  return `
    <div class="app-shell">
      <aside class="sidebar" data-sidebar>
        <a class="brand" href="#/dashboard">
          <span class="brand-mark"><img class="brand-logo" src="assets/lloyds-horse.svg" width="28" height="28" alt="Lloyds horse"></span>
          <span class="brand-text">
            <span class="brand-org">Virtual Team</span>
            <span class="brand-title">Incident Lab</span>
          </span>
        </a>
        <label class="top-search sidebar-search">
          ${icon("search")}
          <input type="search" data-global-search placeholder="Search…" aria-label="Search this page">
        </label>
        <nav class="sidebar-nav" aria-label="Primary">${nav}</nav>
        <div class="sidebar-account">
          ${person ? `
            <div class="sidebar-user">
              <span class="avatar">${escapeHtml(initialsOf(person.name))}</span>
              <span>
                <strong>${escapeHtml(person.name)}</strong>
                <span>${roleLabel(person.role)}${person.source === "entra" ? "" : " · Local"}</span>
              </span>
            </div>
          ` : ""}
          <div class="sidebar-user-actions">
            <button type="button" class="theme-switch" data-action="toggle-theme" role="switch" aria-checked="${light}" aria-label="${light ? "Switch to dark mode" : "Switch to light mode"}">
              <span class="theme-switch-track">
                <span class="theme-switch-thumb"></span>
                <span class="theme-switch-icon theme-switch-moon">${icon("moon", 13)}</span>
                <span class="theme-switch-icon theme-switch-sun">${icon("sun", 13)}</span>
              </span>
            </button>
            ${showMicrosoft ? `<button type="button" class="theme-toggle header-entra" data-action="entra-sign-in">Sign in with Microsoft</button>` : ""}
            ${person ? `<button type="button" class="theme-toggle" data-action="sign-out">Sign out</button>` : ""}
          </div>
        </div>
      </aside>
      <div class="app-frame">
        <header class="topbar">
          <button type="button" class="sidebar-toggle" data-action="toggle-sidebar" aria-label="Open menu">${icon("menu")}</button>
        </header>
        <main id="main" class="app-main" tabindex="-1">${body}</main>
        <p class="app-footnote">${escapeHtml(config.prototypeNotice)}</p>
      </div>
    </div>
  `;
}

// One labelled group of sidebar links, such as Practice or Manage.
function navSection(title, items, path) {
  return `
    <p class="nav-label">${title}</p>
    ${items.map(([href, label, glyph, badge]) => {
      const hrefPath = href.slice(1);
      const current = isCurrentNav(hrefPath, path);
      return `<a class="nav-link" href="${href}" ${current ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${label}</span>${badge ? `<span class="nav-wip">${badge}</span>` : ""}</a>`;
    }).join("")}
  `;
}

// Links for the signed-in role. Users, assessors, and administrators do not share one menu.
function navFor(role, path) {
  if (role === "assessor") {
    return navSection("Review", [
      ["#/assessor", "Overview", "queue"],
      ["#/assessor/people", "People", "people"]
    ], path)
      + navSection("Practice", [
        ["#/library", "Scenario Library", "library"],
        ["#/reading", "Reading", "reading", "WIP"],
        ["#/readiness", "Readiness", "readiness"]
      ], path);
  }
  if (role === "administrator") {
    return navSection("Manage", [
      ["#/admin", "Overview", "manage"],
      ["#/admin/author", "Create Scenario", "author"],
      ["#/admin/proposals", "Proposals", "proposals"],
      ["#/admin/criteria", "On-Call Criteria", "criteria"],
      ["#/admin/access", "Role Access", "access"]
    ], path)
      + navSection("Library", [
        ["#/library", "Scenario Library", "library"],
        ["#/reading", "Reading", "reading", "WIP"]
      ], path);
  }
  return navSection("Practice", [
    ["#/dashboard", "Overview", "overview"],
    ["#/library", "Scenario Library", "library"],
    ["#/reading", "Reading", "reading", "WIP"],
    ["#/evidence", "Evidence", "evidence"],
    ["#/readiness", "Readiness", "readiness"]
  ], path)
    + navSection("Contribute", [["#/propose", "Propose", "propose"]], path);
}

// Which link is the current page, including a few child routes such as a review.
function isCurrentNav(hrefPath, path) {
  if (path === hrefPath) return true;
  if (hrefPath === "/assessor" && (path.startsWith("/assessor/review/") || path.startsWith("/assessor/evidence/"))) return true;
  if (hrefPath === "/assessor/people" && path.startsWith("/assessor/person/")) return true;
  if (hrefPath === "/evidence" && path.startsWith("/evidence")) return true;
  if (hrefPath === "/admin" && (path.startsWith("/admin/import") || path.startsWith("/admin/scenario/"))) return true;
  if (hrefPath === "/admin/author" && path.startsWith("/admin/author")) return true;
  if (hrefPath === "/admin/access" && path.startsWith("/admin/access")) return true;
  if (hrefPath === "/reading" && path.startsWith("/reading")) return true;
  if (hrefPath === "/library" && path.startsWith("/library")) return true;
  return false;
}

// Small labels above a scenario. The library hides the difficulty pill.
export function pillsForScenario(scenario, attempt, { difficulty = true } = {}) {
  const bits = [
    difficulty ? `<span class="pill">${escapeHtml(scenario.difficulty)}</span>` : "",
    `<span class="pill">${scenario.estimatedMinutes} min</span>`
  ].filter(Boolean);
  if (attempt) bits.push(`<span class="pill ${statusClass(attempt.status)}">${statusLabel(attempt.status)}</span>`);
  return `<div class="meta-row">${bits.join("")}</div>`;
}

// Human text for an attempt or scenario status.
export function statusLabel(status) {
  return {
    "in-progress": "In progress",
    submitted: "Awaiting review",
    released: "Feedback released",
    draft: "Draft",
    published: "Published"
  }[status] || status;
}

// CSS class that colours a status pill.
export function statusClass(status) {
  return {
    "in-progress": "progress",
    submitted: "review",
    released: "released",
    draft: "draft",
    published: "released"
  }[status] || "";
}

// The call plus a labelled facts list. Used on the intro and beside the write-up.
export function incidentReportCard(incident, { title = "Initial report" } = {}) {
  if (!incident) return "";
  const facts = Array.isArray(incident.facts) ? incident.facts : [];
  return `
    <section class="card incident-report">
      <h2>${escapeHtml(title)}</h2>
      <p>${nl(incident.callSummary)}</p>
      ${facts.length ? `
        <h3>What you already know</h3>
        <dl class="snow-ticket">
          ${facts.map((item) => `<dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd>`).join("")}
        </dl>
      ` : ""}
    </section>
  `;
}

// The illustrative ServiceNow-style ticket on a scenario intro.
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

// Horizontal bars. A null percentage draws an empty bar, not zero.
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
            ${domain.mandatoryUnmet?.length ? `<p class="error-msg">A mandatory criterion in this domain is not yet met.</p>` : ""}
            ${domain.evidenceNote ? `<p class="subtle">${escapeHtml(domain.evidenceNote)}</p>` : ""}
      </div>
    `;
  }).join("")}
    </div>
  `;
}

// Overview metric tile. hint may include a coloured delta span; label and value are escaped.
export function kpiCard({ label, value, hint = "", href = "" }) {
  const tag = href ? "a" : "article";
  const extra = href ? ` href="${href}"` : "";
  return `
    <${tag} class="kpi"${extra}>
      <p class="kpi-label">${escapeHtml(label)}</p>
      <p class="kpi-value">${escapeHtml(String(value))}</p>
      ${hint ? `<p class="kpi-hint">${hint}</p>` : ""}
    </${tag}>
  `;
}

// Line chart of released domain scores. Unscored domains plot at zero so the axis still reads.
export function capabilityLineChart(domains = []) {
  const width = 720;
  const height = 280;
  const pad = { l: 40, r: 18, t: 24, b: 48 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = Math.max(domains.length, 1);
  const xAt = (i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (pct) => pad.t + (1 - (Number(pct) || 0) / 100) * innerH;
  const coords = domains.map((domain, i) => ({ x: xAt(i), y: yAt(domain.percentage), domain }));
  if (!coords.length) {
    return `<p class="chart-empty">Released scores will plot here after feedback.</p>`;
  }
  const line = coords.map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L${last.x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} L${first.x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;
  const grid = [0, 50, 100].map((tick) => {
    const y = yAt(tick);
    return `<line class="chart-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" /><text class="chart-tick" x="${pad.l - 8}" y="${y + 4}" text-anchor="end">${tick}</text>`;
  }).join("");
  const labels = coords.map((point) => `<text class="chart-label" x="${point.x}" y="${height - 14}" text-anchor="middle">${escapeHtml(DOMAIN_SHORT[point.domain.id] || point.domain.name)}</text>`).join("");
  const dots = coords.map((point) => {
    const score = point.domain.percentage == null ? "Not scored" : `${point.domain.percentage}%`;
    return `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="5"><title>${escapeHtml(point.domain.name)}: ${escapeHtml(score)}</title></circle>`;
  }).join("");
  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Capability scores by domain">
      <defs>
        <linearGradient id="cap-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--mark)" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="var(--mark)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#cap-fill)"></path>
      <path class="chart-line" d="${line}" fill="none" stroke="var(--chart)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"></path>
      ${dots}
      ${labels}
      ${domains.every((item) => item.percentage == null) ? `<text class="chart-label" x="${width / 2}" y="${pad.t + innerH / 2}" text-anchor="middle">Released scores will plot here</text>` : ""}
    </svg>
  `;
}

// Donut of covered / gap / unscored domains. The hole shows percent covered.
export function coverageDonut(domains = []) {
  const parts = [
    { label: "Covered", color: "#006a4d", value: domains.filter((item) => domainState(item) === "strong").length },
    { label: "Gaps", color: "#3dbe8a", value: domains.filter((item) => domainState(item) === "gap").length },
    { label: "Unscored", color: "#054433", value: domains.filter((item) => domainState(item) === "empty").length }
  ];
  const total = domains.length || 1;
  const coveredPct = Math.round((parts[0].value / total) * 100);
  const radius = 68;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const rings = parts.map((part) => {
    const len = (part.value / total) * circ;
    const ring = `<circle cx="90" cy="90" r="${radius}" fill="none" stroke="${part.color}" stroke-width="18" stroke-dasharray="${len} ${Math.max(circ - len, 0)}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"></circle>`;
    offset += len;
    return ring;
  }).join("");
  return `
    <div class="donut-wrap">
      <svg class="donut-svg" viewBox="0 0 180 180" role="img" aria-label="Coverage mix">
        <circle cx="90" cy="90" r="${radius}" fill="none" stroke="var(--line)" stroke-width="18"></circle>
        ${rings}
        <text class="donut-value" x="90" y="86" text-anchor="middle">${coveredPct}%</text>
        <text class="donut-caption" x="90" y="108" text-anchor="middle">Covered</text>
      </svg>
      <ul class="donut-legend">
        ${parts.map((part) => `<li><span class="swatch" style="background:${part.color}"></span>${escapeHtml(part.label)} (${part.value})</li>`).join("")}
      </ul>
    </div>
  `;
}

// The assessor's recommendation, plus a reminder that completion is not a certificate.
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

// Table of criterion scores used on the feedback page.
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

// Short labels for the dashboard line-chart axis. The readiness map uses the full domain name.
const DOMAIN_SHORT = {
  "avd-infrastructure": "AVD",
  "networking": "Network",
  "trm-escalation-ops": "TRM / Ops",
  "proxy-solution": "Proxy",
  "vendor-management": "Vendor",
  "platform-troubleshooting": "Platform",
  "m365-stack": "M365"
};

// Split a long spoke title onto two SVG lines so it fits around the ring.
function wrapSpokeLabel(text) {
  const value = String(text || "").trim();
  if (value.length <= 14) return [value];
  if (value.includes(",")) {
    const idx = value.indexOf(",");
    return [value.slice(0, idx + 1).trim(), value.slice(idx + 1).trim()];
  }
  const words = value.split(/\s+/);
  if (words.length < 2) return [value];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

// Strong / gap / empty for a capability node. Below Demonstrated (67%) counts as a gap.
function domainState(domain) {
  if (domain.mandatoryUnmet?.length) return "gap";
  if (domain.percentage == null) return "empty";
  if (domain.percentage < 67) return "gap";
  return "strong";
}

// Point on the readiness ring. Index 0 starts at the top and the rest go clockwise.
function polarPoint(cx, cy, radius, index, total) {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

// Interactive map of capability areas. Each area is one spoke into the hub. Gaps glow.
export function readinessNetwork(domains, { personName = "You" } = {}) {
  const width = 920;
  const height = 680;
  const hub = { x: 460, y: 340 };
  const ring = 240;
  const points = Object.fromEntries(domains.map((domain, index) => [domain.id, polarPoint(hub.x, hub.y, ring, index, domains.length)]));
  const payload = domains.map((domain) => ({
    id: domain.id,
    name: domain.name,
    summary: domain.summary,
    percentage: domain.percentage,
    coverageLabel: domain.coverageLabel,
    state: domainState(domain),
    unmet: (domain.mandatoryUnmet || []).map((item) => item.label),
    evidenceNote: domain.evidenceNote || ""
  }));
  const firstGap = payload.find((item) => item.state === "gap") || payload[0];

  const spokes = domains.map((domain) => {
    const point = points[domain.id];
    return `<line class="neural-edge" data-ends="hub ${escapeHtml(domain.id)}" x1="${hub.x}" y1="${hub.y}" x2="${point.x}" y2="${point.y}" />`;
  }).join("");

  const nodes = domains.map((domain) => {
    const point = points[domain.id];
    const state = domainState(domain);
    const score = domain.percentage == null ? 16 : 18 + Math.round((domain.percentage / 100) * 14);
    const lines = wrapSpokeLabel(domain.name);
    const labels = lines.map((line, index) =>
      `<text class="neural-label" x="${point.x}" y="${point.y + score + 16 + index * 13}" text-anchor="middle">${escapeHtml(line)}</text>`
    ).join("");
    return `
      <g class="neural-node" data-node-id="${escapeHtml(domain.id)}" data-state="${state}" data-action="neural-focus" tabindex="0" role="button" aria-label="${escapeHtml(domain.name)}">
        <circle class="neural-core" cx="${point.x}" cy="${point.y}" r="${score}" />
        <circle class="neural-halo" cx="${point.x}" cy="${point.y}" r="${score + 10}" />
        ${labels}
      </g>
    `;
  }).join("");

  return `
    <div class="neural-shell" data-neural-shell>
      <svg class="neural-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Interactive capability map">
        <defs>
          <radialGradient id="neural-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="var(--mark)" stop-opacity="0.28" />
            <stop offset="70%" stop-color="var(--paper)" stop-opacity="0.08" />
            <stop offset="100%" stop-color="var(--paper)" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle class="neural-field" cx="${hub.x}" cy="${hub.y}" r="300" fill="url(#neural-glow)" />
        <g class="neural-edges">${spokes}</g>
        <g class="neural-hub">
          <circle cx="${hub.x}" cy="${hub.y}" r="42" />
          <text x="${hub.x}" y="${hub.y - 4}" text-anchor="middle">${escapeHtml(personName.split(" ")[0] || "You")}</text>
          <text class="neural-hub-sub" x="${hub.x}" y="${hub.y + 16}" text-anchor="middle">Readiness</text>
        </g>
        ${nodes}
      </svg>
      <aside class="neural-detail" data-neural-detail>
        ${neuralDetailHtml(firstGap)}
      </aside>
      <pre class="sr-only" data-neural-json>${escapeHtml(JSON.stringify(payload))}</pre>
    </div>
  `;
}

// Copy in the readiness aside for the selected capability node.
function neuralDetailHtml(item) {
  if (!item) {
    return `<p class="muted">Hover or select a capability node to see where evidence is thin.</p>`;
  }
  const score = item.percentage == null ? "Not scored yet" : `${item.percentage}%`;
  const tone = item.state === "gap" ? "This is a gap. Released feedback is still below Demonstrated, or a mandatory criterion is unmet." : item.state === "empty" ? "No released score yet. A blank node is incomplete evidence, not a pass." : "On track from released feedback. Keep using this area in later scenarios.";
  return `
    <p class="eyebrow">${item.state === "gap" ? "Gap" : item.state === "empty" ? "Unscored" : "Covered"}</p>
    <h3>${escapeHtml(item.name)}</h3>
    <p class="neural-score">${escapeHtml(score)}</p>
    <p>${escapeHtml(item.summary || "")}</p>
    <p class="subtle">${escapeHtml(item.coverageLabel || "")}</p>
    <p>${escapeHtml(tone)}</p>
    ${item.unmet?.length ? `<ul class="neural-unmet">${item.unmet.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
    ${item.evidenceNote ? `<p class="subtle">${escapeHtml(item.evidenceNote)}</p>` : ""}
    <p class="btn-row"><a class="btn secondary" href="#/library">Practise from the library</a></p>
  `;
}

// Hover and keyboard highlighting for the readiness map. Called after each page draw.
export function bindReadinessGraph() {
  const shell = document.querySelector("[data-neural-shell]");
  if (!shell) return;
  const json = shell.querySelector("[data-neural-json]");
  const detail = shell.querySelector("[data-neural-detail]");
  let payload = [];
  try {
    payload = JSON.parse((json?.textContent || "[]").trim());
  } catch {
    payload = [];
  }

  const select = (id) => {
    const item = payload.find((entry) => entry.id === id) || payload[0];
    shell.querySelectorAll(".neural-node").forEach((node) => {
      node.classList.toggle("is-selected", node.getAttribute("data-node-id") === item?.id);
    });
    if (detail) detail.innerHTML = neuralDetailHtml(item);
    highlight(item?.id);
  };

  const highlight = (id) => {
    shell.querySelectorAll(".neural-edge").forEach((edge) => {
      const ends = (edge.getAttribute("data-ends") || "").split(/\s+/);
      edge.classList.toggle("is-hot", Boolean(id) && ends.includes(id));
    });
    shell.querySelectorAll(".neural-node").forEach((node) => {
      node.classList.toggle("is-hot", node.getAttribute("data-node-id") === id);
    });
  };

  shell.addEventListener("pointerover", (event) => {
    const node = event.target.closest("[data-node-id]");
    if (!node || !shell.contains(node)) return;
    highlight(node.getAttribute("data-node-id"));
  });
  shell.addEventListener("click", (event) => {
    const node = event.target.closest("[data-node-id]");
    if (!node || !shell.contains(node)) return;
    select(node.getAttribute("data-node-id"));
  });
  shell.addEventListener("pointerleave", () => {
    const selected = shell.querySelector(".neural-node.is-selected");
    highlight(selected?.getAttribute("data-node-id"));
  });
  shell.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const node = event.target.closest("[data-node-id]");
    if (!node) return;
    event.preventDefault();
    select(node.getAttribute("data-node-id"));
  });

  const opening = payload.find((item) => item.state === "gap") || payload[0];
  if (opening) select(opening.id);
}

// Short status word for one criterion row.
function statusForCriterion(item) {
  if (item.unanswered) return "Not yet answered";
  if (item.status === "pending-review") return "Pending assessor review";
  if (item.status === "partial-pending") return "Part-scored; written review pending";
  if (item.status === "auto-scored") return "Auto-scored from configured mapping";
  if (item.status === "reviewed") return "Assessor reviewed";
  return "Unreviewed";
}

// Illustrative runbook titles. They are not live links.
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

// Simple title and message when a route or id cannot be opened.
export function errorPage(title, message) {
  return `
    <div class="page-header">
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${nl(message)}</p>
      <p><a class="btn secondary" href="#/dashboard">Return to dashboard</a></p>
    </div>
  `;
}

// Started, submitted, and released times for an attempt.
export function formatAttemptMeta(attempt) {
  return `Started ${formatDateTime(attempt.startedAt)}${attempt.submittedAt ? ` · Submitted ${formatDateTime(attempt.submittedAt)}` : ""}${attempt.review?.releasedAt ? ` · Released ${formatDateTime(attempt.review.releasedAt)}` : ""}`;
}
