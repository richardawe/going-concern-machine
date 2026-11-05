import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

// Applies migrations/NNN_name.sql in order, each in its own transaction, and records them in schema_migrations.
// Migrations only ever add (expand, then contract in a later release), so rolling back the code never needs a
// database rollback. A lock stops two deploys migrating at once.

export async function migrate(url: string, dir = 'migrations', log: (s: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock(727001)');
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query('select name from schema_migrations')).rows.map(r => r.name as string));
    const files = (await readdir(dir)).filter(f => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
    const applied: string[] = [];
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(join(dir, f), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [f]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migration ${f} failed: ${e instanceof Error ? e.message : e}`);
      }
      log(`Applied ${f}`); applied.push(f);
    }
    if (!applied.length) log('Database is up to date.');
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => {});
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.js')) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Set DATABASE_URL.'); process.exit(1); }
  migrate(url, process.env.MIGRATIONS_DIR ?? 'migrations').catch(e => { console.error(e.message); process.exit(1); });
}
