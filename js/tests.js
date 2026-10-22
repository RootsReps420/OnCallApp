// Scoring and catalog checks. Not shown in the administrator menu.
// These fixtures are not the real scenarios. They prove the scoring rules.

import { scoreObjectiveQuestion, creditToScore, buildCriterionResults, summariseDomains, attemptOutcomeHints, applyEvidenceWeight, EVIDENCE_WEIGHT, splitActions, isAttemptSatisfactory, spokeGateStatus, allSpokesSatisfied } from "./scoring.js?v=79";
import { validateScenario, validateReadingCatalog, validateSandboxCatalog, validateAssistantKnowledge } from "./validation.js?v=79";
import { continueReading, isNewerVersion, mergeScenarios, sortScenarios } from "./content.js?v=79";
import { scoreSandboxRun } from "./sandbox.js?v=79";
import * as storage from "./storage.js?v=79";
import { answerNote } from "./assistant.js?v=79";

// A tiny single-choice question with full, partial, and zero credit.
function fixtureQuestionSingle() {
  return {
    id: "q-single",
    type: "single",
    prompt: "Choose the most appropriate first check.",
    capabilityDomainIds: ["incident-assessment"],
    options: [
      { id: "good", text: "Good", credit: 1, rationale: "full" },
      { id: "ok", text: "Partial", credit: 0.5, rationale: "half" },
      { id: "bad", text: "Poor", credit: 0, rationale: "none" }
    ]
  };
}

// A tiny multiple-choice question with a required option and a negative credit.
function fixtureQuestionMulti() {
  return {
    id: "q-multi",
    type: "multiple",
    prompt: "Choose every action that belongs in the first checks.",
    capabilityDomainIds: ["networking"],
    options: [
      { id: "a", text: "A", credit: 0.5, rationale: "needed" },
      { id: "b", text: "B", credit: 0.5, rationale: "needed" },
      { id: "c", text: "C", credit: -0.5, rationale: "unsafe" }
    ],
    partialCreditRules: {
      method: "sum-option-credits",
      requiredIds: ["a"],
      missingRequiredMax: 0.4,
      clampMin: 0,
      clampMax: 1
    }
  };
}

// A written question, which must stay pending.
function fixtureQuestionWritten() {
  return {
    id: "q-write",
    type: "written",
    prompt: "Explain when you would engage another team.",
    capabilityDomainIds: ["communication"]
  };
}

// A valid mini scenario that links those questions to criteria.
function fixtureScenario() {
  return {
    id: "fixture-001",
    version: "1.0.0",
    status: "published",
    title: "Fixture scenario for tests",
    description: "Used only by the verification page to exercise scoring rules.",
    scope: "Tests",
    difficulty: "foundation",
    estimatedMinutes: 10,
    mandatory: true,
    illustrativeDisclaimer: "Illustrative content used for automated verification only.",
    initialIncident: {
      callSummary: "A fictional call summary used by verification only.",
      serviceNow: {
        incidentNumber: "INC1",
        priority: "1",
        assignmentGroup: "VDI",
        opened: "now",
        shortDescription: "short",
        description: "desc",
        caller: "desk",
        affectedCI: "ci"
      },
      impact: { customers: "c", colleagues: "c", business: "b" }
    },
    questions: [
      fixtureQuestionSingle(),
      fixtureQuestionMulti(),
      fixtureQuestionWritten(),
      {
        id: "q-recover",
        type: "single",
        prompt: "How would you confirm recovery?",
        capabilityDomainIds: ["communication"],
        options: [
          { id: "a", text: "Ask a user and check telemetry", credit: 1, rationale: "full" },
          { id: "b", text: "Close immediately", credit: 0, rationale: "none" }
        ]
      }
    ],
    scoringCriteria: [
      {
        id: "c-obj",
        label: "Objective criterion",
        domainId: "incident-assessment",
        maxScore: 3,
        mandatory: true,
        safetyCritical: false,
        questionIds: ["q-single"]
      },
      {
        id: "c-write",
        label: "Written criterion",
        domainId: "communication",
        maxScore: 3,
        mandatory: true,
        safetyCritical: true,
        questionIds: ["q-write"]
      }
    ]
  };
}

// Run the checks and return { name, ok, detail } rows for the Verification page.
export function runVerification(readingCatalog, sandboxCatalog, assistantKnowledge) {
  const results = [];
  const check = (name, condition, detail = "") => {
    results.push({ name, ok: Boolean(condition), detail });
  };

  // Choice questions use the credit written on each option.
  const singleGood = scoreObjectiveQuestion(fixtureQuestionSingle(), "good");
  check("Single-choice full credit uses option mapping", singleGood.credit === 1, singleGood.detail);

  const singlePartial = scoreObjectiveQuestion(fixtureQuestionSingle(), "ok");
  check("Single-choice partial credit", singlePartial.credit === 0.5);

  const unanswered = scoreObjectiveQuestion(fixtureQuestionSingle(), "");
  check("Unanswered objective is not scored as zero", unanswered.status === "unanswered" && unanswered.credit == null);

  const multi = scoreObjectiveQuestion(fixtureQuestionMulti(), ["a", "b"]);
  check("Multiple-choice summed credits clamp at 1", multi.credit === 1);

  const multiPenalty = scoreObjectiveQuestion(fixtureQuestionMulti(), ["a", "c"]);
  check("Multiple-choice applies explicit negative credit and clamp", multiPenalty.credit === 0);

  const missingRequired = scoreObjectiveQuestion(fixtureQuestionMulti(), ["b"]);
  check("Missing required option caps credit", missingRequired.credit === 0.4);

  // Written text must stay pending. Never treat a blank as a zero.
  const writtenEmpty = scoreObjectiveQuestion(fixtureQuestionWritten(), "  ");
  check("Empty written remains unanswered, not zero", writtenEmpty.status === "unanswered");

  const writtenPending = scoreObjectiveQuestion(fixtureQuestionWritten(), "I would page MIM and Identity.");
  check("Written answers stay pending-review with no keyword score", writtenPending.status === "pending-review" && writtenPending.credit == null);

  check("Credit 1 maps to score 3", creditToScore(1) === 3);
  check("Credit 0.5 maps to score 1.5", creditToScore(0.5) === 1.5);

  const scenario = fixtureScenario();
  const pendingResults = buildCriterionResults(scenario, { "q-single": "good", "q-write": "A thoughtful paragraph." }, null);
  const writtenCrit = pendingResults.find((item) => item.id === "c-write");
  const objCrit = pendingResults.find((item) => item.id === "c-obj");
  check("Written criterion is pending, not zero", writtenCrit.status === "pending-review" && writtenCrit.score == null);
  check("Objective criterion auto-scores from mapping", objCrit.status === "auto-scored" && objCrit.score === 3);

  const reviewed = buildCriterionResults(scenario, { "q-single": "good", "q-write": "text" }, {
    criterionScores: { "c-write": { score: 2, evidence: "Sound escalation." } }
  });
  check("Assessor review replaces pending written score", reviewed.find((item) => item.id === "c-write").score === 2);

  const domains = summariseDomains([
    { id: "incident-assessment", name: "Impact" },
    { id: "communication", name: "Comms" }
  ], pendingResults);
  check("Domain percentage ignores pending written criteria", domains[0].percentage === 100 && domains[1].percentage == null);

  const hints = attemptOutcomeHints(pendingResults, domains, false);
  check("Incomplete evidence is distinct from demonstrated capability", hints.hasIncompleteEvidence === true);
  check("Suggested band withheld while evidence is incomplete", hints.suggestedBand == null);

  const unmet = attemptOutcomeHints(
    [{ mandatory: true, score: 1, maxScore: 3, pendingReview: false, unanswered: false, label: "Mandatory gap", safetyCritical: false, domainId: "x" }],
    [{ percentage: 90 }],
    true
  );
  check("High average cannot hide unmet mandatory criterion", unmet.averageCannotHideMandatory === true && unmet.suggestedBand === "not-yet-ready");

  // Catalog and merge checks: a thin fixture must pass; incomplete JSON must fail.
  const valid = validateScenario(scenario);
  check("Fixture scenario validates", valid.ok, valid.errors?.map((e) => `${e.path}: ${e.message}`).join("; "));

  const withoutEvidence = { ...scenario };
  delete withoutEvidence.evidence;
  const validNoEvidence = validateScenario(withoutEvidence);
  check("Scenario without evidence panels still validates", validNoEvidence.ok);

  const invalid = validateScenario({ id: "x" });
  check("Incomplete JSON is rejected", invalid.ok === false && invalid.errors.length > 0);

  check("Bundled 1.3.0 is newer than a saved 1.1.0 copy", isNewerVersion("1.3.0", "1.1.0") === true);
  const merged = mergeScenarios(
    [{ id: "vds-auth-group-003", version: "1.3.0", title: "Bundled", questions: [{ id: "q1" }] }],
    [{ id: "vds-auth-group-003", version: "1.1.0", title: "Stale custom", questions: [{ id: "q1" }, { id: "q2" }] }]
  );
  check("Newer bundled scenario wins over a stale local copy", merged[0].version === "1.3.0" && merged[0].questions.length === 1);

  const sorted = sortScenarios(
    [
      { title: "M365 Stack 1", spokeId: "m365-stack", spokeNumber: 1 },
      { title: "AVD Infrastructure 2", spokeId: "avd-infrastructure", spokeNumber: 2 },
      { title: "AVD Infrastructure 1", spokeId: "avd-infrastructure", spokeNumber: 1 }
    ],
    [{ id: "avd-infrastructure" }, { id: "m365-stack" }]
  );
  check(
    "Library order is spoke then number",
    sorted.map((item) => item.title).join("|") === "AVD Infrastructure 1|AVD Infrastructure 2|M365 Stack 1"
  );

  const emptySpoke = applyEvidenceWeight(
    [{ id: "proxy-solution", name: "Proxy", percentage: null, coverageLabel: "None", mandatoryUnmet: [] }],
    [{ status: "released", domainId: "proxy-solution", review: { score: 3 } }]
  )[0];
  check("Tickets alone cannot fill an empty spoke past the cap", emptySpoke.percentage === EVIDENCE_WEIGHT.emptySpokeCap);

  const boosted = applyEvidenceWeight(
    [{ id: "networking", name: "Networking", percentage: 50, coverageLabel: "Scored", mandatoryUnmet: [] }],
    [{ status: "released", domainId: "networking", review: { score: 3 } }]
  )[0];
  check("Accepted tickets add a capped boost to a scored spoke", boosted.percentage === 50 + EVIDENCE_WEIGHT.scoredSpokeBoost);

  const blocked = applyEvidenceWeight(
    [{ id: "m365-stack", name: "M365", percentage: 90, coverageLabel: "Scored", mandatoryUnmet: [{ label: "Safety" }] }],
    [{ status: "released", domainId: "m365-stack", review: { score: 3 } }]
  )[0];
  check("Workplace tickets cannot cancel a mandatory gap", blocked.percentage === 90 && /mandatory/i.test(blocked.evidenceNote));

  const gateScenario = (id, spokeId, title) => ({ ...fixtureScenario(), id, spokeId, title, mandatory: false, status: "published" });
  const avdOne = gateScenario("avd-1", "avd-infrastructure", "AVD Infrastructure 1");
  const avdTwo = gateScenario("avd-2", "avd-infrastructure", "AVD Infrastructure 2");
  const netOne = gateScenario("net-1", "networking", "Networking 1");
  const gateDomains = [
    { id: "avd-infrastructure", name: "AVD Infrastructure" },
    { id: "networking", name: "Networking" }
  ];
  const goodAttempt = (scenario) => ({
    id: `good-${scenario.id}`,
    scenarioId: scenario.id,
    status: "released",
    scenarioSnapshot: scenario,
    answers: { "q-single": "good", "q-write": "A complete write-up of the first call." },
    review: { criterionScores: { "c-write": { score: 2, evidence: "Demonstrated." } } }
  });
  const weakAttempt = (scenario) => ({
    id: `weak-${scenario.id}`,
    scenarioId: scenario.id,
    status: "released",
    scenarioSnapshot: scenario,
    answers: { "q-single": "bad", "q-write": "Not enough." },
    review: { criterionScores: { "c-write": { score: 1, evidence: "Below Demonstrated." } } }
  });
  check("Released below Demonstrated is not satisfactory", isAttemptSatisfactory(weakAttempt(avdOne)) === false);
  check("Released at Demonstrated is satisfactory", isAttemptSatisfactory(goodAttempt(avdTwo)) === true);
  check("Submitted work does not satisfy a spoke", isAttemptSatisfactory({ ...goodAttempt(avdTwo), status: "submitted" }) === false);

  const oneSpokeMet = spokeGateStatus(gateDomains, [avdOne, avdTwo, netOne], [weakAttempt(avdOne), goodAttempt(avdTwo)]);
  check("A second scenario in the same spoke can satisfy that spoke", oneSpokeMet.find((item) => item.id === "avd-infrastructure")?.met === true);
  check("A weak first attempt does not block a later satisfactory one", oneSpokeMet.find((item) => item.id === "avd-infrastructure")?.countedTitle === "AVD Infrastructure 2");
  check("An untouched spoke stays unmet", oneSpokeMet.find((item) => item.id === "networking")?.met === false);
  check("Ready is withheld until every spoke is satisfactory", allSpokesSatisfied(oneSpokeMet) === false);

  const bothMet = spokeGateStatus(gateDomains, [avdOne, avdTwo, netOne], [goodAttempt(avdTwo), goodAttempt(netOne)]);
  check("One satisfactory scenario per spoke meets the Ready gate", allSpokesSatisfied(bothMet) === true);

  // Reading catalog: live cards, WIP cards, and continue-reading order.
  const readingFixture = {
    disclaimer: "Illustrative reading catalog used only by verification.",
    collections: [{ id: "on-call", title: "On-call", spine: "On-call", folio: "01", tone: "ops", summary: "Rota and first-hour pages." }],
    articles: [{
      id: "ooh-rota",
      collectionId: "on-call",
      title: "Who is on",
      lede: "Find the live rota before you assume you are alone.",
      source: "Confluence",
      sourceLabel: "On-call space",
      minutes: 4,
      spokeIds: ["trm-escalation-ops"],
      href: "",
      sections: [{ heading: "What to open", paragraphs: ["The approved on-call space should have a rota page."] }]
    }]
  };
  const readingOk = validateReadingCatalog(readingFixture);
  check("Reading catalog fixture validates", readingOk.ok, readingOk.errors?.map((item) => `${item.path}: ${item.message}`).join("; "));
  check("Continue reading prefers an unread note", continueReading(readingFixture, {})?.id === "ooh-rota");
  const wipArticle = {
    ...readingFixture.articles[0],
    id: "pending-guide",
    wip: true,
    href: "",
    lede: "No live page on this card yet."
  };
  const wipCatalog = { ...readingFixture, articles: [wipArticle] };
  check("WIP reading card with empty href validates", validateReadingCatalog(wipCatalog).ok);
  const linkedCatalog = {
    ...readingFixture,
    articles: [{
      ...readingFixture.articles[0],
      href: "https://example.com/rota",
      links: [{ label: "Rota page", href: "https://example.com/rota" }]
    }]
  };
  check("Reading card with labelled https buttons validates", validateReadingCatalog(linkedCatalog).ok);
  if (readingCatalog) {
    const liveReading = validateReadingCatalog(readingCatalog);
    check("Bundled reading catalog validates", liveReading.ok, liveReading.errors?.map((item) => `${item.path}: ${item.message}`).join("; "));
  }

  check("Development actions split on new lines", splitActions("Read the runbook\nShadow a SevA").length === 2);

  const sandboxFixture = {
    disclaimer: "Practice records only. Names in this fixture are fictional placeholders.",
    tickets: [{
      id: "sbx-fixture",
      number: "INC14000000",
      title: "Fixture personal AVD sign-in",
      summary: "Cannot sign in to a personal live desktop.",
      suggestedMinutes: 15,
      form: {
        caller: "Jane Doe",
        state: "New",
        assignmentGroup: "IT.ISD.CLIENTINFRASTRUCTURE",
        shortDescription: "AVD - unable to sign in",
        description: "Personal live desktop will not start. User asked for a restart."
      },
      signals: ["personal", "restart", "sign in"],
      history: []
    }]
  };
  const sandboxOk = validateSandboxCatalog(sandboxFixture);
  check("Sandbox catalog fixture validates", sandboxOk.ok, sandboxOk.errors?.map((item) => `${item.path}: ${item.message}`).join("; "));
  const emptyNotes = scoreSandboxRun(sandboxFixture.tickets[0], { notes: [], resolution: "", state: "New", stateTrail: ["New"], elapsedMs: 1000 });
  check("Sandbox comms is 0 with no work notes", emptyNotes.rows.find((item) => item.id === "comms")?.score === 0);
  const practised = scoreSandboxRun(sandboxFixture.tickets[0], {
    notes: [
      { source: "engineer", kind: "work", text: "Checked the personal live desktop. Asked the caller to confirm they still need a restart, then advised them I would update the record." },
      { source: "engineer", kind: "customer", customerVisible: true, text: "We are looking at a restart of the personal desktop. I will update you on Teams." }
    ],
    resolution: "Restarted the personal desktop and confirmed the user could sign in.",
    state: "Resolved",
    stateTrail: ["New", "In Progress", "Resolved"],
    elapsedMs: 12 * 60 * 1000
  });
  check("Sandbox scores comms when notes name the caller", practised.rows.find((item) => item.id === "comms")?.score >= 4);
  check("Sandbox troubleshooting uses ticket facts", practised.rows.find((item) => item.id === "troubleshooting")?.score >= 3);
  check("Sandbox hygiene rewards In Progress then Resolved", practised.rows.find((item) => item.id === "hygiene")?.score >= 4);
  if (sandboxCatalog) {
    const liveSandbox = validateSandboxCatalog(sandboxCatalog);
    check("Bundled sandbox catalog validates", liveSandbox.ok, liveSandbox.errors?.map((item) => `${item.path}: ${item.message}`).join("; "));
  }

  const assistantReading = {
    disclaimer: "Illustrative reading catalog used only by assistant verification.",
    collections: [
      { id: "troubleshooting", title: "Troubleshooting", spine: "Fix", folio: "03", tone: "fix", summary: "Break-fix pages for PAA and TSA." },
      { id: "on-call", title: "On-call procedures", spine: "On-call", folio: "01", tone: "ops", summary: "Rota and first-hour pages." }
    ],
    articles: [
      {
        id: "ts-paa",
        collectionId: "troubleshooting",
        title: "Platform Troubleshooting - Prisma Access Agent",
        lede: "Initial break-fix support for Prisma Access Agent on personal AVD.",
        source: "Confluence",
        sourceLabel: "ENGTR · Prisma",
        minutes: 6,
        spokeIds: ["platform-troubleshooting"],
        href: "https://example.com/paa",
        links: [{ label: "PAA break-fix", href: "https://example.com/paa" }],
        sections: [{ heading: "On the rail", paragraphs: ["Open the live break-fix page from the rail."] }]
      },
      {
        id: "oc-rota",
        collectionId: "on-call",
        title: "Virtual Team - On Call Rota",
        lede: "Find who is on before you assume you are alone.",
        source: "Confluence",
        sourceLabel: "On-call rota",
        minutes: 4,
        spokeIds: ["trm-escalation-ops"],
        href: "https://example.com/rota",
        links: [{ label: "Rota page", href: "https://example.com/rota" }],
        sections: [{ heading: "On the rail", paragraphs: ["Open the live rota page from the rail."] }]
      }
    ]
  };
  const assistantFixture = {
    disclaimer: "Illustrative assistant knowledge used only by verification.",
    synonyms: { signin: ["sign in", "login", "can't login"], rota: ["who is on"] },
    topics: [{
      id: "personal-signin",
      title: "Personal AVD sign-in",
      kind: "troubleshoot",
      spokeIds: ["platform-troubleshooting"],
      signals: ["personal", "paa", "cannot sign in", "sign in"],
      relatedReadingIds: ["ts-paa"],
      clarify: ["Is this a personal desktop or multi-session?"],
      steps: ["Confirm this is a personal desktop, not multi-session."],
      comms: ["Tell the caller you have the record."]
    }, {
      id: "rota-lookup",
      title: "Who is on call",
      kind: "lookup",
      spokeIds: ["trm-escalation-ops"],
      signals: ["rota", "who is on"],
      relatedReadingIds: ["oc-rota"],
      clarify: ["Do you need the rota or the contacts?"],
      steps: ["Open the Virtual Team on-call rota from Reading."]
    }]
  };
  const assistantOk = validateAssistantKnowledge(assistantFixture);
  check("Assistant knowledge fixture validates", assistantOk.ok, assistantOk.errors?.map((item) => `${item.path}: ${item.message}`).join("; "));
  const personal = answerNote(assistantFixture, assistantReading, "personal can't login");
  check("Personal sign-in note matches the personal topic", personal.mode === "answer" && personal.topic?.id === "personal-signin");
  check("Personal sign-in note offers the PAA article", personal.articles.some((item) => item.id === "ts-paa"));
  check("Personal sign-in note repeats only curated steps", personal.steps.length === 1 && /personal desktop/i.test(personal.steps[0]));
  const rota = answerNote(assistantFixture, assistantReading, "rota");
  check("Rota note can answer from the rota topic or article", (rota.mode === "answer" && rota.topic?.id === "rota-lookup") || rota.articles.some((item) => item.id === "oc-rota"));
  const junk = answerNote(assistantFixture, assistantReading, "asdf qwerty zxcv");
  check("Junk note asks a question instead of guessing", junk.mode === "clarify" && !junk.articles.length && !junk.steps.length);
  const followUp = answerNote(assistantFixture, assistantReading, "it's personal", ["can't login"]);
  check("A brief follow-up still uses earlier words", followUp.topic?.id === "personal-signin" || followUp.articles.some((item) => item.id === "ts-paa"));
  const junkAfter = answerNote(assistantFixture, assistantReading, "asdf qwerty zxcv", ["personal can't login"]);
  check("A full junk note ignores earlier context", junkAfter.mode === "clarify" && !junkAfter.articles.length);
  if (assistantKnowledge) {
    const liveKnowledge = validateAssistantKnowledge(assistantKnowledge);
    check("Bundled assistant knowledge validates", liveKnowledge.ok, liveKnowledge.errors?.map((item) => `${item.path}: ${item.message}`).join("; "));
    const readingIds = new Set((readingCatalog?.articles || []).map((item) => item.id));
    const missingPins = (assistantKnowledge.topics || []).flatMap((topic) => topic.relatedReadingIds || []).filter((id) => !readingIds.has(id));
    check("Assistant reading pins exist in the Reading catalog", missingPins.length === 0, missingPins.join(", "));
    const livePersonal = answerNote(assistantKnowledge, readingCatalog, "personal can't login");
    check("Live personal note stays on a curated topic", livePersonal.mode === "answer" && livePersonal.topic?.id === "personal-signin");
    const liveMs = answerNote(assistantKnowledge, readingCatalog, "Need to engage Microsoft");
    check("Live Microsoft note stays on the engagement topic", liveMs.mode === "answer" && liveMs.topic?.id === "vendor-microsoft");
    check("Live Microsoft note does not offer the Palo Alto page", !liveMs.articles.some((item) => item.id === "ven-palo-alto"));
    const liveRota = answerNote(assistantKnowledge, readingCatalog, "where is the rota");
    check("Live rota note offers the rota article", liveRota.articles.some((item) => item.id === "oc-rota") || liveRota.topic?.id === "rota-lookup");
    const liveJunk = answerNote(assistantKnowledge, readingCatalog, "asdf qwerty zxcv");
    check("Live junk note does not invent a wiki page", liveJunk.mode === "clarify" && !liveJunk.articles.length);
  }

  const key = "incident-lab:attempts";
  const previous = localStorage.getItem(key);
  try {
    storage.saveAttempt({
      id: "attempt-verify-temp",
      scenarioId: "fixture-001",
      scenarioVersion: "1.0.0",
      status: "in-progress",
      answers: { "q-single": "ok" },
      startedAt: "2026-01-01T00:00:00.000Z"
    });
    const loaded = storage.getAttempt("attempt-verify-temp");
    check("Attempt persists and restores answers", loaded?.answers?.["q-single"] === "ok");
    check("Submitted attempt keeps scenario version", loaded?.scenarioVersion === "1.0.0");
    const remaining = storage.getAttempts().filter((item) => item.id !== "attempt-verify-temp");
    localStorage.setItem(key, JSON.stringify(remaining));
    const ticket = {
      id: "ticket-verify-temp",
      engineerId: "demo-engineer",
      ticketRef: "INC-redacted",
      domainId: "proxy-solution",
      status: "submitted",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    storage.saveEvidence(ticket);
    check("Workplace ticket persists", storage.getEvidenceEntry("ticket-verify-temp")?.ticketRef === "INC-redacted");
    const tickets = storage.getEvidence().filter((item) => item.id !== "ticket-verify-temp");
    localStorage.setItem("incident-lab:evidence", JSON.stringify(tickets));
  } catch (error) {
    check("Persistence round-trip", false, String(error));
  } finally {
    if (previous == null) {
      const remaining = storage.getAttempts().filter((item) => item.id !== "attempt-verify-temp");
      localStorage.setItem(key, JSON.stringify(remaining));
    }
  }

  return results;
}
