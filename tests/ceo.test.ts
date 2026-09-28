import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildArchetypes, MIN_COMPANIES, sicToArchetype } from '../src/ceo/archetypes';
import { fictionalCompany, prepareStart, realCompany } from '../src/ceo/company';
import { cases } from '../src/ceo/cases';
import { defaultLevers, play, statusQuo } from '../src/ceo/game';
import { debrief, gameScore, referenceDecisions } from '../src/ceo/assess';
import type { CompanyDataset } from '../src/ontology/types';
import type { Game } from '../src/ceo/types';

const index = JSON.parse(readFileSync('public/machines/index.json', 'utf8')) as { companies: { ticker: string }[] };
const load = (t: string) => JSON.parse(readFileSync(`public/machines/${t}.json`, 'utf8')) as CompanyDataset;
const datasets = index.companies.map(c => load(c.ticker));
const archetypes = buildArchetypes(datasets, 'test');
const archetype = (id: string) => archetypes.archetypes.find(a => a.id === id)!;
const newGame = (caseId: string, decisions?: Game['decisions']): Game => {
  const c = cases.find(x => x.id === caseId)!, start = prepareStart(fictionalCompany(archetype(c.archetype), c.seed), c.setup);
  return { start, caseDef: c, seed: c.seed, decisions: decisions ?? statusQuo(start, c.turns.length) };
};

test('archetypes are deterministic, well-populated quartiles that exclude financial filers', () => {
  assert.deepEqual(buildArchetypes([...datasets].reverse(), 'test'), archetypes);
  assert.ok(archetypes.archetypes.length >= 6);
  for (const a of archetypes.archetypes) {
    assert.ok(a.n >= MIN_COMPANIES, a.id);
    for (const q of Object.values(a.ratios)) { assert.ok(q.p25 <= q.median && q.median <= q.p75); assert.ok(q.n >= MIN_COMPANIES); }
    for (const t of a.tickers) assert.notEqual(load(t).classification?.sector, 'banking');
  }
  assert.equal(sicToArchetype('6021'), null); assert.equal(sicToArchetype('7372'), 'software'); assert.equal(sicToArchetype('5331'), 'retail');
});

test('fictional companies are reproducible and drawn inside the archetype range', () => {
  for (const a of archetypes.archetypes) {
    const one = fictionalCompany(a, 42), two = fictionalCompany(a, 42), other = fictionalCompany(a, 43);
    assert.deepEqual(one, two); assert.notEqual(one.baseline.state.revenue, other.baseline.state.revenue);
    const gm = one.baseline.state.grossMargin, q = a.ratios.grossMargin;
    if (q && q.p25 > .15 && q.p75 < .9) assert.ok(gm >= q.p25 - 1e-9 && gm <= q.p75 + 1e-9, `${a.id} gross margin ${gm}`);
    assert.ok(one.baseline.assumptions.depreciationRate >= .03 && one.baseline.assumptions.depreciationRate <= .2);
    assert.ok(!datasets.some(d => d.name.toLowerCase() === one.name.toLowerCase()), `${one.name} matches a real filer`);
  }
});

test('real companies start from reported figures and label every assumption', () => {
  for (const t of ['MSFT', 'WMT', 'JPM']) {
    const d = load(t), start = realCompany(d);
    assert.equal(start.baseline.state.revenue, d.periods[0].facts.revenue.value);
    assert.ok(start.baseline.notes.some(n => /game assumption/i.test(n)));
    assert.ok(start.provenance.some(p => p.basis.startsWith('Reported')));
  }
  assert.throws(() => realCompany(load('AAPL')), /not available in CEO mode/);
});

test('play is deterministic and a changed decision leaves earlier years untouched', () => {
  const game = newGame('price-war'), first = play(game);
  assert.deepEqual(first, play(game));
  const changed = structuredClone(game.decisions); changed[2] = { ...changed[2], card: 'automateStores' };
  const second = play({ ...game, decisions: changed });
  assert.deepEqual(second.slice(0, 3), first.slice(0, 3));
  assert.notDeepEqual(second[5].state, first[5].state);
});

test('cash never goes negative: shortfalls become visible emergency loans', () => {
  for (const c of cases) {
    const g = newGame(c.id, statusQuo(newGame(c.id).start, c.turns.length).map(d => ({ ...d, levers: { ...d.levers, pay: 15, workforce: 20 } })));
    for (const r of play(g)) { assert.ok(r.state.cash >= 0, `${c.id} year ${r.year}`); assert.ok(r.state.debt >= 0); assert.equal(r.state.liquidityGap, 0); }
  }
  const crunch = play(newGame('cash-crunch'));
  assert.ok(crunch.some(r => r.emergency > 0 && r.headlines.some(h => /emergency loan/.test(h.text))), 'doing nothing in the Cash Crunch needs an emergency loan');
});

test('people: layoffs hurt morale and raise attrition; paying above market helps', () => {
  const base = newGame('talent-exodus'), sq = play(base);
  const cut = structuredClone(base.decisions); cut[0].levers.workforce = -15;
  const pay = structuredClone(base.decisions); pay.forEach(d => { d.levers.pay = 8; });
  const cutRun = play({ ...base, decisions: cut }), payRun = play({ ...base, decisions: pay });
  assert.ok(cutRun[1].people.morale < sq[1].people.morale); assert.ok(cutRun[1].people.attrition > sq[1].people.attrition);
  assert.ok(cutRun[1].people.headcount < sq[1].people.headcount);
  assert.ok(payRun[3].people.morale > sq[3].people.morale); assert.ok(payRun[3].people.payroll > sq[3].people.payroll);
});

test('pricing: a price cut compresses gross margin, because unit costs do not fall with price', () => {
  const base = newGame('price-war'), cut = structuredClone(base.decisions); cut[0].levers.price = -10;
  assert.ok(play({ ...base, decisions: cut })[1].state.grossMargin < play(base)[1].state.grossMargin - .03);
});

test('every case: cards are unique, the reference path is valid and beats doing nothing', () => {
  for (const c of cases) {
    assert.equal(c.turns.length, c.reference.length, c.id);
    const ids = c.turns.flatMap(t => t.cards.map(x => x.id)); assert.equal(new Set(ids).size, ids.length, `${c.id} duplicate card ids`);
    c.reference.forEach((r, i) => assert.ok(r.card == null || c.turns[i].cards.some(x => x.id === r.card), `${c.id} reference ${r.card}`));
    const game = newGame(c.id);
    assert.ok(gameScore({ ...game, decisions: referenceDecisions(game) }).overall > gameScore(game).overall, `${c.id}: reference path loses to doing nothing`);
  }
});

test('debrief attributes each decision, ranks the strategy and measures luck', () => {
  const game = newGame('price-war'), decisions = referenceDecisions(game);
  const d = debrief({ ...game, decisions }, 10);
  assert.equal(d.attribution.length, decisions.filter(x => x.card).length);
  assert.equal(d.luck.you.length, 10); assert.ok(d.luck.you.every((x, i, a) => i === 0 || a[i - 1] <= x));
  assert.ok(d.space.scores.length > 100 && d.space.percentile >= 0 && d.space.percentile <= 1);
  assert.ok(d.you.card.overall > d.statusQuo.card.overall);
  assert.ok(d.lessons.length > 0);
  assert.deepEqual(defaultLevers(game.start), statusQuo(game.start, 1)[0].levers);
});
