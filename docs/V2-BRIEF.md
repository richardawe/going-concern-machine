# Going Concern Machine — V2

Evolve the current application from a generic business simulator into a **company-to-machine translation and simulation platform**.

The key differentiator should be:

> **Give the system a company, and it constructs an explainable economic machine representing how that specific business creates, captures, consumes and reinvests value.**

The visual machine remains the primary interface, but V2 should begin building the intelligence underneath it.

## Product Thesis — Important

Do NOT build this as another generic Digital Twin of an Organization, FP&A tool, system-dynamics modeller or configurable business simulation platform.

Those categories already exist.

The product hypothesis we are testing is:

> **Can we generate a useful economic digital twin of almost any public company automatically, with little or no configuration by the user?**

The defining interaction should eventually be:

**Enter ticker → machine constructs itself → understand business → manipulate assumptions → watch consequences.**

For example:

`NVDA`

should automatically determine:

- what kind of business Nvidia is;
- which economic model/modules are appropriate;
- which reported financial and operating data can populate them;
- which important variables are unavailable;
- which values can legitimately be derived;
- how those elements connect causally;
- how to render the resulting economic machine.

The user should not need to construct a system-dynamics model manually.

## Standard Economic Language

Treat the Going Concern Machine as an attempt to create a **common visual and computational language for businesses**.

Maintain a universal economic backbone:

**Demand → Customers → Revenue → Margin → Cash → Capital → Investment → Productive Capacity → Customer Value → Competitive Advantage → Demand**

Then attach sector/business-model-specific machinery.

For example:

SaaS → ARR / NRR / CAC / churn

Bank → deposits / lending / NIM / credit losses / regulatory capital

Retail → traffic / stores / inventory / turns / same-store sales

Manufacturing → orders / backlog / utilisation / production / CapEx

Insurance → premiums / claims / reserves / combined ratio

The common backbone allows fundamentally different businesses to remain understandable and comparable without pretending they operate identically.

## The Translation Layer Is Core IP

Architect this explicitly:

`Company`
↓
`Raw Financial + Operating Data`
↓
`Company Classification`
↓
`Economic Ontology`
↓
`Sector Modules`
↓
`Causal Relationships`
↓
`Company Machine`
↓
`Simulation`

Do not bury this mapping inside UI components.

Create a distinct translation/mapping layer that can evolve independently.

The long-term value of the system is not the gears or animations.

It is the ability to reliably translate heterogeneous businesses into explainable economic machines.

## Zero-Configuration Principle

Wherever possible:

**The machine should build itself.**

The user enters a ticker.

The system should do the rest.

If information cannot be determined, explicitly show:

**UNKNOWN**

rather than silently inventing an assumption.

The user can subsequently supply or modify unknown variables.

## Universal Core + Sector Modules

Do not assume every company operates the same way.

Create a universal economic core:

**Demand → Customers → Revenue → Margin → Cash → Capital → Investment → Productive Capacity → Customer Value → Competitive Advantage → Demand**

Then allow sector-specific machinery to plug into that core.

Examples:

**SaaS**
ARR, NRR, CAC, churn, subscribers, ARPU.

**Banking**
Deposits, loans, NIM, credit losses, liquidity, regulatory capital.

**Retail**
Stores, traffic, conversion, inventory, inventory turns, same-store sales.

**Manufacturing**
Orders, backlog, production capacity, utilisation, unit cost, CapEx.

**Insurance**
Premiums, claims, loss ratio, combined ratio, reserves.

The machine should visually change when the business model changes.

A bank should not look economically identical to a software company.

## Company → Machine Translation

When a user enters a ticker:

`AAPL`

the system should:

**Identify company → identify sector/business model → retrieve financial/operating data → map data into the universal model → load appropriate sector module → construct the machine.**

This translation layer is strategically important.

Design it as a first-class component rather than hard-coding financial metrics directly into the UI.

Think of it as:

`Company Data → Economic Ontology → Company Machine`

## Explain Everything

Every machine component should be inspectable.

The user should be able to click something like:

**CAPITAL**

and understand:

- what it represents;
- its current value;
- where the value came from;
- whether it was reported, calculated, estimated or assumed;
- what feeds it;
- what it affects.

The machine should never become a black-box company score.

## Show Causality

The major differentiator should increasingly become:

**"Show me how this business works."**

If the user changes a lever, visually trace the consequence through the machine.

For example:

`Churn ↑`

could propagate:

Customers ↓ → Revenue ↓ → FCF ↓ → Capital ↓ → Investment ↓ → Product Capability ↓ → Customer Value ↓ → Demand ↓

Allow the user to see both first-order and delayed effects.

## Historical Machine

Where data permits, allow the user to move backwards through time.

For example:

`2019 ← 2020 ← 2021 ← 2022 ← 2023 ← 2024 ← 2025`

The machine should reconfigure itself for each period.

This should allow users to visually see how the economics of a company have evolved.

The experience should answer:

**What changed in this business?**

not merely:

**What changed in its share price?**

## What-If Machine

From any historical/current state, allow the user to create a fork:

**ACTUAL COMPANY**

versus

**MY SCENARIO**

Then manipulate:

pricing, demand, margins, CapEx, R&D, debt, interest rates, productivity, churn, reinvestment etc.

Run the machine forward and compare outcomes.

## Eventually: Machine Comparison

Design V2 so we can eventually load:

`AAPL vs MSFT`

or:

`Coca-Cola vs PepsiCo`

and compare their economic machines.

The question should become:

> **Why do these businesses behave differently?**

Compare:

capital intensity,
cash conversion,
reinvestment,
ROIC,
margin structure,
growth,
resilience,
friction,
productive assets,
and economic feedback loops.

Do not reduce this to a simplistic score or ranking.

## Longer-Term Direction

Think beyond a financial dashboard.

The long-term product should become an **interactive economic digital twin of a business**.

Users should eventually be able to:

**Load it → understand it → inspect it → stress it → change it → simulate it → compare it.**

The differentiator is not the gears, animation or financial-data API.

The differentiator we want to develop is:

> **A standardised but extensible method for translating different kinds of companies into explainable, interactive economic machines.**

Preserve the existing Going Concern Machine experience while restructuring the underlying model so this direction can be built incrementally.

Do not over-engineer V2.

Prove the thesis first with **three deliberately different companies/business models**.

A good initial test would be:

**Microsoft** — software/cloud  
**Walmart** — retail  
**JPMorgan** — banking

If entering those three tickers results in three economically distinct machines, while still clearly belonging to the same Going Concern framework, V2 has demonstrated the core concept.