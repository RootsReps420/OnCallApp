// Checks a scenario JSON document before it can be saved or published.
// It reports every problem it finds. It does not score answers.

const QUESTION_TYPES = new Set(["single", "multiple", "written"]);
const DIFFICULTIES = new Set(["foundation", "intermediate", "advanced"]);
const STATUSES = new Set(["draft", "published"]);
export const SPOKE_IDS = new Set([
  "avd-infrastructure",
  "networking",
  "trm-escalation-ops",
  "proxy-solution",
  "vendor-management",
  "platform-troubleshooting",
  "m365-stack"
]);

// Record one validation problem. The caller keeps going so the user sees every issue.
function fail(errors, path, message) {
  errors.push({ path, message });
}

// Reject a missing, non-string, or too-short field.
function requireString(errors, path, value, min = 1) {
  if (typeof value !== "string" || value.trim().length < min) {
    fail(errors, path, `Expected a non-empty string (min ${min} characters).`);
  }
}

// Reject anything that is not a list. Returns false so the caller can skip item checks.
function requireArray(errors, path, value) {
  if (!Array.isArray(value)) {
    fail(errors, path, "Expected an array.");
    return false;
  }
  return true;
}

// Full scenario check: identity, incident, questions, and scoring criteria. ok is false when errors is not empty.
export function validateScenario(scenario) {
  const errors = [];
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    return { ok: false, errors: [{ path: "$", message: "Scenario must be a JSON object." }] };
  }

  requireString(errors, "id", scenario.id);
  requireString(errors, "version", scenario.version);
  if (!STATUSES.has(scenario.status)) fail(errors, "status", "Status must be draft or published.");
  requireString(errors, "title", scenario.title, 8);
  if (scenario.spokeId != null) {
    if (!SPOKE_IDS.has(scenario.spokeId)) {
      fail(errors, "spokeId", "spokeId must be one of the seven readiness spokes.");
    }
  }
  if (scenario.spokeNumber != null) {
    if (!Number.isInteger(scenario.spokeNumber) || scenario.spokeNumber < 1) {
      fail(errors, "spokeNumber", "spokeNumber must be a whole number of at least 1.");
    }
  }
  requireString(errors, "description", scenario.description, 20);
  requireString(errors, "scope", scenario.scope);
  if (!DIFFICULTIES.has(scenario.difficulty)) {
    fail(errors, "difficulty", "Difficulty must be foundation, intermediate, or advanced.");
  }
  if (typeof scenario.estimatedMinutes !== "number" || scenario.estimatedMinutes < 5) {
    fail(errors, "estimatedMinutes", "Estimated minutes must be a number of at least 5.");
  }
  if (typeof scenario.mandatory !== "boolean") fail(errors, "mandatory", "mandatory must be true or false.");
  requireString(errors, "illustrativeDisclaimer", scenario.illustrativeDisclaimer, 20);

  if (!scenario.initialIncident || typeof scenario.initialIncident !== "object") {
    fail(errors, "initialIncident", "initialIncident is required.");
  } else {
    requireString(errors, "initialIncident.callSummary", scenario.initialIncident.callSummary, 20);
    const snow = scenario.initialIncident.serviceNow;
    if (!snow) fail(errors, "initialIncident.serviceNow", "A mock ServiceNow record is required.");
    else {
      ["incidentNumber", "priority", "assignmentGroup", "opened", "shortDescription", "description", "caller", "affectedCI"]
        .forEach((key) => requireString(errors, `initialIncident.serviceNow.${key}`, snow[key]));
    }
    if (!scenario.initialIncident.impact) fail(errors, "initialIncident.impact", "Impact details are required.");
    if (scenario.initialIncident.facts != null) {
      if (!Array.isArray(scenario.initialIncident.facts)) {
        fail(errors, "initialIncident.facts", "facts must be an array of labelled items.");
      } else {
        scenario.initialIncident.facts.forEach((item, index) => {
          requireString(errors, `initialIncident.facts[${index}].label`, item?.label);
          requireString(errors, `initialIncident.facts[${index}].value`, item?.value);
        });
      }
    }
  }

  if (!requireArray(errors, "questions", scenario.questions)) {
    return { ok: false, errors };
  }
  if (scenario.questions.length < 1 || scenario.questions.length > 12) {
    fail(errors, "questions", "Provide between 1 and 12 questions.");
  }

  const questionIds = new Set();
  scenario.questions.forEach((question, index) => {
    const path = `questions[${index}]`;
    if (!question?.id) fail(errors, `${path}.id`, "Question id is required.");
    else if (questionIds.has(question.id)) fail(errors, `${path}.id`, "Question ids must be unique.");
    else questionIds.add(question.id);
    if (!QUESTION_TYPES.has(question.type)) fail(errors, `${path}.type`, "Type must be single, multiple, or written.");
    requireString(errors, `${path}.prompt`, question.prompt, 10);
    if (!Array.isArray(question.capabilityDomainIds) || !question.capabilityDomainIds.length) {
      fail(errors, `${path}.capabilityDomainIds`, "Map the question to at least one capability domain.");
    }
    if (question.type !== "written") {
      if (!Array.isArray(question.options) || question.options.length < 2) {
        fail(errors, `${path}.options`, "Objective questions need at least two options.");
      } else {
        const optionIds = new Set();
        question.options.forEach((option, optionIndex) => {
          if (!option?.id) fail(errors, `${path}.options[${optionIndex}].id`, "Option id required.");
          else if (optionIds.has(option.id)) fail(errors, `${path}.options[${optionIndex}].id`, "Option ids must be unique.");
          else optionIds.add(option.id);
          requireString(errors, `${path}.options[${optionIndex}].text`, option.text);
          if (typeof option.credit !== "number") {
            fail(errors, `${path}.options[${optionIndex}].credit`, "Each option needs an explicit numeric credit.");
          }
        });
      }
      if (question.type === "multiple" && !question.partialCreditRules) {
        fail(errors, `${path}.partialCreditRules`, "Multiple-choice questions need explicit partial-credit rules.");
      }
    } else if (question.options) {
      fail(errors, `${path}.options`, "Written questions must not include scored options.");
    }
  });

  if (!requireArray(errors, "scoringCriteria", scenario.scoringCriteria)) {
    return { ok: false, errors };
  }
  if (!scenario.scoringCriteria.length) fail(errors, "scoringCriteria", "At least one scoring criterion is required.");
  const criterionIds = new Set();
  scenario.scoringCriteria.forEach((criterion, index) => {
    const path = `scoringCriteria[${index}]`;
    if (!criterion?.id) fail(errors, `${path}.id`, "Criterion id required.");
    else if (criterionIds.has(criterion.id)) fail(errors, `${path}.id`, "Criterion ids must be unique.");
    else criterionIds.add(criterion.id);
    requireString(errors, `${path}.label`, criterion.label);
    requireString(errors, `${path}.domainId`, criterion.domainId);
    if (criterion.maxScore !== 3) fail(errors, `${path}.maxScore`, "MVP criterion scale maximum must be 3.");
    if (typeof criterion.mandatory !== "boolean") fail(errors, `${path}.mandatory`, "mandatory flag required.");
    if (typeof criterion.safetyCritical !== "boolean") fail(errors, `${path}.safetyCritical`, "safetyCritical flag required.");
    if (!Array.isArray(criterion.questionIds) || !criterion.questionIds.length) {
      fail(errors, `${path}.questionIds`, "Link the criterion to at least one question.");
    } else {
      criterion.questionIds.forEach((id) => {
        if (!questionIds.has(id)) fail(errors, `${path}.questionIds`, `Unknown question id ${id}.`);
      });
    }
  });

  return { ok: errors.length === 0, errors };
}

const READING_TONES = new Set(["ops", "platform", "fix", "identity", "path", "vendor"]);

// Catalog for the Reading room. Articles may have an empty href until a Confluence URL is pasted in.
export function validateReadingCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return { ok: false, errors: [{ path: "$", message: "Reading catalog must be a JSON object." }] };
  }
  requireString(errors, "disclaimer", catalog.disclaimer, 20);
  if (!requireArray(errors, "collections", catalog.collections) || !requireArray(errors, "articles", catalog.articles)) {
    return { ok: false, errors };
  }
  if (!catalog.collections.length) fail(errors, "collections", "Provide at least one collection.");
  if (!catalog.articles.length) fail(errors, "articles", "Provide at least one article.");

  const collectionIds = new Set();
  catalog.collections.forEach((item, index) => {
    const path = `collections[${index}]`;
    requireString(errors, `${path}.id`, item?.id);
    if (item?.id) {
      if (collectionIds.has(item.id)) fail(errors, `${path}.id`, "Collection ids must be unique.");
      collectionIds.add(item.id);
    }
    requireString(errors, `${path}.title`, item?.title, 3);
    requireString(errors, `${path}.spine`, item?.spine);
    requireString(errors, `${path}.folio`, item?.folio);
    requireString(errors, `${path}.summary`, item?.summary, 12);
    if (!READING_TONES.has(item?.tone)) fail(errors, `${path}.tone`, "tone must be a known reading tone.");
  });

  const articleIds = new Set();
  catalog.articles.forEach((item, index) => {
    const path = `articles[${index}]`;
    requireString(errors, `${path}.id`, item?.id);
    if (item?.id) {
      if (articleIds.has(item.id)) fail(errors, `${path}.id`, "Article ids must be unique.");
      articleIds.add(item.id);
    }
    if (!collectionIds.has(item?.collectionId)) fail(errors, `${path}.collectionId`, "collectionId must match a collection.");
    requireString(errors, `${path}.title`, item?.title, 3);
    requireString(errors, `${path}.lede`, item?.lede, 12);
    requireString(errors, `${path}.source`, item?.source);
    requireString(errors, `${path}.sourceLabel`, item?.sourceLabel);
    if (typeof item?.minutes !== "number" || item.minutes < 1) {
      fail(errors, `${path}.minutes`, "minutes must be a number of at least 1.");
    }
    if (item?.href != null && typeof item.href !== "string") {
      fail(errors, `${path}.href`, "href must be a string. Leave it empty until the Confluence URL is known.");
    }
    if (item?.href && !/^https:\/\//i.test(item.href)) {
      fail(errors, `${path}.href`, "href must be empty or an https URL.");
    }
    if (Array.isArray(item?.spokeIds)) {
      item.spokeIds.forEach((spokeId, spokeIndex) => {
        if (!SPOKE_IDS.has(spokeId)) fail(errors, `${path}.spokeIds[${spokeIndex}]`, "spokeId must be one of the seven readiness spokes.");
      });
    }
    if (!requireArray(errors, `${path}.sections`, item?.sections)) return;
    if (!item.sections.length) fail(errors, `${path}.sections`, "Provide at least one section.");
    item.sections.forEach((section, sectionIndex) => {
      requireString(errors, `${path}.sections[${sectionIndex}].heading`, section?.heading);
      if (!requireArray(errors, `${path}.sections[${sectionIndex}].paragraphs`, section?.paragraphs)) return;
      if (!section.paragraphs.length) fail(errors, `${path}.sections[${sectionIndex}].paragraphs`, "Provide at least one paragraph.");
      section.paragraphs.forEach((paragraph, paragraphIndex) => {
        requireString(errors, `${path}.sections[${sectionIndex}].paragraphs[${paragraphIndex}]`, paragraph, 12);
      });
    });
  });

  return { ok: errors.length === 0, errors };
}

// Join path and message into one block of text for the import form.
export function formatValidationErrors(errors) {
  return errors.map((error) => `${error.path}: ${error.message}`).join("\n");
}
