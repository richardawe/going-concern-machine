import { parentPort } from 'node:worker_threads';
import type { ArchetypeFile } from '../src/ceo/archetypes';
import type { Payload } from '../src/course/types';
import { gradePayload } from './grading';

// Runs on a worker thread so a hand-in rush never stalls other requests.
parentPort!.on('message', (m: { id: number; payload: Payload; archetypes: ArchetypeFile }) => {
  try { parentPort!.postMessage({ id: m.id, grades: gradePayload(m.payload, m.archetypes) }); }
  catch (e) { parentPort!.postMessage({ id: m.id, error: e instanceof Error ? e.message : String(e) }); }
});
