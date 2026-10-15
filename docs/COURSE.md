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
Browser: packs the submission into one code (GCM0: gzip + base64url, NOT encrypted)
  → GitHub issue form (.github/ISSUE_TEMPLATE/submission.yml)
  → Action .github/workflows/course-intake.yml (scripts/course-intake.ts)
      validates every field, replays the decisions, replies with a receipt and verification code,
      labels the issue (received or invalid) and closes it
  → Lecturer page (#/course/lecturer): reads the hand-in issues from GitHub as soon as it opens,
      lists every student, and rebuilds each student's PDF
```

- **Prototype only: hand-ins are not encrypted.** All pilot data is fictional, so anyone who opens a hand-in issue can read it. This keeps the demo to one step: a student hands in and the work appears on the lecturer page, with no key to manage.
- Grades are never sent. They are recomputed from the decisions wherever a hand-in is read: in the browser, in the Action and on the lecturer page.
- The **verification code** (`GCM-XXXX-XXXX-XXXX`) is a SHA-256 fingerprint of the submission. The student's PDF and the lecturer's rebuilt PDF are byte-for-byte identical (checked by `tests/course-browser.mjs`).
- Students need a GitHub account. The real version replaces the issue and the Action with a server endpoint and university sign-in.

### Encryption, for later

`src/course/seal.ts` also implements an encrypted format (GCM1: gzip, then AES-GCM, with the key wrapped by RSA-OAEP), and every reader still accepts it. `npm run course:keygen` makes the key pair; the intake Action opens GCM1 codes with the `SUBMISSION_PRIVATE_KEY` secret, and the lecturer page opens them only if the key is remembered on that device. Switch the hand-in page back to `seal()` when real student data is involved.

### Known limits of the prototype

- Grades depend on the industry archetypes, which are rebuilt from the published SEC datasets. If the data refreshes between hand-in and marking, a replayed grade can shift slightly. The verification code does not change, because it covers only the student's answers and decisions.
- The lecturer page reads issues through GitHub's public API without signing in, which allows 60 requests an hour per network (100 hand-ins per request). Pasting codes works without the API.
- One pilot course (`?c=pilot`) is defined in `src/course/modules.ts`.

## Code

| Path | What it does |
| --- | --- |
| `src/course/modules.ts` | Courses and module content: concepts, check questions, planned modules |
| `src/course/seal.ts` | Hand-in codes: the prototype's packed format and the encrypted format for later (the same code runs in the browser, tests and the Action) |
| `src/course/payload.ts` | Building, validating and fingerprinting a hand-in |
| `src/course/grade.ts`, `grade.worker.ts` | Replaying decisions into outcome and judgement grades |
| `src/course/pdf.ts` | The submission PDF (pdf-lib) |
| `src/course/ui/` | Course app: home, module runner, figure, hand-in, lecturer |
| `scripts/course-intake.ts`, `scripts/course-keygen.ts` | The intake Action's script and key generation |
| `tests/course.test.ts`, `tests/course-browser.mjs` | Unit tests, and the full student and lecturer flow in a browser |
