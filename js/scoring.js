import { clamp, percent, round1 } from "./util.js";

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

export function scoreLabel(value) {
  return SCORE_SCALE.find((item) => item.value === value)?.label || "Not scored";
}

function isEmptyAnswer(answer) {
  if (answer == null) return true;
  if (typeof answer === "string" && !answer.trim()) return true;
  if (Array.isArray(answer) && answer.length === 0) return true;
  return false;
}

export function creditToScore(credit, maxScore = 3) {
  if (credit == null || Number.isNaN(credit)) return null;
  const bounded = clamp(credit, 0, 1);
  return round1(bounded * maxScore);
}

export function scoreObjectiveQuestion(question, answer) {
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
      status = "reviewed";
      score = Number(reviewItem.score);
      source = "assessor";
      evidence.push(reviewItem.evidence || "Assessor score applied.");
      if (reviewItem.adjustmentExplanation) {
        evidence.push(`Adjustment: ${reviewItem.adjustmentExplanation}`);
      }
    } else if (pendingWritten && objectiveParts.length === 0) {
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

export function summariseDomains(domains, criterionResults) {
  return domains.map((domain) => {
    const items = criterionResults.filter((item) => item.domainId === domain.id);
    const reviewed = items.filter((item) => item.score != null && !item.unanswered);
    const earned = reviewed.reduce((sum, item) => sum + item.score, 0);
    const available = reviewed.reduce((sum, item) => sum + item.maxScore, 0);
    const pending = items.filter((item) => item.pendingReview);
    const unanswered = items.filter((item) => item.unanswered);
    const mandatoryUnmet = items.filter((item) => item.mandatory && item.score != null && item.score < 2);
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

function coverageLabel(total, reviewed, pending, unanswered) {
  if (!total) return "No criteria mapped";
  if (pending || unanswered) {
    return `${reviewed} of ${total} criteria scored; ${pending} pending review; ${unanswered} not answered`;
  }
  return `${reviewed} of ${total} criteria scored`;
}

export function attemptOutcomeHints(criterionResults, domainSummaries, requiredScenariosComplete) {
  const pending = criterionResults.filter((item) => item.pendingReview || item.unanswered);
  const mandatoryUnmet = criterionResults.filter((item) => item.mandatory && item.score != null && item.score < 2);
  const safetyFlags = criterionResults.filter((item) => item.safetyCritical && (item.score == null || item.score < 2 || item.pendingReview));
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

function suggestedBand({ pending, mandatoryUnmet, requiredScenariosComplete, average }) {
  if (!requiredScenariosComplete || pending) return null;
  if (mandatoryUnmet) return "not-yet-ready";
  if (average != null && average >= 80) return "ready";
  if (average != null && average >= 60) return "ready-with-development";
  return "not-yet-ready";
}

export function readinessCopy(value) {
  return {
    ready: { label: "Ready", detail: "The assessor judges that the engineer can independently manage the initial Sev1 OOH response and use the established support model." },
    "ready-with-development": { label: "Ready with development areas", detail: "The engineer can take a supported place on the rota while completing agreed development actions." },
    "not-yet-ready": { label: "Not yet ready", detail: "Further practice or support is needed before independent OOH response. Completion of scenarios alone does not imply readiness." }
  }[value] || { label: "No recommendation yet", detail: "A human assessor makes the final recommendation after required scenarios and capability criteria have been reviewed." };
}
