import { concepts } from '../ontology/catalog';
import type { CompanyScenario, MachineDefinition, Unit } from '../ontology/types';
import { sectors } from '../sectors';
import { getNode } from '../translation/construct';
import { showDelta, showValue } from '../format';
import { HORIZON, lagYears, resolveInputs, simulateCompany } from './company';
import { equations, refKind, refNode, type Equation, type Ref } from './equations';
// Explains a scenario against BASE: every node that differs, in every year, is attributed to the changed inputs of
// its own equation. Each input effect is the symmetric one-at-a-time swap
//   ½[(f(S) − f(S with input from B)) + (f(B with input from S) − f(B))],
// which is exact for sums, differences and single-factor products; any remainder is reported as interaction.
export interface Contribution { ref: Ref; label: string; unit: Unit; base: number; scen: number; effect: number; source?: { node: string; year: number }; }
export interface Change { node: string; label: string; unit: Unit; year: number; base: number; scen: number; delta: number; formula: string; kind: Equation['kind']; contributions: Contribution[]; interaction: number; order: number; }
export interface Lever { ref: Ref; label: string; base: number; scen: number; unit: string; }
export interface Absorbed { node: string; label: string; year: number; inputs: Contribution[]; reason: string; }
export interface Experiment { levers: Lever[]; changes: Change[]; absorbed: Absorbed[]; base: MachineDefinition[]; scen: MachineDefinition[]; years: number; }
const material = (a: number, b: number) => Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const unitOf = (ref: Ref): Unit => { const n = refNode(ref); return n ? concepts[n]?.unit || 'USD' : 'ratio'; };

export function refLabel(ref: Ref, sector: MachineDefinition['classification']['sector']): string {
 const kind = refKind(ref), node = refNode(ref);
 if (kind === 'assume') return sectors[sector].controls.find(c => c.id === ref.slice(7))?.label || ref;
 if (kind === 'shock') return `${ref.slice(6)[0].toUpperCase()}${ref.slice(7)} shock factor`;
 if (kind === 'year') return 'Years since fork';
 const label = concepts[node!]?.label || node!;
 return kind === 'prior' ? `${label} (prior year)` : kind === 'lagged' ? `${label} (lagged)` : kind === 'opening' ? `${label} (reported opening)` : label;
}
export function leverDiff(opening: MachineDefinition, base: CompanyScenario, scen: CompanyScenario): Lever[] {
 const out: Lever[] = sectors[opening.classification.sector].controls.filter(c => material(base.values[c.id], scen.values[c.id])).map(c => ({ ref: `assume:${c.id}`, label: c.label, base: base.values[c.id], scen: scen.values[c.id], unit: c.unit }));
 for (const kind of ['demand', 'cost', 'credit']) { const b = base.shocks.filter(s => s.kind === kind).length, s = scen.shocks.filter(x => x.kind === kind).length; if (b !== s) out.push({ ref: `shock:${kind}`, label: refLabel(`shock:${kind}`, opening.classification.sector), base: b, scen: s, unit: 'shocks' }); }
 return out;
}
export function explainExperiment(opening: MachineDefinition, baseScenario: CompanyScenario, scenScenario: CompanyScenario, years = HORIZON): Experiment {
 const base = simulateCompany(opening, { ...baseScenario, adopted: true }, years), scen = simulateCompany(opening, { ...scenScenario, adopted: true }, years);
 const sector = opening.classification.sector, changes: Change[] = [], absorbed: Absorbed[] = [];
 for (let year = 1; year <= years; year++) equations[sector].forEach((e, order) => {
  const b = getNode(base[year], e.target)?.value, s = getNode(scen[year], e.target)?.value;
  const xb = resolveInputs(e, base, year, baseScenario), xs = resolveInputs(e, scen, year, scenScenario);
  const f = (x: Record<Ref, number>) => e.f(x) ?? NaN;
  const contributions: Contribution[] = e.inputs.filter(r => material(xb[r], xs[r])).map(ref => {
   const swapS = { ...xs, [ref]: xb[ref] }, swapB = { ...xb, [ref]: xs[ref] };
   const effect = .5 * ((f(xs) - f(swapS)) + (f(swapB) - f(xb))), kind = refKind(ref), node = refNode(ref);
   const sourceYear = kind === 'now' ? year : kind === 'prior' ? year - 1 : kind === 'lagged' ? year - lagYears(scenScenario) : undefined;
   return { ref, label: refLabel(ref, sector), unit: unitOf(ref), base: xb[ref], scen: xs[ref], effect: Number.isFinite(effect) ? effect : 0, source: node && sourceYear != null && sourceYear >= 1 ? { node, year: sourceYear } : undefined };
  });
  const unit = concepts[e.target]?.unit || 'USD', label = concepts[e.target]?.label || e.target;
  if (b == null || s == null || !material(b, s)) {
   if (contributions.length) absorbed.push({ node: e.target, label, year, inputs: contributions, reason: `${contributions.map(c => c.label).join(', ')} changed, but ${label.toLowerCase()} ${b == null ? 'stays undefined' : 'is unchanged'}: ${gate(e, xs, sector) || e.absorbs || 'the changed inputs offset exactly'}.` });
   return;
  }
  const delta = s - b, interaction = delta - contributions.reduce((t, c) => t + c.effect, 0);
  changes.push({ node: e.target, label, unit, year, base: b, scen: s, delta, formula: e.formula, kind: e.kind, contributions: contributions.sort((p, q) => Math.abs(q.effect) - Math.abs(p.effect)), interaction: material(delta, delta - interaction) ? interaction : 0, order: order });
 });
 return { levers: leverDiff(opening, baseScenario, scenScenario), changes, absorbed, base, scen, years };
}
// Name the zero-valued multiplier that absorbs a changed input, when there is one.
function gate(e: Equation, x: Record<Ref, number>, sector: MachineDefinition['classification']['sector']) {
 const zero = e.inputs.filter(r => refKind(r) === 'assume' && x[r] === 0);
 return zero.length ? `${zero.map(r => refLabel(r, sector)).join(' and ')} is 0, so the changed input is multiplied by zero` : '';
}
export const findChange = (x: Experiment, node: string, year: number) => x.changes.find(c => c.node === node && c.year === year);
/** Follow the dominant input effect back until it reaches a lever or shock. */
export function rootPath(x: Experiment, change: Change): (Change | Contribution)[] {
 const path: (Change | Contribution)[] = [change]; let current: Change | undefined = change;
 for (let guard = 0; current && guard < 200; guard++) {
  const top: Contribution | undefined = current.contributions[0]; if (!top) break;
  const next: Change | undefined = top.source ? findChange(x, top.source.node, top.source.year) : undefined;
  if (next) path.push(next); else { path.push(top); break; }
  current = next;
 }
 return path;
}
export const isLeverRef = (ref: Ref) => refKind(ref) === 'assume' || refKind(ref) === 'shock';
export function describeLever(l: Lever) { return l.unit === 'shocks' ? `${l.label}: ${l.base} → ${l.scen} shock(s)` : `${l.label}: ${fmtLever(l.base, l.unit)} → ${fmtLever(l.scen, l.unit)}`; }
const fmtLever = (v: number, unit: string) => unit === '%' || unit === 'pp' ? `${+v.toFixed(2)}${unit === '%' ? '%' : 'pp'}` : `${v} ${unit}`;
export function describeChange(x: Experiment, c: Change): string {
 const parts = c.contributions.map(p => { const l = x.levers.find(v => v.ref === p.ref); return `${p.label} ${l ? describeLever(l).split(': ')[1] : refKind(p.ref) === 'shock' ? `×${+p.base.toFixed(3)} → ×${+p.scen.toFixed(3)}` : showDelta(p.scen - p.base, p.unit)} ⇒ ${showDelta(p.effect, c.unit)}`; });
 if (c.interaction) parts.push(`interaction ${showDelta(c.interaction, c.unit)}`);
 const root = rootPath(x, c).slice(1).map(step => 'node' in step ? `${step.label} Y${step.year} ${showDelta(step.delta, step.unit)}` : `${step.label}${isLeverRef(step.ref) ? ' (lever)' : ''}`);
 return `Year ${c.year} · ${c.label} ${showValue({ value: c.base, unit: c.unit })} → ${showValue({ value: c.scen, unit: c.unit })} (${showDelta(c.delta, c.unit)}). ${c.label} = ${c.formula.replace(/\.$/, '')}. Effects: ${parts.join('; ')}.${root.length ? ` Root: ${root.join(' ← ')}.` : ''}`;
}
