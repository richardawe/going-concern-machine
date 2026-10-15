import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { buildArchetypes } from '../src/ceo/archetypes';
import type { CompanyDataset } from '../src/ontology/types';
import { gradeModule, moduleStart } from '../src/course/grade';
import { courseById, moduleById } from '../src/course/modules';
import { stats, validatePayload, verificationCode } from '../src/course/payload';
import { findSealed, isPacked, openCode } from '../src/course/seal';

// The hand-in intake, run by .github/workflows/course-intake.yml when a hand-in issue opens. It opens the hand-in code
// (prototype GCM0 codes need no key; encrypted GCM1 codes need the SUBMISSION_PRIVATE_KEY secret), checks every field,
// replays the decisions, and writes the public reply.
// The reply goes on a public issue, so it carries the verification code and counts only: no name, ID or grade.
// Writes the reply to $INTAKE_COMMENT and status=received|invalid|unconfigured to $GITHUB_OUTPUT.

const out = process.env.INTAKE_COMMENT ?? 'intake-comment.md';
const finish = async (status: 'received' | 'invalid' | 'unconfigured', body: string) => {
  await writeFile(out, body + '\n');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${status}\n`);
  console.log(`${status}\n${body}`);
};
const retry = 'Go back to the **Hand in** page, prepare your hand-in again and open a new issue. Your saved work is still in your browser.';

try {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH ?? '', 'utf8').catch(() => '{}')) as { issue?: { body?: string | null } };
  const body = (event.issue?.body ?? process.env.ISSUE_BODY ?? '').slice(0, 200_000), code = findSealed(body);
  const keyText = process.env.SUBMISSION_PRIVATE_KEY?.trim();
  if (!code) await finish('invalid', `**Not received.** This issue doesn’t contain a hand-in code (it starts with \`GCM0.\`).\n\n${retry}`);
  else if (!isPacked(code) && !keyText) await finish('unconfigured', '**Saved, not yet checked.** The course key isn’t set up on this repository, so the hand-in couldn’t be opened and checked. Your sealed code is kept here, and your lecturer can still open it.');
  else {
    let opened;
    try { opened = validatePayload(await openCode(code, keyText ? JSON.parse(keyText) as JsonWebKey : null)); }
    catch (e) { opened = { ok: false as const, error: e instanceof Error ? e.message : 'The code could not be opened.' }; }
    if (!opened.ok) await finish('invalid', `**Not received.** ${opened.error}\n\n${retry}`);
    else {
      const p = opened.payload, course = courseById(p.course), s = stats(p), v = await verificationCode(p);
      // Replaying proves the decisions are playable; the grades themselves stay private to the lecturer.
      const index = JSON.parse(await readFile('public/machines/index.json', 'utf8')) as { companies: { ticker: string }[] };
      const archetypes = buildArchetypes(await Promise.all(index.companies.map(async c => JSON.parse(await readFile(`public/machines/${c.ticker}.json`, 'utf8')) as CompanyDataset)), 'intake');
      for (const m of p.modules) { const def = moduleById(m.id)!; if (m.completed && m.decisions.length) gradeModule(def, moduleStart(def, archetypes), m.decisions.map(d => d.card)); }
      await finish('received', [
        `**Received.** Verification code \`${v}\``, '',
        `| | |`, `|---|---|`,
        `| Course | ${course.code} |`,
        `| Modules complete | ${s.completed} of ${course.modules.length} |`,
        `| Typed responses | ${s.responses} (${s.words.toLocaleString('en-GB')} words) |`,
        `| Submitted | ${p.submittedAt.slice(0, 16).replace('T', ' ')} UTC |`, '',
        'Your lecturer can now open your submission. Upload the PDF you downloaded to Canvas as well: it shows the same verification code.',
        'If you hand in again, your lecturer uses the latest one.',
      ].join('\n'));
    }
  }
} catch (e) {
  console.error(e);
  await finish('invalid', `**Not received.** Something went wrong while checking this hand-in.\n\n${retry}`);
}
