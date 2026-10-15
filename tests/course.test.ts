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

test('module 1 is complete: eight concepts, a mixed check and a playable case', () => {
  assert.equal(modules.length, 6);
  assert.equal(m1.concepts.length, 8);
  assert.equal(new Set(m1.concepts.map(c => c.id)).size, 8);
  const mcq = m1.check.filter(q => q.kind === 'mcq'), text = m1.check.filter(q => q.kind === 'text');
  assert.equal(mcq.length, 3); assert.equal(text.length, 4);
  for (const q of mcq) if (q.kind === 'mcq') assert.ok(q.answer >= 0 && q.answer < q.options.length);
  assert.ok(cases.some(c => c.id === m1.caseId));
  for (const m of modules.filter(x => !x.ready)) { assert.equal(m.planned?.length, 8, m.id); assert.ok(cases.some(c => c.id === m.caseId)); }
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
