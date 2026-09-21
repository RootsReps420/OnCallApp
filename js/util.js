// Shared helpers used by every other script.
// Nothing here knows about scenarios, roles, or pages.

const UUID_KEY = "incident-lab:uuid-seq";

// Turn user text into safe HTML so a typed < or & cannot become markup.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Show an ISO timestamp as a short UTC date, or a dash when it is missing.
export function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date) + " UTC";
}

// Current time in the format we store on attempts and reviews.
export function nowIso() {
  return new Date().toISOString();
}

// New id for an attempt, proposal, or colleague. Uses a random UUID when the browser has one.
export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const seq = Number(sessionStorage.getItem(UUID_KEY) || "0") + 1;
  sessionStorage.setItem(UUID_KEY, String(seq));
  return `${prefix}-${Date.now()}-${seq}`;
}

// Keep a number inside min and max.
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// One decimal place, used when a 0–1 credit becomes a 0–3 score.
export function round1(value) {
  return Math.round(value * 10) / 10;
}

// Whole-number percentage. Returns null when there is nothing to divide by, so a blank chart stays blank.
export function percent(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

// First list item whose id matches.
export function byId(list, id) {
  return (list || []).find((item) => item.id === id);
}

// Drop duplicate values, keeping the first time each one appears.
export function unique(values) {
  return [...new Set(values)];
}

// Offer a JSON file as a browser download.
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Read #/area/id/extra from the address. An empty hash means the dashboard.
export function parseHash() {
  const raw = (location.hash || "#/dashboard").replace(/^#/, "");
  const [path, queryString] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = {};
  if (queryString) {
    for (const pair of queryString.split("&")) {
      const [key, value] = pair.split("=");
      query[decodeURIComponent(key)] = decodeURIComponent(value || "");
    }
  }
  return { parts, query, path: "/" + parts.join("/") };
}

// Change the hash. If it is already that address, fire hashchange so the page still redraws.
export function navigate(path) {
  if (!path.startsWith("#")) path = "#" + path;
  if (location.hash === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  location.hash = path;
}

// Escape text, then turn line breaks into <br> for paragraphs the user typed.
export function nl(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}
