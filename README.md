# Incident Lab

Practice tool for Virtual Desktop Infrastructure engineers on the Virtual Team.

Engineers work a SevA out-of-hours incident, write what they would do, and an assessor scores the write-up. Completing a scenario is practice, not a certificate.

Live site: https://blue-ocean-0ef426703.4.azurestaticapps.net

The site is static HTML, CSS, and JavaScript. Content is JSON. It does not connect to live Azure or ServiceNow.

---

## What each part does

| Area | Who uses it | What it is |
| --- | --- | --- |
| **Overview** | Engineer | Dashboard of in-progress work, scores, and Ready status |
| **SevA Scenarios** | Engineer, Assessor | Written assessments. One write-up per scenario. An assessor scores it 0–3 |
| **Incident Sandbox** | Engineer | Interactive ServiceNow-style tickets. Instant feedback out of 5. Not marked by an assessor and does not count on Ready |
| **Reading** | Everyone | Approved live pages (Confluence, SharePoint, ServiceNow, Azure, Microsoft Learn). The app does not copy wiki bodies |
| **Live Assistant** | Everyone | WIP. Type a short note; the page matches curated first-call steps and Reading articles. No live model |
| **Evidence** | Engineer | Redacted prior tickets that an assessor can score |
| **Readiness** | Engineer, Assessor | Hub-and-spoke map. Ready needs one satisfactory scenario per spoke |
| **Propose** | Engineer | Suggest a new scenario |
| **People / review** | Assessor | Score submitted write-ups and release feedback |
| **Access / criteria** | Administrator | Role access and on-call criteria |

The left nav splits **On Call** (Overview, Reading, SevA Scenarios, Evidence, Readiness) from **Incident** (Incident Sandbox, Live Assistant).

**Roles:** User (engineer), Assessor, Administrator. An administrator also sees the User and Assessor menus, plus Manage.

---

## Open it locally

Pages load JSON with `fetch`, so use a small web server. From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080 and hard-refresh after a change.

---

## Sign in

**Sign in with Microsoft** uses the ignitemyfire.co.uk tenant. Roles come from the Incident Lab app registration. There is no client secret.

Attempts stay in this browser. An assessor on another machine cannot see an engineer’s write-up unless they use the same browser profile.

For practice without Entra, choose **Local Practice Account Sign In**:

| Profile | Role |
| --- | --- |
| Engineer | User |
| Assessor (Senior Engineer) | Assessor |
| Site Administrator | Administrator |

---

## How a SevA scenario works

1. Open **SevA Scenarios** and pick a spoke.
2. Read the call, known impact, and mock ticket. Write one response covering the whole incident.
3. Submit. An assessor scores each criterion 0–3.
4. When they release feedback, the engineer sees it on Overview, Evidence, and Readiness.

| Score | Meaning |
| --- | --- |
| 0 | Not yet demonstrated |
| 1 | Developing |
| 2 | Demonstrated |
| 3 | Strongly demonstrated |

A blank answer is “not answered”, not a zero. Ready needs one released scenario per spoke at Demonstrated (2) or above. Workplace tickets cannot replace a spoke.

---

## Saved in this browser

Attempts, sandbox runs, Reading ticks, workplace tickets, and theme live in `localStorage` under `incident-lab:`. Reset demo data (administrator) clears practice records in this browser. It does not remove colleagues. Scenario files stay in the repo.

---

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page shell |
| `css/styles.css` | Layout and Lloyds black/green theme |
| `js/app.js` | Starts the app and handles `#/` routes |
| `js/views.js` | HTML for each screen |
| `js/render.js` | Sidebar, tickets, charts, readiness map |
| `js/content.js` | Loads config, scenarios, Reading, sandbox, and assistant JSON |
| `js/assistant.js` | Matches a note to curated steps and Reading articles |
| `js/auth.js` | Microsoft sign-in |
| `js/scoring.js` | 0–3 scores and Ready |
| `js/sandbox.js` | Sandbox 0–5 feedback |
| `js/storage.js` | This browser’s saved data |
| `js/validation.js` | Checks scenario and catalog JSON |
| `data/config.json` | App name, Entra ids, spokes, list of scenario files |
| `data/reading.json` | Reading shelves and links. Live Assistant also offers these pages |
| `data/assistant/knowledge.json` | Live Assistant topics, synonyms, and Reading pins |
| `data/sandbox.json` | Practice ServiceNow tickets |
| `data/scenarios/` | SevA scenario files |
| `staticwebapp.config.json` | Azure Static Web Apps routing |
| `assets/lloyds-horse.svg` | Sidebar horse |

`?v=` on `index.html` and script imports avoids a stale cached copy after a publish.

Publishing the live site is a Static Web Apps upload. A `git push` does not update the live site by itself.

---

## Add a SevA scenario

1. Copy `data/scenarios/_template.json` to a new file. Do not add `_template.json` itself to the library.
2. Set a unique `id`, `spokeId`, and the next `spokeNumber` for that spoke. `title` is the spoke name plus that number (`AVD Infrastructure 2`).
3. Rewrite the call, facts, mock ticket, impact, one written prompt (`q1`), and scoring criteria. Facts are what they would hear on the first call.
4. Add the file path to `bundledScenarioFiles` in `data/config.json`.
5. Serve locally, hard-refresh, then publish the live site when it looks right.

Spoke ids: `avd-infrastructure`, `networking`, `trm-escalation-ops`, `proxy-solution`, `vendor-management`, `platform-troubleshooting`, `m365-stack`.

Do not add scenarios only in the browser. The live library is the files in the repo.

---

## Add Live Assistant topics

The assistant is retrieval only. It repeats steps you write and opens Reading pages. It does not call a model.

**New wiki / knowledge-base page**

1. Add the article to `data/reading.json` (`id`, `title`, `lede`, `spokeIds`, `https` links).
2. Publish. The assistant can match on title and lede by itself.
3. If a topic should always offer that page, add the article `id` to `relatedReadingIds` on the topic.

**New first-call steps**

1. Open `data/assistant/knowledge.json`. The `authoring` object is the field list and a `topicTemplate`.
2. Copy the template into `topics`. Keep `id` unique.
3. `signals` are phrases a colleague might type (`paa`, `cannot sign in`).
4. `steps` are first-call checks only. Do not invent portal clicks, az commands, or vendor SLAs.
5. Pin Reading ids in `relatedReadingIds`.
6. Add spellings under `synonyms` when brief notes would otherwise miss.

Serve locally, hard-refresh, then publish. Bump the `?v=` cache query on the next deploy.
