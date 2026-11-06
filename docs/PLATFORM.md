# Going Concern platform (universities)

The university edition as a hosted service: one server for every university, each on its own subdomain, signing in
with university email. Deployment is in [DEPLOYMENT.md](DEPLOYMENT.md); the course content itself is in [COURSE.md](COURSE.md).

## Who does what

| Role | Where | Can |
| --- | --- | --- |
| Platform admin (you) | `admin.<domain>` | Show prospective universities the modules prototype (**Demo modules**) and the CEO mode class tool (**CEO class tool**). Provision universities from the UK directory, set email domains, places and contract dates, invite university admins, suspend, export, see the audit log and system health. Signs in with an emailed code **and** an authenticator app. |
| University admin | `<slug>.<domain>/admin` | Accept the terms, invite lecturers and admins (one at a time or as a list), change roles, deactivate people, set the name and colour, export all the university's data, see its activity. |
| Lecturer | `<slug>.<domain>/teach` | Set CEO mode class assignments and grade them (**CEO mode classes**). Create courses (modules, due date, late policy, co-lecturers), share a join link, follow every student's status, read their answers, give extensions, download CSV, each PDF or all PDFs as a zip. |
| Student | `<slug>.<domain>` | Anyone with an address on the university's domains. Join with a link or code, work through modules (saved to their account as they type), hand in, get a receipt and the PDF, download their own data. |

## How it fits together

| Path | What it does |
| --- | --- |
| `server/app.ts` | Fastify app: works out the host kind (public, console or university), security headers, CSRF check, static files, and the app shell |
| `server/db.ts` | Every query runs in a transaction scoped to one university, or to the platform |
| `migrations/001_init.sql` | The schema, with **forced row-level security**: a query at one university can't see another's rows even without a filter |
| `server/routes/` | `auth` (emailed codes), `account`, `student`, `teach`, `admin` (university), `platform` (console), `public` |
| `server/grader.ts` | Grades hand-ins on a worker thread from a queue in the database, so a deadline rush never blocks requests |
| `server/grading.ts` | Pins each course to a snapshot of the industry archetypes, so the weekly SEC refresh never moves a mark |
| `server/courses.ts` | Builds the hand-in on the server from saved progress and the account (`src/course/payload.ts` checks it), and the PDF |
| `server/data/uk-universities.json`, `server/directory.ts` | 165 UK universities with common short names and email domains, searchable in the console |
| `server/cli/` | `platform-admin` (add, remove, reset 2FA) and `maintenance` (retention) |
| `src/portal/` | The web pages: `PortalApp` (by host), `tenant/` (student, teach, admin, account), `platform/` (console) |
| `deploy/`, `ecosystem.config.cjs`, `.github/workflows/deploy.yml` | CI/CD, PM2, Apache, backups and rollback |

**Grades and PDFs.** A hand-in stores the student's answers and decisions, and the course details printed on the
PDF, exactly as they were at hand-in. Grades are computed once, on the server, against the course's pinned snapshot.
The PDF is rebuilt from those stored values whenever anyone downloads it, so the student's and lecturer's copies are
byte-for-byte identical, and the verification code (`GCM-XXXX-XXXX-XXXX`) matches.

**Security.**
- Sign-in codes and session tokens are stored only as keyed hashes.
- Sessions use `__Host-` cookies, bound to one subdomain.
- Every request that changes something needs the `x-gcm` header and a same-host `Origin`.
- Rate limits apply per email and per network.
- Admin actions go to the audit log.
- Emailed links are built from stored data, never from the request's Host header.

## Local development

You need PostgreSQL 16 with a non-superuser role (superusers skip row-level security):

```sql
create role gcm_dev login password 'gcm_dev';  create database gcm_dev owner gcm_dev;
create role gcm_test login password 'gcm_test'; create database gcm_test owner gcm_test;
```

```bash
cp .env.example .env    # then: NODE_ENV=development, BASE_DOMAIN=localhost, DATABASE_URL=…gcm_dev, EMAIL_MODE=log, SECURE_COOKIES=false
npm run db:migrate
npm run platform:admin -- add you@example.com "You"
BASE_PATH=/ npm run build && npm run server:dev
```

Open `http://admin.localhost:3100` (the console) or `http://<slug>.localhost:3100` (a university). Browsers resolve
`*.localhost` to your machine. With `EMAIL_MODE=log`, sign-in codes are printed in the server's output.

| Command | Checks |
| --- | --- |
| `npm run typecheck` | Web app and server |
| `npm test` | Models, course content, payloads (no database) |
| `npm run test:server` | API against PostgreSQL: provisioning, sign-in and 2FA, isolation, roles, seats, courses, hand-in, grading, identical PDFs, deadlines (`TEST_DATABASE_URL`, default the `gcm_test` role above) |
| `npm run test:portal` | The whole journey in a real browser, against the built server |
