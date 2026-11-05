// PM2 process file, used from <app>/current on the server (see docs/DEPLOYMENT.md).
// Two workers in cluster mode share the port, so `pm2 reload` restarts them one at a time without dropping requests.
// Settings come from <app>/shared/.env; the release id from the RELEASE file the deploy writes.
const fs = require('fs'), path = require('path');
const here = fs.realpathSync(__dirname), appDir = path.resolve(here, '..', '..');
const envFile = path.join(appDir, 'shared', '.env');
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; }));
const release = fs.existsSync(path.join(here, 'RELEASE')) ? fs.readFileSync(path.join(here, 'RELEASE'), 'utf8').trim() : 'unknown';
module.exports = {
  apps: [{
    name: `gcm-${env.ENVIRONMENT_NAME || 'production'}`,
    cwd: path.join(appDir, 'current'),
    script: 'dist-server/main.js',
    exec_mode: 'cluster', instances: Number(env.WORKERS || 2),
    env: { ...env, NODE_ENV: 'production', RELEASE: release },
    kill_timeout: 10000, listen_timeout: 15000, max_memory_restart: '700M',
    out_file: path.join(appDir, 'shared', 'logs', 'app.log'), error_file: path.join(appDir, 'shared', 'logs', 'error.log'), merge_logs: true, time: true,
  }],
};
