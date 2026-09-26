# PROJECT: THE GOING CONCERN MACHINE

Build an interactive web application that turns a business into a visually animated economic machine.

This is NOT a conventional financial dashboard.

## Deployment constraints

The application must run on GitHub Pages as a static website. Any required backend work must run through GitHub Actions. These constraints take precedence over framework and server-side suggestions elsewhere in this brief.

* Run the deterministic simulation, interactive machinery, inspectors and scenario comparisons in the browser.
* Use a static build, such as React with TypeScript and Vite, or a fully static Next.js export. Do not require a persistent application server, server-side rendering or runtime API routes.
* Use GitHub Actions to fetch, normalize and validate company financial data, generate static data files, and build and deploy the site.
* Keep provider credentials in GitHub Actions secrets. Never include credentials or privileged GitHub tokens in the website.
* Ticker lookup loads available published company data. Backend data refreshes are asynchronous workflows, not live HTTP requests served by GitHub Actions. Clearly show data periods, sources, refresh times and unavailable tickers.
* Preserve manual mode when company data is unavailable. Keep user scenarios in browser storage, with import/export as needed.
* Support the GitHub Pages repository base path for assets and navigation.

The machine remains the primary interface; these hosting constraints do not change the economic model or its auditability requirements.

The primary interface must look and behave like a sophisticated mechanical engineering control system: gears, flywheels, pipes, reservoirs, batteries, valves, gauges and control levers.

The purpose is to allow a user to:

1. Build or configure a hypothetical business.
2. Change economic and management variables using physical-looking controls.
3. Watch those changes propagate visually through the machine.
4. Run multi-year scenarios.
5. Enter a public-company ticker such as AAPL, MSFT, KO, TSLA, etc.
6. Automatically populate the machine using available company financial data.
7. Visually diagnose whether the business is compounding, stable or decaying.
8. Compare a company’s current configuration against alternative scenarios.

The application should eventually function as both:

* a visual business simulation system;
* a public-company economic analysis tool.

---

## 1. CORE CONCEPT

The governing model is:

A business is an open economic system that must continuously capture external economic value, convert that value into cash and productive capital, and reinvest sufficient capital to overcome friction, deterioration and competitive entropy.

The machine is therefore NOT a perpetual-motion machine.

External economic value enters primarily through customers’ willingness and ability to pay.

The system transforms:

Market Need
→ Demand
→ Customer Acquisition
→ Customers
→ Value Delivered
→ Revenue
→ Gross Margin
→ Operating Profit
→ Free Cash Flow
→ Capital
→ Capital Allocation
→ Investment
→ Productive Capacity
→ Product / Service
→ Customer Value
→ Competitive Advantage
→ Demand

This forms the main reinforcing economic loop.

---

## 2. THE INTERFACE IS THE MACHINE

Do NOT build a normal SaaS dashboard with the machine as an illustration.

The machine itself IS the application.

Create a large 2D interactive SVG/canvas engineering schematic occupying most of the viewport.

At the centre:

GOING CONCERN

Represent this as a large animated flywheel.

Its angular velocity represents:

Business Momentum M

The flywheel must visibly:

* accelerate
* maintain speed
* decelerate
* wobble under stress
* approach stall
* recover

Do not make animation decorative.

Animation speed must be linked to simulation state.

Display:

ACCELERATING | EQUILIBRIUM | DECAYING

---

## 3. MAIN ECONOMIC MACHINE

Arrange components around the flywheel.

Clockwise:

Market Need

↓

Demand

↓

Customer Acquisition

↓

Customers

↓

Value Delivered

↓

Revenue

↓

Gross Margin

↓

Operating Profit

↓

Free Cash Flow

↓

Capital

↓

Capital Allocation

↓

Investment

↓

Productive Capacity

↓

Product / Service

↓

Customer Value

↓

Competitive Advantage

↓

Demand

Where mechanically appropriate, represent causal relationships as meshing gears.

Where a relationship represents flow rather than direct mechanical transmission, use:

* pipes
* valves
* arrows
* pumps
* reservoirs

Do not turn everything into a gear.

---

## 4. CASH SYSTEM

Cash must be visually represented as glowing amber/gold fluid.

It should visibly move through transparent industrial pipes.

Revenue feeds the cash system.

Cash branches toward:

Operating Costs
Taxes
Interest
Debt Repayment
Working Capital
Maintenance CapEx
Growth CapEx
Dividends
Cash Reserves
Reinvestment

Flow velocity and pipe volume should respond to actual simulation values.

Create a large transparent:

CASH RESERVE

Its fill level represents actual cash.

Add:

RUNWAY: XX MONTHS

If cash deteriorates, the reservoir visibly drains.

---

## 5. ECONOMIC CONVERSION ENGINE

Create a physical conversion chamber:

ECONOMIC CONVERSION ENGINE

Inputs:

Revenue

Less:

Cost to Deliver Value

Output:

Gross Profit / Operating Profit

Then calculate:

Operating Profit
− Tax
− Interest
− Maintenance CapEx
− Working Capital Requirements

FREE CASH FLOW

Visualise conversion efficiency.

High margins should make the chamber operate efficiently.

Margin compression should visibly reduce output.

---

## 6. CAPITAL ACCUMULATOR

Represent available capital as a large industrial battery/accumulator.

Sources:

* retained earnings
* existing cash
* equity
* debt

Display:

AVAILABLE CAPITAL

Show charge level visually.

Capital should flow from this component toward management’s allocation console.

---

## 7. MANAGEMENT CONTROL CONSOLE

Across the top of the machine create an interactive mechanical console.

Provide adjustable levers for:

R&D
Product
People
Marketing
Sales
Infrastructure
Automation
Maintenance
Acquisitions
Debt Repayment
Dividends
Cash Reserves

Add a large master control:

REINVESTMENT RATE

0% ————————— 100%

All controls must be genuinely interactive.

Dragging a lever must alter the underlying simulation.

Changes should immediately propagate through the machine.

Example:

Increase R&D
→ cash available decreases
→ investment increases
→ technology/IP stock gradually increases
→ productive capacity potentially increases
→ product/customer value potentially improves
→ retention/demand may improve
→ future revenue changes

Effects must occur with configurable TIME LAGS.

Do not model every management action as producing an immediate benefit.

---

## 8. PRODUCTIVE ASSET STOCKS

Investment builds stocks:

Human Capital
Technology / IP
Physical Assets
Brand
Distribution
Customer Relationships
Data
Organisational Capability

Each must have:

current stock
investment rate
depreciation/decay rate
productivity contribution

These combine into:

PRODUCTIVE CAPACITY

Stocks should visibly fill/drain like industrial reservoirs or accumulators.

---

## 9. FRICTION SYSTEM

Under the machine build physical braking systems representing:

Competition
Customer Churn
Depreciation
Technological Obsolescence
Inflation
Interest
Regulation
Taxation
Organisational Complexity
Talent Loss

These should apply visible resistance to the system.

Higher friction = greater braking force.

For example:

Churn ↑
→ customer stock drains faster
→ revenue falls
→ cash generation falls
→ capital accumulation slows
→ investment falls
→ productive capacity deteriorates
→ competitive position weakens
→ demand can deteriorate

---

## 10. SIMULATION ENGINE

Separate the economic simulation from the rendering layer.

Use a deterministic simulation engine.

Do NOT use an LLM for calculations.

Represent time discretely:

Year 0
Year 1
Year 2
…
Year 10

Eventually allow quarterly simulation.

Core state should include at minimum:

```text
marketSize
demand
customers
newCustomers
churnRate
price
volume
revenue
cogs
grossProfit
grossMargin
opex
operatingProfit
tax
interestExpense
workingCapital
maintenanceCapex
growthCapex
freeCashFlow
cash
debt
equity
investedCapital
availableCapital
reinvestmentRate
productiveCapacity
productivity
humanCapital
technologyCapital
physicalCapital
brandCapital
distributionCapital
customerRelationshipCapital
organizationalCapital
cac
ltv
retention
roic
costOfCapital
capitalTurnover
businessMomentum
```

---

## 11. ECONOMIC RELATIONSHIPS

Implement explicit equations.

Example foundations:

Revenue =
Customers × Average Revenue Per Customer

Customer Stock(t+1) =
Customers(t)

* New Customers
    − Churned Customers

Churned Customers =
Customers × Churn Rate

New Customers =
Acquisition Spend / CAC

Gross Profit =
Revenue − COGS

Operating Profit =
Gross Profit − Operating Expenses

NOPAT =
Operating Profit × (1 − Tax Rate)

ROIC =
NOPAT / Invested Capital

FCF =
Operating Cash Flow
− Maintenance CapEx
− Growth CapEx
− Working Capital Investment

Capital(t+1) =
Capital(t)

* FCF
* New Equity
* New Debt
    − Dividends
    − Debt Repayment

Productive Capacity(t+1) =
Productive Capacity(t)

* Productive Investment
    − Economic Depreciation

These are starting equations.

Design the engine so formulas can be refined without rewriting the UI.

---

## 12. BUSINESS MOMENTUM

Create a transparent composite metric:

M = Business Momentum

Do NOT create an arbitrary black-box score.

Construct it from normalized underlying variables such as:

Revenue Growth
FCF Growth
ROIC Spread
Customer Growth
Retention
Productivity Growth
Balance-Sheet Resilience

where:

ROIC Spread = ROIC − Cost of Capital

The exact formula must live in a dedicated configuration/model file.

Every component of M must be inspectable.

Clicking the flywheel should show:

WHY IS THE MACHINE SPEEDING UP OR SLOWING DOWN?

Example:

Momentum +12%

Contributors:

```text
Revenue Growth        +4.2
ROIC Spread           +3.8
Retention             +2.1
Productivity          +2.6
```

Drag:

```text
Churn                 −1.9
Interest Cost         −0.8
```

Never hide the calculation.

---

## 13. VALUE CREATION CONDITION

Prominently display:

ROIC > COST OF CAPITAL

When true:

VALUE CREATION

Show capital flowing toward productive capacity and the flywheel accelerating.

When:

ROIC < COST OF CAPITAL

Show:

CAPITAL DESTRUCTION

and visually increase system drag.

Do not treat this as the only determinant of company health; it is one major economic condition within the model.

---

## 14. SCENARIO MODE

Allow users to change:

Demand Growth
Price
Volume
CAC
Churn
Retention
Gross Margin
Operating Costs
Debt
Interest Rate
Tax Rate
Maintenance CapEx
Growth CapEx
R&D
Marketing
People
Automation
Reinvestment Rate
Productivity Growth

Provide:

PLAY
PAUSE
RESET
STEP FORWARD

and a time slider:

YEAR 0 → YEAR 10

When PLAY is pressed, animate the business through time.

The user should literally watch:

cash move
reservoirs fill/drain
gears accelerate/decelerate
capital charge/discharge
friction increase/decrease
the flywheel gain/lose momentum

---

## 15. SHOCK MODE

Allow the user to inject shocks.

Examples:

Demand −20%

Interest Rates +300bps

Churn doubles

COGS +15%

CAC +40%

Major Competitor Enters

Recession

Regulatory Cost +10%

Productivity +20%

Price +10%

Acquisition

Debt Refinancing

Show the shock physically entering the machine.

Then animate the cascade through future periods.

---

## 16. PUBLIC COMPANY / TICKER MODE

Add a prominent input:

LOAD A BUSINESS

[ Enter ticker: ______ ]

Examples:

AAPL
MSFT
AMZN
GOOGL
TSLA
KO

When a ticker is entered:

1. Resolve the company.
2. Retrieve available public financial information.
3. Populate the economic machine.
4. Calculate observable metrics.
5. Derive model variables.
6. Animate the machine according to the resulting state.

---

## 17. COMPANY DATA

Create a provider abstraction.

Example:

FinancialDataProvider

Methods such as:

```text
getCompany()
getIncomeStatements()
getBalanceSheets()
getCashFlowStatements()
getMarketData()
getShares()
getHistoricalFinancials()
```

Do not hard-code the application to one commercial API.

Allow adapters for sources such as regulatory filings and licensed financial-data providers.

Cache normalized financial statements locally/server-side where legally permitted.

The simulation must still function without external data using manual mode.

---

## 18. TICKER → MACHINE MAPPING

Where public financial data exists, map it directly.

Examples:

Revenue
→ Revenue

COGS
→ Cost to Deliver Value

Gross Profit
→ Gross Margin Engine

Operating Income
→ Operating Profit

Cash From Operations
→ Operating Cash Generation

CapEx
→ Investment

Cash
→ Cash Reservoir

Debt
→ Debt Load

Interest Expense
→ Interest Drag

R&D
→ R&D Allocation

SG&A
→ Operating Cost

Shareholder Distributions
→ Dividends / Buybacks

Calculate:

Revenue Growth
Gross Margin
Operating Margin
FCF Margin
ROIC
Capital Turnover
Debt ratios
Interest coverage
Reinvestment measures

Never invent unavailable company data.

---

## 19. OBSERVED VS DERIVED DATA

This distinction is mandatory.

Every variable must be labelled internally as:

OBSERVED
CALCULATED
ESTIMATED
USER ASSUMPTION

Example:

Revenue: OBSERVED

Operating Margin: CALCULATED

Churn: UNAVAILABLE

Competitive Advantage: MODEL-DERIVED

Future Demand Growth: USER ASSUMPTION

Hovering over any gauge must show:

VALUE
SOURCE
PERIOD
CALCULATION
CONFIDENCE / DATA STATUS

Never imply that model-derived values came directly from company filings.

---

## 20. COMPANY MODE VISUALIZATION

After loading a ticker, display:

APPLE INC. — AAPL
FY2026 / TTM

Then animate the machine.

The user should immediately see things such as:

strong/weak cash generation
capital accumulation
investment intensity
margin conversion
debt drag
ROIC spread
productive investment
momentum trend

Do not produce investment recommendations.

This is a business-system analysis tool.

---

## 21. COMPANY WHAT-IF MODE

This is a core feature.

After loading a real company, allow the user to modify it.

Example:

Load AAPL.

Then change:

Gross Margin −5%
Revenue Growth 0%
R&D +20%
CapEx +30%
Interest Cost +200bps

Press:

RUN 10 YEARS

The machine should simulate the consequences.

Provide:

BASE CASE

versus

USER SCENARIO

Allow instant reset to reported-company baseline.

---

## 22. SCENARIO COMPARISON

Support multiple scenarios simultaneously:

BASE
BULL
BEAR
CUSTOM

Do not prescribe assumptions for Bull/Bear; these are user-defined scenario containers.

Show differences in:

Revenue
Operating Profit
FCF
Cash
Debt
ROIC
Productive Capacity
Business Momentum

Allow two machines to be shown side-by-side where screen size permits.

---

## 23. FAILURE CASCADE

When a variable deteriorates sufficiently, highlight the causal path.

Example:

CHURN ↑

→ Customers ↓
→ Revenue ↓
→ Margin pressure
→ FCF ↓
→ Capital ↓
→ Investment ↓
→ Productive Capacity ↓
→ Customer Value ↓
→ Competitive Position ↓
→ Demand ↓

Animate the affected connections sequentially.

This should make causality understandable visually.

---

## 24. INSPECT ANY COMPONENT

Every major machine component must be clickable.

Click:

REVENUE

Open a side inspector:

Current: £42.5bn
Previous: £39.1bn
Growth: 8.7%

Formula / source

Upstream drivers

Downstream effects

Scenario assumptions

Historical chart

Click:

ROIC

Show exactly how ROIC was calculated.

Click:

FLYWHEEL

Show momentum decomposition.

The model must be auditable.

---

## 25. VISUAL DESIGN

Use the provided Going Concern Machine image as the conceptual visual reference.

Recreate it programmatically rather than simply displaying the image.

Preferred approach:

React / Next.js
TypeScript
SVG for machine components
Canvas/WebGL only where useful for high-performance animation
Framer Motion or equivalent for UI transitions
D3 only where useful for scales/data visualization

Use SVG heavily because individual machine components need to be interactive.

Style:

premium engineering schematic
off-white technical drawing background
graphite construction lines
brushed-metal appearance
subtle shadows
restrained brass/gold for economic/cash flows
green for healthy value creation
red for destruction/warnings
dark charcoal typography

Avoid:

cartoon graphics
generic SaaS cards everywhere
excessive gradients
futuristic sci-fi styling
dashboard-first design

---

## 26. ANIMATION RULES

Animation must encode state.

Examples:

Gear RPM ∝ activity/throughput

Pipe velocity ∝ cash flow

Reservoir height ∝ cash

Battery charge ∝ available capital

Brake pressure ∝ friction

Flywheel RPM ∝ momentum

Gear colour/intensity ∝ health

Pipe diameter may represent relative magnitude.

Negative values should not simply reverse every animation; design meaningful representations for outflows/losses.

---

## 27. RESPONSIVENESS

Desktop is the primary experience.

The complete machine should work at:

1920×1080
1440×900
MacBook screens

For mobile/tablet:

allow pan/zoom
provide component focus mode
collapse secondary panels
retain simulation controls

Do not attempt to squeeze the complete engineering schematic into a tiny viewport.

---

## 28. ARCHITECTURE

Keep four layers separate:

DATA LAYER

Financial statements
Market/company data
Manual assumptions

ECONOMIC MODEL

Deterministic equations
Stocks
Flows
Feedback loops
Time lags
Scenario calculations

STATE / SIMULATION ENGINE

Time
Scenario state
Shocks
User adjustments
Historical baseline

VISUALIZATION

SVG machinery
Animations
Controls
Gauges
Inspectors

The visualization must never contain core business calculations.

---

## 29. MODEL CONFIGURATION

Store economic relationships in configurable modules.

For example:

```text
model/revenue.ts
model/customers.ts
model/capital.ts
model/investment.ts
model/productivity.ts
model/momentum.ts
model/friction.ts
model/valuation.ts
```

This allows economic assumptions to evolve independently.

---

## 30. MVP

Do NOT try to perfect the entire economic theory before producing something usable.

Build MVP in this order:

PHASE 1

Interactive machine shell.

Flywheel
gears
cash pipes
capital battery
friction brakes
gauges

PHASE 2

Deterministic simulation.

Revenue
margin
FCF
cash
capital
investment
ROIC
momentum

PHASE 3

Interactive levers.

Users can modify assumptions and watch the machine react.

PHASE 4

Time simulation.

0–10 years.

PHASE 5

Ticker ingestion.

Load a public company and map financial statements onto the machine.

PHASE 6

Real-company what-if simulation.

PHASE 7

Advanced stocks, feedback loops, shocks and failure cascades.

---

## 31. FIRST DEMONSTRATION

The first working demo must allow me to:

1. Open the application.
2. See the Going Concern Machine running.
3. Move the Demand Growth lever.
4. Watch Demand change.
5. Watch Revenue respond.
6. Watch FCF respond.
7. Watch cash flow through the pipes.
8. Watch capital change.
9. Watch investment change.
10. Watch ROIC and Business Momentum respond.
11. Increase churn.
12. Watch the system deteriorate.
13. Press RESET.
14. Enter a supported public-company ticker.
15. Load available financials.
16. Watch the same machine configure itself for that company.
17. Modify one assumption.
18. Run a 10-year scenario.
19. Compare the result against the reported-company baseline.

If this interaction is compelling, the architecture is working.

---

## 32. CRITICAL PRINCIPLES

Do not fake precision.

Do not invent missing company data.

Do not use an LLM as the financial calculation engine.

Keep historical observations separate from scenario assumptions.

Keep accounting identities internally consistent.

Expose formulas.

Expose sources.

Make derived variables explainable.

Model delays between investment and results.

Separate liquidity, profitability and economic value creation.

Do not assume growth automatically creates value.

Do not assume investment automatically creates productive capacity.

Do not assume ROIC alone determines survival.

Make feedback loops explicit.

Make failure propagation visible.

Above all:

THE USER SHOULD FEEL AS THOUGH THEY ARE OPERATING A BUSINESS ENGINE, NOT FILLING IN A SPREADSHEET.

The governing principle of the entire application is:

THE MACHINE CONTINUES ONLY WHILE IT CREATES, CAPTURES AND REINVESTS ENOUGH ECONOMIC VALUE TO OFFSET THE FORCES THAT DESTROY IT.
