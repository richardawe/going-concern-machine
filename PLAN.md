# Going Concern Machine — revised build plan

Status: **feature expansion frozen.** The current milestone is one canonical end-to-end demonstration, proven on MSFT and repeated unchanged on WMT and JPM:

reported data → economic machine → inspectable causal model → one lever → visible propagation → five-year simulation → every change explained.

- `src/simulation/equations.ts` is the forecast model. The simulator evaluates it, and the machine's computed links are generated from it, so the graph shown is exactly what runs. Links that are conceptual only are drawn but labelled as not simulated.
- `src/simulation/explain.ts` compares a scenario with BASE. It attributes every changed component-year to the inputs of its own equation and follows the dominant effect back to the lever. It also says why components the lever reaches stay unchanged.
- `src/simulation/demos.ts` defines one lever per company: MSFT CapEx intensity, WMT inventory days, JPM credit cost. In the app this is the seven-step *Canonical demonstration* rail.
- `npm run demo -- --write` regenerates [docs/demos](docs/demos) from the published data. `tests/demo.test.ts` checks that every change reconciles and reaches the lever.
- Suggested assumptions state their basis: they are either calibrated from a reported ratio or a neutral placeholder.

## Product target

Enter a ticker → construct an explainable company-specific machine → inspect its economics → change assumptions → simulate the consequences.

Keep the approved industrial 2D design. Prove the translation approach with MSFT, WMT and JPM before adding broad ticker coverage. See [V2 brief](docs/V2-BRIEF.md) and [original brief](PROJECT.md).

## 1. Establish an honest, working foundation

- Finish the local dependency setup, production build and browser checks.
- Keep the SVG machinery, timeline, inspectors and scenario controls already in progress.
- Retain the generic model for explicitly hypothetical businesses only.
- Remove silent company-mode defaults for customers, churn, CAC, working capital, maintenance/growth CapEx splits and cost of capital.
- Unknown data must remain unknown. Display assumptions only after the user explicitly adopts them; never portray an activity index as reported customer counts.
- Keep reported history immutable and separate from every forecast.

Acceptance: manual mode works, accounting checks pass, and loading company data cannot silently invent operating facts.

## 2. Introduce the company-to-machine translation layer

Use small typed modules, not a general-purpose modeling framework:

- `data/`: raw facts, periods, units, source references and provider adapters.
- `translation/classify.ts`: company identity, business-model classification, evidence and supported-module selection.
- `ontology/`: shared meanings for economic concepts and sector-specific extensions.
- `sectors/`: software/cloud, retail and banking definitions, metric mappings and deterministic equations.
- `translation/construct.ts`: construct the company machine as nodes and causal edges.
- `simulation/`: scenario state, timed effects, shocks and history forks.
- `visualization/`: render the constructed machine and animate its state.

Each node carries its meaning, unit, value or null, period, provenance, calculation and data status. Each edge names its relationship, equation, lag and whether it is modeled or observed. Maintain an inspectable formula registry.

Classification starts with a supported-company registry backed by company disclosures. Record overrides and mixed business models explicitly. Broader automatic classification is a later step, not a capability to claim now.

Acceptance: a machine definition can be inspected and tested without rendering it.

## 3. Prove three distinct economic machines

| Company | Model | Machinery to expose |
| --- | --- | --- |
| Microsoft / MSFT | Software and cloud | Reported business segments, cloud infrastructure, R&D, software/service revenue and capital spending; ARR, NRR and churn only when actually disclosed and applicable |
| Walmart / WMT | Retail | Sales, stores where disclosed, inventory, inventory turns, cost of goods, margins and working-capital cycle; traffic and conversion remain unknown unless sourced |
| JPMorgan / JPM | Banking | Deposits, earning assets/loans, net interest income, credit-loss provisions, liquidity and regulatory capital where disclosed |

Retain the common economic language while changing the actual machinery and equations. Do not force a bank through industrial-company FCF, gross-margin or ROIC formulas. Define suitable bank metrics and mark cross-sector measures as non-comparable where needed.

Keep unobserved customer value and competitive advantage visible as modeled concepts or unknowns, not precise reported scores. Disable or qualify momentum when required inputs lack coverage; never replace missing signals with zero.

Acceptance: loading MSFT, WMT and JPM produces three materially different, source-backed machines without model construction by the user.

## 4. Make historical machines explorable

- Publish consistent annual snapshots for available years, targeting 2019 onward where sources permit.
- Preserve each company's fiscal dates, units and filing/amendment references.
- Separate actual history from the future scenario timeline visually.
- Scrubbing history reconfigures the same machine and explains changes in its key nodes.
- Show gaps rather than filling missing years with invented observations.

Acceptance: the user can see what changed between two reported periods and inspect the evidence.

## 5. Fork a reported state into a scenario

- Allow a scenario to start from any available historical period.
- Label the views ACTUAL COMPANY and MY SCENARIO; future base paths are also scenarios, not actual outcomes.
- Offer sector-relevant controls and disclose required unknown inputs before forecasting dependent outputs.
- Let users explicitly adopt a labeled assumption set when a fully specified forecast needs unavailable data.
- Apply immediate cash effects and delayed productive effects through the causal graph.
- Trace affected paths and show the changed equations, not merely flashing connections.
- Preserve BASE/BULL/BEAR/CUSTOM containers without prescribed bull/bear assumptions.

Acceptance: reported figures remain unchanged, scenario effects reconcile, and users can explain why an output changed.

## 6. Fit the whole pipeline to GitHub Pages and Actions

- GitHub Pages serves the static app, machine definitions and dated normalized datasets.
- GitHub Actions fetches public data, validates it, builds versioned machine snapshots and publishes them.
- Credentials and source contact details stay in Actions secrets; no privileged token enters the browser.
- Scheduled or manually dispatched refreshes are asynchronous. Ticker entry reads already-published data.
- The first release supports the three verified models. Unsupported tickers clearly show coverage limits; the static site does not promise an instant backend fetch for arbitrary symbols.
- Failed validation preserves the last good published dataset and reports the failure. Display the actual data period and refresh date.
- Browser storage and scenario import/export retain assumptions together with their exact baseline identity and period.

Acceptance: the full experience runs from a repository subpath with no persistent server.

## 7. Verify, then expand

- Test accounting identities, units, period alignment, missing data and sector mappings.
- Test deterministic scenarios, delays, shocks and unchanged reported baselines.
- Test ticker loading, historical scrubbing, inspectors, reset, storage and comparison in the browser.
- Check the approved visual direction on desktop and pan/zoom on smaller screens.
- Add company-to-company comparison only after the three-machine proof works. Compare economic mechanisms and compatible measures, not a single ranking.

First review milestone: working source-backed MSFT, WMT and JPM machines with distinct layouts and inspectors. Historical forks and simulations follow on the same translation architecture.
