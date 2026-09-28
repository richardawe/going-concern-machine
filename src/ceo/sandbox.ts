import type { ArchetypeId } from './archetypes';
import { cases } from './cases';
import type { Card, CaseDef, EventKind, GameEvent } from './types';

// Sandbox: the player picks which shocks hit and when, then plays five years with a general toolkit of cards.
export const SANDBOX_ID = 'sandbox';
export const SANDBOX_YEARS = 5;
export const sandboxEvents: Record<EventKind, { label: string; size: number; headline: string }> = {
  recession: { label: 'Recession', size: .15, headline: 'Recession: demand falls 15%' },
  rateRise: { label: 'Interest rates +300 bps', size: .03, headline: 'Interest rates jump 300 basis points' },
  competitorPriceCut: { label: 'Competitor cuts prices 10%', size: -.1, headline: 'A competitor cuts prices by 10%' },
  talentWar: { label: 'War for talent', size: .06, headline: 'Rivals are poaching your people' },
  costInflation: { label: 'Cost inflation +5%', size: .05, headline: 'Input and wage costs rise 5%' },
  demandBoom: { label: 'Demand boom', size: .08, headline: 'A demand boom lifts your market 8%' },
  customerLoss: { label: 'A new entrant takes customers', size: -.06, headline: 'A new entrant takes 6% of your customers' },
  creditSqueeze: { label: 'Bank cuts the credit line', size: .2, headline: 'Your bank demands 20% of your debt back' },
};
export interface SandboxConfig { archetype: ArchetypeId; events: { kind: EventKind; year: number }[] }

const toolkit: Card[] = [
  { id: 'priceCut', title: 'Cut prices 10%', fn: 'marketing', pitch: 'Win volume; give up margin on every sale.', effects: { price: -.1 } },
  { id: 'priceRise', title: 'Raise prices 5%', fn: 'marketing', pitch: 'Take margin; some customers will leave.', effects: { price: .05 } },
  { id: 'brand', title: 'Invest in brand and service', fn: 'marketing', pitch: '1.5% of revenue now; loyalty in two years.', effects: { oneOffCost: .015, allocations: { marketing: 30 }, delayed: { years: 2, note: 'Brand investment makes customers less price-sensitive', effects: { elasticity: .75, churn: -.015 } } } },
  { id: 'rd', title: 'Step up R&D', fn: 'product', pitch: 'More reinvestment into technology; new products in two years.', effects: { reinvestment: .1, allocations: { rd: 30 }, delayed: { years: 2, note: 'New products launch', effects: { demand: 1.05 } } } },
  { id: 'automate', title: 'Automate operations', fn: 'operations', pitch: '4% of revenue now; fewer staff needed in two years.', effects: { oneOffCost: .04, delayed: { years: 2, note: 'Automation comes online', effects: { opexRatio: -.01, staffNeed: .9 } } } },
  { id: 'workingCapital', title: 'Release working capital', fn: 'operations', pitch: 'Leaner inventory and faster collections.', effects: { workingCapital: -.04, grossMargin: -.005 } },
  { id: 'layoffs', title: 'Lay off 10%', fn: 'people', pitch: 'Fast cost cut; severance and a morale hit.', effects: { workforce: -.1 } },
  { id: 'retention', title: 'Retention bonuses (6% of payroll)', fn: 'people', pitch: 'Lift morale and hold on to people for a year.', effects: { bonus: .06 } },
  { id: 'debt', title: 'Borrow 10% of revenue', fn: 'finance', pitch: 'Cash now; interest from next year.', effects: { debt: .1 } },
  { id: 'equity', title: 'Raise equity (10% of revenue)', fn: 'finance', pitch: 'Cash with no interest, but it carries a cost of capital.', effects: { equity: .1 } },
];

export function sandboxCase(config: SandboxConfig): CaseDef {
  const events: GameEvent[] = config.events.map(e => ({ year: e.year, kind: e.kind, size: sandboxEvents[e.kind].size, headline: sandboxEvents[e.kind].headline }));
  return {
    id: SANDBOX_ID, title: 'Sandbox', archetype: config.archetype, seed: 5150,
    tagline: 'Choose the shocks and when they hit, then play with a general toolkit.',
    briefing: events.length ? `Five years. You chose the storms: ${config.events.map(e => `${sandboxEvents[e.kind].label.toLowerCase()} in year ${e.year}`).join('; ')}. The same toolkit of decisions is available every year.` : 'Five calm years: no scheduled shocks, only the ordinary swings of demand. The same toolkit of decisions is available every year.',
    objectives: ['Sandbox has no hidden lesson: use the debrief to see which of your decisions moved which numbers, and by how much.'],
    events,
    turns: Array.from({ length: SANDBOX_YEARS }, (_, i) => ({ year: i + 1, memo: `Year ${i + 1}. ${events.filter(e => e.year === i + 1).map(e => `Coming this year: ${e.headline.toLowerCase()}.`).join(' ') || 'Set your course.'}`, cards: toolkit })),
    reference: Array.from({ length: SANDBOX_YEARS }, () => ({ card: null })),
    weights: { value: .25, survival: .2, growth: .2, people: .15, customers: .2 },
    lessons: [{ when: 'always', note: 'In Sandbox the reference path is simply holding course every year: compare it with “doing nothing” to see what the shocks alone did.' }],
  };
}

/** The case a saved game refers to: a scripted case by id, or the Sandbox built from its config. */
export function resolveCase(caseId: string, sandbox?: SandboxConfig): CaseDef | undefined {
  if (caseId === SANDBOX_ID) return sandbox && validSandbox(sandbox) ? sandboxCase(sandbox) : undefined;
  return cases.find(c => c.id === caseId);
}
export function validSandbox(x: SandboxConfig): boolean {
  return typeof x?.archetype === 'string' && Array.isArray(x.events) && x.events.length <= 16 && x.events.every(e => e && e.kind in sandboxEvents && Number.isInteger(e.year) && e.year >= 1 && e.year <= SANDBOX_YEARS);
}
