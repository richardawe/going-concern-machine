import { buildApp } from './app';
import { loadConfig } from './config';
import { Db } from './db';
import { createMailer } from './email';
import { createGrader } from './grader';

// Starts one server process. PM2 runs two of these (see ecosystem.config.cjs); they share nothing but the database.

const config = loadConfig();
const db = new Db(config.DATABASE_URL);
const grader = createGrader(db, config.GRADER, (msg, err) => console.error(msg, err));
const app = await buildApp(config, db, createMailer(config), grader.kick);

grader.start();
await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(`Going Concern ${config.RELEASE} (${config.ENVIRONMENT_NAME}) on ${config.HOST}:${config.PORT} for ${config.BASE_DOMAIN}`);

// Finish requests in flight before exiting, so a PM2 reload drops nothing.
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
  if (stopping) return; stopping = true;
  app.log.info(`${signal}: shutting down`);
  await app.close().catch(() => {});
  await grader.stop();
  await db.close().catch(() => {});
  process.exit(0);
});
