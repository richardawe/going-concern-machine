import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildArchetypes } from '../src/ceo/archetypes';
import { cases } from '../src/ceo/cases';
import type { CompanyDataset } from '../src/ontology/types';
import { gradeModule, moduleStart } from '../src/course/grade';
import { courseById, modules, moduleById } from '../src/course/modules';
import { buildPayload, canonical, stats, validatePayload, verificationCode } from '../src/course/payload';
import { submissionPdf } from '../src/course/pdf';
import { findAllSealed, findSealed, generateKeys, openCode, pack, seal, unpack, unseal } from '../src/course/seal';
import { answer, complete, wordCount } from '../src/course/text';
import { MIN_WORDS, type Progress } from '../src/course/types';
import { figures } from '../src/course/figures';
import { conveyor } from '../src/course/figures/conveyor';
import { elevator } from '../src/course/figures/elevator';
import { gearbox } from '../src/course/figures/gearbox';
import { irr, presentValues, press } from '../src/course/figures/press';
import { splitter } from '../src/course/figures/splitter';
import { vessel } from '../src/course/figures/vessel';

const index = JSON.parse(readFileSync('public/machines/index.json', 'utf8')) as { companies: { ticker: string }[] };
const archetypes = buildArchetypes(index.companies.map(c => JSON.parse(readFileSync(`public/machines/${c.ticker}.json`, 'utf8')) as CompanyDataset), 'test');
const words = (n: number, w = 'margin') => Array.from({ length: n }, () => w).join(' ');
const m1 = moduleById('price-war')!, course = courseById('pilot');

function finished(): Progress {
  const caseDef = cases.find(c => c.id === m1.caseId)!;
  return {
    course: 'pilot', student: { name: 'Test Student', id: '20419377', email: 'test@student.example.ac.uk' },
    modules: { 'price-war': {
      stage: 'complete', concept: 7, checked: true, completedAt: '2026-10-15T20:00:00.000Z',
      concepts: Object.fromEntries(m1.concepts.map(c => [c.id, answer(words(45))])),
      decisions: caseDef.turns.map((t, i) => ({ card: i === 0 ? 'matchPrice' : i === 4 ? null : t.cards[0].id, reason: answer(words(30), i === 2) })),
      check: Object.fromEntries(m1.check.map(q => [q.id, q.kind === 'mcq' ? q.answer : answer(words(65, 'cash “runway” −2.2 ≈ 漢'))])),
      reflection: answer(words(50)),
    } },
  };
}

test('every module is complete: eight concepts, a mixed check, a figure and a playable case', () => {
  assert.equal(modules.length, 6);
  for (const m of modules) {
    assert.ok(m.ready, m.id);
    assert.equal(m.concepts.length, 8, m.id);
    assert.equal(new Set(m.concepts.map(c => c.id)).size, 8, m.id);
    assert.equal(m.outcomes.length, 3, m.id);
    assert.ok(m.reflection, m.id);
    const mcq = m.check.filter(q => q.kind === 'mcq'), text = m.check.filter(q => q.kind === 'text');
    assert.equal(mcq.length, 3, m.id); assert.equal(text.length, 4, m.id);
    assert.equal(new Set(m.check.map(q => q.id)).size, 7, m.id);
    for (const q of mcq) if (q.kind === 'mcq') assert.ok(q.answer >= 0 && q.answer < q.options.length, `${m.id} ${q.id}`);
    assert.deepEqual(text.filter(q => q.kind === 'text' && q.personal).map(q => q.kind === 'text' && q.personal?.year), [1], m.id);
    const c = cases.find(x => x.id === m.caseId); assert.ok(c, m.id); assert.equal(c.turns.length, 5, m.id);
    // Each concept opens the figure at a lever setting the lever can actually reach.
    assert.ok(m.figure, m.id);
    const { min, max, step } = figures[m.figure].control;
    for (const k of m.concepts) {
      assert.ok(k.lever >= min - 1e-9 && k.lever <= max + 1e-9, `${m.id} ${k.id}`);
      assert.ok(Math.abs((k.lever - min) / step - Math.round((k.lever - min) / step)) < 1e-6, `${m.id} ${k.id} is on a step`);
    }
  }
  assert.equal(new Set(modules.map(m => m.figure)).size, 6);
});

// Every number a concept or check question quotes from a figure comes from that figure's model.
test('figure numbers quoted in the modules match the figure models', () => {
  const near = (a: number, b: number, d = .05) => assert.ok(Math.abs(a - b) <= d, `${a} ≈ ${b}`);
  near(gearbox(-.12).margin * 100, 23.9); near(gearbox(-.12).cash, -2.2); near(gearbox(-.12).grossProfit / gearbox(0).grossProfit - 1, -.25, .005); near(gearbox(0).cash, 6);
  // Module 2
  near(vessel(0).capacity, 88); near(vessel(0).attritionCost, 36); near(vessel(0).profit, 14);
  near(vessel(.05).capacity, 91.75); assert.ok(vessel(.05).attritionCost < 25);
  near(vessel(.08).attrition, .12, 1e-9); near(vessel(.08).profit, 24); near(vessel(.08).profit - vessel(0).profit, 10);
  near(vessel(.09).profit, 25.25); near(vessel(.15).profit, 20); near(vessel(.1).capacity, 95); near(vessel(.05).attrition, .165, 1e-9);
  // Module 3
  near(conveyor(75).cash, -10); near(conveyor(45).cash, 20); near(conveyor(45).workingCapital, 55.5); near(conveyor(45).inventory, 42); near(conveyor(45).payables, 31.5);
  assert.equal(conveyor(60).cycle, 75); near(conveyor(60).receivables - conveyor(45).receivables, 15); assert.equal(conveyor(45).cycle, 60);
  near(conveyor(45).current, 1.5, .005); near(conveyor(65).current, 1.5, .005); near(conveyor(45).cashRatio, .28, .005); assert.equal(conveyor(65).cashRatio, 0);
  near(conveyor(75).drawn, 10); assert.equal(conveyor(90).headroom, 0);
  // Module 4
  const e = elevator(.2);
  near(e.lifetime, 5); near(e.ltv, 4); near(e.ratio, 2.5); near(e.payback, 2); near(e.next, 1100); near(e.steady, 1500); near(e.growth, .1);
  near(elevator(.1).lifetime, 10); near(elevator(.1).growth, .2); near(elevator(.1).steady, 3000); near(elevator(.25).ltv, 3.2); near(elevator(.25).ratio, 2);
  near(elevator(.3).ratio, 1.7); near(elevator(.3).growth, 0); near(100 * .8 ** 3, 51.2); near(100 * .9 ** 3, 72.9);
  // Module 5
  near(press(.1).total, 133.4); near(press(.1).npv, 33.4); near(press(.1).discountedPayback!, 5.4); near(press(.25).npv, -16.8); near(press(.25).total, 83.2);
  near(press(.15).npv, 12.2); near(irr() * 100, 18.6); assert.ok(press(.18).npv > 0 && press(.19).npv < 0); assert.equal(press(.19).discountedPayback, null);
  near(press(0).payback, 4); near(press(0).profitUplift, 12.5); near(presentValues(.1)[7], 11.66, .005);
  // Module 6
  near(splitter(.6).growth, .048, 1e-9); near(splitter(.4).valueAdded, 20); near(splitter(0).valueAdded, 33.3); near(splitter(1).growth, 0); near(splitter(0).growth, .12, 1e-9);
  near(splitter(.4, .06).valueAdded, -20);
});

test('word counts and minimums', () => {
  assert.equal(wordCount('  two   words \n'), 2);
  assert.equal(wordCount(''), 0);
  assert.ok(!complete(answer(words(MIN_WORDS.concept - 1)), MIN_WORDS.concept));
  assert.ok(complete(answer(words(MIN_WORDS.concept)), MIN_WORDS.concept));
});

test('a submission seals, opens and validates; edits change its verification code', async () => {
  const { publicKey, privateKey } = await generateKeys();
  const payload = buildPayload(finished(), course, '2026-10-15T21:14:00.000Z');
  const code = await seal(payload, course.id, publicKey);
  assert.ok(code.startsWith('GCM1.pilot.'));
  assert.equal(findSealed(`### Sealed submission\n\n${code}\n`), code);
  const opened = validatePayload(await unseal(code, privateKey));
  assert.ok(opened.ok);
  if (!opened.ok) return;
  assert.equal(canonical(opened.payload), canonical(payload));
  const v = await verificationCode(opened.payload);
  assert.match(v, /^GCM-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(v, await verificationCode(payload));
  const edited = structuredClone(payload); edited.modules[0].check.q1 = 0;
  assert.notEqual(await verificationCode(edited), v);
  const s = stats(payload);
  assert.equal(s.completed, 1); assert.equal(s.responses, 8 + 5 + 4 + 1); assert.equal(s.pasted, 1);
  // Tampering and other keys fail.
  const other = await generateKeys();
  await assert.rejects(unseal(code, other.privateKey));
  await assert.rejects(unseal(code.slice(0, -8) + 'AAAAAAAA', privateKey));
});

test('prototype hand-in codes (GCM0) open without a key; encrypted ones still need it', async () => {
  const payload = buildPayload(finished(), course, '2026-10-15T21:14:00.000Z');
  const code = await pack(payload, course.id);
  assert.match(code, /^GCM0\.pilot\.[A-Za-z0-9_-]+$/);
  assert.equal(findSealed(`Hand-in code\n\n${code}\n`), code);
  const opened = validatePayload(await openCode(code));
  assert.ok(opened.ok && canonical(opened.payload) === canonical(payload));
  await assert.rejects(unpack(code.slice(0, -10)));
  const { publicKey, privateKey } = await generateKeys(), sealed = await seal(payload, course.id, publicKey);
  assert.deepEqual(findAllSealed(`${code} and ${sealed}`), [code, sealed]);
  await assert.rejects(openCode(sealed), /needs the course key/);
  assert.ok(validatePayload(await openCode(sealed, privateKey)).ok);
});

test('validation rejects malformed or invented content and recomputes word counts', () => {
  const p = buildPayload(finished(), course, '2026-10-15T21:14:00.000Z');
  const bad = (f: (x: any) => void) => { const x: any = structuredClone(p); f(x); return validatePayload(x).ok; };
  assert.equal(bad(() => {}), true);
  assert.equal(bad(x => { x.v = 2; }), false);
  assert.equal(bad(x => { x.student.name = ' '; }), false);
  assert.equal(bad(x => { x.modules[0].id = 'nope'; }), false);
  assert.equal(bad(x => { x.modules[0].decisions[0].card = 'buyTheMoon'; }), false);
  assert.equal(bad(x => { x.modules[0].check.q1 = 9; }), false);
  assert.equal(bad(x => { x.modules[0].concepts.invented = { text: 'x', words: 1, pasted: false }; }), false);
  assert.equal(bad(x => { x.modules[0].concepts.elasticity.text = 'x'.repeat(9000); }), false);
  const lied: any = structuredClone(p); lied.modules[0].concepts.elasticity.words = 999;
  const r = validatePayload(lied); assert.ok(r.ok && r.payload.modules[0].concepts.elasticity.words === 45);
});

test('every module grades its reference path and a hold-course path', () => {
  for (const m of modules) {
    const start = moduleStart(m, archetypes), c = cases.find(x => x.id === m.caseId)!;
    const ref = gradeModule(m, start, c.reference.map(r => r.card)), hold = gradeModule(m, start, [null, null, null, null, null]);
    assert.match(ref.outcome.grade, /^[A-E]$/, m.id); assert.match(hold.judgement.grade, /^[A-E]$/, m.id);
    assert.ok(ref.outcome.score >= hold.outcome.score, `${m.id}: the reference path scores at least as well as holding course`);
  }
});

test('grades replay deterministically and the PDF builds from any text', async () => {
  const start = moduleStart(m1, archetypes), p = finished(), cards = p.modules['price-war'].decisions.map(d => d.card);
  const g = gradeModule(m1, start, cards);
  assert.match(g.outcome.grade, /^[A-E]$/); assert.match(g.judgement.grade, /^[A-E]$/);
  assert.deepEqual(gradeModule(m1, start, cards), g);
  const payload = buildPayload(p, course, '2026-10-15T21:14:00.000Z'), code = await verificationCode(payload);
  const a = await submissionPdf({ payload, course, code, grades: { 'price-war': g } });
  const b = await submissionPdf({ payload, course, code, grades: { 'price-war': g } });
  assert.ok(a.length > 3000);
  assert.equal(Buffer.from(a).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(a, b, 'the same submission always makes the same PDF');
});
