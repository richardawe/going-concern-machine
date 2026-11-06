# Deploying Going Concern to the VPS

> **Setting up for the first time?** Follow [SETUP-GUIDE.md](SETUP-GUIDE.md), the click-by-click checklist. This page is the reference behind it.

One-time setup for the Liquid Web cPanel VPS, Cloudflare, Brevo and GitHub, then how deploys, rollbacks and backups
work day to day. The domain is **goingconcernlab.com**. There is no staging copy yet: every release goes straight to
production after your approval, behind the tests, a database backup, a health check and automatic rollback.
[Section 8](#8-when-you-add-staging) adds staging later.

```
Browser ──https──▶ Cloudflare (DNS, wildcard TLS, protection) ──https──▶ Apache (cPanel) ──▶ Node app ×2 (PM2) ──▶ PostgreSQL
                                                                                    127.0.0.1:3100
```

| Host | What it is |
| --- | --- |
| `goingconcernlab.com` | Public site: company machine, CEO mode, live company, `/universities`, `/sign-in` (find your university) |
| `admin.goingconcernlab.com` | Platform console (you): provision and manage universities |
| `<slug>.goingconcernlab.com` | A university's portal, e.g. `strathclyde.goingconcernlab.com` |

Adding a university never needs a DNS change: the wildcard record and certificate already cover every subdomain.

---

## 1. Cloudflare (about 20 minutes)

1. Add `goingconcernlab.com` to Cloudflare (free plan) and change the nameservers at your registrar to the two Cloudflare gives you.
2. **DNS**, all **Proxied** (orange cloud):
   - `A  @  <VPS IP>`
   - `A  *  <VPS IP>` (every university, and `admin`)
   - `CNAME  www  goingconcernlab.com`
3. **SSL/TLS → Overview**: set the mode to **Full (strict)**.
4. **SSL/TLS → Origin Server → Create certificate**: hostnames `goingconcernlab.com` and `*.goingconcernlab.com`, 15 years. Keep the certificate and private key for step 2.6.
5. **SSL/TLS → Edge Certificates**: turn on **Always Use HTTPS**, and set the minimum TLS version to 1.2.
6. **Speed → Optimization**: turn **Rocket Loader off**. **Scrape Shield**: turn **Email Address Obfuscation off**. Both inject scripts that the site's security policy blocks.

## 2. The server (WHM as root)

1. **Account.** WHM → Create a New Account for `goingconcernlab.com`, username `gcm`. Then WHM → Manage Shell Access → give `gcm` a **normal shell**.
2. **Wildcard subdomain.** cPanel (as `gcm`) → Domains → create `*.goingconcernlab.com`. Its document root doesn't matter: Apache sends everything to Node.
3. **Node 22.** WHM → EasyApache 4 → Customize → Additional Packages → `ea-nodejs22` → Provision. Node is then at `/opt/cpanel/ea-nodejs22/bin`.
4. **PostgreSQL.** As root, `su - postgres -c psql`, then:
   ```sql
   create role gcm login password '<strong password 1>' nosuperuser nocreatedb nocreaterole;
   create database gcm_production owner gcm;
   -- Backups only: read-only, and allowed past row-level security (the app's own roles are not).
   create role gcm_backup login password '<strong password 2>' bypassrls nosuperuser;
   grant pg_read_all_data to gcm_backup;
   ```
   The app roles must **not** be superusers: superusers skip row-level security, the database's own guarantee that one university never sees another's rows. PostgreSQL must listen on localhost only (the default).
   PostgreSQL **14 or newer** is required (`pg_read_all_data`). If the server's own PostgreSQL is older and other sites depend on it, run a separate cluster instead of upgrading it. Production does this: PostgreSQL 16 from the PGDG packages, data in `/var/lib/pgsql/16/gcm`, service `postgresql-16-gcm`, listening on `127.0.0.1:5433`, so `DATABASE_URL` and `BACKUP_DATABASE_URL` use port 5433 and the commands above run with `psql -p 5433`. The deploy scripts put `/usr/pgsql-16/bin` (and 17, 18) first on `PATH`, so `pg_dump` matches the server.
5. **Certificates.** WHM → SSL/TLS → Install an SSL Certificate on a Domain: install the Cloudflare origin certificate and key for `goingconcernlab.com` **and** for `*.goingconcernlab.com`. AutoSSL leaves a valid certificate it didn't issue alone.
6. **Proxy to Node.** Copy [`deploy/apache/proxy.conf`](../deploy/apache/proxy.conf) to both of these paths:
   ```
   /etc/apache2/conf.d/userdata/ssl/2_4/gcm/goingconcernlab.com/gcm-proxy.conf
   /etc/apache2/conf.d/userdata/ssl/2_4/gcm/wildcard_safe.goingconcernlab.com/gcm-proxy.conf
   ```
   Then `/scripts/rebuildhttpdconf && /scripts/restartsrv_httpd`.
7. **Firewall.** Only Cloudflare should reach the site. The app trusts Cloudflare's visitor-IP header for rate limits, so a direct connection could spoof it. On a server used only for this app, remove 80 and 443 from `TCP_IN` in `/etc/csf/csf.conf` and allow Cloudflare's ranges in `csf.allow`. **On a shared server (production is one), don't:** that cuts off the other sites. If cPanel's NGINX fronts Apache, restrict the `gcm` account in NGINX instead, checking `$realip_remote_addr` against Cloudflare's ranges, and turn NGINX caching off for `gcm`. SETUP-GUIDE.md Part 6 has production's exact files.
   Also: SSH by key only (`PasswordAuthentication no`), cPHulk on, and WHM's automatic updates on.
8. **PM2 at boot** (as `gcm`, then the one root command it prints):
   ```bash
   export PATH=/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:$PATH
   echo 'export PATH=/opt/cpanel/ea-nodejs22/bin:$HOME/.npm-global/bin:$PATH' >> ~/.bashrc
   npm config set prefix ~/.npm-global && npm install -g pm2@5
   pm2 startup     # prints a sudo/root command: run it as root
   pm2 install pm2-logrotate
   ```
9. **App folders and settings** (as `gcm`):
    ```bash
    mkdir -p ~/app/shared
    cp .env.example ~/app/shared/.env && chmod 600 ~/app/shared/.env   # from the repo; fill it in
    ```
    Fill in `~/app/shared/.env` (production: `PORT=3100`, `ENVIRONMENT_NAME=production`, `BASE_DOMAIN=goingconcernlab.com`, the `gcm` and `gcm_backup` database URLs, a new `SESSION_SECRET` from `openssl rand -base64 48`, `BREVO_API_KEY`, and `EMAIL_FROM` from section 3).
10. **Deploy key** (as `gcm`, so GitHub Actions can log in):
    ```bash
    ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/gcm-deploy
    mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat ~/gcm-deploy.pub >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
    cat ~/gcm-deploy                         # the private key: paste it into GitHub (section 4), then:
    ssh-keyscan -p 22 <server IP> 2>/dev/null # the host keys: paste into GitHub too
    rm ~/gcm-deploy ~/gcm-deploy.pub
    ```
    SSH must stay reachable from the internet, because GitHub's runners don't have fixed addresses. It is safe with key-only login.

## 3. Brevo (sign-in emails)

1. Brevo → Senders, Domains & Dedicated IPs → **Domains** → add `mail.goingconcernlab.com` (a subdomain keeps sending reputation separate). Brevo shows a code TXT record, a DKIM record and a DMARC record: add each in Cloudflare DNS **exactly as shown, DNS only (grey cloud)**, then press Authenticate in Brevo.
2. If Brevo asks for SPF, add `TXT mail  v=spf1 include:spf.brevo.com ~all`.
3. Senders → add `sign-in@mail.goingconcernlab.com`, named "Going Concern".
4. SMTP & API → API Keys → create a key for the server, and put it in `BREVO_API_KEY` .
5. Set `EMAIL_FROM=sign-in@mail.goingconcernlab.com`. Give each university's IT team this address to allow (the university admin's Settings page shows the note to send).

## 4. GitHub (CI/CD)

**Settings → Secrets and variables → Actions.**

| Tab | Name | Value |
| --- | --- | --- |
| Secrets | `SSH_KEY` | the private key from section 2.10, all of it, including the BEGIN and END lines |
| Secrets | `SSH_KNOWN_HOSTS` | the `ssh-keyscan` output from section 2.10 |
| Secrets | `SSH_HOST` | the server's IP address |
| Secrets | `SSH_USER` | `gcm` |
| Secrets | `SSH_PORT` | only if SSH isn't on port 22 |
| Variables | `APP_DIR` | `/home/gcm/app` |
| Variables | `SITE_URL` | `https://admin.goingconcernlab.com` |

**Settings → Environments → New environment** `production`: tick **Required reviewers** and add yourself (leave "Prevent self-review" off), then under deployment branches choose **Selected branches** and add `main`.

Until `APP_DIR` is set, deploys are skipped. They don't fail.

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) then:

1. **Every pull request:** typecheck, unit tests, server tests against a real PostgreSQL (as a non-superuser, so isolation is really tested), and a build.
2. **Every merge to `main`:** the same checks, then one release tarball, which waits for your approval in the Actions tab.
3. **Once you approve,** [`deploy/ship.sh`](../deploy/ship.sh) copies the release over SSH and runs [`deploy/remote-deploy.sh`](../deploy/remote-deploy.sh) on the server. That script unpacks the release into `releases/<id>`, installs packages, takes a `pg_dump`, migrates, switches the `current` symlink, reloads PM2 one worker at a time, and waits for `/healthz` to report the new release. **If the release isn't healthy, it switches back by itself** and the job fails.

The weekly SEC data job triggers the same pipeline, so new company data waits for your approval too.

Without staging, take two extra precautions:
- Approve deploys at quiet times, never in the hour before a deadline (the console's System page lists them).
- After a deploy that changes something students use, sign in to the university as a test student and click through it once.

**Server task** ([`.github/workflows/server-task.yml`](../.github/workflows/server-task.yml), run from the Actions tab or by Claude) does one job from a fixed menu on the server, over the same SSH key:

| Task | Does |
| --- | --- |
| `preflight` | Checks each setup step: Node, PM2, `.env`, the database roles, Brevo, the certificate, Apache proxy, Cloudflare, disk |
| `status` | Release, health, PM2 workers, disk, backups, cron |
| `add-admin`, `list-admins`, `reset-2fa` | Platform console accounts |
| `install-cron` | Installs the nightly backup and maintenance jobs (section 6) |
| `backup-now`, `maintenance-dry-run`, `recent-errors`, `rollback` | As named |

The repository is public, so Actions logs are public too. These tasks print no secrets, mask email addresses, and the server's logs leave out query strings.

Once the domain is live, disable the old GitHub Pages workflow (Actions → "Build and deploy Pages" → Disable) and point the Pages site at the new domain.

## 5. First run

1. Run **Server task → preflight** until everything passes.
2. Merge to `main`. In Actions, approve the production deploy and watch it go live.
3. Run **Server task → add-admin** with your email and name, then **install-cron**.
4. Open `https://admin.goingconcernlab.com`, sign in with the emailed code, and scan the QR code with an authenticator app.
5. **Provision a university:** type its name, check the email domains with its IT team, and enter the admin's email. The admin gets an invite, signs in and accepts the terms. They invite lecturers; students just sign in with their university email.

## 6. Scheduled jobs (Server task → install-cron sets these up)

```
15 2 * * *  /home/gcm/app/current/deploy/backup.sh /home/gcm/app >> /home/gcm/app/shared/logs/backup.log 2>&1
40 2 * * *  cd /home/gcm/app/current && /opt/cpanel/ea-nodejs22/bin/node --env-file=/home/gcm/app/shared/.env dist-server/maintenance.js >> /home/gcm/app/shared/logs/maintenance.log 2>&1
```

- **Backups:** 14 nightly dumps on the server. Set `RESTIC_REPOSITORY` and its credentials in `shared/.env` (for example a Backblaze B2 bucket in the EU) and they also go off-site, encrypted, kept 30 daily and 12 monthly. **Restore one each term** to prove it works:
  ```bash
  createdb -O gcm gcm_restore_check && pg_restore --no-owner --role=gcm -d gcm_restore_check shared/backups/<file>.dump && dropdb gcm_restore_check
  ```
- **Maintenance:** deletes sign-in codes and expired sessions after 90 days, and student work once a university's retention period has passed after each course's due date, as the privacy notice promises. Try it with `--dry-run` first.

## 7. Day to day

| Task | How |
| --- | --- |
| Is it up? | `https://goingconcernlab.com/healthz`. Point an uptime monitor (Better Stack or UptimeRobot) at it and at `admin.` |
| What's deployed, backups, deadlines | Platform console → System |
| Roll back | `~/app/current/deploy/rollback.sh ~/app` (previous release) or `… ~/app <release-id>` |
| Logs | `pm2 logs gcm-production`, or `~/app/shared/logs/` |
| Lost authenticator | `node --env-file=/home/gcm/app/shared/.env dist-server/platform-admin.js reset-2fa you@your-email` |
| Another platform admin | `platform-admin.js add …`, `list`, `remove …` |

**Migrations only ever add.** A column is removed in a later release, once no running code reads it. That way rolling back the code never needs a database rollback. Avoid deploying in the hour before a big deadline: the System page lists them.

## 8. When you add staging

Once a second university signs, add a staging copy so changes are tried before either university sees them:

1. Buy a cheap second domain, for example `goingconcernlab.co.uk`, and set it up in Cloudflare as in section 1. Use its own origin certificate.
2. In cPanel, add it as a domain of the `gcm` account with a wildcard subdomain. Install its certificate, and add the Apache proxy file for both vhosts with port **3101**.
3. Create its database: `create role gcm_staging login password '…' nosuperuser nocreatedb nocreaterole; create database gcm_staging owner gcm_staging;`
4. `mkdir -p ~/app-staging/shared` and write `~/app-staging/shared/.env`. Use `PORT=3101`, `ENVIRONMENT_NAME=staging`, the staging domain and database, and a **different** `SESSION_SECRET`.
5. In GitHub, create a **staging** environment with no required reviewers, and add the repository variables `STAGING_APP_DIR=/home/gcm/app-staging` and `STAGING_ENABLED=true`.

From then on, every merge deploys to staging by itself, and production waits for staging to succeed and for your approval. No code changes are needed.
