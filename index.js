#!/usr/bin/env node
"use strict";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('firebase-token-kit requires Node.js 18 or later.');
  process.exit(1);
}

require('dotenv').config();

const yargs  = require('yargs');
const logger = require('./src/lib/logger');

// ─── Global safety net ────────────────────────────────────────────────────────
// Catches anything that slips past local try/catch blocks.

process.on('uncaughtException', (err) => {
  logger.err(`Unexpected error: ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.err(`Unexpected async error: ${msg}`);
  if (process.env.DEBUG) console.error(reason);
  process.exit(1);
});

// ─── Arg parsing (no async handlers — dispatched manually below) ──────────────

const cli = yargs
  .scriptName('ftk')
  .usage('$0 [command] [options]\n\nRun without arguments to launch the interactive TUI.')
  .command('get-token', 'Mint a Firebase ID token for a given UID or email', (y) => y
    .option('uid',            { type: 'string',  describe: 'Firebase user UID (mutually exclusive with --email)' })
    .option('email',          { type: 'string',  describe: 'User email — UID is looked up via Admin SDK (mutually exclusive with --uid)' })
    .option('apiKey',         { type: 'string',  describe: 'Firebase Web API Key (or FIREBASE_API_KEY env)' })
    .option('serviceAccount', { type: 'string',  describe: 'Path to service account JSON (or GOOGLE_APPLICATION_CREDENTIALS env)' })
    .option('projectId',      { type: 'string',  describe: 'Firebase project ID (optional)' })
    .option('json',           { type: 'boolean', describe: 'Output raw JSON only (for piping)', default: false })
    .conflicts('uid', 'email')
  )
  .command('clear-cache', 'View and remove saved setup values', (y) => y
    .option('all', { type: 'boolean', describe: 'Clear the entire cache without prompting', default: false })
  )
  .command('set-claims', 'Set custom claims on a Firebase user via their ID token', (y) => y
    .option('token',          { type: 'string',  describe: 'Firebase ID Token (JWT)' })
    .option('claims',         { type: 'string',  describe: "Custom claims as JSON string, e.g. '{\"role\":\"admin\"}'" })
    .option('serviceAccount', { type: 'string',  describe: 'Path to service account JSON' })
    .option('projectId',      { type: 'string',  describe: 'Firebase project ID (optional)' })
    .option('json',           { type: 'boolean', describe: 'Output raw JSON only', default: false })
  )
  .demandCommand(0)
  .help()
  .alias('h', 'help')
  .alias('v', 'version')
  .strict(false); // allow unknown options without throwing before we can handle them

// parseSync is safe here because NO async handlers are registered above.
let argv;
try {
  argv = cli.parseSync();
} catch (err) {
  logger.err(`Argument error: ${err.message}`);
  process.exit(1);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const [cmd] = argv._ ?? [];

(async () => {
  if      (cmd === 'get-token')    await cliGetToken(argv);
  else if (cmd === 'set-claims')   await cliSetClaims(argv);
  else if (cmd === 'clear-cache')  await cliClearCache(argv);
  else                             await runTui();
})().catch((err) => {
  // Final fallback — should rarely fire since each handler catches its own errors.
  logger.err(`Fatal: ${err.message || err}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});

// ─── CLI: get-token ───────────────────────────────────────────────────────────

async function cliGetToken(argv) {
  const { prompt }   = require('./src/lib/prompt');
  const { readCache } = require('./src/lib/cache');
  const { autoDetectServiceAccount } = require('./src/lib/admin');
  const { run }      = require('./src/commands/getToken');

  logger.banner('Firebase Token Kit', `v${require('./package.json').version}`);

  const cache = readCache();
  let { uid, email, apiKey, serviceAccount, projectId } = argv;

  // Resolve: flag → env/cache → auto-detect → interactive prompt
  if (!uid && !email)  uid            = cache?.uid;
  if (!apiKey)         apiKey         = process.env.FIREBASE_API_KEY  || cache?.apiKey;
  if (!serviceAccount) serviceAccount = cache?.serviceAccount;
  if (!projectId)      projectId      = process.env.FIREBASE_PROJECT_ID;

  const autoSa = autoDetectServiceAccount();
  if (!serviceAccount && autoSa) {
    serviceAccount = autoSa;
    logger.dim(`Auto-detected service account: ${autoSa}`);
  }

  if (!uid && !email) {
    const input = await prompt('UID or Email: ');
    if (!input) { logger.err('UID or email is required'); process.exit(1); }
    if (input.includes('@')) email = input;
    else                     uid   = input;
  }

  if (!apiKey) {
    logger.dim('Tip: add FIREBASE_API_KEY to .env to skip this prompt (it is not a secret).');
    logger.dim('Find it at: Firebase Console → Project Settings → General → Web API Key');
    apiKey = await prompt('Firebase Web API Key: ');
    if (!apiKey) { logger.err('API Key is required'); process.exit(1); }
  }

  if (!serviceAccount) {
    serviceAccount = await prompt('Path to service account JSON: ');
    if (!serviceAccount) { logger.err('Service account path is required'); process.exit(1); }
  }

  logger.step(email ? `Looking up user by email and minting token…` : 'Creating custom token…');
  let result;
  try {
    result = await run({ uid, email, apiKey, serviceAccountPath: serviceAccount, projectId });
  } catch (err) {
    logger.err(err.message);
    process.exit(2);
  }
  logger.ok('Custom token created');
  logger.ok('ID token ready');

  if (argv.json) {
    process.stdout.write(JSON.stringify({
      idToken:      result.idToken,
      refreshToken: result.refreshToken,
      expiresIn:    result.expiresIn,
      localId:      result.localId,
    }, null, 2) + '\n');
    return;
  }

  logger.box('Result', [
    { label: 'UID',      value: result.resolvedUid ?? result.localId },
    { label: 'Email',    value: result.resolvedEmail ?? '—' },
    { label: 'Expires',  value: result.expiry?.label ?? `${result.expiresIn}s` },
    { label: 'ID Token', value: result.idToken },
  ]);
}

// ─── CLI: set-claims ──────────────────────────────────────────────────────────

async function cliSetClaims(argv) {
  const { prompt } = require('./src/lib/prompt');
  const { autoDetectServiceAccount } = require('./src/lib/admin');
  const { run }    = require('./src/commands/setClaims');

  logger.banner('Firebase Token Kit', `v${require('./package.json').version}`);

  let { token, claims, serviceAccount, projectId } = argv;

  if (!projectId) projectId = process.env.FIREBASE_PROJECT_ID;

  const autoSa = autoDetectServiceAccount();
  if (!serviceAccount && autoSa) {
    serviceAccount = autoSa;
    logger.dim(`Auto-detected service account: ${autoSa}`);
  }

  if (!token) {
    token = await prompt('Firebase ID Token (JWT): ');
    if (!token) { logger.err('Token is required'); process.exit(1); }
  }

  if (!claims) {
    logger.dim('Example: {"role":"admin"}');
    claims = await prompt('Custom claims (JSON): ');
    if (!claims) { logger.err('Claims JSON is required'); process.exit(1); }
  }

  // Validate JSON before sending to Firebase
  try {
    const parsed = JSON.parse(claims);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be a JSON object');
  } catch (err) {
    logger.err(`Invalid claims JSON: ${err.message}`);
    process.exit(1);
  }

  if (!serviceAccount) {
    serviceAccount = await prompt('Path to service account JSON: ');
    if (!serviceAccount) { logger.err('Service account path is required'); process.exit(1); }
  }

  logger.step('Setting custom claims…');
  let result;
  try {
    result = await run({ token, claimsJson: claims, serviceAccountPath: serviceAccount, projectId });
  } catch (err) {
    logger.err(err.message);
    process.exit(2);
  }
  logger.ok(`Claims set for UID: ${result.uid}`);

  if (argv.json) {
    process.stdout.write(JSON.stringify(result.customClaims, null, 2) + '\n');
    return;
  }

  logger.box('Claims Set', [
    { label: 'UID',     value: result.uid },
    { label: 'Email',   value: result.email ?? '—' },
    { label: 'Project', value: result.projectId },
    { label: 'Claims',  value: JSON.stringify(result.customClaims) },
  ]);
  logger.warn('User must refresh their token to see updated claims.');
}

// ─── CLI: clear-cache ─────────────────────────────────────────────────────────

async function cliClearCache(argv) {
  const { readCache, clearCacheFields, clearAllCache, describeCacheField, CACHE_FILE } = require('./src/lib/cache');
  const { prompt } = require('./src/lib/prompt');

  const cache = readCache();

  if (!cache) {
    logger.ok('Cache is empty — nothing to clear.');
    logger.dim(`Cache file: ${CACHE_FILE}`);
    return;
  }

  const CLEARABLE = ['uid', 'apiKey', 'serviceAccount', 'projectId'];
  const present   = CLEARABLE.filter(f => cache[f] != null);
  const savedOn   = cache.timestamp ? new Date(cache.timestamp).toLocaleString() : '—';

  logger.banner('Cache', `saved ${savedOn}`);
  present.forEach(f => {
    const { label, hint } = describeCacheField(f, cache[f]);
    logger.raw(`  ${logger.paint(label.padEnd(16), logger.colors.dim)}  ${hint}`);
  });
  logger.divider();

  if (argv.all) {
    clearAllCache();
    logger.ok('Cache cleared.');
    return;
  }

  // Interactive field selection
  logger.raw('\n  Which fields do you want to remove?');
  logger.dim(`  Enter numbers separated by commas, "all" to clear everything, or Enter to cancel.`);
  present.forEach((f, i) => {
    const { label, hint } = describeCacheField(f, cache[f]);
    logger.raw(`  ${logger.paint(`[${i + 1}]`, logger.colors.cyan)} ${label.padEnd(16)} ${logger.paint(hint, logger.colors.dim)}`);
  });

  const answer = await prompt('\n  Selection: ');
  if (!answer) { logger.dim('Cancelled.'); return; }

  if (answer.trim().toLowerCase() === 'all') {
    clearAllCache();
    logger.ok('Cache cleared.');
    return;
  }

  const indices = answer.split(',')
    .map(s => parseInt(s.trim(), 10) - 1)
    .filter(i => i >= 0 && i < present.length);

  if (!indices.length) { logger.dim('No valid selection — cache unchanged.'); return; }

  const toRemove = indices.map(i => present[i]);
  clearCacheFields(toRemove);
  logger.ok(`Removed: ${toRemove.join(', ')}`);
}

// ─── TUI ──────────────────────────────────────────────────────────────────────

async function runTui() {
  const { runTui: startTui } = require('./src/tui/index');
  await startTui();
}
