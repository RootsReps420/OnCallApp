// Practice scoring for the Run Engineer Incident Sandbox.
// This is not an assessor mark. It reads the work notes and ticket actions
// the engineer left, then gives a 0–5 on each heading so they can try again.

export const SANDBOX_STATES = ["New", "In Progress", "On Hold", "Resolved", "Closed", "Canceled"];

export const SANDBOX_CRITERIA = [
  { id: "comms", label: "Clear comms", hint: "Work notes a colleague could pick up, and a note the user can see." },
  { id: "troubleshooting", label: "Troubleshooting methods", hint: "You used facts that are already on the ticket, in a sensible order." },
  { id: "time", label: "Time to resolution", hint: "You did not rush the record, and you did not leave it hanging." },
  { id: "hygiene", label: "Ticket hygiene", hint: "State, assignment, and resolution match how a live record is worked." }
];

function clampScore(value) {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function haystack(run) {
  const notes = (run?.notes || []).map((item) => item.text).join("\n");
  return `${notes}\n${run?.resolution || ""}\n${run?.draftNote || ""}`.toLowerCase();
}

function engineerNotes(run) {
  return (run?.notes || []).filter((item) => item.source === "engineer" && (item.kind === "work" || item.kind === "customer"));
}

function hasPhrase(text, phrase) {
  return text.includes(String(phrase || "").toLowerCase());
}

// Clear comms: length, who you told, and a customer-visible update.
export function scoreComms(run) {
  const mine = engineerNotes(run);
  if (!mine.length) return { score: 0, why: "No work notes from you yet." };
  const joined = mine.map((item) => item.text).join("\n");
  let score = 1;
  const reasons = ["You posted a work note."];
  if (joined.trim().length >= 80) {
    score += 1;
    reasons.push("The notes are long enough to hand over.");
  }
  if (mine.length >= 2) {
    score += 1;
    reasons.push("More than one note, so the timeline is clearer.");
  }
  if (/\b(user|caller|colleague|advised|informed|updated|emailed|teams)\b/i.test(joined)) {
    score += 1;
    reasons.push("You said who you updated.");
  }
  if (mine.some((item) => item.customerVisible)) {
    score += 1;
    reasons.push("There is a customer-visible update.");
  } else {
    reasons.push("Add a customer-visible comment next time so the caller sees progress.");
  }
  return { score: clampScore(score), why: reasons.join(" ") };
}

// Troubleshooting: how many of the ticket's own facts you actually used in the notes.
export function scoreTroubleshooting(ticket, run) {
  const text = haystack(run);
  const signals = ticket?.signals || [];
  if (!engineerNotes(run).length) {
    return { score: 0, why: "Write what you checked before this heading can score." };
  }
  const hit = signals.filter((item) => hasPhrase(text, item));
  const ratio = signals.length ? hit.length / signals.length : 0;
  let score = ratio * 5;
  const reasons = [];
  if (hit.length) {
    reasons.push(`You used ${hit.length} of ${signals.length} facts already on the ticket (${hit.join(", ")}).`);
  } else {
    reasons.push("Tie the notes back to the host pool, VM, error, or app named on the record.");
  }
  if (/\b(check|checked|confirm|tested|reproduced|logs|host pool|session host)\b/i.test(text)) {
    score += 0.5;
    reasons.push("You described a check, not only the outcome.");
  }
  return { score: clampScore(score), why: reasons.join(" ") };
}

// Time: resolved without a one-second click-through, and not abandoned.
export function scoreTime(ticket, run) {
  const elapsedMs = Number(run?.elapsedMs) || 0;
  const suggestedMs = (Number(ticket?.suggestedMinutes) || 20) * 60 * 1000;
  const resolved = ["Resolved", "Closed"].includes(run?.state);
  if (!resolved) {
    return { score: 2, why: "The record is not resolved yet, so time-to-resolution stays low." };
  }
  const notesLen = engineerNotes(run).reduce((sum, item) => sum + String(item.text || "").length, 0);
  if (elapsedMs < 20000 && notesLen < 120) {
    return { score: 1, why: "The ticket was closed very quickly with little written up. Slow down and leave a trail." };
  }
  if (elapsedMs < suggestedMs * 0.15 && notesLen >= 120) {
    return { score: 3, why: "Resolved fast, but the notes are there. A live queue would still want a bit more dwell." };
  }
  if (elapsedMs <= suggestedMs * 2) {
    return { score: 5, why: `Inside the ${ticket.suggestedMinutes}-minute practice window, with a written close.` };
  }
  return { score: 4, why: "Over the suggested window, which is allowed. The close is still documented." };
}

// Hygiene: In Progress before Resolved, a note before close, resolution text.
export function scoreHygiene(run) {
  const trail = run?.stateTrail || [];
  const resolved = ["Resolved", "Closed"].includes(run?.state);
  let score = 1;
  const reasons = ["You opened the record."];
  if (trail.includes("In Progress") || run?.state === "In Progress") {
    score += 1;
    reasons.push("State moved to In Progress.");
  } else {
    reasons.push("Set In Progress when you pick the ticket up.");
  }
  if (engineerNotes(run).length) {
    score += 1;
    reasons.push("A work note sits on the timeline.");
  }
  if (resolved && String(run?.resolution || "").trim().length >= 40) {
    score += 1;
    reasons.push("Resolution notes are filled in.");
  } else if (resolved) {
    reasons.push("Add a short resolution note before you close.");
  }
  if (resolved && trail.includes("In Progress")) {
    score += 1;
    reasons.push("You did not jump straight from New to closed.");
  }
  return { score: clampScore(score), why: reasons.join(" ") };
}

export function scoreSandboxRun(ticket, run) {
  const comms = scoreComms(run);
  const troubleshooting = scoreTroubleshooting(ticket, run);
  const time = scoreTime(ticket, run);
  const hygiene = scoreHygiene(run);
  const rows = [
    { ...SANDBOX_CRITERIA[0], ...comms },
    { ...SANDBOX_CRITERIA[1], ...troubleshooting },
    { ...SANDBOX_CRITERIA[2], ...time },
    { ...SANDBOX_CRITERIA[3], ...hygiene }
  ];
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  const average = Math.round((total / rows.length) * 10) / 10;
  return {
    rows,
    total,
    average,
    outOf: rows.length * 5,
    summary: average >= 4
      ? "Solid practice pass. Read the notes below and try a second ticket."
      : average >= 2.5
        ? "Enough to learn from. Strengthen the weak heading and run the same ticket again."
        : "Treat this as a dry run. Add work notes, use the facts on the record, then complete it again."
  };
}

export function findSandboxTicket(catalog, id) {
  return (catalog?.tickets || []).find((item) => item.id === id) || null;
}

export function latestSandboxRun(runs, ticketId, engineerId) {
  return (runs || [])
    .filter((item) => item.ticketId === ticketId && item.engineerId === engineerId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}
