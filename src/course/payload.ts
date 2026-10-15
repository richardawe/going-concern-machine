import { cases } from '../ceo/cases';
import { moduleById } from './modules';
import { answer, wordCount } from './text';
import type { Answer, CheckAnswer, Course, DecisionEntry, Payload, Progress } from './types';

// The hand-in: built from the student's saved progress, checked field by field wherever it is opened (a sealed code
// is untrusted input), and identified by a verification code that both copies of the PDF print.

export function buildPayload(progress: Progress, course: Course, submittedAt: string): Payload {
  return {
    v: 1, course: course.id, student: { ...progress.student }, submittedAt,
    modules: course.modules.flatMap(id => {
      const p = progress.modules[id]; if (!p) return [];
      return [{ id, completed: p.stage === 'complete', concepts: p.concepts, decisions: p.decisions, reflection: p.reflection, check: p.check }];
    }),
  };
}

const LIMIT = { text: 8000, field: 200 };
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max = LIMIT.field) => typeof x === 'string' && x.length <= max;
function readAnswer(x: unknown): Answer | null {
  if (!isObject(x) || !str(x.text, LIMIT.text) || typeof x.pasted !== 'boolean') return null;
  return answer(x.text as string, x.pasted);
}

/** Checks an opened submission. Word counts are recomputed, never trusted; unknown modules, cards or questions fail. */
export function validatePayload(x: unknown): { ok: true; payload: Payload } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!isObject(x) || x.v !== 1) return fail('Unknown submission format.');
  if (!str(x.course, 40)) return fail('Missing course.');
  const s = x.student;
  if (!isObject(s) || !str(s.name) || !str(s.id) || !str(s.email) || !(s.name as string).trim()) return fail('Missing student details.');
  if (!str(x.submittedAt, 40) || Number.isNaN(Date.parse(x.submittedAt as string))) return fail('Missing submission time.');
  if (!Array.isArray(x.modules) || x.modules.length > 12) return fail('Missing modules.');
  const out: Payload['modules'] = [];
  for (const m of x.modules) {
    if (!isObject(m) || !str(m.id, 60)) return fail('A module is malformed.');
    const def = moduleById(m.id as string), caseDef = def && cases.find(c => c.id === def.caseId);
    if (!def || !caseDef) return fail(`Unknown module “${String(m.id).slice(0, 40)}”.`);
    if (out.some(o => o.id === def.id)) return fail(`Module ${def.number} appears twice.`);
    if (!isObject(m.concepts) || !Array.isArray(m.decisions) || !isObject(m.check)) return fail(`Module ${def.number} is malformed.`);
    const concepts: Record<string, Answer> = {};
    for (const [k, v] of Object.entries(m.concepts)) { const a = readAnswer(v); if (!a || !def.concepts.some(c => c.id === k)) return fail(`Module ${def.number} has an unknown concept answer.`); concepts[k] = a; }
    if (m.decisions.length > caseDef.turns.length) return fail(`Module ${def.number} has too many decisions.`);
    const decisions: DecisionEntry[] = [];
    for (const [i, d] of m.decisions.entries()) {
      if (!isObject(d)) return fail(`Module ${def.number} has a malformed decision.`);
      const card = d.card === null ? null : typeof d.card === 'string' && caseDef.turns[i].cards.some(c => c.id === d.card) ? d.card : undefined;
      const reason = readAnswer(d.reason);
      if (card === undefined || !reason) return fail(`Module ${def.number}, year ${i + 1}: unknown decision.`);
      decisions.push({ card, reason });
    }
    const check: Record<string, CheckAnswer> = {};
    for (const [k, v] of Object.entries(m.check)) {
      const q = def.check.find(c => c.id === k); if (!q) return fail(`Module ${def.number} has an unknown question.`);
      if (q.kind === 'mcq') { if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= q.options.length) return fail(`Module ${def.number}, ${k}: invalid choice.`); check[k] = v as number; }
      else { const a = readAnswer(v); if (!a) return fail(`Module ${def.number}, ${k}: invalid answer.`); check[k] = a; }
    }
    const reflection = m.reflection === undefined ? undefined : readAnswer(m.reflection);
    if (reflection === null) return fail(`Module ${def.number}: invalid reflection.`);
    out.push({ id: def.id, completed: m.completed === true, concepts, decisions, reflection, check });
  }
  const st = s as Record<string, string>;
  return { ok: true, payload: { v: 1, course: x.course as string, student: { name: st.name.trim(), id: st.id.trim(), email: st.email.trim() }, submittedAt: x.submittedAt as string, modules: out } };
}

/** JSON with object keys sorted, so the same submission always hashes the same way. */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (isObject(x)) return `{${Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`;
  return JSON.stringify(x);
}
const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** GCM-XXXX-XXXX-XXXX: the first 60 bits of SHA-256 over the canonical submission. Any edit changes it. */
export async function verificationCode(p: Payload): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(p))));
  let bits = 0n; for (let i = 0; i < 8; i++) bits = (bits << 8n) | BigInt(hash[i]);
  let out = ''; for (let i = 0; i < 12; i++) out += BASE32[Number((bits >> BigInt(59 - i * 5)) & 31n)];
  return `GCM-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

/** Everything a student typed in a module, in order. */
export function typedAnswers(m: Payload['modules'][number]): Answer[] {
  return [...Object.values(m.concepts), ...m.decisions.map(d => d.reason), ...Object.values(m.check).filter((a): a is Answer => typeof a !== 'number'), ...(m.reflection ? [m.reflection] : [])];
}
export function stats(p: Payload) {
  const typed = p.modules.flatMap(typedAnswers);
  return { completed: p.modules.filter(m => m.completed).length, responses: typed.length, words: typed.reduce((n, a) => n + wordCount(a.text), 0), pasted: typed.filter(a => a.pasted).length };
}
