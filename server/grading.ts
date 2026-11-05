import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchetypeFile } from '../src/ceo/archetypes';
import { gradeModule, moduleStart, type ModuleGrade } from '../src/course/grade';
import { moduleById } from '../src/course/modules';
import type { Payload } from '../src/course/types';
import type { Db } from './db';

// Grades replay a student's decisions against a frozen copy of the industry archetypes. A course keeps the copy it was
// created with, so a weekly SEC refresh never moves a mark.

export type Grades = Record<string, ModuleGrade | null>;

/** Pure: the grade for every finished module in a hand-in. About half a second per module, so run it off the main thread. */
export function gradePayload(payload: Payload, archetypes: ArchetypeFile): Grades {
  const out: Grades = {};
  for (const m of payload.modules) {
    const def = moduleById(m.id);
    out[m.id] = def && m.completed && m.decisions.length ? gradeModule(def, moduleStart(def, archetypes), m.decisions.map(d => d.card)) : null;
  }
  return out;
}

let current: { mtime: number; id: string } | null = null;
/** Makes sure the archetypes this release was built with are stored as a snapshot, and returns its id. */
export async function currentSnapshotId(db: Db, staticDir: string): Promise<string> {
  const file = join(staticDir, 'ceo', 'archetypes.json'), info = await stat(file).catch(() => null);
  if (!info) throw new Error(`The industry archetypes are missing (${file}). Build the app first.`);
  if (current && current.mtime === info.mtimeMs) return current.id;
  const text = await readFile(file, 'utf8'), data = JSON.parse(text) as ArchetypeFile;
  const id = `${(data.built ?? '').slice(0, 10)}-${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
  await db.platform(q => q.exec('insert into archetype_snapshots (id, data) values ($1, $2) on conflict (id) do nothing', [id, text]));
  current = { mtime: info.mtimeMs, id };
  return id;
}

const cache = new Map<string, ArchetypeFile>();
export async function snapshot(db: Db, id: string): Promise<ArchetypeFile> {
  const hit = cache.get(id); if (hit) return hit;
  const row = await db.platform(q => q.maybe<{ data: ArchetypeFile }>('select data from archetype_snapshots where id = $1', [id]));
  if (!row) throw new Error(`Snapshot ${id} is missing.`);
  cache.set(id, row.data);
  return row.data;
}
