import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildArchetypes, MIN_COMPANIES, sicToArchetype } from '../src/ceo/archetypes';
import { fictionalCompany, prepareStart, realCompany } from '../src/ceo/company';
import { cases } from '../src/ceo/cases';
import { defaultLevers, play, statusQuo } from '../src/ceo/game';
import { debrief, describeDecision, gameScore, judgement, JUDGEMENT_WORLDS, verdict, MAX_STRATEGIES, referenceDecisions, strategySpace, undoDecision } from '../src/ceo/assess';
import { resolveCase, SANDBOX_ID, SANDBOX_YEARS, sandboxCase } from '../src/ceo/sandbox';
import { challengeFromHash, decodeChallenge, encodeChallenge } from '../src/ceo/challenge';
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

test('undoing a decision reverts the standing policy it set, but not a later change to it', () => {
  const game = newGame('talent-exodus'), d = structuredClone(game.decisions);
  d.forEach(x => { x.levers.pay = 5; }); d[3].levers.pay = 9; d[1].card = 'academy';
  const g = { ...game, decisions: d }, undone = undoDecision(g, 0)!;
  assert.deepEqual(undone.map(x => x.levers.pay), [0, 0, 0, 9, 5]);
  assert.equal(undone[1].card, 'academy');
  assert.equal(undoDecision(g, 2), null, 'year 3 only kept the policy: nothing to undo');
  assert.match(describeDecision(g, 3), /pay \+4/);
});

test('sandbox: shocks land in the chosen year, and a huge strategy space is sampled', () => {
  const config = { archetype: 'industrial' as const, events: [{ kind: 'recession' as const, year: 2 }, { kind: 'creditSqueeze' as const, year: 3 }] };
  const c = resolveCase(SANDBOX_ID, config)!;
  assert.equal(c.turns.length, SANDBOX_YEARS); assert.deepEqual(c.events.map(e => e.year), [2, 3]);
  assert.equal(resolveCase(SANDBOX_ID, { archetype: 'industrial', events: [{ kind: 'recession', year: 9 }] }), undefined);
  assert.equal(resolveCase(SANDBOX_ID), undefined);
  const start = fictionalCompany(archetype('industrial'), 7), game = { start, caseDef: c, seed: c.seed, decisions: statusQuo(start, SANDBOX_YEARS) };
  const calm = play({ ...game, caseDef: sandboxCase({ archetype: 'industrial', events: [] }) }), stormy = play(game);
  assert.deepEqual(stormy[1].state, calm[1].state, 'nothing happens before the first shock');
  assert.ok(stormy[2].state.revenue < calm[2].state.revenue);
  const space = strategySpace(game);
  assert.ok(space.sampled && space.total > MAX_STRATEGIES && space.paths.length === 1000);
  assert.deepEqual(strategySpace(game).paths.map(p => p.overall), space.paths.map(p => p.overall), 'the sample is reproducible');
});

test('automation lowers the staff the work needs rather than leaving the plant short-handed', () => {
  const game = newGame('automation-bet'), d = structuredClone(game.decisions); d[0].card = 'fullAutomation';
  const auto = play({ ...game, decisions: d }), sq = play(game);
  assert.ok(auto[4].people.natural < sq[4].people.natural * .95);
  assert.ok(auto[4].people.headcount / auto[4].people.natural > .97, 'staffing stays in line with the lower need');
  assert.ok(auto[5].state.operatingProfit > sq[5].state.operatingProfit);
});

test('judgement: averages across worlds, is reproducible, and separates luck from choices', () => {
  const game = newGame('price-war'), ref = { ...game, decisions: referenceDecisions(game) };
  const j = judgement(ref);
  assert.deepEqual(judgement(ref), j);
  assert.equal(j.worlds, JUDGEMENT_WORLDS); assert.ok(j.strategies > 100 && j.percentile >= 0 && j.percentile <= 1);
  assert.ok(j.expected > j.statusQuo, 'the reference path beats doing nothing on average');
  assert.ok(j.best.expected >= j.expected);
  assert.equal(verdict(.9, .2).title, 'Sound decisions, unlucky outcome');
  assert.equal(verdict(.2, .9).title, 'A lucky result');
  assert.equal(verdict(.9, .9).title, 'Sound decisions, and they paid off');
});

test('challenge links round-trip exactly and reject anything tampered with', () => {
  const game = newGame('price-war'), decisions = referenceDecisions(game);
  decisions[0].levers.pay = 3; decisions[2].levers.price = -7;
  const challenge = { caseId: 'price-war', choice: { kind: 'fictional' as const, archetype: 'retail' as const, seed: 1207 }, decisions, name: '  Alex <b>  ', revenue: game.start.baseline.state.revenue };
  const code = encodeChallenge(challenge, game.caseDef), back = decodeChallenge(code)!;
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(back.decisions, decisions); assert.deepEqual(back.choice, challenge.choice); assert.equal(back.name, 'Alex <b>');
  assert.equal(back.revenue, Math.round(challenge.revenue));
  assert.equal(challengeFromHash(`#/ceo?challenge=${code}`), code);
  // The replayed world is the challenger's world: same case, same company, same decisions, same score.
  assert.equal(gameScore({ ...game, decisions: back.decisions }).overall, gameScore({ ...game, decisions }).overall);
  const tamper = (f: (w: any) => void) => { const w = JSON.parse(Buffer.from(code, 'base64url').toString()); f(w); return decodeChallenge(Buffer.from(JSON.stringify(w)).toString('base64url')); };
  assert.equal(tamper(w => { w.d[0][0] = 9; }), null, 'card index out of range');
  assert.equal(tamper(w => { w.d[0][1] = 90; }), null, 'price lever out of range');
  assert.equal(tamper(w => { w.d.pop(); }), null, 'missing a year');
  assert.equal(tamper(w => { w.co = ['r', 'AAPL']; }), null, 'not a CEO-mode company');
  assert.equal(tamper(w => { w.k = 'no-such-case'; }), null);
  assert.equal(decodeChallenge('not base64!'), null); assert.equal(decodeChallenge(''), null); assert.equal(decodeChallenge('x'.repeat(5000)), null);
  const sandbox = { archetype: 'industrial' as const, events: [{ kind: 'recession' as const, year: 2 }] };
  const sc = sandboxCase(sandbox), sd = statusQuo(game.start, SANDBOX_YEARS).map((d, i) => ({ ...d, card: i === 1 ? 'layoffs' : null }));
  const s2 = decodeChallenge(encodeChallenge({ caseId: SANDBOX_ID, choice: { kind: 'fictional', archetype: 'industrial', seed: 5 }, sandbox, decisions: sd, revenue: 1 }, sc))!;
  assert.deepEqual(s2.sandbox, sandbox); assert.equal(s2.decisions[1].card, 'layoffs');
});
