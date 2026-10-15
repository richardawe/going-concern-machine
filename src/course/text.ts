import type { Answer } from './types';

export const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
export const answer = (text: string, pasted = false): Answer => ({ text, words: wordCount(text), pasted });
/** An answer counts once it reaches the minimum. Pasting is allowed but flagged to the lecturer. */
export const complete = (a: Answer | undefined, min: number) => !!a && wordCount(a.text) >= min;
