import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { money } from '../presentation';
import type { ModuleGrade } from './grade';
import { caseFor } from './grade';
import { moduleById } from './modules';
import { stats, typedAnswers } from './payload';
import { wordCount } from './text';
import type { Answer, Course, Payload } from './types';

// The submission PDF. The student's download and the lecturer's copy are built by this one function from the same
// submission, so they match; grades come from replaying the decisions, never from the submission itself.

const A4 = [595.28, 841.89] as const, M = 56, W = A4[0] - 2 * M;
const ink = rgb(.1, .1, .11), grey = rgb(.45, .45, .48), faint = rgb(.82, .82, .8), warn = rgb(.66, .4, .05);

/** Standard PDF fonts only cover Windows-1252; anything else is spelled out or replaced so the PDF always builds. */
const SWAP: Record<string, string> = { '−': '-', '≈': '~', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', ' ': ' ', ' ': ' ', '​': '' };
function clean(font: PDFFont, text: string, cache: Map<string, string>) {
  let out = '';
  for (const ch of text.replace(/\r/g, '')) {
    let c = cache.get(ch);
    if (c === undefined) { c = SWAP[ch] ?? ch; try { font.encodeText(c); } catch { c = '?'; } cache.set(ch, c); }
    out += c;
  }
  return out;
}

class Writer {
  page!: PDFPage; y = 0; pages: PDFPage[] = []; cache = new Map<string, string>();
  constructor(public doc: PDFDocument, public f: { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont }) { this.add(); }
  add() { this.page = this.doc.addPage([...A4]); this.pages.push(this.page); this.y = A4[1] - M; }
  need(h: number) { if (this.y - h < M + 24) this.add(); }
  wrap(text: string, font: PDFFont, size: number, width = W) {
    const lines: string[] = [];
    for (const para of clean(font, text, this.cache).split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) lines.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > width) { let k = line.length; while (k > 1 && font.widthOfTextAtSize(line.slice(0, k), size) > width) k--; lines.push(line.slice(0, k)); line = line.slice(k); }
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const font = o.font ?? this.f.regular, size = o.size ?? 10, lead = size * 1.38, x = M + (o.indent ?? 0);
    for (const line of this.wrap(text, font, size, W - (o.indent ?? 0))) { this.need(lead); this.page.drawText(line, { x, y: this.y - size, size, font, color: o.color ?? ink }); this.y -= lead; }
    this.y -= o.gap ?? 4;
  }
  at(text: string, x: number, size: number, font: PDFFont, color = ink, right = false) {
    const t = clean(font, text, this.cache); this.page.drawText(t, { x: right ? x - font.widthOfTextAtSize(t, size) : x, y: this.y - size, size, font, color });
  }
  rule(color = faint, thickness = .6) { this.need(8); this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + W, y: this.y }, thickness, color }); this.y -= 8; }
  label(text: string) { this.need(30); this.y -= 6; this.text(text.toUpperCase(), { font: this.f.bold, size: 7.5, color: grey, gap: 2 }); }
  row(cells: string[], widths: number[], o: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    const size = 8.5, font = o.bold ? this.f.bold : this.f.regular;
    const wrapped = cells.map((c, i) => this.wrap(c, font, size, widths[i] - 6)), h = Math.max(...wrapped.map(l => l.length)) * size * 1.35 + 5;
    this.need(h);
    let x = M; wrapped.forEach((lines, i) => { lines.forEach((l, k) => this.page.drawText(l, { x, y: this.y - size - k * size * 1.35, size, font, color: o.color ?? ink })); x += widths[i]; });
    this.y -= h; this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: M + W, y: this.y + 2 }, thickness: .4, color: faint });
  }
  answer(a: Answer | undefined) {
    if (!a || !a.text.trim()) { this.text('No answer.', { font: this.f.italic, color: grey, indent: 10 }); return; }
    const top = this.y, page = this.page;
    this.text(a.text, { indent: 10, size: 9.5, gap: 1 });
    if (page === this.page) page.drawLine({ start: { x: M + 2, y: top - 2 }, end: { x: M + 2, y: this.y + 3 }, thickness: 1.2, color: faint });
    this.text(`${wordCount(a.text)} words${a.pasted ? '   ·   CONTAINS PASTED TEXT' : ''}`, { size: 7.5, color: a.pasted ? warn : grey, indent: 10, gap: 8 });
  }
}

export interface PdfInput { payload: Payload; course: Course; code: string; grades: Record<string, ModuleGrade | null> }

export async function submissionPdf({ payload, course, code, grades }: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create(), when = new Date(payload.submittedAt);
  const f = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), italic: await doc.embedFont(StandardFonts.HelveticaOblique), mono: await doc.embedFont(StandardFonts.Courier) };
  doc.setTitle(`${course.code} submission: ${payload.student.name}`); doc.setAuthor(payload.student.name); doc.setSubject(`Verification ${code}`);
  doc.setProducer('Going Concern Modules'); doc.setCreator('Going Concern Modules'); doc.setCreationDate(when); doc.setModificationDate(when);
  const w = new Writer(doc, f), s = stats(payload), date = when.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  // Cover
  w.text('GOING CONCERN MODULES · SUBMISSION', { font: f.bold, size: 7.5, color: grey, gap: 6 });
  const top = w.y;
  w.text(course.title, { font: f.bold, size: 15, gap: 2 });
  w.text(`${course.code} · ${course.lecturer}${course.due ? ` · due ${course.due}` : ''}`, { size: 9, color: grey, gap: 10 });
  const after = w.y; w.y = top;
  w.at(payload.student.name, M + W, 11, f.bold, ink, true); w.y -= 15;
  w.at(`Student ID ${payload.student.id || '-'}`, M + W, 9, f.regular, grey, true); w.y -= 12;
  w.at(payload.student.email || '', M + W, 9, f.regular, grey, true); w.y -= 12;
  w.at(`Submitted ${date}`, M + W, 9, f.regular, grey, true);
  w.y = Math.min(after, w.y - 14); w.rule(ink, 1.2);
  w.label('Verification');
  w.text(code, { font: f.mono, size: 13, gap: 2 });
  w.text('This code is a fingerprint of everything in the submission. The lecturer’s copy is rebuilt from the sealed hand-in and must show the same code; grades are recomputed by replaying the decisions.', { size: 8.5, color: grey, gap: 8 });
  w.label('Summary');
  w.text(`${s.completed} of ${course.modules.length} modules complete · ${s.responses} typed responses · ${s.words.toLocaleString('en-GB')} words · ${s.pasted ? `${s.pasted} answer${s.pasted > 1 ? 's contain' : ' contains'} pasted text` : 'no pasted text'}`, { size: 9, gap: 6 });
  const cols = [150, 70, 62, 62, 46, 46, 47];
  w.row(['Module', 'Status', 'Outcome', 'Judgement', 'MCQ', 'Words', 'Pasted'], cols, { bold: true, color: grey });
  for (const id of course.modules) {
    const def = moduleById(id)!, m = payload.modules.find(x => x.id === id), g = grades[id];
    if (!m) { w.row([`${def.number} · ${def.title}`, def.ready ? 'Not started' : 'Not yet available', '-', '-', '-', '-', '-'], cols, { color: grey }); continue; }
    const mcq = def.check.filter(q => q.kind === 'mcq'), right = mcq.filter(q => q.kind === 'mcq' && m.check[q.id] === q.answer).length, typed = typedAnswers(m);
    w.row([`${def.number} · ${def.title}`, m.completed ? 'Complete' : 'In progress', g ? g.outcome.grade : '-', g ? g.judgement.grade : '-', m.completed ? `${right} / ${mcq.length}` : '-', String(typed.reduce((n, a) => n + wordCount(a.text), 0)), String(typed.filter(a => a.pasted).length)], cols);
  }

  // One section per module the student started
  for (const m of payload.modules) {
    const def = moduleById(m.id)!, caseDef = caseFor(def), g = grades[m.id];
    w.add();
    w.text(`MODULE ${def.number} · ${def.topic.toUpperCase()}`, { font: f.bold, size: 7.5, color: grey, gap: 4 });
    w.text(def.title, { font: f.bold, size: 15, gap: 4 });
    if (g) w.text(`Outcome ${g.outcome.grade} · Judgement ${g.judgement.grade} · ${g.verdict}. Cash ${money(g.startCash, g.currency)} to ${money(g.finalCash, g.currency)}${g.emergencies ? `, ${g.emergencies} emergency loan${g.emergencies > 1 ? 's' : ''}` : ''}.`, { size: 9, color: grey, gap: 8 });
    else w.text(m.completed ? 'Grades not computed.' : 'Decisions not finished, so no grade yet.', { size: 9, color: grey, gap: 8 });
    w.rule();
    if (m.decisions.length) {
      w.label('Decisions and reasons');
      m.decisions.forEach((d, i) => {
        const title = caseDef.turns[i].cards.find(c => c.id === d.card)?.title ?? 'Hold course';
        w.text(`Year ${i + 1}: ${title}`, { font: f.bold, size: 9.5, gap: 2 }); w.answer(d.reason);
      });
    }
    if (Object.keys(m.concepts).length) {
      w.label('Concepts, in the student’s own words');
      def.concepts.forEach((c, i) => {
        if (!m.concepts[c.id]) return;
        w.text(`${i + 1}. ${c.title}`, { font: f.bold, size: 9.5, gap: 1 }); w.text(c.prompt, { size: 8.5, color: grey, gap: 3 }); w.answer(m.concepts[c.id]);
      });
    }
    if (Object.keys(m.check).length) {
      w.label('End-of-module check');
      def.check.forEach((q, i) => {
        const a = m.check[q.id]; if (a === undefined) return;
        w.text(`Q${i + 1}. ${q.stem}`, { font: f.bold, size: 9.5, gap: 2 });
        if (q.kind === 'mcq' && typeof a === 'number') w.text(`Chose: ${q.options[a]}   ${a === q.answer ? '(correct)' : `(incorrect; answer: ${q.options[q.answer]})`}`, { size: 9, indent: 10, color: a === q.answer ? ink : warn, gap: 8 });
        else if (typeof a !== 'number') w.answer(a);
      });
    }
    if (m.reflection) { w.label('Reflection'); w.text(def.reflection, { size: 8.5, color: grey, gap: 3 }); w.answer(m.reflection); }
  }

  w.pages.forEach((p, i) => {
    const t = clean(f.regular, `${code} · ${payload.student.name} · page ${i + 1} of ${w.pages.length}`, w.cache);
    p.drawLine({ start: { x: M, y: M - 4 }, end: { x: M + W, y: M - 4 }, thickness: .4, color: faint });
    p.drawText(t, { x: M, y: M - 16, size: 7.5, font: f.regular, color: grey });
  });
  return doc.save({ useObjectStreams: false });
}

export const pdfName = (course: Course, p: Payload) => `${course.code.replace(/\s+/g, '')}_${(p.student.id || 'student').replace(/[^\w-]/g, '')}_${p.student.name.split(/\s+/).at(-1)?.replace(/[^\w-]/g, '') || 'submission'}.pdf`;
