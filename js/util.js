const UUID_KEY = "incident-lab:uuid-seq";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const seq = Number(sessionStorage.getItem(UUID_KEY) || "0") + 1;
  sessionStorage.setItem(UUID_KEY, String(seq));
  return `${prefix}-${Date.now()}-${seq}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round1(value) {
  return Math.round(value * 10) / 10;
}

export function percent(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

export function byId(list, id) {
  return (list || []).find((item) => item.id === id);
}

export function unique(values) {
  return [...new Set(values)];
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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

export function navigate(path) {
  if (!path.startsWith("#")) path = "#" + path;
  if (location.hash === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  location.hash = path;
}

export function nl(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}
