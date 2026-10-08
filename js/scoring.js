// Turns answers and an assessor review into criterion scores and domain bars.
// Written answers are never keyword-scored. They stay pending until a person marks them.
// A missing answer is "unanswered", not zero.

import { clamp, percent, round1 } from "./util.js?v=65";

// 0 is not yet demonstrated. 2 is the "Demonstrated" line used by the areas-to-improve chart.
export const SCORE_SCALE = [
  {
    value: 0,
    label: "Not yet demonstrated",
    description: "The response does not show the required understanding for this criterion."
  },
  {
    value: 1,
    label: "Developing",
    description: "Some relevant understanding is present, with significant gaps."
  },
  {
    value: 2,
    label: "Demonstrated",
    description: "A sound approach that meets the expected standard."
  },
  {
    value: 3,
    label: "Strongly demonstrated",
    description: "Clear reasoning, appropriate evidence use, and well-judged actions."
  }
];

// Word for a 0–3 score, such as Demonstrated.
export function scoreLabel(value) {
  return SCORE_SCALE.find((item) => item.value === value)?.label || "Not scored";
}

// Blank text and an empty option list both count as not answered.
function isEmptyAnswer(answer) {
  if (answer == null) return true;
  if (typeof answer === "string" && !answer.trim()) return true;
  if (Array.isArray(answer) && answer.length === 0) return true;
  return false;
}

// Map a 0–1 option credit onto the 0–3 criterion scale.
export function creditToScore(credit, maxScore = 3) {
  if (credit == null || Number.isNaN(credit)) return null;
  const bounded = clamp(credit, 0, 1);
  return round1(bounded * maxScore);
}

// Score one question. Written text stays pending. Choice questions use the credit on the selected option.
export function scoreObjectiveQuestion(question, answer) {
  // The shipped scenarios are written. A person scores them. Do not scan the text for keywords.
  if (question.type === "written") {
    return {
      status: isEmptyAnswer(answer) ? "unanswered" : "pending-review",
      credit: null,
      detail: isEmptyAnswer(answer)
        ? "No written response yet."
        : "Written responses are scored by an assessor. Automated keyword matching is not used."
    };
  }

  if (isEmptyAnswer(answer)) {
    return { status: "unanswered", credit: null, detail: "Not answered." };
  }

  if (question.type === "single") {
    const selected = question.options.find((option) => option.id === answer);
    if (!selected) {
      return { status: "unanswered", credit: null, detail: "Selected option is not in the current scenario version." };
    }
    return {
      status: "scored",
      credit: clamp(selected.credit, 0, 1),
      detail: selected.rationale || "Credit taken from the configured option mapping.",
      selectedIds: [selected.id]
    };
  }

  const selectedIds = Array.isArray(answer) ? [...answer] : [answer];
  const rules = question.partialCreditRules || { method: "sum-option-credits", clampMin: 0, clampMax: 1 };
  const optionMap = Object.fromEntries(question.options.map((option) => [option.id, option]));
  let credit = 0;
  const notes = [];

  if (rules.method === "sum-option-credits" || !rules.method) {
    selectedIds.forEach((id) => {
      const option = optionMap[id];
      if (!option) {
        notes.push(`Ignored unknown option ${id}.`);
        return;
      }
      credit += option.credit;
      notes.push(`${option.id}: ${option.credit} (${option.rationale || "configured credit"})`);
    });
    if (Array.isArray(rules.requiredIds)) {
      const missing = rules.requiredIds.filter((id) => !selectedIds.includes(id));
      if (missing.length) {
        credit = Math.min(credit, rules.missingRequiredMax ?? 0.5);
        notes.push(`Required selections missing (${missing.join(", ")}); credit capped.`);
      }
    }
    credit = clamp(credit, rules.clampMin ?? 0, rules.clampMax ?? 1);
  } else {
    notes.push("Unknown partial-credit method; no automated score applied.");
    return { status: "pending-review", credit: null, detail: notes.join(" ") };
  }

  return {
    status: "scored",
    credit,
    detail: notes.join(" "),
    selectedIds
  };
}

// One row per scoring criterion, using the linked answers and any saved review.
export function buildCriterionResults(scenario, answers, review = null) {
  const questionScores = {};
  for (const question of scenario.questions) {
    questionScores[question.id] = scoreObjectiveQuestion(question, answers?.[question.id]);
  }

  return scenario.scoringCriteria.map((criterion) => {
    const linked = criterion.questionIds.map((id) => ({
      question: scenario.questions.find((item) => item.id === id),
      score: questionScores[id]
    }));
    const reviewItem = review?.criterionScores?.[criterion.id];
    const unanswered = linked.every((item) => item.score.status === "unanswered");
    const pendingWritten = linked.some((item) => item.score.status === "pending-review");
    const objectiveParts = linked.filter((item) => item.score.status === "scored");

    let status = "unreviewed";
    let score = null;
    let source = "none";
    let evidence = [];

    if (unanswered) {
      status = "unanswered";
      evidence.push("No linked question has been answered.");
    } else if (reviewItem && reviewItem.score != null && reviewItem.score !== "") {
      // A saved assessor score wins over any automatic credit.
      status = "reviewed";
      score = Number(reviewItem.score);
      source = "assessor";
      evidence.push(reviewItem.evidence || "Assessor score applied.");
      if (reviewItem.adjustmentExplanation) {
        evidence.push(`Adjustment: ${reviewItem.adjustmentExplanation}`);
      }
    } else if (pendingWritten && objectiveParts.length === 0) {
      // Waiting for a person. This must not become a zero on the chart.
      status = "pending-review";
      evidence.push("Written response awaiting assessor review. This is not scored as zero.");
    } else if (objectiveParts.length) {
      const avgCredit = objectiveParts.reduce((sum, item) => sum + item.score.credit, 0) / objectiveParts.length;
      status = pendingWritten ? "partial-pending" : "auto-scored";
      score = creditToScore(avgCredit, criterion.maxScore);
      source = "objective";
      evidence = objectiveParts.map((item) => `${item.question.id}: ${item.score.detail}`);
      if (pendingWritten) evidence.push("A linked written response is still awaiting review.");
    }

    return {
      ...criterion,
      status,
      score,
      source,
      evidence,
      pendingReview: status === "pending-review" || status === "partial-pending",
      unanswered: status === "unanswered"
    };
  });
}

// Roll criteria up to the capability areas for the chart and readiness map.
export function summariseDomains(domains, criterionResults, minScore = 2) {
  return domains.map((domain) => {
    const items = criterionResults.filter((item) => item.domainId === domain.id);
    const reviewed = items.filter((item) => item.score != null && !item.unanswered);
    const earned = reviewed.reduce((sum, item) => sum + item.score, 0);
    const available = reviewed.reduce((sum, item) => sum + item.maxScore, 0);
    const pending = items.filter((item) => item.pendingReview);
    const unanswered = items.filter((item) => item.unanswered);
    const mandatoryUnmet = items.filter((item) => item.mandatory && item.score != null && item.score < minScore);
    const mandatoryPending = items.filter((item) => item.mandatory && (item.pendingReview || item.unanswered || item.score == null));
    return {
      ...domain,
      criterionCount: items.length,
      reviewedCount: reviewed.length,
      pendingCount: pending.length,
      unansweredCount: unanswered.length,
      earned: round1(earned),
      available,
      percentage: percent(earned, available),
      mandatoryUnmet,
      mandatoryPending,
      coverageLabel: coverageLabel(items.length, reviewed.length, pending.length, unanswered.length)
    };
  });
}

// Short sentence under a bar: how many criteria are scored, pending, or unanswered.
function coverageLabel(total, reviewed, pending, unanswered) {
  if (!total) return "No criteria mapped";
  if (pending || unanswered) {
    return `${reviewed} of ${total} criteria scored; ${pending} pending review; ${unanswered} not answered`;
  }
  return `${reviewed} of ${total} criteria scored`;
}

// Released attempt whose mandatory and safety-critical scores meet Demonstrated (or the configured minimum).
export function isAttemptSatisfactory(attempt, minScore = 2) {
  if (!attempt || attempt.status !== "released") return false;
  const scenario = attempt.scenarioSnapshot;
  if (!scenario?.scoringCriteria?.length) return false;
  const results = buildCriterionResults(scenario, attempt.answers, attempt.review);
  const gates = results.filter((item) => item.mandatory || item.safetyCritical);
  if (!gates.length) return false;
  return gates.every((item) => item.score != null && !item.pendingReview && Number(item.score) >= minScore);
}

// Minimum Demonstrated line from administrator criteria (default 2).
export function gateMinScore(readinessConfig) {
  const n = Number(readinessConfig?.mandatoryCriterionMinimum);
  return Number.isFinite(n) ? n : 2;
}

// One row per readiness spoke: has this engineer done any scenario in that spoke to standard?
export function spokeGateStatus(domains, scenarios, attempts, minScore = 2, requireSatisfactory = true) {
  const published = (scenarios || []).filter((item) => item.status === "published");
  const counts = (attempt) => requireSatisfactory
    ? isAttemptSatisfactory(attempt, minScore)
    : Boolean(attempt && attempt.status === "released");
  return (domains || []).map((domain) => {
    const inSpoke = published.filter((item) => item.spokeId === domain.id);
    let countedAttempt = null;
    const counted = inSpoke.find((scenario) => {
      const match = (attempts || []).find((attempt) => attempt.scenarioId === scenario.id && counts(attempt));
      if (match) {
        countedAttempt = match;
        return true;
      }
      return false;
    });
    const latest = (scenario) => (attempts || [])
      .filter((item) => item.scenarioId === scenario.id)
      .sort((a, b) => String(b.updatedAt || b.startedAt || "").localeCompare(String(a.updatedAt || a.startedAt || "")))[0];
    let progressLabel = "Not started";
    let progressStatus = "";
    if (counted) {
      progressLabel = requireSatisfactory ? "Demonstrated" : "Released";
      progressStatus = "released";
    } else {
      const inFlight = inSpoke.map(latest).filter(Boolean);
      if (inFlight.some((item) => item.status === "released")) {
        progressLabel = "Released — below Demonstrated";
        progressStatus = "not-ready";
      } else if (inFlight.some((item) => item.status === "submitted")) {
        progressLabel = "Awaiting review";
        progressStatus = "review";
      } else if (inFlight.some((item) => item.status === "in-progress")) {
        progressLabel = "In progress";
        progressStatus = "progress";
      }
    }
    return {
      id: domain.id,
      name: domain.name,
      met: Boolean(counted),
      countedTitle: counted?.title || "",
      countedId: counted?.id || "",
      countedAttemptId: countedAttempt?.id || "",
      startId: counted?.id || inSpoke[0]?.id || "",
      progressLabel,
      progressStatus,
      scenarioCount: inSpoke.length
    };
  });
}

// True when every readiness spoke has a satisfactory attempt.
export function allSpokesSatisfied(spokeStatus) {
  return Array.isArray(spokeStatus) && spokeStatus.length > 0 && spokeStatus.every((item) => item.met);
}

// Ready-gate check. Administrators can switch the one-per-spoke rule off.
export function spokeGateComplete(readinessConfig, spokeStatus) {
  if (readinessConfig?.oneScenarioPerSpoke === false) return true;
  return allSpokesSatisfied(spokeStatus);
}

// Signals for the readiness page. A suggested band is withheld while evidence is incomplete.
export function attemptOutcomeHints(criterionResults, domainSummaries, requiredScenariosComplete, minScore = 2) {
  const pending = criterionResults.filter((item) => item.pendingReview || item.unanswered);
  const mandatoryUnmet = criterionResults.filter((item) => item.mandatory && item.score != null && item.score < minScore);
  const safetyFlags = criterionResults.filter((item) => item.safetyCritical && (item.score == null || item.score < minScore || item.pendingReview));
  const average = (() => {
    const scored = domainSummaries.filter((item) => item.percentage != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((sum, item) => sum + item.percentage, 0) / scored.length);
  })();

  return {
    requiredScenariosComplete,
    hasIncompleteEvidence: pending.length > 0 || !requiredScenariosComplete,
    mandatoryUnmet,
    safetyFlags,
    average,
    averageCannotHideMandatory: mandatoryUnmet.length > 0,
    suggestedBand: suggestedBand({
      pending: pending.length,
      mandatoryUnmet: mandatoryUnmet.length,
      requiredScenariosComplete,
      average
    })
  };
}

// Only used after every spoke has a satisfactory attempt and nothing is still pending.
function suggestedBand({ pending, mandatoryUnmet, requiredScenariosComplete, average }) {
  if (!requiredScenariosComplete || pending) return null;
  if (mandatoryUnmet) return "not-yet-ready";
  if (average != null && average >= 80) return "ready";
  if (average != null && average >= 60) return "ready-with-development";
  return "not-yet-ready";
}

// Heading and explanation for Ready, Ready with development areas, or Not yet ready.
export function readinessCopy(value) {
  return {
    ready: { label: "Ready", detail: "The assessor judges that the engineer can independently manage the initial Sev1 OOH response and use the established support model." },
    "ready-with-development": { label: "Ready with development areas", detail: "The engineer can take a supported place on the rota while completing agreed development actions." },
    "not-yet-ready": { label: "Not yet ready", detail: "Further practice or support is needed before independent OOH response. Completion of scenarios alone does not imply readiness." }
  }[value] || { label: "No recommendation yet", detail: "A human assessor makes the final recommendation after one scenario per spoke is at Demonstrated and capability criteria have been reviewed." };
}

// Workplace tickets can thicken a spoke. They cannot replace a spoke on the Ready
// gate or cancel a mandatory gap. Empty spokes stay at most 67% from tickets alone.
export const EVIDENCE_WEIGHT = {
  emptySpokeCap: 67,
  scoredSpokeBoost: 15,
  demonstratedMin: 2
};

// Split assessor next-steps text into list items (new lines, semicolons, or bullets).
export function splitActions(text) {
  return String(text || "")
    .split(/\n+|;\s+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

// Agreed development actions from released scenario feedback and ticket reviews.
export function listDevelopmentActions(attempts = [], evidenceEntries = [], engineerId) {
  const fromAttempts = (attempts || [])
    .filter((item) => item.engineerId === engineerId && item.status === "released")
    .flatMap((item) => splitActions(item.review?.developmentActions).map((text) => ({
      id: `${item.id}:${text}`,
      text,
      source: "scenario",
      attemptId: item.id,
      evidenceId: "",
      scenarioTitle: item.scenarioSnapshot?.title || "Scenario",
      ticketRef: "",
      at: item.review?.releasedAt || item.updatedAt || ""
    })));
  const fromTickets = (evidenceEntries || [])
    .filter((item) => item.engineerId === engineerId && item.status === "released")
    .flatMap((item) => splitActions(item.review?.developmentActions).map((text) => ({
      id: `${item.id}:${text}`,
      text,
      source: "ticket",
      attemptId: "",
      evidenceId: item.id,
      scenarioTitle: "",
      ticketRef: item.ticketRef || "Ticket",
      at: item.review?.releasedAt || item.updatedAt || ""
    })));
  return [...fromAttempts, ...fromTickets].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// Mix released workplace tickets into domain percentages, with a hard cap.
export function applyEvidenceWeight(domains, evidenceEntries = []) {
  const released = (evidenceEntries || []).filter((item) => item.status === "released" && item.review?.score != null && item.review.score !== "");
  const pending = (evidenceEntries || []).filter((item) => item.status === "submitted" || (item.status === "released" && (item.review?.score == null || item.review.score === "")));
  return (domains || []).map((domain) => {
    const tickets = released.filter((item) => item.domainId === domain.id);
    const accepted = tickets.filter((item) => Number(item.review.score) >= EVIDENCE_WEIGHT.demonstratedMin);
    const waiting = pending.filter((item) => item.domainId === domain.id);
    const next = {
      ...domain,
      evidenceCount: tickets.length,
      evidenceAccepted: accepted.length,
      evidencePending: waiting.length,
      evidenceBoosted: false,
      evidenceNote: ""
    };
    if (waiting.length) {
      next.evidenceNote = `${waiting.length} workplace ticket${waiting.length === 1 ? "" : "s"} awaiting assessor review (pending, not zero).`;
    }
    if (!accepted.length) return next;

    const avg = accepted.reduce((sum, item) => sum + Number(item.review.score), 0) / accepted.length;
    const ticketPct = Math.round((avg / 3) * 100);
    const ticketBit = `${accepted.length} accepted workplace ticket${accepted.length === 1 ? "" : "s"}`;

    if (domain.mandatoryUnmet?.length) {
      next.evidenceNote = `${ticketBit}; a mandatory scenario gap still stands.`;
      return next;
    }

    if (domain.percentage == null) {
      next.percentage = Math.min(EVIDENCE_WEIGHT.emptySpokeCap, ticketPct);
      next.evidenceBoosted = true;
      next.coverageLabel = `${next.coverageLabel}; ${ticketBit} capped at ${EVIDENCE_WEIGHT.emptySpokeCap}%`;
      next.evidenceNote = `Workplace evidence only. Capped at ${EVIDENCE_WEIGHT.emptySpokeCap}% so tickets cannot stand in for a spoke on the Ready gate.`;
      return next;
    }

    const extra = Math.min(EVIDENCE_WEIGHT.scoredSpokeBoost, Math.round((avg / 3) * EVIDENCE_WEIGHT.scoredSpokeBoost));
    next.percentage = Math.min(100, domain.percentage + extra);
    next.evidenceBoosted = extra > 0;
    next.coverageLabel = extra
      ? `${domain.coverageLabel}; ${ticketBit} added ${extra} points (capped at +${EVIDENCE_WEIGHT.scoredSpokeBoost})`
      : domain.coverageLabel;
    next.evidenceNote = extra
      ? `${ticketBit} added ${extra} points to this spoke (capped).`
      : `${ticketBit}; no extra points at this score.`;
    return next;
  });
}
