import type { AllocationKey, Baseline, State } from '../model/types';
import type { ArchetypeId } from './archetypes';

/** Game parameters that no filing reports. Every one is a labelled GAME ASSUMPTION, never presented as data. */
export interface GameParams {
  /** Average annual cost per employee at market pay. */ avgPay: number;
  /** Payroll as a share of total costs (revenue − operating profit). */ laborShare: number;
  /** Price elasticity of demand: 1.5 means a 10% relative price rise loses ~15% of demand. */ elasticity: number;
  /** Normal annual staff attrition at neutral morale. */ baseAttrition: number;
  /** Normal annual customer churn. */ churn: number;
}

export interface StartCompany {
  id: string; name: string; kind: 'fictional' | 'real'; archetype: ArchetypeId; tagline: string;
  baseline: Baseline; params: GameParams;
  /** Where each opening figure came from: calibrated quartile, reported filing or game assumption. */
  provenance: { label: string; value: string; basis: string }[];
}

export interface Levers {
  /** One-off price change applied this year, %. */ price: number;
  /** Change in staffing beyond what revenue requires, % (negative = layoffs). */ workforce: number;
  /** Pay relative to market, percentage points (persistent). */ pay: number;
  /** Allocation weights 0–100 (persistent). */ marketing: number; rd: number; people: number; dividends: number;
  /** Share of pre-investment cash reinvested, % (persistent). */ reinvestment: number;
}

export interface Effects {
  price?: number; workforce?: number; pay?: number;
  /** One-off retention bonus as a share of payroll. */ bonus?: number;
  morale?: number;
  /** One-off cash cost as a share of prior-year revenue. */ oneOffCost?: number;
  /** Cash raised as a share of prior-year revenue. */ debt?: number; equity?: number;
  /** Persistent additions to allocation weights. */ allocations?: Partial<Record<AllocationKey, number>>;
  reinvestment?: number;
  /** Persistent percentage-point changes (as fractions). */ grossMargin?: number; opexRatio?: number; churn?: number; workingCapital?: number; interestRate?: number;
  /** Persistent multipliers. */ elasticity?: number; demand?: number;
  delayed?: { years: number; note: string; effects: Effects };
  /** A seeded chance that something else happens as a result. */ risk?: { chance: number; headline: string; effects: Effects };
}

export type Fn = 'finance' | 'people' | 'product' | 'marketing' | 'operations' | 'strategy';
export interface Card { id: string; title: string; fn: Fn; pitch: string; effects: Effects }

export type EventKind = 'competitorPriceCut' | 'recession' | 'rateRise' | 'talentWar' | 'costInflation' | 'demandBoom' | 'customerLoss' | 'creditSqueeze';
export interface GameEvent { year: number; kind: EventKind; size: number; headline: string }

export const dimensions = ['value', 'survival', 'growth', 'people', 'customers'] as const;
export type Dimension = typeof dimensions[number];

export interface Turn { year: number; memo: string; cards: Card[] }
export interface CaseDef {
  id: string; title: string; tagline: string; archetype: ArchetypeId; briefing: string;
  /** Revealed only in the debrief. */ objectives: string[];
  seed: number; events: GameEvent[]; turns: Turn[];
  /** The situation the case starts from, applied to any company: cash as a share of revenue, debt as a multiple of operating profit. */
  setup?: { cashToRevenue?: number; debtToOperatingProfit?: number; note: string };
  /** The author's reference path, one entry per turn: a card id (or null) and any lever settings that differ from the default. */
  reference: { card: string | null; levers?: Partial<Levers> }[];
  weights: Record<Dimension, number>;
  lessons: { when: string; note: string }[];
}

export interface Decision { card: string | null; levers: Levers }
export interface People { headcount: number; natural: number; morale: number; attrition: number; payroll: number; layoffs: number; hires: number; productivity: number }
export interface Headline { text: string; tone: 'good' | 'bad' | 'neutral' }
export interface YearRecord {
  year: number; state: State; people: People; headlines: Headline[];
  /** Emergency financing drawn this year to cover a cash shortfall. */ emergency: number;
  /** Cumulative new debt and equity raised since Year 0, including emergency loans. */ raised: number;
  pending: string[]; marketPrice: number; ourPrice: number;
}
export interface Game { start: StartCompany; caseDef: CaseDef; seed: number; decisions: Decision[] }
