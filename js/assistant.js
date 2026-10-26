// Retrieval-only Live Assistant. It scores a short note against curated
// topics and the Reading catalog. It never invents a step or a wiki page.

import { articleIsWip, articleLinks, readingArticles, findReadingCollection, findReadingArticle } from "./content.js?v=82";

export const TOPIC_SCORE_MIN = 2;
export const ARTICLE_SCORE_MIN = 2;
export const MAX_ARTICLES = 1;
export const MAX_QUESTIONS = 2;

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it",
  "this", "that", "with", "at", "as", "be", "i", "we", "my", "our", "can",
  "not", "no", "please", "help", "need", "user", "users", "someone", "issue",
  "problem", "having", "got", "get", "me", "do", "how", "what", "when",
  "about", "from", "they", "them", "their", "any", "just", "also",
  "guide", "resources", "overview", "documentation", "support", "process",
  "information", "useful", "additional", "official", "handbook", "engagement",
  "page", "pages", "live"
]);

const STRONG = new Set([
  "rota", "paa", "tsa", "prisma", "critsit", "workbook", "workbooks",
  "escalation", "palo", "microsoft", "outlook", "onedrive", "teams",
  "mailbox", "proxy", "msh"
]);

const INTENT_TERMS = {
  comms: ["comms", "work note", "customer visible", "stakeholder", "bridge", "tell the business", "first update", "what do i say"],
  lookup: ["where", "rota", "link", "page", "document", "guide", "who is", "who's"],
  troubleshoot: ["error", "fail", "down", "slow", "cannot", "can't", "unable", "signin", "login", "connect", "broken"]
};

function escapeRe(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9+./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function expandQuery(text, synonyms = {}) {
  let hay = ` ${normalizeText(text)} `;
  Object.entries(synonyms).forEach(([canonical, aliases]) => {
    const terms = [canonical, ...(aliases || [])].map(normalizeText).filter(Boolean);
    if (terms.some((term) => hay.includes(` ${term} `))) {
      terms.forEach((term) => {
        if (!hay.includes(` ${term} `)) hay += `${term} `;
      });
    }
  });
  return hay.replace(/\s+/g, " ").trim();
}

export function phraseIn(hay, phrase) {
  const needle = normalizeText(phrase);
  if (!needle) return false;
  if (needle.includes(" ")) return ` ${hay} `.includes(` ${needle} `);
  return new RegExp(`(?:^|\\s)${escapeRe(needle)}(?:\\s|$)`).test(hay);
}

function significantTokens(text) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP.has(token));
}

export function detectIntent(hay) {
  const hits = Object.entries(INTENT_TERMS).map(([intent, terms]) => ({
    intent,
    count: terms.filter((term) => phraseIn(hay, term)).length
  }));
  hits.sort((a, b) => b.count - a.count);
  if (hits[0].count && hits[0].count > (hits[1]?.count || 0)) return hits[0].intent;
  return "troubleshoot";
}

export function queryIsThin(hay) {
  const tokens = significantTokens(hay);
  if (!tokens.length) return true;
  if (tokens.length === 1 && !STRONG.has(tokens[0])) return true;
  return false;
}

export function rankTopics(knowledge, hay, intent) {
  return (knowledge?.topics || []).map((topic) => {
    let score = 0;
    const hits = [];
    (topic.signals || []).forEach((signal) => {
      if (phraseIn(hay, signal)) {
        score += String(signal).includes(" ") ? 3 : 2;
        hits.push(signal);
      }
    });
    significantTokens(topic.title).forEach((token) => {
      if (phraseIn(hay, token)) score += 0.5;
    });
    if (intent && intent === topic.kind) score += 1;
    return { id: topic.id, topic, score, hits };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function scoreArticle(article, collection, hay, intent, topSpokes) {
  if (articleIsWip(article) || !articleLinks(article).length) return null;
  let score = 0;
  const hits = [];
  significantTokens(article.title).forEach((token) => {
    if (phraseIn(hay, token)) {
      score += 1.2;
      hits.push(token);
    }
  });
  significantTokens(article.lede).forEach((token) => {
    if (phraseIn(hay, token)) score += 0.35;
  });
  if (collection?.title && phraseIn(hay, collection.title)) score += 0.6;
  if (intent === "troubleshoot" && collection?.id === "troubleshooting") score += 1.2;
  if (intent === "lookup" && (collection?.id === "on-call" || collection?.id === "vendors")) score += 0.8;
  if (intent === "comms" && collection?.id === "on-call") score += 0.6;
  if ((topSpokes || []).some((spokeId) => (article.spokeIds || []).includes(spokeId))) score += 1.2;
  return { id: article.id, article, collection, score, hits };
}

export function rankArticles(reading, hay, intent, topSpokes = []) {
  return readingArticles(reading)
    .map((article) => scoreArticle(article, findReadingCollection(reading, article.collectionId), hay, intent, topSpokes))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function liveArticleRow(id, reading, hay, intent, topSpokes) {
  const article = findReadingArticle(reading, id);
  if (!article || articleIsWip(article) || !articleLinks(article).length) return null;
  const collection = findReadingCollection(reading, article.collectionId);
  return scoreArticle(article, collection, hay, intent, topSpokes) || {
    id,
    article,
    collection,
    score: 0,
    hits: []
  };
}

function pickBestArticle(rows, fallback) {
  const live = (rows || []).filter(Boolean);
  if (!live.length) return fallback ? [fallback] : [];
  const ranked = live.slice().sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = ranked[0].score > 0 ? ranked[0] : (fallback || ranked[0]);
  return best ? [best] : [];
}

function pickPinnedArticle(pinnedIds, reading, hay, intent, topSpokes) {
  const rows = (pinnedIds || []).map((id) => liveArticleRow(id, reading, hay, intent, topSpokes));
  const firstLive = rows.find(Boolean);
  return pickBestArticle(rows, firstLive);
}

export function preferredArticleLinks(article, hay, limit = 1) {
  const links = articleLinks(article);
  if (links.length <= 1) return links;
  const scored = links.map((link) => {
    let score = 0;
    significantTokens(link.label).forEach((token) => {
      if (phraseIn(hay, token)) score += 1.5;
    });
    return { label: link.label, href: link.href, score };
  }).sort((a, b) => b.score - a.score);
  if (scored[0].score > 0) {
    return scored.filter((link) => link.score > 0).slice(0, limit).map(({ label, href }) => ({ label, href }));
  }
  return [{ label: links[0].label, href: links[0].href }];
}

function pickQuestions(topicRows, hay) {
  const asked = [];
  topicRows.forEach((row) => {
    (row.topic.clarify || []).forEach((question) => {
      if (asked.length >= MAX_QUESTIONS) return;
      if (!asked.includes(question)) asked.push(question);
    });
  });
  if (!asked.length && !phraseIn(hay, "personal") && !phraseIn(hay, "msh") && !phraseIn(hay, "multi-session")) {
    asked.push("Is this a personal desktop or multi-session?");
  }
  if (!asked.length) asked.push("What exact error or page are you looking at?");
  return asked.slice(0, MAX_QUESTIONS);
}

function summariseTopic(row) {
  return {
    id: row.topic.id,
    title: row.topic.title,
    kind: row.topic.kind,
    score: row.score,
    hits: row.hits
  };
}

function summariseArticle(row) {
  return {
    id: row.article.id,
    title: row.article.title,
    lede: row.article.lede,
    collectionId: row.article.collectionId,
    collectionTitle: row.collection?.title || "",
    score: row.score
  };
}

export function buildHaystack(knowledge, notes) {
  return expandQuery((notes || []).filter(Boolean).join(" "), knowledge?.synonyms || {});
}

export function answerNote(knowledge, reading, note, priorNotes = []) {
  const raw = String(note || "").trim();
  const latestHay = expandQuery(raw, knowledge?.synonyms || {});
  const thin = queryIsThin(latestHay);
  const hay = thin ? buildHaystack(knowledge, [...priorNotes, raw]) : latestHay;
  const intent = detectIntent(hay);
  const topicRows = rankTopics(knowledge, hay, intent);
  const bestTopic = topicRows[0];
  const topicOk = Boolean(bestTopic && bestTopic.score >= TOPIC_SCORE_MIN && !thin);
  const matchedTopic = topicOk ? bestTopic : null;
  const topSpokes = matchedTopic?.topic.spokeIds || [];
  const articleRows = rankArticles(reading, hay, intent, topSpokes);
  const pinned = matchedTopic?.topic.relatedReadingIds || [];
  const articles = topicOk
    ? pickPinnedArticle(pinned, reading, hay, intent, topSpokes)
    : pickBestArticle(articleRows.filter((row) => row.score >= ARTICLE_SCORE_MIN));
  const articleOnly = !topicOk && articles.length && !thin;

  if (!topicOk && !articleOnly) {
    const hintTopics = topicRows.filter((row) => row.score > 0).slice(0, 2);
    return {
      mode: "clarify",
      confidence: "low",
      intent,
      queryHay: hay,
      intro: thin
        ? "That note is a bit thin. Add the pool type, the error, or the page you need, or tap a question below."
        : "I do not have a confident match yet. A few more words will keep the answer on a real topic instead of a guess.",
      topic: null,
      steps: [],
      comms: [],
      articles: [],
      questions: pickQuestions(hintTopics.length ? hintTopics : topicRows.slice(0, 2), hay),
      matchedSignals: hintTopics.flatMap((row) => row.hits),
      disclaimer: knowledge?.disclaimer || ""
    };
  }

  if (articleOnly) {
    return {
      mode: "articles",
      confidence: "medium",
      intent,
      queryHay: hay,
      intro: "No step list is a strong match, so here is the approved page that fits the note.",
      topic: null,
      steps: [],
      comms: [],
      articles: articles.map(summariseArticle),
      questions: [],
      matchedSignals: articles.flatMap((row) => row.hits || []),
      disclaimer: knowledge?.disclaimer || ""
    };
  }

  return {
    mode: "answer",
    confidence: matchedTopic.score >= 6 ? "high" : "medium",
    intent,
    queryHay: hay,
    intro: `Matched “${matchedTopic.topic.title}” from the curated list.`,
    topic: summariseTopic(matchedTopic),
    steps: [...(matchedTopic.topic.steps || [])],
    comms: [...(matchedTopic.topic.comms || [])],
    articles: articles.map(summariseArticle),
    questions: [],
    matchedSignals: matchedTopic.hits,
    disclaimer: knowledge?.disclaimer || ""
  };
}
