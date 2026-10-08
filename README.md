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
| **Evidence** | Engineer | Redacted prior tickets that an assessor can score |
| **Readiness** | Engineer, Assessor | Hub-and-spoke map. Ready needs one satisfactory scenario per spoke |
| **Propose** | Engineer | Suggest a new scenario |
| **Create Scenario** | Administrator | Author a scenario in this browser, then download JSON for the shared library |
| **People / review** | Assessor | Score submitted write-ups and release feedback |
| **Access / criteria** | Administrator | Role access and on-call criteria |

**Roles:** User (engineer), Assessor, Administrator.

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

For practice without Entra, choose **Practice on this browser**:

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

Attempts, sandbox runs, Reading ticks, workplace tickets, imported scenarios, and theme live in `localStorage` under `incident-lab:`. Reset demo data (administrator) clears practice records in this browser. It does not remove colleagues.

---

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page shell |
| `css/styles.css` | Layout and Lloyds black/green theme |
| `js/app.js` | Starts the app and handles `#/` routes |
| `js/views.js` | HTML for each screen |
| `js/render.js` | Sidebar, tickets, charts, readiness map |
| `js/content.js` | Loads config, scenarios, Reading, and sandbox JSON |
| `js/auth.js` | Microsoft sign-in |
| `js/scoring.js` | 0–3 scores and Ready |
| `js/sandbox.js` | Sandbox 0–5 feedback |
| `js/storage.js` | This browser’s saved data |
| `js/validation.js` | Checks scenario and catalog JSON |
| `data/config.json` | App name, Entra ids, spokes, list of scenario files |
| `data/reading.json` | Reading shelves and links |
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

The Create Scenario form only saves in this browser until that JSON file is in `data/scenarios/` and listed in `config.json`.
