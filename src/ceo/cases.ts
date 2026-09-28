import type { CaseDef } from './types';
// Scenario content. Cards state what the board would see; hidden second-order effects live in `delayed` and `risk`.
// Every case also offers "Hold course" (no card) on every turn.

const priceWar: CaseDef = {
  id: 'price-war', title: 'The Price War', archetype: 'retail', seed: 1207,
  tagline: 'A discounter lands in your best regions. Match, differentiate or out-wait them?',
  briefing: 'You have just been appointed CEO. The business is steady: modest growth, thin but reliable margins, loyal regional customers. Last week a national discounter announced 40 new stores in your three strongest regions, pricing 12% below you. The board wants a plan by Monday.',
  objectives: ['Protect long-run value, not just this year’s market share.', 'Price cuts in a low-margin business destroy profit faster than they save volume.', 'Differentiation takes time to pay off: judge it on year 4 and 5, not year 1.', 'Never let a price war drain the cash reserve.'],
  events: [
    { year: 1, kind: 'competitorPriceCut', size: -.12, headline: 'Discounter opens 40 stores, pricing 12% below you' },
    { year: 3, kind: 'costInflation', size: .04, headline: 'Suppliers push through a 4% cost increase' },
  ],
  turns: [
    { year: 1, memo: 'The discounter has landed. Regional managers want to match prices at once; the CFO wants to protect margin. Marketing thinks customers will pay for service.', cards: [
      { id: 'matchPrice', title: 'Match the discounter’s prices', fn: 'marketing', pitch: 'Cut prices 12%. Keep every customer; margin takes the hit.', effects: { price: -.12 } },
      { id: 'brandService', title: 'Hold prices; invest in service and loyalty', fn: 'marketing', pitch: 'Costs 1% of revenue now plus a bigger marketing budget. Loyalty builds over two years.', effects: { oneOffCost: .01, allocations: { marketing: 30, product: 20 }, delayed: { years: 2, note: 'Loyalty programme matures: customers are less price-sensitive', effects: { elasticity: .55, churn: -.02 } } } },
      { id: 'privateLabel', title: 'Launch a private-label range', fn: 'product', pitch: 'Cheaper own-brand products at better margins, after a year of setup costing 1.5% of revenue.', effects: { oneOffCost: .015, delayed: { years: 1, note: 'Private label reaches the shelves', effects: { grossMargin: .025, elasticity: .8 } } } },
      { id: 'cutToFund', title: 'Cut 10% of store staff to fund a 6% price cut', fn: 'people', pitch: 'Halves the price gap without touching the margin, on paper.', effects: { workforce: -.1, price: -.06 } },
    ] },
    { year: 2, memo: 'The discounter keeps expanding. Your online share is small and the board keeps asking about it.', cards: [
      { id: 'partialMatch', title: 'Cut prices 5% on key lines', fn: 'marketing', pitch: 'A targeted response on the products customers compare.', effects: { price: -.05 } },
      { id: 'online', title: 'Build an online and click-and-collect channel', fn: 'operations', pitch: 'Costs 2% of revenue now. Reaches new customers in two years.', effects: { oneOffCost: .02, allocations: { infrastructure: 20 }, delayed: { years: 2, note: 'Online channel is live and growing', effects: { demand: 1.06 } } } },
      { id: 'debtExpansion', title: 'Borrow to open 20 new stores', fn: 'finance', pitch: 'Raise debt worth 8% of revenue and go on the offensive.', effects: { debt: .08, allocations: { infrastructure: 40 }, delayed: { years: 2, note: 'New stores open', effects: { demand: 1.05 } }, risk: { chance: .35, headline: 'New stores open in the discounter’s shadow and underperform', effects: { opexRatio: .01 } } } },
    ] },
    { year: 3, memo: 'Suppliers want 4% more. Your buyers think one big supplier is bluffing.', cards: [
      { id: 'passThrough', title: 'Pass the increase on: prices +4%', fn: 'marketing', pitch: 'Keeps the margin intact.', effects: { price: .04 } },
      { id: 'renegotiate', title: 'Play hardball with suppliers', fn: 'operations', pitch: 'Could win better terms than before. Could also go badly.', effects: { oneOffCost: .005, grossMargin: .015, risk: { chance: .3, headline: 'A key supplier walks away; shelves are empty for a quarter', effects: { oneOffCost: .015, churn: .01 } } } },
      { id: 'automateStores', title: 'Self-checkout and store automation', fn: 'operations', pitch: 'Costs 2.5% of revenue; reduces staffing needs in two years.', effects: { oneOffCost: .025, delayed: { years: 2, note: 'Automation lets stores run with fewer staff', effects: { opexRatio: -.012, workforce: -.05 } } } },
    ] },
    { year: 4, memo: 'Shareholders ask what happens to the cash. The finance team presents three options.', cards: [
      { id: 'specialDividend', title: 'Raise the dividend', fn: 'finance', pitch: 'Reward patient shareholders.', effects: { allocations: { dividends: 40 } } },
      { id: 'payDown', title: 'Pay down debt', fn: 'finance', pitch: 'A stronger balance sheet for the next shock.', effects: { allocations: { debtRepayment: 50 } } },
      { id: 'reinvest', title: 'Reinvest harder in the stores', fn: 'strategy', pitch: 'Raise the reinvestment rate by 20 points.', effects: { reinvestment: .2 } },
    ] },
    { year: 5, memo: 'Your final year. Rumour says the discounter is losing money.', cards: [
      { id: 'raisePrices', title: 'Edge prices back up 5%', fn: 'marketing', pitch: 'If they are weakening, now is the time.', effects: { price: .05 } },
      { id: 'staffBonus', title: 'Thank the team: a 5% bonus', fn: 'people', pitch: 'They held the line through a hard fight.', effects: { bonus: .05 } },
    ] },
  ],
  reference: [{ card: 'brandService' }, { card: 'online' }, { card: 'passThrough' }, { card: 'payDown' }, { card: null }],
  weights: { value: .3, survival: .2, growth: .15, people: .15, customers: .2 },
  lessons: [
    { when: 'took:matchPrice', note: 'Matching a 12% price cut with a ~33% gross margin gives away over a third of gross profit on every sale, and the discounter can keep cutting. Volume rarely comes back fast enough.' },
    { when: 'took:cutToFund', note: 'Cutting store staff to fund prices looks neutral on paper, but under-staffed stores lose productivity and morale, and customers notice the service.' },
    { when: 'took:brandService', note: 'Loyalty investment cost money in years 1–2 and made customers less price-sensitive from year 3. That lag is why impatient boards abandon differentiation too early.' },
    { when: 'skipped:brandService', note: 'The reference path held price and invested in loyalty. It looks worse in year 1 and better by year 5.' },
    { when: 'emergency', note: 'You ran out of cash. In a price war, liquidity is the weapon: whoever runs out first loses, whatever their strategy.' },
    { when: 'always', note: 'Compare yourself with “doing nothing”: in some years inaction is the hardest decision to beat.' },
  ],
};

const talentExodus: CaseDef = {
  id: 'talent-exodus', title: 'Talent Exodus', archetype: 'software', seed: 4401,
  tagline: 'A rival is poaching your engineers. Pay up, lock them in, or shrink the roadmap?',
  briefing: 'Your software business is profitable and growing. Then a rival raises a huge funding round and starts hiring your best engineers with 20% pay rises. Attrition is climbing and two product launches are at risk.',
  objectives: ['In a people business, morale and attrition drive productivity, and productivity drives revenue.', 'One-off bonuses buy a year; pay and culture change the trend.', 'Cutting scope saves cash now but can starve the product of the capacity it needs to meet demand later.', 'When demand turns up, a team that has held together can capture it.'],
  events: [
    { year: 1, kind: 'talentWar', size: .08, headline: 'A newly funded rival poaches engineers with 20% raises' },
    { year: 3, kind: 'demandBoom', size: .1, headline: 'A wave of AI adoption lifts demand across your category' },
  ],
  turns: [
    { year: 1, memo: 'Five senior engineers resigned this month. HR says more will follow unless something changes.', cards: [
      { id: 'matchPay', title: 'Raise engineering pay to market (+8%)', fn: 'people', pitch: 'A permanent cost increase. Closes the gap with the rival.', effects: { pay: .08 } },
      { id: 'retentionBonus', title: 'Pay one-off retention bonuses (10% of payroll)', fn: 'people', pitch: 'Cheaper than a permanent raise, and it buys time.', effects: { bonus: .1 } },
      { id: 'contractors', title: 'Backfill with contractors', fn: 'operations', pitch: 'Keep the roadmap moving. Costs 2% of revenue; the permanent team may resent it.', effects: { oneOffCost: .02, workforce: .05, morale: -.05 } },
      { id: 'cutScope', title: 'Cut the roadmap and trim the team 8%', fn: 'strategy', pitch: 'Fewer products, a smaller team, more cash.', effects: { workforce: -.08, allocations: { rd: -25 } } },
    ] },
    { year: 2, memo: 'The poaching continues. Managers propose ways to make people want to stay.', cards: [
      { id: 'academy', title: 'Build a training academy', fn: 'people', pitch: 'Costs 1% of revenue plus a bigger people budget. Careers grow in two years.', effects: { oneOffCost: .01, allocations: { people: 30 }, delayed: { years: 2, note: 'Academy graduates reach senior roles', effects: { morale: .1, churn: -.01 } } } },
      { id: 'remoteFirst', title: 'Go remote-first', fn: 'people', pitch: 'People love it and office costs fall. Collaboration may suffer.', effects: { morale: .08, opexRatio: -.01, risk: { chance: .3, headline: 'Remote teams drift apart; two launches slip', effects: { morale: -.06, churn: .01 } } } },
      { id: 'hireAhead', title: 'Hire 10% ahead of plan', fn: 'people', pitch: 'Rebuild capacity before demand arrives.', effects: { workforce: .1 } },
    ] },
    { year: 3, memo: 'Demand is surging. Sales wants capacity; finance wants price.', cards: [
      { id: 'hireForBoom', title: 'Hire 12% more people', fn: 'people', pitch: 'Capture the wave while it lasts.', effects: { workforce: .12 } },
      { id: 'priceUp', title: 'Raise prices 8%', fn: 'marketing', pitch: 'Demand is strong; take the margin.', effects: { price: .08 } },
      { id: 'marketingPush', title: 'Launch a big marketing push', fn: 'marketing', pitch: 'Grab share while buyers are shopping.', effects: { allocations: { marketing: 40 } } },
    ] },
    { year: 4, memo: 'Investors are calling. A startup with a strong team is for sale.', cards: [
      { id: 'raiseEquity', title: 'Raise equity (15% of revenue) for R&D', fn: 'finance', pitch: 'Fund the roadmap without debt.', effects: { equity: .15, allocations: { rd: 30 } } },
      { id: 'acquihire', title: 'Buy the startup for its team', fn: 'strategy', pitch: 'Costs 8% of revenue. Integration is never painless.', effects: { oneOffCost: .08, workforce: .06, delayed: { years: 1, note: 'Acquired product ships', effects: { demand: 1.04, morale: -.04 } } } },
      { id: 'buyback', title: 'Return cash to shareholders', fn: 'finance', pitch: 'Raise the payout.', effects: { allocations: { dividends: 40 } } },
    ] },
    { year: 5, memo: 'Your final year. The rival’s funding is running out.', cards: [
      { id: 'equityGrants', title: 'Broad equity grants for all staff', fn: 'people', pitch: 'Lock in the team for the next chapter.', effects: { pay: .03, morale: .06 } },
      { id: 'trimCosts', title: 'Trim 5% of costs for the year-end numbers', fn: 'finance', pitch: 'Makes the final year look good.', effects: { workforce: -.05 } },
    ] },
  ],
  reference: [{ card: 'matchPay' }, { card: 'academy' }, { card: 'hireForBoom' }, { card: null }, { card: 'equityGrants' }],
  weights: { value: .25, survival: .15, growth: .2, people: .25, customers: .15 },
  lessons: [
    { when: 'took:cutScope', note: 'Trimming the team in year 1 saved cash but left you under capacity when demand surged in year 3; understaffing costs productivity faster than overstaffing adds it.' },
    { when: 'took:retentionBonus', note: 'A bonus lifts morale for one year, then it fades back. A permanent pay gap keeps pulling attrition up.' },
    { when: 'took:matchPay', note: 'Matching pay is expensive every year, but it stops the attrition that quietly drains productivity and the human-capital stock.' },
    { when: 'took:trimCosts', note: 'Final-year cuts flatter the numbers you are judged on and weaken the business you hand over.' },
    { when: 'emergency', note: 'You ran out of cash. Growth decisions need funding decisions to go with them.' },
    { when: 'always', note: 'Watch the people gauges: morale moves first, attrition second, productivity and revenue last.' },
  ],
};

const cashCrunch: CaseDef = {
  id: 'cash-crunch', title: 'Cash Crunch', archetype: 'industrial', seed: 9173,
  setup: { cashToRevenue: .025, debtToOperatingProfit: 4, note: 'a stretched balance sheet: cash of 2.5% of revenue and debt of four times operating profit.' },
  tagline: 'Rates jump, then a recession hits. Keep the lights on without eating the seed corn.',
  briefing: 'Your manufacturing business carries heavy debt, thin cash and a lot of working capital. Interest rates have just jumped 300 basis points, economists are warning of a recession, and the bank wants to talk about your credit line.',
  objectives: ['Liquidity first: a profitable company can still fail if it runs out of cash.', 'Working capital is cash you can release without cutting capacity.', 'Deep cuts to investment and people save cash now and cost you the recovery.', 'When the recovery comes, the companies that kept capacity capture it.'],
  events: [
    { year: 1, kind: 'rateRise', size: .03, headline: 'Rates up 300 bps; your credit line reprices' },
    { year: 2, kind: 'recession', size: .2, headline: 'Recession: orders fall by a fifth and customers pay late' },
    { year: 2, kind: 'creditSqueeze', size: .25, headline: 'Your bank cuts the credit line: a quarter of your debt must be repaid this year' },
    { year: 4, kind: 'demandBoom', size: .08, headline: 'Recovery: orders come back strongly' },
  ],
  turns: [
    { year: 1, memo: 'Interest costs are up and a downturn looks likely. The CFO wants options on the table.', cards: [
      { id: 'cutCapex', title: 'Freeze investment', fn: 'finance', pitch: 'Cut the reinvestment rate by 30 points and trim maintenance.', effects: { reinvestment: -.3, allocations: { maintenance: -15 } } },
      { id: 'workingCapital', title: 'Release working capital', fn: 'operations', pitch: 'Tighter inventory and faster collections; small discounts to customers.', effects: { workingCapital: -.06, grossMargin: -.005 } },
      { id: 'raiseEquity', title: 'Raise equity now (10% of revenue)', fn: 'finance', pitch: 'Dilutive, but the cash is there before you need it.', effects: { equity: .1 } },
      { id: 'layoffs', title: 'Lay off 12% of staff', fn: 'people', pitch: 'The fastest way to cut costs.', effects: { workforce: -.12 } },
    ] },
    { year: 2, memo: 'The recession has arrived. Orders are down and customers want discounts.', cards: [
      { id: 'priceCut', title: 'Cut prices 5% to hold volume', fn: 'marketing', pitch: 'Keep the plants loaded.', effects: { price: -.05 } },
      { id: 'shortWeeks', title: 'Short working weeks instead of layoffs', fn: 'people', pitch: 'Everyone takes a 5% pay cut for a year; nobody loses their job.', effects: { pay: -.05, morale: .03, delayed: { years: 1, note: 'Full hours restored', effects: { pay: .05 } } } },
      { id: 'keepInvesting', title: 'Keep investing through the downturn', fn: 'strategy', pitch: 'Raise reinvestment 20 points while competitors retreat.', effects: { reinvestment: .2 } },
    ] },
    { year: 3, memo: 'The worst may be over. Your bank offers to refinance; engineering proposes automation.', cards: [
      { id: 'refinance', title: 'Refinance into long-term fixed debt', fn: 'finance', pitch: 'A fee now for a rate 1.5 points lower.', effects: { oneOffCost: .005, interestRate: -.015 } },
      { id: 'suspendDividend', title: 'Suspend the dividend', fn: 'finance', pitch: 'Keep every dollar in the business.', effects: { allocations: { dividends: -60 } } },
      { id: 'automate', title: 'Automate the main plant', fn: 'operations', pitch: 'Costs 3% of revenue now; cuts costs and headcount in two years.', effects: { oneOffCost: .03, delayed: { years: 2, note: 'Automation line comes online', effects: { opexRatio: -.03, workforce: -.06 } } } },
    ] },
    { year: 4, memo: 'Orders are back. Can you meet them?', cards: [
      { id: 'rehire', title: 'Rehire 8%', fn: 'people', pitch: 'Staff up to meet demand.', effects: { workforce: .08 } },
      { id: 'capacity', title: 'Invest in new capacity', fn: 'strategy', pitch: 'Raise reinvestment and infrastructure spend.', effects: { reinvestment: .15, allocations: { infrastructure: 25 } } },
      { id: 'payDebt', title: 'Pay down debt first', fn: 'finance', pitch: 'Use the recovery to deleverage.', effects: { allocations: { debtRepayment: 50 } } },
    ] },
    { year: 5, memo: 'Your final year. The board wants to know the business is ready for the next cycle.', cards: [
      { id: 'resumeDividend', title: 'Restore the dividend', fn: 'finance', pitch: 'Shareholders waited patiently.', effects: { allocations: { dividends: 40 } } },
      { id: 'growthPush', title: 'Push into a new market', fn: 'marketing', pitch: 'Marketing and sales budgets up.', effects: { allocations: { marketing: 30, sales: 20 } } },
    ] },
  ],
  reference: [{ card: 'workingCapital', levers: { dividends: 0, reinvestment: 25 } }, { card: 'shortWeeks', levers: { dividends: 0, reinvestment: 25 } }, { card: 'refinance', levers: { dividends: 0, reinvestment: 40 } }, { card: 'rehire', levers: { dividends: 0, reinvestment: 50 } }, { card: null, levers: { reinvestment: 50 } }],
  weights: { value: .2, survival: .35, growth: .15, people: .15, customers: .15 },
  lessons: [
    { when: 'took:workingCapital', note: 'Releasing working capital raised cash without cutting capacity, the cheapest money in a downturn.' },
    { when: 'took:layoffs', note: 'Layoffs cut cost fast, but they came with severance, a morale shock and lost know-how, and you were short-staffed when orders returned in year 4.' },
    { when: 'took:cutCapex', note: 'Freezing investment protects cash today; productive stocks decay while you wait, and the effects show up years later.' },
    { when: 'took:priceCut', note: 'In an industrial business with ~35% gross margin, a 5% price cut costs about a seventh of gross profit on every unit.' },
    { when: 'emergency', note: 'You ran out of cash, and the emergency loan came at a penalty rate that dragged on every later year.' },
    { when: 'took:raiseEquity', note: 'Raising equity before the squeeze bought safety, but new capital is charged at the cost of capital in the value score: safety has a price.' },
    { when: 'always', note: 'The cards alone rarely get you through the credit squeeze. The reference path pairs releasing working capital with the dividend and reinvestment levers: several small moves add up to a big one.' },
    { when: 'always', note: 'Survival carries the heaviest weight in this case: a business that fails never gets to enjoy the recovery.' },
  ],
};

export const cases: CaseDef[] = [priceWar, talentExodus, cashCrunch];
