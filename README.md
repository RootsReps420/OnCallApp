# Incident Lab

Incident Lab is a supportive assessment and development tool for engineers who support the **Virtual Desktop Service (VDS)**, including Azure Virtual Desktop (AVD).

It is a scenario-based practice application, not a live infrastructure simulator, a full training course, or a certification engine. There are no leaderboards, colleague comparisons, countdown timers, or automatic pass/fail certificates.

Engineers work through preset Sev1 out-of-hours incidents, explain their approach, and receive constructive feedback. Assessors review written answers against a rubric and make a human readiness recommendation:

- Ready
- Ready with development areas
- Not yet ready

**Independently** means confidently managing the initial response and using the established support model. Involving Microsoft, Major Incident Management, senior engineers, and internal teams at the right time is part of a strong response.

## How to run

This is a static HTML/CSS/JavaScript app. Scenario JSON is loaded with `fetch`, so open it through a local web server rather than a `file://` URL.

From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080

Alternatively:

```bash
npx --yes serve -l 8080
```

No build step, package install, paid service, live Azure access, ServiceNow connection, or external AI API is required.

## Sign-in and access

Colleagues sign in by choosing their name. That session is stored in this browser and stands in for **Microsoft Entra ID**, which is the right sign-in for a shared Incident Lab: the bank already issues the account, and the app should not keep a separate password.

**Sign out** is in the header. It ends the session on this browser and leaves saved attempts in place.

Access is assigned by an administrator under **Access**. A colleague has one role:

| Access | Who | What they can do |
| --- | --- | --- |
| User | The engineer practising, such as Alex Chen | Own dashboard, library, attempts, proposals, and released feedback |
| Assessor | The reviewer, such as Jordan Blake | Review queue, rubric, and releasing feedback |
| Administrator | Enablement, such as Sam Rivera | Scenarios, proposals, readiness criteria, verification, and the colleague directory |

An administrator adds a colleague, changes their access, or removes them. The directory must keep at least one administrator. Removing someone does not delete attempts already stored in this browser.

Users cannot open the review queue, scenario management, or another colleague's attempt. Assessors cannot publish scenarios or edit the directory. This is still enforced only in the page the browser renders. A production service has to check the same rules on the server, using Entra groups or app roles rather than a list in local storage.

**Reset demo data** is on the administrator Scenario management page. It clears attempts and scenarios stored in this browser. It does not remove the colleague directory.

## Try the MVP path

1. Sign in as **Alex Chen** (User). Open a required scenario, start it, answer questions (progress saves automatically), review, and submit.
2. Sign out, then sign in as **Jordan Blake** (Assessor). Open the review queue, score written criteria (0–3), explain any change to an automated score, add development actions, choose a recommendation, and release.
3. Sign out, then sign in as **Alex Chen** again. Open released feedback and the readiness summary.
4. Sign in as **Sam Rivera** (Administrator) to import JSON, manage access, or run **Verification**.

Retries create a **new attempt**. The previous attempt, including its scenario version snapshot, is kept.

## Adding scenarios

Scenarios are JSON documents. Three published samples live in `data/scenarios/`:

- `avd-connection-failures.json` — widespread AVD connection failures and a possible Microsoft dependency
- `app-access-failures.json` — applications unreachable from working desktops (DNS / network / Secure Access / firewall)
- `auth-failures.json` — authentication failures for a defined user group (identity or assignment)

To add another scenario:

1. Copy a sample file or start from the administrator **Import or create JSON** template.
2. Give it a stable `id` and a `version`.
3. Keep `status` as `draft` until it should appear in the engineer library.
4. Include 6–8 questions if it is a full assessment (the validator allows 4–12).
5. Use `type: "written"` and put what a strong answer should cover in `assessorGuidance`. Engineers see a text box, not an option list. The validator still accepts `single` and `multiple` for older imports.
6. Link `scoringCriteria` to question ids. Set `mandatory` and `safetyCritical` flags deliberately.
7. Keep the `illustrativeDisclaimer`. Do not present sample runbooks or escalation routes as approved operational procedure.
8. In the app, open **Administrator → Import or create JSON**, paste or upload the file, validate, then publish.

Imported scenarios override bundled ones with the same `id` in this browser only. Export or copy JSON back into `data/scenarios/` if you want it in source control.

Each submitted attempt stores a **snapshot** of the scenario version used, so later edits do not rewrite historical evidence.

### Useful scenario fields

- `initialIncident.callSummary`, `serviceNow`, `impact`
- `evidence[]` with `revealAfterQuestionIndex` for staged reveal
- `questions[]` of type `single`, `multiple`, or `written`
- `documentationReferences[]`
- `acceptableAlternativeApproaches` and `assessorGuidance`
- `scoringCriteria[]` with `domainId` values from `data/config.json`

The three shipped scenarios ask for a written answer on every question. An assessor scores those answers on the 0–3 scale. Choice questions can still be imported, and those use configured option credits rather than keyword matching.

## Scoring model

Criterion scale:

| Score | Meaning |
| --- | --- |
| 0 | Not yet demonstrated |
| 1 | Developing |
| 2 | Demonstrated |
| 3 | Strongly demonstrated |

Unanswered and unreviewed criteria are shown separately from zero.

Objective scores come from configured option credits (summed and clamped for multiple choice, including required-option caps). Domain percentages use **reviewed or auto-scored criteria only** ÷ their maximum. A high average does not hide an unmet mandatory criterion.

A human assessor still makes the final readiness recommendation. Completing scenarios is not readiness.

## Capability domains

1. Incident assessment and customer impact
2. Incident management process
3. Microsoft engagement
4. Azure and AVD technical understanding and investigation
5. Networking and dependency troubleshooting
6. Documentation and runbook usage
7. Escalation and support model awareness
8. Communication and stakeholder updates

Technical questions favour investigation order, evidence interpretation, and safe decisions over obscure recall. Using documentation and asking for help is rewarded.

## Project structure

```
index.html
css/styles.css
js/util.js          rendering helpers
js/validation.js    scenario JSON validation
js/scoring.js       credit, criteria, domain coverage, readiness hints
js/storage.js       local persistence
js/content.js       loads config and scenarios
js/render.js        shared layout and components
js/views.js         page templates
js/app.js           routing and actions
js/tests.js         scoring and persistence checks
data/config.json
data/scenarios/*.json
```

## Prototype limitations

This prototype is **single-browser**. Production deployment needs:

- a backend and shared database
- real authentication with Microsoft Entra ID
- server-enforced permissions (this browser can hide a page, but it cannot protect assessor guidance or other colleagues' data)
- retention, audit, and access controls appropriate to assessment records

The app keeps assessment answers and review records in local storage only. There is no click tracking or behavioural surveillance.

## Assumptions and content to validate

The following are **illustrative** and must be validated against approved operational sources before any operational use:

- ServiceNow ticket layouts, assignment groups, and priority names
- Host pool names, runbook titles, and diagnostic queries
- Escalation routes to MIM, Microsoft, Identity, and network teams
- Secure Access / Prisma / firewall change processes
- Conditional Access policy names and authentication-strength wording
- What “ready for the Sev1 OOH rota” means in a specific organisation

This application does not invent bank-specific policy. Sample Microsoft error codes and Azure portal labels are teaching devices, not a live tenant.

## Verification

Administrator → **Verification** runs in-browser checks for:

- configured objective scoring and partial credit
- unanswered ≠ zero
- written answers remaining pending
- domain percentages ignoring pending criteria
- mandatory gaps remaining visible beside a high average
- JSON validation
- attempt persistence and scenario version retention

## Accessibility and design

The UI is a calm internal-tools layout with skip link, labelled inputs, visible focus, keyboard-operable question navigation, and evidence panels in readable contrast. Validation messages appear on incomplete JSON and missing adjustment explanations.
