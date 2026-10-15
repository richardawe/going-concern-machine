import type { Course, ModuleDef } from './types';

// Module content. Module 1 is complete; modules 2–6 list the concepts they will cover and open once written.
// The figure's numbers are an illustrative retailer (price 1.00, unit cost 0.67, overheads 27, elasticity 1.5), kept
// deliberately simple so a student can check every number by hand. The decisions run on the full CEO-mode engine.

const priceWar: ModuleDef = {
  id: 'price-war', number: 1, title: 'The Price War', topic: 'Pricing and margin', caseId: 'price-war',
  summary: 'A discounter lands in your best regions. Match its prices, or hold price and build loyalty?',
  figure: 'margin-gearbox', figureTitle: 'Margin gearbox',
  outcomes: [
    'Calculate the volume needed to break even after a price change, and explain why it depends on margin.',
    'Explain operating leverage and why it makes thin-margin businesses fragile.',
    'Judge a pricing response by its effect on cash and long-run value, not on volume alone.',
  ],
  concepts: [
    { id: 'elasticity', title: 'Price elasticity of demand', short: 'Elasticity', price: -.1,
      body: 'Elasticity measures how far volume moves when price moves. At 1.5, every 1% cut in price adds about 1.5% to volume, and every 1% rise loses about 1.5%.',
      formula: '% change in volume ≈ −1.5 × % change in price',
      task: 'Move the lever between 0% and −10% and read the volume change in the readout.',
      prompt: 'What does an elasticity of 1.5 mean for this retailer? Why might it be much lower for a luxury brand?' },
    { id: 'margin', title: 'Gross margin and contribution', short: 'Gross margin', price: -.12,
      body: 'Each unit sold contributes its price minus its variable cost. That contribution is what pays for overheads. Here it is 0.33 a unit, a 33% gross margin.',
      formula: 'gross margin = (price − unit cost) ÷ price',
      task: 'Set the lever to −12% and watch the gross margin fall from 33.0% to 23.9%.',
      prompt: 'Explain why a 12% price cut takes only 9 points off the gross margin percentage, but cuts profit per unit by more than a third.' },
    { id: 'break-even', title: 'Break-even volume after a price change', short: 'Break-even volume', price: -.12,
      body: 'To keep gross profit level after a price cut, volume has to rise until the extra units make up for the thinner margin on every unit. The volume needed depends on the margin, not on the size of the cut alone.',
      formula: 'required volume = old profit per unit ÷ new profit per unit = 0.33 ÷ 0.21 = 1.57×',
      task: 'Keep the lever at −12%. The readout shows volume up 18%, but staying level needs 57%.',
      prompt: 'Explain why a 12% price cut needs far more than 12% extra volume to keep gross profit level. Use the numbers on the figure.' },
    { id: 'cost-behaviour', title: 'Fixed and variable costs', short: 'Fixed vs variable', price: -.12,
      body: 'The unit cost of 0.67 rises and falls with volume. Overheads of 27 stay the same whatever is sold. A price cut attacks the gap between price and unit cost, and leaves the overheads untouched.',
      formula: 'profit = units × (price − unit cost) − fixed costs',
      task: 'Watch the red drain from the tank. It runs at the same rate wherever you set the lever.',
      prompt: 'Give two costs of a supermarket that are variable and two that are fixed, and explain why the difference matters in a price war.' },
    { id: 'operating-leverage', title: 'Operating leverage', short: 'Operating leverage', price: -.05,
      body: 'Because overheads are fixed, a small change in gross profit causes a much larger change in what is left. Here gross profit falls by 25% but cash after overheads goes from +6.0 to −2.2 a year.',
      formula: 'degree of operating leverage = gross profit ÷ operating profit = 33 ÷ 6 = 5.5×',
      task: 'Move between 0% and −5%, and compare the change in gross profit with the change in cash.',
      prompt: 'Explain operating leverage in your own words, and say why it makes thin-margin retailers fragile in a price war.' },
    { id: 'competitive-response', title: 'Competitive response', short: 'Competitive response', price: -.15,
      body: 'A price cut can be matched. If the rival can always match you, the cut moves profit to customers and not to you. Both firms can end up worse off, which is the logic of a price war.',
      task: 'Imagine the discounter cuts again after you match it. Set the lever to −15%.',
      prompt: 'Use the idea of a prisoner’s dilemma to explain why both firms can end up worse off after a price war.' },
    { id: 'differentiation', title: 'Differentiation and the time lag', short: 'Differentiation lag', price: 0,
      body: 'Service, loyalty schemes and own-brand ranges make customers less sensitive to price. They cost money now and pay back later, often after about two years.',
      task: 'Set the lever back to 0%. Investing in loyalty keeps the price where it is and lowers elasticity later.',
      prompt: 'Why do boards often abandon differentiation strategies too early? Use the idea of a time lag.' },
    { id: 'runway', title: 'Liquidity and cash runway', short: 'Cash runway', price: -.12,
      body: 'Being profitable and surviving are different things. The cash reserve decides how long a loss-making strategy can last. Whoever runs out of cash first loses the price war.',
      formula: 'runway = cash reserve ÷ yearly cash burn',
      task: 'Set the lever to −12% and watch the tank. How long would a reserve of 10 last?',
      prompt: 'Explain why liquidity can matter more than strategy in a price war, using the idea of runway.' },
  ],
  check: [
    { id: 'q1', kind: 'mcq', stem: 'Gross margin is 33% (price 1.00, unit cost 0.67). You cut price by 12% and unit cost doesn’t change. What is the new gross margin?',
      options: ['21.0%', '23.9%', '29.0%', '33.0%'], answer: 1,
      why: 'The new price is 0.88. Gross profit per unit is 0.88 − 0.67 = 0.21, and 0.21 ÷ 0.88 = 23.9%. The margin falls by 9 points, not 12.' },
    { id: 'q2', kind: 'mcq', stem: 'Using the same figures, by how much must volume rise for total gross profit to stay where it was after the 12% cut?',
      options: ['+12%', '+36%', '+57%', '+88%'], answer: 2,
      why: 'Profit per unit falls from 0.33 to 0.21. Keeping total profit level needs 0.33 ÷ 0.21 = 1.57 times the volume, a 57% increase. With an elasticity of 1.5 the cut brings only +18%.' },
    { id: 'q3', kind: 'mcq', stem: 'On the figure, what does it mean when the cash tank drains while the flywheel keeps turning?',
      options: ['Revenue has fallen', 'Gross profit is now below fixed overheads', 'Unit cost has risen', 'The business has taken on debt'], answer: 1,
      why: 'The flywheel turns as long as there is gross profit. The tank drains when gross profit doesn’t cover the overheads: a loss, even though sales continue.' },
    { id: 'q4', kind: 'text', personal: { year: 1 }, stem: 'Using the figures from your own debrief, explain what your year-1 decision did to cash in years 1–3.',
      model: 'Matching would cut gross profit per unit from 0.33 to 0.21. Volume rises about 18%, which is not enough, so gross profit falls below the fixed overheads and cash turns negative. Holding price and investing in loyalty costs cash in years 1–2 but protects the margin, so cash recovers once the loyalty effect arrives in year 3.' },
    { id: 'q5', kind: 'text', stem: 'Gross profit fell 25%, but cash after overheads fell by more than 100%. Explain why, using operating leverage.',
      model: 'Overheads of 27 are fixed, so they don’t fall when gross profit falls. With gross profit at 33, only 6 was left over. A fall of 8.2 in gross profit wipes out that 6 and goes 2.2 beyond it. The larger fixed costs are relative to profit, the more any change in gross profit is magnified in what remains.' },
    { id: 'q6', kind: 'text', stem: 'The reference path held price and invested in loyalty. Explain why it looked worse in year 1 but better by year 5.',
      model: 'Loyalty spending is a cost straight away, while its benefit, customers who are less sensitive to price and leave less often, arrives about two years later. Early results understate the strategy. Once it matures the business keeps both its margin and its volume while the discounter is still competing on price alone.' },
    { id: 'q7', kind: 'text', stem: 'Describe one situation in which matching a competitor’s price cut would be the right decision, and justify it.',
      model: 'When gross margin is high and demand is very price-sensitive, for example software with a 75% margin and an elasticity above 3, the extra volume can outweigh the margin given up. Matching can also be right when the rival is weaker and you have the cash to outlast it, so the cut is temporary.' },
  ],
  reflection: 'Looking back at your five decisions and the debrief, which decision would you change, and which concept from this module explains why?',
  ready: true,
};

const planned = (id: string, number: number, title: string, topic: string, caseId: string, summary: string, figureTitle: string, concepts: string[]): ModuleDef =>
  ({ id, number, title, topic, caseId, summary, figure: null, figureTitle, outcomes: [], concepts: [], check: [], reflection: '', ready: false, planned: concepts });

export const modules: ModuleDef[] = [
  priceWar,
  planned('talent-exodus', 2, 'Talent Exodus', 'People economics', 'talent-exodus', 'A rival is poaching your engineers. Pay up, lock them in, or shrink the roadmap?', 'Leaking pressure vessel with a pay valve',
    ['Labour as cost and capacity', 'Attrition and replacement cost', 'Morale and productivity', 'Permanent versus one-off costs', 'Human capital investment and lag', 'Capacity constraints', 'Funding growth: equity versus debt', 'Acquisition and integration risk']),
  planned('cash-crunch', 3, 'Cash Crunch', 'Liquidity', 'cash-crunch', 'Profitable on paper, but the cash runs out in ninety days.', 'Reservoir on a rotary conveyor',
    ['Profit versus cash', 'The working-capital cycle (DSO, DIO, DPO)', 'Cash conversion cycle', 'Liquidity ratios', 'Covenants and interest cover', 'Short-term financing and factoring', 'Going-concern assessment (IAS 1, ISA 570)', 'Cash triage and deferring capex']),
  planned('growth-at-any-cost', 4, 'Growth at Any Cost?', 'Unit economics', 'growth-at-any-cost', 'The board wants growth. The customer cohorts tell another story.', 'Bucket elevator with holed buckets',
    ['Customer acquisition cost', 'Churn and retention', 'Customer lifetime value', 'LTV/CAC and payback', 'Cohort analysis', 'Growth versus profitability (Rule of 40)', 'Burn rate and runway', 'Dilution and funding rounds']),
  planned('automation-bet', 5, 'The Automation Bet', 'Capital investment', 'automation-bet', 'Spend now to cut costs for a decade?', 'Press with a payback dial',
    ['Capex versus opex', 'Time value of money and discount rates', 'Net present value', 'Payback period and IRR', 'Depreciation and non-cash costs', 'Cost structure and operating leverage', 'Sunk costs', 'Implementation risk and real options']),
  planned('dividend-pressure', 6, 'Dividend Pressure', 'Capital allocation', 'dividend-pressure', 'Shareholders want cash back. The plant wants new equipment.', 'Three-way splitter valve',
    ['Free cash flow', 'Dividend policy and signalling', 'Buybacks versus dividends', 'ROIC versus WACC', 'Capital structure and leverage', 'Reinvestment rate and growth', 'Agency problems and activists', 'Shareholder and stakeholder views']),
];
export const moduleById = (id: string) => modules.find(m => m.id === id);

// The prototype runs one pilot course; a lecturer's link names it with ?c=<id>.
export const courses: Course[] = [
  { id: 'pilot', code: 'GCM 101', title: 'Strategic Finance: the Going Concern pilot', lecturer: 'Your lecturer', modules: modules.map(m => m.id) },
];
export const courseById = (id: string | null | undefined) => courses.find(c => c.id === id) ?? courses[0];

