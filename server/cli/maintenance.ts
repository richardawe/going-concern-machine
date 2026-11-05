import { Db } from '../db';

// Nightly housekeeping (cron, see docs/DEPLOYMENT.md). Keeps the promises in the privacy notice:
//  - sign-in codes and expired sessions go after 90 days;
//  - each university's student work goes once its retention period has passed after the course's due date
//    (or its creation date if it has none); the course itself is closed and kept as an empty record.
// Prints what it removed; --dry-run reports without deleting.

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL.'); process.exit(1); }
const dry = process.argv.includes('--dry-run');
const db = new Db(url, 1);
try {
  const report = await db.platform(async q => {
    const expired = `coalesce(c.due_at, c.created_at) < now() - make_interval(months => t.retention_months)`;
    const courses = await q.many<{ id: string; code: string; university: string }>(
      `select c.id, c.code, t.name as university from courses c join tenants t on t.id = c.tenant_id
        where ${expired} and (exists (select 1 from module_progress p where p.course_id = c.id) or exists (select 1 from submissions s where s.course_id = c.id))`);
    const ids = courses.map(c => c.id);
    const out = {
      loginCodes: await q.exec(`${dry ? 'select 1 from' : 'delete from'} login_codes where created_at < now() - interval '90 days'`),
      platformCodes: await q.exec(`${dry ? 'select 1 from' : 'delete from'} platform_login_codes where created_at < now() - interval '90 days'`),
      sessions: await q.exec(`${dry ? 'select 1 from' : 'delete from'} sessions where expires_at < now() - interval '90 days'`),
      platformSessions: await q.exec(`${dry ? 'select 1 from' : 'delete from'} platform_sessions where expires_at < now() - interval '90 days'`),
      progress: await q.exec(`${dry ? 'select 1 from' : 'delete from'} module_progress where course_id = any($1)`, [ids]),
      handIns: await q.exec(`${dry ? 'select 1 from' : 'delete from'} submissions where course_id = any($1)`, [ids]),
      courses: courses.map(c => `${c.university}: ${c.code}`),
    };
    if (!dry && ids.length) {
      await q.exec('update courses set archived = true, join_open = false where id = any($1)', [ids]);
      for (const c of courses) await q.exec("insert into audit_log (tenant_id, actor_kind, action, target, detail) select tenant_id, 'system', 'retention.delete', code, '{}' from courses where id = $1", [c.id]);
    }
    return out;
  });
  console.log(`${dry ? '[dry run] ' : ''}${new Date().toISOString()} ${JSON.stringify(report)}`);
} finally { await db.close(); }
