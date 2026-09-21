# Incident Lab

Incident Lab is a practice tool for Virtual Desktop Service engineers. They work through a fictional Sev1 out-of-hours incident, write what they would do, and an assessor reads the answers.

It does not connect to Azure, ServiceNow, or a live incident. The sample tickets and runbooks are for practice. Completing a scenario is not a certificate, and there is no leaderboard.

## Open it

The pages load JSON with `fetch`, so use a small web server. From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080

## Sign in

Pick a name. There is no password. **Sign out** is in the header.

| Person | Access | What they do |
| --- | --- | --- |
| Alex Chen | User | Takes scenarios and reads their own released feedback |
| Jordan Blake | Assessor | Scores answers and releases feedback |
| Sam Rivera | Administrator | Publishes scenarios and adds or removes colleagues |

An administrator assigns one role per person on **Access**. The last administrator cannot be removed.

This list lives in the browser only. A shared version should sign people in with Microsoft Entra ID and store attempts in a database. The browser must not keep a password.

## A practice attempt

1. Sign in as Alex and open a required scenario.
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

The dashboard chart shows capability areas that are still below Demonstrated, for that person only.

## Where to look in the code

Each script starts with a short note, and each function has a comment above it.

| File | What it does |
| --- | --- |
| `index.html` | The page shell. The theme is applied before the CSS loads. |
| `css/styles.css` | Colours, the green header and footer, and the hover on clickable items. |
| `js/app.js` | Starts the app, reads the address after `#/`, and saves work. |
| `js/views.js` | The HTML for each screen. |
| `js/render.js` | The header, footer, pills, evidence, and charts. |
| `js/storage.js` | Reads and writes this browser's saved data. |
| `js/content.js` | Loads `data/config.json` and the scenario files. |
| `js/scoring.js` | Turns answers and a review into scores and charts. |
| `js/validation.js` | Checks scenario JSON before it is published. |
| `js/util.js` | Small helpers: safe HTML, dates, ids, and navigation. |
| `js/tests.js` | Checks run from Administrator → Verification. |
| `data/scenarios/` | The three practice incidents. |

Scenario files are JSON, so they cannot contain comments. A question asks for a written answer. `assessorGuidance` is what the reviewer sees, not the engineer. `scoringCriteria` links each 0–3 score to one or more questions.

An attempt keeps a copy of the scenario version it started with. Later edits do not rewrite that copy.

## Saved in this browser

Attempts, the colleague list, the signed-in person, and the light or dark choice stay in local storage. Reset demo data, on the administrator scenario page, clears attempts and imported scenarios. It does not remove colleagues.
