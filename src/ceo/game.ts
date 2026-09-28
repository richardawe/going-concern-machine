import { clamp, ratio } from '../model/config';
import { engineContext, stepYear } from '../model/engine';
import { momentum } from '../model/momentum';
import type { Assumptions } from '../model/types';
import { money } from '../presentation';
import { normal, uniform } from './random';
import type { Card, Decision, Effects, Game, Headline, Levers, People, StartCompany, YearRecord } from './types';

// CEO mode layers people, pricing, financing, decisions and events over the deterministic engine in model/engine.ts.
// A game is its decisions: `play` replays them from Year 0, so a counterfactual is just a replay with a decision changed.
const NEUTRAL_MORALE = .7, RAMP = .4, DEMAND_NOISE = .03;

export function defaultLevers(start: StartCompany): Levers {
  const a = start.baseline.assumptions.allocations;
  return { price: 0, workforce: 0, pay: 0, marketing: a.marketing, rd: a.rd, people: a.people, dividends: a.dividends, reinvestment: Math.round(start.baseline.assumptions.reinvestmentRate * 100) };
}
export const statusQuo = (start: StartCompany, years: number): Decision[] => Array.from({ length: years }, () => ({ card: null, levers: defaultLevers(start) }));
export const findCard = (game: Game, year: number, id: string | null): Card | undefined => id == null ? undefined : game.caseDef.turns.find(t => t.year === year)?.cards.find(c => c.id === id);

export function initialPeople(start: StartCompany): People {
  const s = start.baseline.state, payroll = Math.max(0, s.revenue - s.operatingProfit) * start.params.laborShare;
  const headcount = payroll / start.params.avgPay;
  return { headcount, natural: headcount, morale: NEUTRAL_MORALE, attrition: start.params.baseAttrition, payroll, layoffs: 0, hires: 0, productivity: 1 };
}

/** Effects active in `year`: one-off parts only in the year they were applied, persistent parts from then on. */
function activeEffects(game: Game, year: number) {
  const once: Effects[] = [], lasting: Effects[] = [], notes: Headline[] = [];
  game.decisions.slice(0, year).forEach((d, i) => {
    const taken = i + 1, card = findCard(game, taken, d.card); if (!card) return;
    const apply = (e: Effects, at: number) => { if (at === year) once.push(e); if (at <= year) lasting.push(e); };
    apply(card.effects, taken);
    const delayed = card.effects.delayed; if (delayed) { apply(delayed.effects, taken + delayed.years); if (taken + delayed.years === year) notes.push({ text: delayed.note, tone: 'neutral' }); }
    const risk = card.effects.risk;
    if (risk && uniform(game.seed, 'risk', card.id, taken) < risk.chance) { apply(risk.effects, taken + 1); if (taken + 1 === year) notes.push({ text: risk.headline, tone: 'bad' }); }
  });
  return { once, lasting, notes };
}
const sum = (list: Effects[], key: keyof Effects) => list.reduce((n, e) => n + ((e[key] as number | undefined) ?? 0), 0);
const product = (list: Effects[], key: 'elasticity' | 'demand' | 'staffNeed') => list.reduce((n, e) => n * (e[key] ?? 1), 1);

export function play(game: Game): YearRecord[] {
  const { start, caseDef } = game, base = start.baseline, p = start.params;
  const ctx = engineContext(base), people0 = initialPeople(start);
  const records: YearRecord[] = [{ year: 0, state: ctx.initial, people: people0, headlines: [], emergency: 0, raised: 0, pending: [], marketPrice: 1, ourPrice: 1 }];
  let ourPrice = 1, marketPrice = 1, penaltyRate = 0;
  for (let year = 1; year <= game.decisions.length; year++) {
    const prev = records[year - 1], d = game.decisions[year - 1], L = d.levers;
    const { once, lasting, notes } = activeEffects(game, year);
    const events = caseDef.events.filter(e => e.year === year), past = caseDef.events.filter(e => e.year <= year);
    const headlines: Headline[] = [...events.map(e => ({ text: e.headline, tone: (e.kind === 'demandBoom' ? 'good' : 'bad') as Headline['tone'] })), ...notes];
    const cardNow = findCard(game, year, d.card); if (cardNow) headlines.unshift({ text: `CEO decision: ${cardNow.title}`, tone: 'neutral' });
    // Assumptions this year: levers are persistent settings; card effects add on top.
    const a: Assumptions = structuredClone(base.assumptions);
    const weight = (lever: number, key: 'marketing' | 'rd' | 'people' | 'dividends') => clamp(lever + lasting.reduce((n, e) => n + (e.allocations?.[key] ?? 0), 0), 0, 100);
    a.allocations = { ...a.allocations, marketing: weight(L.marketing, 'marketing'), rd: weight(L.rd, 'rd'), people: weight(L.people, 'people'), dividends: weight(L.dividends, 'dividends') };
    for (const k of ['product', 'sales', 'infrastructure', 'automation', 'maintenance', 'acquisitions', 'debtRepayment', 'reserves'] as const) a.allocations[k] = clamp(a.allocations[k] + lasting.reduce((n, e) => n + (e.allocations?.[k] ?? 0), 0), 0, 100);
    a.reinvestmentRate = clamp(L.reinvestment / 100 + sum(lasting, 'reinvestment'), 0, 1);
    a.churn = clamp(a.churn + sum(lasting, 'churn') + past.filter(e => e.kind === 'recession').length * .02, 0, .6);
    a.opexRatio = Math.max(.01, a.opexRatio + sum(lasting, 'opexRatio'));
    // Customers pay late in a recession, which ties up working capital for that year and the next.
    a.workingCapitalRatio = clamp(a.workingCapitalRatio + sum(lasting, 'workingCapital') + past.filter(e => e.kind === 'recession' && year - e.year <= 1).reduce((n, e) => n + e.size * .2, 0), 0, .5);
    a.interestRate = clamp(a.interestRate + sum(lasting, 'interestRate') + past.filter(e => e.kind === 'rateRise').reduce((n, e) => n + e.size, 0) + penaltyRate, 0, .3);
    a.competition = clamp(a.competition + past.filter(e => e.kind === 'competitorPriceCut').length * .02, 0, .3);
    // Pricing: our price relative to the market sets demand; cost per unit does not fall when price does.
    ourPrice *= 1 + L.price / 100 + sum(once, 'price');
    for (const e of events) if (e.kind === 'competitorPriceCut') marketPrice *= 1 + e.size;
    const costInflation = past.filter(e => e.kind === 'costInflation').reduce((n, e) => n * (1 + e.size), 1);
    a.grossMargin = clamp(1 - (1 - (a.grossMargin + sum(lasting, 'grossMargin'))) * costInflation / ourPrice, -.5, .95);
    const elasticity = p.elasticity * product(lasting, 'elasticity');
    let demandFactor = Math.pow(ourPrice / marketPrice, -elasticity) * product(lasting, 'demand') * Math.exp(DEMAND_NOISE * normal(game.seed, 'demand', year));
    for (const e of past) {
      if (e.kind === 'recession') demandFactor *= e.year === year ? 1 - e.size : e.year === year - 1 ? 1 - e.size / 2 : 1;
      if (e.kind === 'demandBoom' || e.kind === 'customerLoss') demandFactor *= 1 + e.size;
    }
    // People: staffing follows revenue unless the CEO says otherwise; morale drives attrition, productivity and service.
    // The engine's operating costs already carry the payroll implied by revenue (naturalBase). Automation lowers the
    // staff the work needs (natural); the payroll it saves shows up as a negative extraOpex.
    const naturalBase = people0.headcount * prev.state.revenue / base.state.revenue, natural = naturalBase * product(lasting, 'staffNeed');
    const change = L.workforce / 100 + sum(once, 'workforce');
    const headcount = Math.max(1, prev.people.headcount * natural / prev.people.natural * (1 + change));
    const layoffs = Math.max(0, -change) * prev.people.headcount, hires = Math.max(0, headcount - prev.people.headcount);
    const pay = L.pay / 100 + sum(lasting, 'pay'), talent = past.filter(e => e.kind === 'talentWar'), wageDrift = talent.reduce((n, e) => n * (1 + e.size / 2), 1) * costInflation;
    const overload = Math.max(0, natural / headcount - 1.1);
    const morale = clamp(prev.people.morale + .25 * (NEUTRAL_MORALE - prev.people.morale) + .8 * clamp(pay, -.15, .15) - 1.1 * Math.max(0, -change) - .3 * overload + sum(once, 'morale') + 1.5 * sum(once, 'bonus') - events.filter(e => e.kind === 'talentWar').length * .08, .05, .95);
    const attrition = clamp(p.baseAttrition * (1 + 2.5 * (NEUTRAL_MORALE - morale)) + talent.filter(e => e.year >= year - 1).reduce((n, e) => n + e.size, 0), .02, .6);
    const effective = headcount - RAMP * (headcount * attrition + hires), expected = natural * (1 - RAMP * p.baseAttrition);
    const r = effective / expected, staffing = r < 1 ? Math.pow(r, .6) : 1 + .2 * Math.log(r);
    const productivity = staffing * (1 + .3 * (morale - NEUTRAL_MORALE));
    const payroll = headcount * p.avgPay * wageDrift * (1 + pay);
    const extraOpex = payroll - naturalBase * p.avgPay + layoffs * .5 * p.avgPay * wageDrift + sum(once, 'bonus') * payroll + (attrition - p.baseAttrition) * headcount * .25 * p.avgPay + sum(once, 'oneOffCost') * prev.state.revenue;
    const debtRaised = sum(once, 'debt') * prev.state.revenue, equityIssued = sum(once, 'equity') * prev.state.revenue;
    const squeeze = events.filter(e => e.kind === 'creditSqueeze').reduce((n, e) => n + e.size, 0) * prev.state.debt, debtIssued = debtRaised - squeeze;
    const state = stepYear(ctx, prev.state, year, {
      a, demandFactor, priceFactor: ourPrice, productivityFactor: productivity, extraOpex,
      churnAdd: .1 * Math.max(0, .5 - morale), stockFactor: { human: clamp(1 - .6 * Math.max(0, attrition - p.baseAttrition) - .3 * Math.max(0, -change), .2, 1) },
      debtIssued, equityIssued,
    });
    // A cash shortfall is never silently absorbed: the lenders step in at a penalty rate, and everyone hears about it.
    let emergency = 0;
    if (state.cash < 0) {
      emergency = -state.cash + .05 * state.revenue; state.cash += emergency; state.debt += emergency; state.liquidityGap = 0; state.availableCapital = state.cash; penaltyRate += .03;
      state.runway = state.freeCashFlow < 0 ? state.cash / (-state.freeCashFlow / 12) : null;
      const m = momentum(state, prev.state); state.businessMomentum = m.value; state.momentumParts = m.parts;
      headlines.push({ text: `Cash ran out: emergency loan of ${money(emergency, base.currency)} at a penalty rate`, tone: 'bad' });
    }
    const person: People = { headcount, natural, morale, attrition, payroll, layoffs, hires, productivity };
    headlines.push(...signals(prev, state, person, p.baseAttrition, base.currency));
    const pending = ctx.queue.filter(q => q.due > year).map(q => `${money(Object.values(q.stocks).reduce((x, y) => x + y, 0), base.currency)} of investment matures in year ${q.due}`);
    game.decisions.slice(0, year).forEach((dd, i) => { const c = findCard(game, i + 1, dd.card); if (c?.effects.delayed && i + 1 + c.effects.delayed.years > year) pending.push(`${c.title}: ${c.effects.delayed.note.toLowerCase()} (year ${i + 1 + c.effects.delayed.years})`); });
    records.push({ year, state, people: person, headlines, emergency, raised: prev.raised + debtRaised + equityIssued + emergency, pending, marketPrice, ourPrice });
  }
  return records;
}

/** Threshold headlines: what a board, the press or the team would notice this year. */
function signals(prev: YearRecord, s: YearRecord['state'], people: People, base: number, currency: string): Headline[] {
  const out: Headline[] = [], growth = ratio(s.revenue - prev.state.revenue, prev.state.revenue);
  if (growth > .12) out.push({ text: `Revenue up ${(growth * 100).toFixed(0)}%: the growth story is back`, tone: 'good' });
  if (growth < -.08) out.push({ text: `Revenue falls ${(-growth * 100).toFixed(0)}%`, tone: 'bad' });
  if (s.freeCashFlow < 0 && prev.state.freeCashFlow >= 0) out.push({ text: `Free cash flow turns negative (${money(s.freeCashFlow, currency)})`, tone: 'bad' });
  if (s.roic < s.costOfCapital && prev.state.roic >= prev.state.costOfCapital) out.push({ text: 'Returns slip below the cost of capital', tone: 'bad' });
  if (s.roic >= s.costOfCapital && prev.state.roic < prev.state.costOfCapital) out.push({ text: 'Returns climb back above the cost of capital', tone: 'good' });
  if (people.morale < .45 && prev.people.morale >= .45) out.push({ text: 'Staff surveys slump; managers report burnout', tone: 'bad' });
  if (people.morale > .82 && prev.people.morale <= .82) out.push({ text: 'Named a best place to work', tone: 'good' });
  if (people.attrition > base * 1.5) out.push({ text: `${(people.attrition * 100).toFixed(0)}% of staff left this year; hiring can't keep up`, tone: 'bad' });
  if (people.layoffs > 0) out.push({ text: `${(people.layoffs / prev.people.headcount * 100).toFixed(0)}% of roles cut`, tone: 'neutral' });
  if (s.churnRate > prev.state.churnRate + .02) out.push({ text: 'Customers are leaving faster', tone: 'bad' });
  if (s.businessMomentum > 20 && prev.state.businessMomentum <= 20) out.push({ text: 'Analysts say the flywheel is spinning up', tone: 'good' });
  return out;
}
