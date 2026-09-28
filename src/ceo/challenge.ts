import { archetypeIds, type ArchetypeId } from './archetypes';
import { realCompanies } from './company';
import { resolveCase, SANDBOX_ID, type SandboxConfig } from './sandbox';
import type { CaseDef, Decision, EventKind, Levers } from './types';

// A challenge is a link that recreates the same world (case, company, shocks) and carries the challenger's decisions.
// It never carries scores: the recipient's browser replays the decisions, so a link cannot claim a result it did not earn.
export type CompanyChoice = { kind: 'fictional'; archetype: ArchetypeId; seed: number } | { kind: 'real'; ticker: string };
export interface Challenge { caseId: string; choice: CompanyChoice; sandbox?: SandboxConfig; decisions: Decision[]; name?: string; revenue: number; assignment?: string }
/** A class assignment fixes the world (case and company) so every student's results are comparable. */
export interface Assignment { id: string; title: string; caseId: string; choice: CompanyChoice; sandbox?: SandboxConfig }

const leverOrder = ['price', 'workforce', 'pay', 'marketing', 'rd', 'people', 'dividends', 'reinvestment'] as const satisfies readonly (keyof Levers)[];
export const leverRange: Record<keyof Levers, [number, number]> = { price: [-20, 20], workforce: [-20, 20], pay: [-10, 15], marketing: [0, 100], rd: [0, 100], people: [0, 100], dividends: [0, 100], reinvestment: [0, 100] };
const MAX_NAME = 30, MAX_TITLE = 80, MAX_CODE = 4000;
const ASSIGNMENT_ID = /^[A-Za-z0-9-]{1,40}$/;
const clean = (text: unknown, max: number) => typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || undefined : undefined;

type World = { v: 1; k: string; co: ['f', string, number] | ['r', string]; sb?: [string, number][] };
type Wire = World & { d: number[][]; n?: string; r: number; a?: string };
type AssignmentWire = World & { a: string; t: string };
const worldWire = (w: { caseId: string; choice: CompanyChoice; sandbox?: SandboxConfig }): World => ({
  v: 1, k: w.caseId, co: w.choice.kind === 'fictional' ? ['f', w.choice.archetype, w.choice.seed] : ['r', w.choice.ticker],
  ...(w.sandbox ? { sb: w.sandbox.events.map(e => [e.kind, e.year] as [string, number]) } : {}),
});
/** Validates the case, company and shocks every code carries. */
function parseWorld(w: World): { choice: CompanyChoice; sandbox?: SandboxConfig; caseDef: CaseDef } | null {
  if (w?.v !== 1 || typeof w.k !== 'string' || !Array.isArray(w.co)) return null;
  let choice: CompanyChoice;
  if (w.co[0] === 'f' && archetypeIds.includes(w.co[1] as ArchetypeId) && Number.isInteger(w.co[2]) && w.co[2] >= 0 && w.co[2] < 1e9) choice = { kind: 'fictional', archetype: w.co[1] as ArchetypeId, seed: w.co[2] };
  else if (w.co[0] === 'r' && typeof w.co[1] === 'string' && w.co[1] in realCompanies) choice = { kind: 'real', ticker: w.co[1] };
  else return null;
  const sandbox: SandboxConfig | undefined = w.k === SANDBOX_ID ? { archetype: choice.kind === 'fictional' ? choice.archetype : 'industrial', events: (Array.isArray(w.sb) ? w.sb : []).map(([kind, year]) => ({ kind: kind as EventKind, year })) } : undefined;
  const caseDef = resolveCase(w.k, sandbox);
  return caseDef ? { choice, sandbox, caseDef } : null;
}
const readCode = (code: string): unknown => { if (!code || code.length > MAX_CODE || !/^[A-Za-z0-9_-]+$/.test(code)) return null; return JSON.parse(fromBase64Url(code)); };
const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code: string) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

export function encodeChallenge(c: Challenge, caseDef: CaseDef): string {
  const wire: Wire = {
    ...worldWire(c), r: Math.round(c.revenue),
    d: c.decisions.map((d, i) => [d.card == null ? -1 : caseDef.turns[i].cards.findIndex(x => x.id === d.card), ...leverOrder.map(k => Math.round(d.levers[k]))]),
    ...(c.name?.trim() ? { n: c.name.trim().slice(0, MAX_NAME) } : {}),
    ...(c.assignment && ASSIGNMENT_ID.test(c.assignment) ? { a: c.assignment } : {}),
  };
  return toBase64Url(JSON.stringify(wire));
}

/** Decodes and fully validates a challenge code; anything malformed or out of range returns null. */
export function decodeChallenge(code: string): (Challenge & { caseDef: CaseDef }) | null {
  try {
    const w = readCode(code) as Wire | null;
    if (!w || !Array.isArray(w.d) || !Number.isFinite(w.r)) return null;
    const world = parseWorld(w); if (!world || w.d.length !== world.caseDef.turns.length) return null;
    const { choice, sandbox, caseDef } = world;
    const decisions: Decision[] = [];
    for (const [i, row] of w.d.entries()) {
      if (!Array.isArray(row) || row.length !== 1 + leverOrder.length || !row.every(Number.isInteger)) return null;
      const [card, ...values] = row, cards = caseDef.turns[i].cards;
      if (card < -1 || card >= cards.length) return null;
      const levers = Object.fromEntries(leverOrder.map((k, j) => [k, values[j]])) as unknown as Levers;
      if (!leverOrder.every(k => levers[k] >= leverRange[k][0] && levers[k] <= leverRange[k][1])) return null;
      decisions.push({ card: card === -1 ? null : cards[card].id, levers });
    }
    const assignment = typeof w.a === 'string' && ASSIGNMENT_ID.test(w.a) ? w.a : undefined;
    return { caseId: w.k, choice, sandbox, decisions, name: clean(w.n, MAX_NAME), revenue: w.r, caseDef, assignment };
  } catch { return null; }
}

/** The shareable URL for the current page's location. */
export const challengeUrl = (code: string, href = location.href) => `${href.split('#')[0]}#/ceo?challenge=${code}`;
export const challengeFromHash = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '').get('challenge');

export function encodeAssignment(a: Assignment): string {
  const wire: AssignmentWire = { ...worldWire(a), a: a.id, t: a.title.trim().slice(0, MAX_TITLE) };
  return toBase64Url(JSON.stringify(wire));
}
export function decodeAssignment(code: string): (Assignment & { caseDef: CaseDef }) | null {
  try {
    const w = readCode(code) as AssignmentWire | null;
    if (!w || typeof w.a !== 'string' || !ASSIGNMENT_ID.test(w.a) || typeof w.t !== 'string' || 'd' in w) return null;
    const world = parseWorld(w); if (!world) return null;
    return { id: w.a, title: clean(w.t, MAX_TITLE) ?? 'Class assignment', caseId: w.k, ...world };
  } catch { return null; }
}
export const newAssignmentId = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`;
export const assignmentUrl = (code: string, href = location.href) => `${href.split('#')[0]}#/ceo?assignment=${code}`;
export const assignmentFromHash = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '').get('assignment');
/** Every results code in a block of pasted text: challenge links, bare codes, one per line or mixed with other text. */
export function extractCodes(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/[\r\n,;\t ]+/)) {
    const m = line.match(/challenge=([A-Za-z0-9_-]+)/) ?? line.match(/^["']?([A-Za-z0-9_-]{40,})["']?$/);
    if (m) out.push(m[1]);
  }
  return out;
}
/** A stable key for "the same world": two codes with the same key were played on the same company and events. */
export const worldKey = (w: { caseId: string; choice: CompanyChoice; sandbox?: SandboxConfig }) => JSON.stringify(worldWire(w));
