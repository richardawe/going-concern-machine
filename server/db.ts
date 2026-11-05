import pg from 'pg';

// Every query runs in a transaction that first says whose data it may see: one university (tenant), or the platform.
// Row-level security in the database enforces it, so a query that forgets a tenant filter still can't leak.

export type Scope = { tenantId: string } | { platform: true };

export interface Q {
  many<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T>;
  maybe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string, params?: unknown[]): Promise<number>;
}

export class NotFound extends Error { constructor(what = 'Not found.') { super(what); } }

const wrap = (c: pg.PoolClient): Q => ({
  async many(sql, params) { return (await c.query(sql, params)).rows; },
  async one(sql, params) { const r = await c.query(sql, params); if (!r.rows[0]) throw new NotFound(); return r.rows[0]; },
  async maybe(sql, params) { return (await c.query(sql, params)).rows[0] ?? null; },
  async exec(sql, params) { return (await c.query(sql, params)).rowCount ?? 0; },
});

export class Db {
  readonly pool: pg.Pool;
  constructor(url: string, max = 10) {
    this.pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
    // timestamptz as ISO strings, so JSON responses and comparisons are predictable.
    pg.types.setTypeParser(1184, v => new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString());
    pg.types.setTypeParser(1082, v => v); // date stays YYYY-MM-DD
    pg.types.setTypeParser(20, v => Number(v)); // bigint counts
  }
  async tx<T>(scope: Scope, fn: (q: Q) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.tenant_id', $1, true), set_config('app.platform', $2, true)",
        ['tenantId' in scope ? scope.tenantId : '', 'platform' in scope ? 'on' : '']);
      const out = await fn(wrap(c));
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally { c.release(); }
  }
  tenant<T>(tenantId: string, fn: (q: Q) => Promise<T>) { return this.tx({ tenantId }, fn); }
  platform<T>(fn: (q: Q) => Promise<T>) { return this.tx({ platform: true }, fn); }
  close() { return this.pool.end(); }
}
