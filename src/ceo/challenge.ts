import { archetypeIds, type ArchetypeId } from './archetypes';
import { realCompanies } from './company';
import { resolveCase, SANDBOX_ID, type SandboxConfig } from './sandbox';
import type { CaseDef, Decision, EventKind, Levers } from './types';

// A challenge is a link that recreates the same world (case, company, shocks) and carries the challenger's decisions.
// It never carries scores: the recipient's browser replays the decisions, so a link cannot claim a result it did not earn.
export type CompanyChoice = { kind: 'fictional'; archetype: ArchetypeId; seed: number } | { kind: 'real'; ticker: string };
export interface Challenge { caseId: string; choice: CompanyChoice; sandbox?: SandboxConfig; decisions: Decision[]; name?: string; revenue: number }

const leverOrder = ['price', 'workforce', 'pay', 'marketing', 'rd', 'people', 'dividends', 'reinvestment'] as const satisfies readonly (keyof Levers)[];
export const leverRange: Record<keyof Levers, [number, number]> = { price: [-20, 20], workforce: [-20, 20], pay: [-10, 15], marketing: [0, 100], rd: [0, 100], people: [0, 100], dividends: [0, 100], reinvestment: [0, 100] };
const MAX_NAME = 30, MAX_CODE = 4000;

type Wire = { v: 1; k: string; co: ['f', string, number] | ['r', string]; sb?: [string, number][]; d: number[][]; n?: string; r: number };
const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code: string) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

export function encodeChallenge(c: Challenge, caseDef: CaseDef): string {
  const wire: Wire = {
    v: 1, k: c.caseId, r: Math.round(c.revenue),
    co: c.choice.kind === 'fictional' ? ['f', c.choice.archetype, c.choice.seed] : ['r', c.choice.ticker],
    d: c.decisions.map((d, i) => [d.card == null ? -1 : caseDef.turns[i].cards.findIndex(x => x.id === d.card), ...leverOrder.map(k => Math.round(d.levers[k]))]),
    ...(c.sandbox ? { sb: c.sandbox.events.map(e => [e.kind, e.year] as [string, number]) } : {}),
    ...(c.name?.trim() ? { n: c.name.trim().slice(0, MAX_NAME) } : {}),
  };
  return toBase64Url(JSON.stringify(wire));
}

/** Decodes and fully validates a challenge code; anything malformed or out of range returns null. */
export function decodeChallenge(code: string): (Challenge & { caseDef: CaseDef }) | null {
  try {
    if (!code || code.length > MAX_CODE || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
    const w = JSON.parse(fromBase64Url(code)) as Wire;
    if (w?.v !== 1 || typeof w.k !== 'string' || !Array.isArray(w.co) || !Array.isArray(w.d) || !Number.isFinite(w.r)) return null;
    let choice: CompanyChoice;
    if (w.co[0] === 'f' && archetypeIds.includes(w.co[1] as ArchetypeId) && Number.isInteger(w.co[2]) && w.co[2] >= 0 && w.co[2] < 1e9) choice = { kind: 'fictional', archetype: w.co[1] as ArchetypeId, seed: w.co[2] };
    else if (w.co[0] === 'r' && typeof w.co[1] === 'string' && w.co[1] in realCompanies) choice = { kind: 'real', ticker: w.co[1] };
    else return null;
    const sandbox: SandboxConfig | undefined = w.k === SANDBOX_ID ? { archetype: choice.kind === 'fictional' ? choice.archetype : 'industrial', events: (Array.isArray(w.sb) ? w.sb : []).map(([kind, year]) => ({ kind: kind as EventKind, year })) } : undefined;
    const caseDef = resolveCase(w.k, sandbox); if (!caseDef || w.d.length !== caseDef.turns.length) return null;
    const decisions: Decision[] = [];
    for (const [i, row] of w.d.entries()) {
      if (!Array.isArray(row) || row.length !== 1 + leverOrder.length || !row.every(Number.isInteger)) return null;
      const [card, ...values] = row, cards = caseDef.turns[i].cards;
      if (card < -1 || card >= cards.length) return null;
      const levers = Object.fromEntries(leverOrder.map((k, j) => [k, values[j]])) as unknown as Levers;
      if (!leverOrder.every(k => levers[k] >= leverRange[k][0] && levers[k] <= leverRange[k][1])) return null;
      decisions.push({ card: card === -1 ? null : cards[card].id, levers });
    }
    const name = typeof w.n === 'string' ? w.n.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME) || undefined : undefined;
    return { caseId: w.k, choice, sandbox, decisions, name, revenue: w.r, caseDef };
  } catch { return null; }
}

/** The shareable URL for the current page's location. */
export const challengeUrl = (code: string, href = location.href) => `${href.split('#')[0]}#/ceo?challenge=${code}`;
export const challengeFromHash = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '').get('challenge');
