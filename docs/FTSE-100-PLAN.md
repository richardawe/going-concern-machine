# FTSE 100 version — draft plan

Goal: enter a FTSE 100 ticker (e.g. `ULVR`, `BP.`, `AZN`) and get the same explainable, source-backed machine the
S&P 500 gets today, published statically by a GitHub Action, with the same quality gates and honesty rules.

Status: plan only. Nothing here is built.

## What carries over unchanged

Most of the product is already market-neutral:

- The machine, inspectors, scenario fork, five-year simulation and `explain.ts` attribution.
- `CompanyDataset` / `Datum` provenance (value, status, period, source, url, calculation).
- The sector modules (`general`, `retail`, `banking`) and the equation registry.
- `checkDataset` identity gates, `whyInspectOnly`, the index/publish-report flow, Pages deployment.
- Ratio-based CEO-mode archetypes (currency cancels out of ratios).

The work is almost entirely in **the data layer** (SEC-specific) and a few **USD assumptions** in the UI.

## The four real gaps

| Gap | Today (S&P 500) | FTSE 100 needs |
| --- | --- | --- |
| Source | SEC EDGAR `companyfacts` JSON, one call per CIK | UK annual reports in ESEF iXBRL, via filings.xbrl.org (xBRL-JSON, keyed by LEI) |
| Taxonomy | `us-gaap:*` tags | `ifrs-full:*` tags plus company **extension** elements |
| Currency | `Unit = 'USD'`, `$` hard-coded | GBP, USD (Shell, BP, AZN, HSBC, Rio…), EUR (Unilever, CCH…) |
| Classification | SEC SIC code → sector | No SIC; use ICB industry (what FTSE Russell uses) from a curated list |

## Phase 0 — Spike (1–2 days, decides feasibility)

Pick 8 companies that cover the awkward cases and hand-check what the source actually gives:
`ULVR` (EUR, Dec), `BP.` (USD), `TSCO` (retail, Feb year-end), `VOD` (March year-end), `HSBA` (bank, USD),
`AZN` (USD, heavy R&D), `RR.` (GBP industrial), `LGEN` (insurer — expected refusal).

For each: does filings.xbrl.org have FY2021–FY2025? Which `ifrs-full` tags carry revenue, operating profit, CFO,
CapEx, cash? How much is on custom extensions? Record the answers in `docs/ftse-spike.md`.

Exit criterion: ≥ 6 of 8 pass the existing `checkDataset` gates with only standard tags + documented fallbacks.
If not, fall back to option B below before building anything else.

**Source options, in order of preference**

- **A. filings.xbrl.org (primary).** Free, no key, JSON API filtered by `country=GB`, each filing has a `json_url`
  (xBRL-JSON) and `viewer_url` (good for the "link to filing" requirement). UK ESEF is mandatory for periods from
  1 Jan 2021, so expect 4–5 annual periods (each report also carries prior-year comparatives). Coverage is
  collected from the FCA National Storage Mechanism and can lag or have gaps — the spike measures that.
- **B. SEC `companyfacts` for dual-listed filers.** ~20 FTSE 100 names file 20-F with the SEC (Shell, BP, AZN,
  HSBC, Unilever, GSK, Diageo, BATS, RELX, Rio, NatWest, Barclays, Lloyds, Vodafone, National Grid, Haleon,
  Smith & Nephew, Prudential…). `companyfacts` exposes their `ifrs-full` facts in the existing pipeline with little
  new code. Useful as a cross-check and a fallback, but not the whole index.
- **C. Parse the NSM iXBRL directly** (Arelle in the Action). Only if A has unacceptable gaps; heavier to run.
- Commercial APIs are out unless the free route fails — they conflict with "every figure links to its filing".

## Phase 1 — Currency becomes data, not an assumption

Small, mechanical, and a prerequisite for everything else. Do it first on its own PR so S&P 500 output is
byte-identical before and after.

- `ontology/types.ts`: `Unit` gains `'money'` (or keep `'USD'` and add `'GBP' | 'EUR'`); `CompanyDataset` gets
  `currency: 'USD' | 'GBP' | 'EUR'` (reporting currency, from the filing's unit, not the listing).
- `format.ts` `showValue` / `showDelta` take the currency; `presentation.ts` already half-supports `£`.
- ~50 `'USD'` literals across `src/` (`grep -rn "'USD'" src`) — mostly gauge scaling in `CompanyWorkbench.tsx`,
  `Gauge.tsx`, `simulation/`, `model/`. Replace the type checks with "is money".
- Never convert currencies. Show the reporting currency on the machine header ("Figures in USD m, as reported").
- Schema bump to `schemaVersion: 3`; `validateDataset` accepts 2 (implies USD) and 3.

Acceptance: `npm test`, `npm run demo` and every `public/machines/*.json` unchanged except the version/currency field.

## Phase 2 — Universe, identity and tickers

- `data/universe/ftse100.json`, same shape as `sp500.json` but keyed by LEI:
  `{ ticker: "ULVR", epic: "ULVR", name, lei, icb: { industry, supersector, sector }, secCik? }`.
  Source: FTSE Russell constituent list / LSE; LEIs from GLEIF. Refresh quarterly (index reviews).
- **Ticker collisions are real**: `AAL` (Anglo American vs American Airlines), `BA.` vs `BA`, `RIO`, `NG.`, `SHEL`.
  Store FTSE machines under a market prefix: `public/machines/LSE/ULVR.json` and index entries with
  `market: 'LSE'`. The ticker regex in `data/company-datasets.ts` must allow a trailing dot (`BP.`, `RR.`, `BT.A`);
  normalise to a filename-safe form (`BP`, `BT-A`) but display the EPIC.
- Lookup UI: market switch (S&P 500 / FTSE 100) next to the ticker box; accept `ULVR.L` and `LSE:ULVR` too.

## Phase 3 — IFRS translation (`src/data/esef.ts`)

Mirror `src/data/sec.ts` so the two are easy to diff: rules table → `pick` → `esefToDataset` → reuse `checkDataset`.

Candidate `ifrs-full` rules (the spike confirms/extends these):

| Field | Tags (first match wins) | Notes |
| --- | --- | --- |
| revenue | `Revenue`, `RevenueFromContractsWithCustomers` | |
| cogs / grossProfit | `CostOfSales`, `GrossProfit` | Many UK filers use a nature-of-expense P&L: no gross profit → leave UNKNOWN, `costBasis: 'total'` (already supported) |
| operatingProfit | `ProfitLossFromOperatingActivities` | **Not an IFRS-defined line until IFRS 18 (2027)**; often on an extension. Fallback: `ProfitLossBeforeTax` + `FinanceCosts` − `FinanceIncome`, marked ESTIMATED with formula |
| operatingCashFlow | `CashFlowsFromUsedInOperatingActivities` | IFRS lets interest/dividends sit in operating, investing or financing — record which in `calculation` |
| capex | `PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities`, `PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets` | second is broader; state it |
| rd | `ResearchAndDevelopmentExpense` | often only in notes (not tagged) → UNKNOWN |
| dividends | `DividendsPaidClassifiedAsFinancingActivities`, `DividendsPaid` | |
| tax / netIncome | `IncomeTaxExpenseContinuingOperations`, `ProfitLossAttributableToOwnersOfParent`, `ProfitLoss` | |
| inventoryInvestment | `AdjustmentsForDecreaseIncreaseInInventories` | **sign is reversed** vs us-gaap `IncreaseDecreaseInInventories` — test this explicitly |
| cash, equity, ppe, inventory | `CashAndCashEquivalents`, `EquityAttributableToOwnersOfParent`, `PropertyPlantAndEquipment`, `Inventories` | IFRS 16 right-of-use assets may be inside PPE; note it |
| bank: nii, fees, provision | `InterestRevenueExpense` / (`RevenueFromInterest` − `InterestExpense`), `FeeAndCommissionIncomeExpense`, `ImpairmentLossImpairmentGainAndReversalOfImpairmentLossDeterminedInAccordanceWithIFRS9` | |
| bank: deposits, loans | `DepositsFromCustomers`, `LoansAndAdvancesToCustomers` (often extension) | |

Also:

- **Extensions**: ESEF requires every extension to be *anchored* to the nearest `ifrs-full` element. Allow a rule to
  accept an extension whose anchor is the target tag, and label the figure "company-specific tag anchored to X".
  Never guess from element names.
- **Scale & sign**: xBRL-JSON gives full values; trust `decimals`, not the `scale` of the HTML. Duration vs instant
  from the period; keep the 330–380-day annual test (and 52/53-week handling for Tesco/Sainsbury's etc.).
- **Restatements**: prefer the latest filing's comparative for a period, like `filed` desc today; record both
  report URLs when they differ.
- **Fiscal year label**: UK March year-ends (VOD, BT, NG, SSE, UU, SVT) should read FY2025 for March 2025 —
  settle one rule and apply it everywhere.
- Fixtures in `tests/fixtures/esef/<EPIC>.json` (trimmed), plus `tests/esef.test.ts` mirroring `sec.test.ts`.

## Phase 4 — Classification without SIC

- `sectorFromIcb(icb)`: Banks → `banking`; Retailers (and Food Retailers & Wholesalers) → `retail`; everything else
  → `general`. Same "classified automatically, not reviewed" rationale, citing ICB instead of SIC.
- `unsupportedIndustry` equivalents: Life/Non-life Insurance (Aviva, L&G, Prudential, Phoenix, Admiral, Beazley),
  Real Estate Investment Trusts (Land Securities, British Land, Segro, LondonMetric, Unite), closed-end investment
  trusts / asset holders (3i, Pershing Square, Scottish Mortgage, F&C). These are refused with a reason, exactly
  as US insurers/REITs are today.
- Expect roughly **75–85 publishable** of 100 at launch; insurers and REITs are ~12–15 names, so an insurance
  module becomes a much higher priority than it was for the S&P 500.

## Phase 5 — Publishing workflow

- `scripts/publish-esef.ts` (or a `--source esef` flag on `publish-sec.ts`; separate script is clearer).
- Shared helpers (index update, report, step summary) extracted from `publish-sec.ts` rather than copied.
- `.github/workflows/publish-companies.yml`: add a `ftse` job (weekly; ESEF annual reports arrive once a year
  per company, so weekly is plenty). No secret needed for filings.xbrl.org; be polite (rate limit, user agent).
- Pull-request run: live sample of ~8 spike companies, commits nothing.
- `validate-data.ts` and `build-archetypes.ts` walk both markets. Decide whether CEO archetypes pool markets
  (ratios are comparable) or stay per market — pooling is simpler; label the cohort source either way.

## Phase 6 — Demonstration and verification

- Pick one verified UK anchor per module, hand-checked like MSFT/WMT/JPM: e.g. `ULVR` (general), `TSCO`
  (retail, inventory lever), `LLOY` or `HSBA` (banking, credit-cost lever). Add to `companyRegistry` and
  `verified-snapshots.ts`; `docs/demos/` gets their walkthroughs; `tests/demo.test.ts` covers them.
- Browser check (`tests/browser.mjs`): FTSE lookup, currency symbol, `BP.`-style ticker, a refused insurer.

## Risks

1. **Coverage/latency of filings.xbrl.org for UK** — the main unknown; the spike measures it. Option B/C are
   the mitigations.
2. **Operating profit isn't a standard IFRS line** before IFRS 18 — biggest source of ESTIMATED figures and gate
   failures. Keep the estimate explicit, never silent.
3. **Extension-heavy filers** (banks especially) may fall below the gates; they stay unpublished with the reason
   rather than half-filled.
4. **Unit/sign bugs** (inventory adjustment sign, pence vs pounds for per-share data, EUR reporters) — cover each
   with a fixture test before publishing.
5. **Name collisions** with US tickers if the market prefix is skipped.

## Rough effort

| Phase | Effort |
| --- | --- |
| 0 Spike | 1–2 days |
| 1 Currency | 1–2 days |
| 2 Universe & tickers | 1–2 days |
| 3 IFRS translation + fixtures/tests | 4–6 days |
| 4 Classification | 1 day |
| 5 Workflow | 1–2 days |
| 6 Verified UK demos + browser tests | 2–3 days |
| **Total** | **~2.5–3.5 weeks** for one developer, assuming the spike passes |

Suggested order of PRs: currency (1) → spike findings (0) → universe/tickers (2) → `esef.ts` + tests (3, 4) →
workflow (5) → verified UK demos (6). Each keeps the S&P 500 output unchanged.
