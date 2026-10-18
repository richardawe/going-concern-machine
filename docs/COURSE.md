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

All six modules are complete. Each has its own Anatomy-style isometric figure, worked by a single lever, on a deliberately simple illustrative business so students can check every number by hand. The decisions run on the matching CEO-mode case.

| Module | Topic | Figure (`src/course/figures/`) | Lever |
| --- | --- | --- | --- |
| 1 · The Price War | Pricing and margin | Margin gearbox (`gearbox.ts`) | Price |
| 2 · Talent Exodus | People economics | Leaking pressure vessel with a pay valve (`vessel.ts`) | Pay against today |
| 3 · Cash Crunch | Liquidity | Reservoir on a rotary conveyor (`conveyor.ts`) | Debtor days |
| 4 · Growth at Any Cost? | Unit economics | Bucket elevator with holed buckets (`elevator.ts`) | Churn |
| 5 · The Automation Bet | Capital investment | Press with a payback dial (`press.ts`) | Discount rate |
| 6 · Dividend Pressure | Capital allocation | Three-way splitter valve (`splitter.ts`) | Payout ratio |

Each figure file holds its model (lever value → numbers) alongside its drawing; `src/course/ui/IsoFigure.tsx` runs the animation, lever and readout for all six, and `src/course/ui/iso.ts` is the shared drawing kit. Each concept sets the lever where its task starts. Content lives in `src/course/modules.ts`, and `tests/course.test.ts` checks every figure number the concepts and check questions quote against the models.

## Hand-in (prototype)

Clicking **Hand it in** saves the student's work to an inbox in the browser's storage, and the lecturer page (`#/course/lecturer`) reads it from there. A hand-in in another tab of the same browser appears without a refresh. Handing in again replaces the student's earlier hand-in. The student then downloads the PDF for Canvas.

- **The student and lecturer pages must be open in the same browser.** That suits a demo on one laptop. Moving answers between devices needs a server, which replaces the inbox later.
- Nothing leaves the browser; no GitHub, no third-party service.
- Grades are never stored with the hand-in. They are recomputed from the decisions when the lecturer replays them or builds a PDF.
- The **verification code** (`GCM-XXXX-XXXX-XXXX`) is a SHA-256 fingerprint of the submission. The student's PDF and the lecturer's rebuilt PDF are byte-for-byte identical (checked by `tests/course-browser.mjs`).
- `src/course/seal.ts` keeps an encrypted hand-in format and `npm run course:keygen` for the move to a server; the prototype doesn't use them.

### Known limits of the prototype

- Grades depend on the industry archetypes, which are rebuilt from the published SEC datasets. If the data refreshes between hand-in and marking, a replayed grade can shift slightly. The verification code does not change, because it covers only the student's answers and decisions.
- One pilot course (`?c=pilot`) is defined in `src/course/modules.ts`.

## Code

| Path | What it does |
| --- | --- |
| `src/course/modules.ts` | Courses and module content: concepts, check questions, planned modules |
| `src/course/seal.ts` | Hand-in codes for the move to a server (unused by the prototype) |
| `src/course/payload.ts` | Building, validating and fingerprinting a hand-in |
| `src/course/grade.ts`, `grade.worker.ts` | Replaying decisions into outcome and judgement grades |
| `src/course/pdf.ts` | The submission PDF (pdf-lib) |
| `src/course/progress.ts` | Saved progress, and the prototype's hand-in inbox |
| `src/course/figures/` | The six module figures: each one's illustrative model and drawing |
| `src/course/ui/` | Course app: home, module runner, figure component and drawing kit, hand-in, lecturer |
| `scripts/course-keygen.ts` | Key generation for the encrypted format (for later) |
| `tests/course.test.ts`, `tests/course-browser.mjs` | Unit tests, and the full student and lecturer flow in a browser |
