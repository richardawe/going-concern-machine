# Going Concern Modules (university edition) · prototype

CEO mode rebuilt for courses. Students work through **modules**, type their understanding throughout, and hand in once. The lecturer receives every hand-in, and the student uploads the same PDF to Canvas.

Open it at `#/course` (for example `https://<user>.github.io/going-concern-machine/#/course`). The lecturer page is `#/course/lecturer`.

## A module

Briefing → **8 concepts** → **5 decisions** → debrief → **end-of-module check** → complete. About 45 minutes.

| Step | What the student does | Typed minimum |
| --- | --- | --- |
| Concepts | Explores each concept on the module's figure, then explains it in their own words | 40 words each |
| Decisions | Five annual decisions on the CEO-mode engine (`src/ceo`), each with a reason | 25 words each |
| Debrief | Sees the outcome and judgement grades, three futures, attribution and lessons, then reflects | 40 words |
| Check | 3 multiple-choice questions (instant feedback) and 4 typed answers (model answer shown after checking). One is built from the student's own year-1 decision | 60 words each |

That is 18 typed responses per module. Pasting is allowed but **flagged** in the PDF and on the lecturer page.

**Module 1, The Price War**, is complete. Its figure is an Anatomy-style isometric *margin gearbox* (`src/course/ui/MarginGearbox.tsx`): a price lever drives a flywheel (gross profit), which fills a cash tank that fixed overheads drain. Modules 2–6 are listed with the 8 concepts each will cover, and open once their content and figures are written. Content lives in `src/course/modules.ts`.

## Hand-in: GitHub Issues and Actions, for now

```
Browser: seal (gzip, then AES-GCM, with the key wrapped by RSA-OAEP)
  → GitHub issue form (.github/ISSUE_TEMPLATE/submission.yml)
  → Action .github/workflows/course-intake.yml (scripts/course-intake.ts)
      opens it with the SUBMISSION_PRIVATE_KEY secret, validates every field, replays the decisions,
      replies with a receipt and verification code, labels the issue (received or invalid) and closes it
  → Lecturer page (#/course/lecturer): loads the hand-in issues, opens them with the private key file
      in the browser, and rebuilds each student's PDF
```

- The repository is public, so issues are public. A hand-in issue shows only the sealed code and the student's GitHub username. The bot's reply carries no name, ID or grade.
- Grades are never sent. They are recomputed from the decisions wherever a hand-in is read: in the browser, in the Action and on the lecturer page.
- The **verification code** (`GCM-XXXX-XXXX-XXXX`) is a SHA-256 fingerprint of the submission. The student's PDF and the lecturer's rebuilt PDF are byte-for-byte identical (checked by `tests/course-browser.mjs`).
- Students need a GitHub account. The final version replaces the issue and the Action with a server endpoint that accepts the same sealed payload (`src/course/payload.ts`), so the rest stays as it is.

### Setup (once)

1. `npm run course:keygen` writes the public key to `public/course/submission-key.json` (commit it) and the private key to `course-private-key.json` (git ignores it).
2. In the repository, go to **Settings → Secrets and variables → Actions → New repository secret**, and add `SUBMISSION_PRIVATE_KEY` with the contents of the private key file.
3. Give the private key file to the lecturer, who loads it on `#/course/lecturer`. It never leaves their browser.

Without the secret, hand-ins are still kept as issues, and the bot replies "Saved, not yet checked". Codes sealed with an older key need that older private key to open them.

### Known limits of the prototype

- Grades depend on the industry archetypes, which are rebuilt from the published SEC datasets. If the data refreshes between hand-in and marking, a replayed grade can shift slightly. The verification code does not change, because it covers only the student's answers and decisions.
- The lecturer page reads issues through GitHub's public API without signing in, which allows 60 requests an hour per network (100 hand-ins per request). Pasting codes works without the API.
- One pilot course (`?c=pilot`) is defined in `src/course/modules.ts`.

## Code

| Path | What it does |
| --- | --- |
| `src/course/modules.ts` | Courses and module content: concepts, check questions, planned modules |
| `src/course/seal.ts` | Sealing and opening (Web Crypto; the same code runs in the browser, tests and the Action) |
| `src/course/payload.ts` | Building, validating and fingerprinting a hand-in |
| `src/course/grade.ts`, `grade.worker.ts` | Replaying decisions into outcome and judgement grades |
| `src/course/pdf.ts` | The submission PDF (pdf-lib) |
| `src/course/ui/` | Course app: home, module runner, figure, hand-in, lecturer |
| `scripts/course-intake.ts`, `scripts/course-keygen.ts` | The intake Action's script and key generation |
| `tests/course.test.ts`, `tests/course-browser.mjs` | Unit tests, and the full student and lecturer flow in a browser |
