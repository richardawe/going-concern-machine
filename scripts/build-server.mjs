import { build } from 'esbuild';

// Bundles the server into dist-server/: the app, the grading worker, migrations runner and the two admin tools.
// Packages stay external (installed on the server with npm ci --omit=dev); our own TypeScript, including the shared
// course code under src/, is compiled in.
await build({
  entryPoints: { main: 'server/main.ts', 'grade-worker': 'server/grade-worker.ts', migrate: 'server/migrate.ts', 'platform-admin': 'server/cli/platform-admin.ts', maintenance: 'server/cli/maintenance.ts' },
  outdir: 'dist-server', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true, logLevel: 'info',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
