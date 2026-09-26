import type { Baseline, State, Fact } from './types';
import { stockLabels } from './config';
export const metricInfo: Record<string, {label:string; formula:string; upstream:string; downstream:string; unit?:string}> = {
 revenue:{label:'Revenue',formula:'Customer activity × productivity × price',upstream:'Demand, customers, price, productive capacity',downstream:'Gross profit, working capital, cash'},
 demand:{label:'Demand',formula:'Initial customer activity × (1 + demand growth)^year × demand shock × customer value × competition effect',upstream:'External market need, competitive pressure, customer value',downstream:'Customer activity, revenue'},
 customers:{label:'Customer activity',formula:'Prior activity + acquired activity − lost activity (including demand contraction)',upstream:'Demand, churn, acquisition budget / CAC',downstream:'Volume, revenue'},
 newCustomers:{label:'Customer acquisition',formula:'Min(acquisition budget / CAC, remaining demand)',upstream:'Baseline acquisition budget (included in opex), prior brand/distribution investment, CAC',downstream:'Customer activity, revenue'},
 volume:{label:'Value delivered / volume',formula:'Customer activity × productivity',upstream:'Customers, productive capacity, productivity growth',downstream:'Revenue'},
 grossProfit:{label:'Gross profit',formula:'Revenue − cost of goods and services',upstream:'Revenue, gross margin, competition',downstream:'Operating profit'},
 grossMargin:{label:'Gross margin',formula:'Gross profit / revenue',upstream:'Cost to deliver value, pricing',downstream:'Operating profit, cash conversion',unit:'percent'},
 operatingProfit:{label:'Operating profit',formula:'Gross profit − cash operating expenses − depreciation − expense investment',upstream:'Margin, fixed and variable costs, R&D / people / marketing investment',downstream:'Tax, operating cash flow, ROIC'},
 operatingCashFlow:{label:'Operating cash flow',formula:'Operating profit − tax − interest + depreciation − working capital investment',upstream:'Operating profit, tax, interest, noncash depreciation, working capital',downstream:'FCF, cash reserves'},
 freeCashFlow:{label:'Free cash flow',formula:'Operating cash flow − maintenance CapEx − growth CapEx. Working capital is already deducted in CFO.',upstream:'Cash from operations, capital expenditure',downstream:'Cash, distributions, debt repayment'},
 cash:{label:'Cash reserve',formula:'Prior cash + FCF − dividends − debt repayment. A negative balance is an unfunded gap, not automatic borrowing.',upstream:'Cash generation, investment, payouts',downstream:'Liquidity, available capital, business survival'},
 availableCapital:{label:'Available capital',formula:'Max(0, cash balance). Retained earnings are not added again to cash.',upstream:'Cash generation, payouts, debt repayment',downstream:'Capacity to fund future spending'},
 investment:{label:'Productive investment',formula:'Max(0, pre-investment free cash flow) × reinvestment rate, distributed by relative productive allocation weights',upstream:'Cash generation, management allocation',downstream:'Expense investment / growth CapEx now; economic stocks after the investment lag'},
 investedCapital:{label:'Invested capital',formula:'Modeled net fixed assets + working capital. Fixed assets accumulate maintenance / growth CapEx less depreciation.',upstream:'Initial capital, CapEx, depreciation, working capital',downstream:'ROIC denominator, turnover'},
 roic:{label:'Return on invested capital',formula:'Operating profit × (1 − tax rate) / average opening and closing invested capital',upstream:'NOPAT, invested capital',downstream:'Value creation spread, momentum',unit:'percent'},
 businessMomentum:{label:'Business momentum',formula:'Sum of clipped normalized signals × weights × 100. Range −100 to +100; a transparent model index, not a growth rate.',upstream:'Revenue, FCF, ROIC, customer activity, retention, productivity, liquidity',downstream:'Flywheel speed and machine state',unit:'index'},
 productiveCapacity:{label:'Productive capacity',formula:'Weighted sum of each economic stock / its initial stock',upstream:'Delayed investment × efficiency, depreciation',downstream:'Productivity, customer value, retention',unit:'index'},
 productivity:{label:'Productivity',formula:'(1 + productivity growth)^year × productivity shock × productive capacity^0.15',upstream:'Productive capacity, productivity assumptions',downstream:'Volume delivered, revenue',unit:'index'},
 retention:{label:'Customer value / retention',formula:'1 − churn rate. Churn responds to modeled productive capacity; never a reported customer metric unless sourced.',upstream:'Assumed churn, productive capacity',downstream:'Customers, revenue, momentum',unit:'percent'},
 churnRate:{label:'Customer churn',formula:'Clamp(assumed churn / modeled customer value, 0, 95%)',upstream:'User churn assumption, productive capacity',downstream:'Customers → revenue → FCF → investment',unit:'percent'},
 interestExpense:{label:'Interest expense',formula:'Opening debt × interest rate',upstream:'Debt, refinancing / rate shocks',downstream:'Taxable income, cash generation'},
 debt:{label:'Debt outstanding',formula:'Prior debt − repayment (limited to outstanding debt and distributable cash)',upstream:'Opening debt, repayment allocation',downstream:'Interest, balance-sheet resilience'},
 maintenanceCapex:{label:'Maintenance CapEx',formula:'Revenue × maintenance ratio × (0.5 + maintenance weight / 50)',upstream:'Revenue, maintenance policy',downstream:'FCF, fixed assets, delayed physical capacity'},
 growthCapex:{label:'Growth CapEx',formula:'Productive investment allocated to infrastructure, automation and acquisitions',upstream:'Investment budget, relative weights',downstream:'Cash today; fixed assets and delayed productive stocks'},
 friction:{label:'System friction',formula:'Braking combines churn, negative ROIC spread and interest / revenue. Other illustrated forces enter through cost, competition and decay assumptions.',upstream:'Competition, churn, depreciation, interest, tax, operating costs',downstream:'Profitability, liquidity and productive capacity'},
};
for(const [key,label] of Object.entries(stockLabels)) metricInfo[key]={label,formula:'Prior stock × (1 − decay) + investment arriving after lag × investment efficiency',upstream:'Capital allocation, delay, investment efficiency',downstream:'Weighted productive capacity; customer value and productivity',unit:'stock'};
export function metricFact(key: string, s: State, b: Baseline): Fact {
  if(s.year===0 && b.facts[key])return b.facts[key];
  const stock = key in stockLabels;
  const value = stock ? s.stocks[key as keyof typeof s.stocks] : typeof s[key as keyof State]==='number' ? s[key as keyof State] as number : null;
  const assumption = ['demand','customers','newCustomers','volume','retention','churnRate','productiveCapacity','productivity','businessMomentum','friction'].includes(key) || stock;
  return {value,status:s.year===0&&!b.company?'USER ASSUMPTION':assumption?'ESTIMATED':'CALCULATED',source:s.year===0?'Initial model assumptions':'Deterministic scenario model / user assumptions',period:s.year===0?b.period:`Scenario year ${s.year}`,calculation:metricInfo[key]?.formula ?? 'Model-derived value'};
}
