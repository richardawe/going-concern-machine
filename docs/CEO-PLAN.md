# Going Concern Machine: CEO Mode, build plan

A new, separate mode built on the existing machine: **you are the CEO of a fictional business.** You get a situation, make a decision, and the machine plays the future forward to show what that decision did. It is a training tool for judging the impact of decisions. It is **strictly hypothetical**. The companies are fictional, and it gives no advice about real companies or investments.

> Scenario → Decide → Play forward → See the impact → Debrief → Next decision

## Status

Open **CEO mode** from the company workbench, or go to `#/ceo`. What works today:

- **Six cases**, each five annual turns: *The Price War*, *Talent Exodus*, *Cash Crunch*, *Growth at Any Cost?*, *The Automation Bet* and *Dividend Pressure*.
- **Sandbox:** choose which of eight shocks hit and in which year, then play with a general toolkit of ten decisions. Strategy rankings with more than 1,500 possible paths use a fixed sample of 1,000.
- **Two grades: Judgement and Outcome.**
  - *Outcome* ranks your score among every card strategy in the world you played.
  - *Judgement* replays your decisions and 240 card strategies in 12 worlds (the one you played plus 11 with different demand swings and risk draws), and ranks your average among theirs.
  - A one-line verdict combines the two: *sound decisions, unlucky outcome*, *a lucky result*, and so on.
  - Scoring runs in a Web Worker (`src/ceo/debrief.worker.ts`), so the page stays responsive; the judgement grade fills in about a second after the rest of the debrief.
  - Demand noise was raised from 3% to 5% a year so that luck is large enough to matter; every case still balances.
- **Instructor view** (`#/ceo/instructor`).
  - An instructor creates a class assignment link that fixes the scenario and company, so every student plays the same world.
  - Students see a class banner, play, and hand in a results link from their debrief through the course's usual submission box. A name is required.
  - The instructor pastes the links, or loads a .txt or .csv file, and grades the class. Every grade is recomputed from the decisions, so a link cannot claim a result.
  - Results: summary tiles, a judgement-vs-outcome chart with the lucky and unlucky zones, a sortable table with each student's decisions, what the class chose each year with the average judgement of each choice, and a spreadsheet-safe CSV export.
  - Links from other scenarios, other assignments or edited codes are listed with a reason. Duplicate names are flagged.
  - The judgement benchmark is computed once per class (`judgementBenchmark` + `judgeAgainst` in `src/ceo/assess.ts`), so each student costs about a dozen replays. Grading runs in a Web Worker (`src/ceo/cohort.worker.ts`), and nothing is uploaded.
- **Shareable challenges.**
  - *Challenge a friend* in the debrief copies a link (`#/ceo?challenge=…`). It carries the case, the company (fictional industry and seed, or ticker), any Sandbox shocks, the player's decisions and an optional name.
  - The link never carries scores: the recipient's browser replays the decisions, so a result cannot be faked. `src/ceo/challenge.ts` validates every field and rejects out-of-range or tampered links.
  - The recipient sees a banner and plays the same world. Their debrief adds *You vs [name]*: both players' judgement and outcome grades and their decisions year by year. The challenger's judgement is computed in the same worker.
  - If the company data has been refreshed since the link was made, the briefing says the world may differ slightly.
- **While a year plays,** the machine's gears light up in causal order and the overlay names the decision entering the machine.
- **Automation is modelled as lower staffing need**, not as layoffs that leave the plant short-handed; the payroll it saves flows through operating costs.
- **Companies:** a fictional company in any of 8 industry archetypes, or a hypothetical future for **MSFT**, **WMT** or **JPM**.
- **Each turn:** a decision card plus two one-off levers (price, staffing) and six standing policies (pay, reinvestment, marketing, R&D, training, dividends). The machine plays the year, then shows headlines, effects still to come, and the impact of this year's decision against holding course.
- **Debrief:**
  - objectives, revealed only now;
  - a five-dimension scorecard against doing nothing and against the reference path;
  - three-futures charts;
  - per-decision attribution;
  - the grade, which is your rank among every card strategy;
  - a 40-world luck band, lessons, and a JSON report.
- **Tests and tooling:**
  - `npm run ceo:balance` plays every card path for every case on the fictional company and on MSFT, WMT and JPM.
  - `tests/ceo.test.ts` and `tests/ceo-browser.mjs` cover the engine and a full game.

## Decisions (agreed)

| Question | Decision |
| --- | --- |
| Turn length | **Annual** turns (fits the engine). |
| Audience | **Self-directed players.** No cohorts, and no backend. |
| Learning objectives | **Revealed only in the debrief.** |
| Companies | **Fictional by default**, with MSFT, WMT and JPM as options. The opening is reported; the future is hypothetical; people and price sensitivity are game assumptions. JPM runs through the general engine with credit provisions as the cost of delivery, and that caveat is stated in the game. |
| Name | **CEO mode inside Going Concern Machine**, with its own link (`#/ceo`). |

### Design choices made while building

- **Scores measure change the CEO made**, not how good the company was at the start. 50 means it kept pace with Year 0, and a logistic curve stops strong companies from saturating.
- **Value is scored on economic profit**, which charges the cost of capital on all new debt and equity. Borrowing or diluting to look safe is not free.
- **Survival is scored on cash net of new borrowing.** A cash shortfall is never absorbed silently: it becomes an emergency loan at a penalty rate, with a headline.
- **The grade is a rank:** where your score falls among every card strategy the case allows, played in the same world. This makes grades comparable between a fictional start-up-sized firm and Microsoft.
- **Undoing a decision** also reverts the standing policy it set, for as long as later years only kept it.

This mode sits beside the company-analysis product and does not replace it. It reuses the engine, the machine visuals and the SEC data that already exist.

---

## 1. Review: what exists and what we can reuse

| Asset | Where | Reuse in CEO mode |
| --- | --- | --- |
| **Hypothetical-business engine**: annual steps; 12 allocation levers (R&D, product, people, marketing, sales, infrastructure, automation, maintenance, acquisitions, debt repayment, dividends, reserves); 8 productive stocks with **investment lags** and decay; customers/churn/CAC; cash, debt, equity, ROIC; shocks | `src/model/engine.ts`, `config.ts`, `investment.ts`, `types.ts` | **Core of the game engine.** It already models "decision now, benefit later". It needs a people/HR subsystem, pricing, financing actions and events (§4). |
| **Momentum composite**: transparent, weighted and inspectable | `src/model/momentum.ts` | Becomes the "flywheel speed" and one input to the scorecard. |
| **Equation registry + change explainer**: attributes every change to the inputs of its own equation and traces it back to the lever | `src/simulation/equations.ts`, `explain.ts` | The pattern for the **debrief** ("why did FCF fall in year 3?"). Phase 1 uses decision-level attribution. Node-level attribution follows once the engine is on the registry. |
| **Machine visuals**: flywheel, gears, pipes, cash reservoir, capital battery, brakes, gauges, inspector, light/dark theme | `src/components/Machine.tsx`, `Gauge.tsx`, `Inspector.tsx`, `theme.css`, `styles.css` | Used unchanged as the "play forward" view. Animation already encodes state. |
| **Shocks**: demand −20%, rates +300 bps, churn ×2, COGS +15%, CAC +40%, recession, regulation, productivity, price | `src/model/engine.ts` (`withShocks`) | Become **scenario events** that arrive mid-campaign. |
| **SEC dataset**: 402 companies, usually 3 fiscal years each. Fields: revenue, tax, operating profit, CFO, CapEx and cash (~388); equity (375); net income (367); PPE (308); dividends (286); COGS (281); inventory (274); R&D (202); every company has an SIC code. Sectors: 359 general, 27 retail, 13 banks. | `public/machines/*.json`, `data/universe/sp500.json` | **Calibrates fictional archetypes** (§3): realistic margins, capital intensity, R&D intensity, inventory days, growth and payout by industry, plus peer ranges for the debrief. No real names are shown. |
| Scenario storage and import/export, BASE/BULL/BEAR/CUSTOM containers | `src/state.ts` | The pattern for save games and exported results. |
| Static Pages + Actions pipeline, tests, browser tests, demo recorder | `.github/workflows`, `tests/`, `scripts/` | Unchanged. A new script builds archetypes during the data workflow. |

**Gaps for a training tool**

1. **No people/HR system.** "People" is only a budget line into a human-capital stock. We need headcount, pay, morale, attrition, hiring ramp and layoffs.
2. **No pricing decision.** Only `priceGrowth` exists, and it has no demand response. We need price elasticity and competitor response.
3. **No financing decisions.** There is no way to raise debt or equity, buy back shares, or change credit terms. Cash shortfalls are exposed (`liquidityGap`) but nothing can respond to them.
4. **No discrete decisions.** All levers are continuous. Training needs choices with trade-offs, e.g. *"Cut 10% of staff"* or *"Acquire the rival for $40M"*.
5. **No turn structure.** Today the user sets levers and runs 10 years. We need turns: decide, play 1 year, react.
6. **No counterfactual or assessment.** Nothing compares "what you did" with "doing nothing" or a reference decision.
7. **No uncertainty.** The engine is fully deterministic, so luck cannot be separated from judgement.

---

## 2. Product design

### The loop (one campaign ≈ 15–20 minutes)

1. **Briefing.** The company card shows the fictional name, sector archetype, current machine state, a board memo describing the situation, and 2–3 learning objectives. These are hidden until the debrief or shown up front, depending on trainer mode.
2. **Decision turn.** The player picks one **decision card** from 2–4 options and may fine-tune up to three **levers** within a budget. Each card shows its stated costs, not its hidden second-order effects.
3. **Play forward.** The machine animates one year: cash flows, reservoirs fill or drain, the flywheel speeds up or slows down. Deterministic **headlines** fire at thresholds, e.g. "Engineers leave for rival" when attrition exceeds 20% or "Bank tightens covenant" when interest cover is below 2×.
4. **Impact panel.** Shows the KPI deltas against the **"no decision" counterfactual** for this year, plus effects still in the pipeline ("R&D investment matures in 2 years").
5. **Repeat** for 5–8 years. Events arrive on the scenario's timeline.
6. **Debrief** (§5).

### Decision levers by function

| Function | Continuous levers | Example decision cards |
| --- | --- | --- |
| **Finance** | Dividend payout, cash reserve target, debt repayment | Raise $X debt at Y%; raise equity (dilution); buy back shares; sell a division; factor receivables |
| **HR / People** | Headcount growth, pay vs market, training spend | Hire 50 engineers; 10% layoffs; pay freeze; retention bonuses; outsource support |
| **Product / R&D** | R&D % of revenue, product spend | Launch a new product (2-year lag); kill a legacy line; technical-debt sprint |
| **Sales & Marketing** | Marketing, sales, price change | Price cut / price rise; enter a new market; loyalty programme |
| **Operations** | Maintenance, infrastructure, automation, inventory days | Automate the plant (CapEx now, cost later); new warehouse; switch supplier |
| **Strategy** | Reinvestment rate (master lever) | Acquire a competitor; pivot; hold course |

Each card compiles to **lever deltas + one-off cash effects + delayed effects + risk flags**. A card is data, not code.

---

## 3. Reusing the SEC data: fictional archetypes

`scripts/build-archetypes.ts` runs inside the existing data workflow and writes `public/ceo/archetypes.json`.

- Group the 402 companies by SIC into ~8 archetypes: *Software & internet, Semis & hardware, Consumer brands, Retail, Industrial manufacturing, Healthcare & pharma, Energy & utilities, Business services.* Banks are excluded from v1 because their machine is different.
- For each archetype, compute **p25 / median / p75** of: gross margin, operating margin, CapEx/revenue, R&D/revenue, inventory days, revenue growth, cash/revenue, payout ratio and PPE/revenue. Record the number of companies (n) and the list of source tickers for audit.
- **A fictional company = one archetype + a seeded draw inside its ranges, rescaled** to a playable size ($20M–$2B revenue). It gets a generated name (e.g. *Northwind Devices*, *Kestrel Freight*) so it cannot be identified as a real firm.
- Provenance stays honest. Every starting value is labelled **"CALIBRATED: [archetype] median of n SEC filers, FY2023–25"** or **"GAME ASSUMPTION"**. We do not have customer counts, headcount or morale, so these are marked as game assumptions, never as data.
- **The debrief uses peer ranges.** For example: "Your operating margin ended at 4%; archetype p25–p75 is 9–18%."

Acceptance: archetypes rebuild deterministically from `public/machines`. Every value has an n and a source. A validator refuses archetypes built from fewer than 8 companies.

---

## 4. Engine extensions (`src/ceo/engine/`)

Wrap and extend `model/engine.ts` rather than fork it. Keep the rules of the original brief: deterministic, explicit equations, lags, no LLM in calculations, and a separate rendering layer.

1. **People subsystem.** State: `headcount`, `avgPay`, `morale` (0–1 stock), `attrition`, `hiringPipeline`, `productivityPerHead`.
   - Morale goes up with pay vs market, training and growth. It goes down with layoffs, pay freezes and overload (revenue per head above the archetype p75).
   - Attrition = base + k × (1 − morale).
   - New hires ramp over 2–4 quarters, modelled as a fraction of annual productivity.
   - Layoffs: severance cash now, opex saving next year, a morale shock and a human-capital stock loss.
   - Links to the existing `human` stock and to opex.
2. **Pricing and demand.** An archetype-specific price elasticity, plus competitor response as a scenario parameter (probability and size of a matching cut). A price change affects revenue, volume, churn and brand.
3. **Financing actions.** Debt issue (rate spread rises with leverage), equity issue (tracked as dilution and ownership %), buybacks, covenants (interest cover or leverage threshold → event), and liquidity-gap handling. A negative cash position triggers a forced emergency-financing event with a penalty; nothing is funded silently.
4. **Discrete decisions compiler.** `applyDecision(state, assumptions, card)` returns lever deltas, one-off flows and entries for the delayed-effect queue. The queue generalizes the existing investment-lag queue.
5. **Events.** Generalize `withShocks` into timed, conditional events: a scheduled year, a trigger (e.g. `morale < 0.4`), or a seeded probability.
6. **Seeded uncertainty.** A small noise layer on demand growth, competitor response and event probability, using a seeded PRNG (e.g. mulberry32). The same seed and the same decisions always give the same result. The engine also supports **N-seed runs** for the debrief's luck-vs-judgement band.
7. **Turn API.** `step(game, decision) → { game, yearTrace, headlines }`, plus `counterfactual(game, alternative)`, which replays from the same seed.

Acceptance: unit tests for accounting identities (cash roll-forward, equity roll-forward), lag timing, determinism given a seed, and layoff/morale/attrition directionality. Runs to date in `tests/model.test.ts` keep passing unchanged.

---

## 5. Assessment and debrief (the training value)

- **Counterfactuals.** Replay the same seed with (a) **status quo**, i.e. no decisions, and (b) the case's **reference decision path**, if the author supplied one. Show the three paths on one chart for revenue, FCF, cash, ROIC − WACC, headcount/morale and momentum.
- **Decision attribution.** For each decision taken, replay the campaign *without that decision* and report its marginal impact on each KPI, e.g. "Your year-2 layoff added +$3.1M FCF in year 3 but cost −$5.4M revenue by year 5 through attrition and product delays." Then trace the causal path through the machine using the existing cascade/explain styling.
- **Scorecard.** Five dimensions shown separately: **Value creation** (ROIC spread), **Survival/liquidity** (min runway, covenant breaches), **Growth**, **People health** (morale, regretted attrition) and **Customer health** (retention, brand). Case-specific weights give an overall grade (A–E) and a transparent "Board confidence" meter. Every number is inspectable, following the momentum approach.
- **Luck vs judgement.** Run the player's decisions over 50 seeds and show the outcome range: "You scored B; your decisions score B− to A across 50 possible worlds, so this result was about average luck."
- **Lessons.** Short debrief notes written by the case author, keyed to the decisions taken and the thresholds hit. There is no LLM in the loop for v1.
- **Export.** Download a JSON and printable (HTML → PDF) report for trainers: case, seed, decisions, scores and attribution. Results are in browser storage only; there is no backend.

---

## 6. Scenario/case format

Cases live in `src/ceo/cases.ts`: they are typed, and `tests/ceo.test.ts` plus `npm run ceo:balance` check that they are valid and balanced. They are shown below as JSON for readability.

```jsonc
{
  "id": "price-war",
  "title": "The Price War",
  "archetype": "retail",
  "seed": 1207,
  "years": 6,
  "briefing": "A discount rival has entered your top three regions…",
  "objectives": ["Protect long-run value, not just this year's share", "Keep runway above 12 months"],
  "start": { "overrides": { "cashToRevenue": 0.06 } },
  "events": [{ "year": 1, "kind": "competitorPriceCut", "size": -0.15 }],
  "turns": [{ "year": 1, "cards": ["matchPrice", "holdAndBuildBrand", "differentiateProduct", "cutCostsToFund"] }],
  "reference": ["holdAndBuildBrand"],
  "scoring": { "value": 0.3, "survival": 0.25, "growth": 0.15, "people": 0.15, "customers": 0.15 },
  "debrief": [{ "if": "took:matchPrice", "note": "Matching price protected volume but…" }]
}
```

**Starter cases (v1 target: 6)**

1. **The Price War** (Retail). Match, hold, differentiate or cut costs.
2. **Talent Exodus** (Software). Attrition spike: raise pay, hire contractors, cut scope or ride it out.
3. **Cash Crunch** (Industrial). Rates +300 bps, heavy inventory: cut CapEx, factor receivables, raise equity or lay off staff.
4. **Growth at Any Cost?** (Software). The board wants growth: buy customers with marketing, or fix retention first.
5. **The Automation Bet** (Manufacturing). CapEx now vs headcount cost later, plus the people-side impact.
6. **Dividend Pressure** (Consumer brands). Shareholders want payout, the product line is ageing. Then a recession arrives.

A **Sandbox** mode lets the player choose any archetype with no case: free play with every lever and any shock.

---

## 7. UI and architecture

- **Route:** `#/ceo`, a new entry in `App.tsx`. The company workbench stays the default. Add a "CEO mode" switch in both directions.
- **New code:** `src/ceo/` containing `engine/` (§4), `cases/` (loader + types), `assessment/` (§5) and `ui/`.
  - UI screens: `CaseSelect`, `Briefing`, `DecisionDesk` (cards + levers + budget meter), `PlayForward` (wraps the existing `Machine` + `Gauge`), `ImpactPanel`, `Debrief`.
- **Reuse** `Machine.tsx` through the existing `presentation.ts` / `machineView` mapping. Add an HR "people reservoir" and a morale gauge to the machine as a new component, not a rewrite.
- **Layers stay separate:** data (archetypes, cases) → engine → game state → visualization. No calculations in components.
- **Save:** browser storage under `gcm:ceo:v1:*`, wrapped in try/catch, with import/export.
- **Hosting:** unchanged. Everything is static on GitHub Pages, and archetypes are built by Actions.

---

## 8. Delivery phases

| Phase | Scope | Done when |
| --- | --- | --- |
| **0. Decisions** (½ day) | Answer the open questions (§9). Freeze the case JSON schema. | Schema and one case written on paper |
| **1. Archetypes** | `build-archetypes.ts`, validator, `public/ceo/archetypes.json`, fictional-company generator | 8 archetypes with n ≥ 8, tests pass, provenance shown |
| **2. Engine v1** | People subsystem, pricing elasticity, financing actions, decision compiler, events, seeded PRNG, turn API | Identity, lag and determinism tests pass; existing tests unchanged |
| **3. Playable loop** | Route, case select, briefing, decision desk, play-forward on the existing machine, impact panel; **one case end-to-end (Price War)** | A full campaign is playable in the browser; browser test covers it |
| **4. Assessment** | Counterfactuals, decision attribution, scorecard, 50-seed luck band, debrief notes, report export | The debrief explains every KPI change back to a decision |
| **5. Content** | The remaining 5 cases + Sandbox; balance pass (no dominant card; the reference path beats status quo on median seed) | A balance script runs all card combos × seeds and flags dominant strategies |
| **6. Polish** | Headlines, animations for decisions entering the machine, mobile focus mode, demo recording, docs | Demo video of a full campaign; mobile playable |
| **Later** | Quarterly turns; node-level explain by porting the engine onto the equation registry; trainer case editor; cohort results via an artifact database; optional LLM-written flavour text (never numbers) | — |

**Recommended first slice:** phases 1–3 for a single case, so the loop can be tested for fun before we invest in assessment and content.

---

## 9. Next steps

1. **Node-level "why did this change".** Port the game onto the equation registry so `simulation/explain.ts` can trace any number back to a decision.
2. **Case authoring.** Move the case definitions from TypeScript to validated JSON so non-developers can write scenarios.

## 10. Landscape (researched September 2026)

| Product | What it is | How CEO mode differs |
| --- | --- | --- |
| **Capsim** (Capstone, Foundation, Inbox, Assessments) | The market leader in higher education: 1.7M+ users and 1,100+ institutions. Multi-round team company simulations; says it measures "judgment, not just outcomes". | Capsim is licensed and cohort-based, in an invented industry. CEO mode is free, solo and about 15 minutes, calibrated on real SEC filings, and each decision is scored against a replay without it. |
| **Cesim**, **Marketplace Simulations**, **StratX**, **Smartsims**, **Knowledge Matters** | Team competitions in business schools, often industry-specific (banking, hospitality). | Same contrast: CEO mode is solo with counterfactual attribution rather than peer competition. |
| **Harvard Business Publishing** / **Forio** simulations | Short single-issue scenarios with a debrief; Forio powers many HBS and Wharton simulations. | The closest in format. CEO mode adds a visual causal machine, real-data calibration and a luck-vs-skill band. |
| **CEOSim** (ceosim.ai) | An AI-assisted simulation for Latin American business schools: an individual Arena against AI companies, team Core markets, AI-written "CEO profiles", real macro data from 2014–2025. | It uses AI to coach and profile players. CEO mode keeps every number deterministic and inspectable, with no model in the calculations. |
| **Capitalism Lab**, **Business Simulator 2026**, **CEO** (Steam) | Deep entertainment tycoon games. | These are built for play; they do not isolate the impact of a decision. |
| **StockTrak** | Trading simulations with real SEC data. | It uses real data for investing, not for running a company. |

**Positioning:** "a flight simulator for business decisions." Every number is traceable, every decision is measured against the world where you did not make it, and luck is separated from judgement. Nothing found combines real-filing calibration, per-decision counterfactuals and luck-vs-skill in a free, solo format.

Sources: [Capsim](https://www.capsim.com/), [Cesim comparison](https://www.cesim.com/simulations/compare-business-simulations), [StratX: top executive-education simulations 2026](https://stratxsim.com/recent-posts/6-top-business-simulations-for-executive-education-in-2026), [LiveCase: 7 best business simulation platforms 2026](https://www.livecase.com/blog/en/posts/7-best-business-simulation-platforms-in-2026), [CEOSim](https://www.ceosim.ai/en/), [AACSB on AI-driven simulations](https://www.aacsb.edu/insights/articles/2025/02/ai-driven-simulations-build-decision-making-skills), [Capitalism Lab ranking](https://www.capitalismlab.com/good-business-simulation-games/), [StockTrak](https://www.stocktrak.com/stock-market-simulations/).
