# Incident Lab

Incident Lab is a practice tool for Virtual Desktop Infrastructure engineers. They work through a fictional SevA out-of-hours incident, write what they would do, and an assessor reads the answers.

It does not connect to Azure, ServiceNow, or a live incident. The sample tickets and runbooks are for practice. Completing a scenario is not a certificate, and there is no leaderboard.

The live site is https://blue-ocean-0ef426703.4.azurestaticapps.net (Azure Static Web Apps, Free). GitHub holds the source. Publishing the website is a separate Static Web Apps upload; a `git push` does not update the live site by itself.

## Open it locally

The pages load JSON with `fetch`, so use a small web server. From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080

Microsoft sign-in is registered for that origin and for the live Static Web App URL. After a local change, hard-refresh so the `?v=` cache-bust on `index.html` picks up new CSS and JS.

## Sign in

The left sidebar holds search, role navigation, and the account block (theme, Sign in with Microsoft, Sign out).

**Sign in with Microsoft** uses the ignitemyfire.co.uk tenant. Roles come from the Incident Lab app registration (`User`, `Assessor`, `Administrator`). The browser uses MSAL with PKCE. There is no client secret, and the app does not call Microsoft Graph.

Attempts still live in this browser. A shared Incident Lab would store them in a database and check the token on a server.

For practice without Entra, open **Practice on this browser** and pick a name:

| Person | Access | What they do |
| --- | --- | --- |
| Alex Chen | User | Takes scenarios and reads their own released feedback |
| Jordan Blake | Assessor | Scores answers and releases feedback |
| Sam Rivera | Administrator | Publishes scenarios and adds or removes colleagues |

A local practice session is labelled **Local** in the sidebar. Sign in with Microsoft stays available until the session comes from Entra.

## Layout and theme

The shell is a dashboard: Lloyds horse on a white tile, **Virtual Team / Incident Lab**, Grove green on carbon black (dark) or a pale canvas (light). The sun/moon control is **Light mode** / **Dark mode** under the signed-in name.

Users see Overview, Library, Readiness, and Propose. Assessors see the review queue. Administrators see scenario management, proposals, criteria, access, and verification.

## A practice attempt

1. Sign in as Alex and open a required scenario from the library.
2. Each question is a text box. Cover what you would check, who you would involve, and what you would not change.
3. Submit. Sign out, then sign in as Jordan and score each criterion from 0 to 3 beside the answer.
4. Release the feedback. Sign in as Alex again. The feedback quotes what was written next to how it was read.

Scores:

| Score | Meaning |
| --- | --- |
| 0 | Not yet demonstrated |
| 1 | Developing |
| 2 | Demonstrated |
| 3 | Strongly demonstrated |

A blank answer is "not answered". It is not a zero. Written answers are not marked by keyword matching.

Tests can be resat once an assessor has reviewed the previous attempt. Each attempt is stored separately.

## Dashboard and readiness

The user Overview is KPI cards (in progress, awaiting review, released feedback, capability average), a line chart of released domain scores, a coverage donut, and recent activity.

Readiness is a hub-and-spoke map. You sit in the middle. Each capability is one spoke. Gaps pulse. Hover or click a node for the score and what is missing. This is not a certificate — an assessor still makes the recommendation.

The seven capability areas are listed in `data/config.json`:

| Spoke | What it covers |
| --- | --- |
| AVD Infrastructure | Host pools, session hosts, gateways, control plane |
| Networking | DNS, routing, firewalls, name resolution |
| TRM, Escalation & Ops | TRM, MIM, OOH process, updates, handover |
| Proxy Solution | Secure Access / Prisma, inspection, connectors |
| Vendor Management | Microsoft and other vendor cases, evidence to prepare |
| Platform Troubleshooting | Impact, runbooks, evidence before platform changes |
| M365 Stack | Entra ID, Conditional Access, other M365 dependencies |

A spoke with no released score is incomplete evidence, not a pass.

## Where to look in the code

Each script starts with a short note, and each function has a comment above it.

| File | What it does |
| --- | --- |
| `index.html` | The page shell. The theme is applied before CSS loads. `?v=` avoids a stale cached copy. |
| `css/styles.css` | Dashboard layout, Lloyds black and green, light and dark tokens. |
| `js/app.js` | Starts the app, reads the address after `#/`, and saves work. |
| `js/auth.js` | Microsoft Entra sign-in for ignitemyfire.co.uk. |
| `js/views.js` | The HTML for each screen. |
| `js/render.js` | Sidebar chrome, pills, evidence, KPI cards, charts, and the readiness map. |
| `js/storage.js` | Reads and writes this browser's saved data. |
| `js/content.js` | Loads `data/config.json` and the scenario files. |
| `js/scoring.js` | Turns answers and a review into scores and charts. |
| `js/validation.js` | Checks scenario JSON before it is published. |
| `js/util.js` | Small helpers: safe HTML, dates, ids, and navigation. |
| `js/tests.js` | Checks run from Administrator → Verification. |
| `js/vendor/msal-browser.min.js` | MSAL browser library. Do not edit. |
| `data/config.json` | App name, Entra ids, capability domains, demo people, bundled scenario paths. |
| `data/scenarios/` | The three practice incidents. |
| `staticwebapp.config.json` | Fallback so hash routes still serve `index.html` on Azure Static Web Apps. |
| `assets/lloyds-horse.svg` | The horse in the sidebar. |

Scenario files are JSON, so they cannot contain comments. A question asks for a written answer. `assessorGuidance` is what the reviewer sees, not the engineer. `scoringCriteria` links each 0–3 score to one or more questions and to a `domainId` from `capabilityDomains`.

An attempt keeps a copy of the scenario version it started with. Later edits do not rewrite that copy.

## Saved in this browser

Attempts, the colleague list, the signed-in person, and the light or dark choice stay in local storage under `incident-lab:`. Reset demo data, on the administrator scenario page, clears attempts and imported scenarios. It does not remove colleagues.
