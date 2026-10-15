// University course mode: CEO-mode cases become modules a student works through, explains in their own words and hands in.
// Everything a student types is kept with its word count and whether any of it was pasted; grades are never stored or
// sent, they are recomputed from the decisions wherever a submission is read.

/** Minimum words for each kind of typed answer. */
export const MIN_WORDS = { concept: 40, reason: 25, check: 60, reflection: 40 } as const;

export interface Concept {
  id: string; title: string; short: string;
  /** What the idea is, in two or three sentences. */ body: string;
  formula?: string;
  /** What to do on the figure, and the price the figure is set to when the concept opens. */ task: string; price: number;
  /** The "in your own words" prompt. */ prompt: string;
}
export interface McqQuestion { id: string; kind: 'mcq'; stem: string; options: string[]; answer: number; why: string }
export interface TextQuestion {
  id: string; kind: 'text'; stem: string; model: string;
  /** Prefix the stem with what this student decided in that year. */ personal?: { year: number };
}
export type Question = McqQuestion | TextQuestion;

export interface ModuleDef {
  id: string; number: number; title: string; topic: string; summary: string;
  /** The CEO-mode case whose five annual decisions the module plays. */ caseId: string;
  figure: 'margin-gearbox' | null; figureTitle: string;
  outcomes: string[];
  concepts: Concept[];
  check: Question[];
  reflection: string;
  /** Modules still being written are listed with their planned concepts but cannot be opened yet. */ ready: boolean; planned?: string[];
}

export interface Answer { text: string; words: number; pasted: boolean }
export interface DecisionEntry { card: string | null; reason: Answer }
export type CheckAnswer = number | Answer;

export type Stage = 'briefing' | 'concepts' | 'decisions' | 'debrief' | 'check' | 'complete';
export interface ModuleProgress {
  stage: Stage;
  concept: number;
  concepts: Record<string, Answer>;
  decisions: DecisionEntry[];
  reflection?: Answer;
  check: Record<string, CheckAnswer>;
  checked: boolean;
  completedAt?: string;
  /** The decision being drafted for the next year (kept so a reload doesn't lose the reason). */ draft?: { card?: string | null; reason?: Answer };
}
export interface Student { name: string; id: string; email: string }
export interface Progress { course: string; student: Student; modules: Record<string, ModuleProgress> }

/** What a student hands in: answers and decisions, never grades. */
export interface Payload {
  v: 1; course: string; student: Student; submittedAt: string;
  modules: { id: string; completed: boolean; concepts: Record<string, Answer>; decisions: DecisionEntry[]; reflection?: Answer; check: Record<string, CheckAnswer> }[];
}

export interface Course {
  id: string; code: string; title: string; lecturer: string; due?: string;
  modules: string[];
}
