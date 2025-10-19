#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
let fetch;
// node-fetch v3 is ESM-only. Load it dynamically so this file can remain CommonJS.
async function loadFetch() {
  if (fetch) return fetch;
  const mod = await import('node-fetch');
  // node-fetch exposes default export
  fetch = mod.default || mod;
  return fetch;
}
const admin = require("firebase-admin");
const yargs = require("yargs");
require("dotenv").config();

// Small ANSI color helper (no external deps)
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function colorText(text, col) {
  return `${col}${text}${colors.reset}`;
}

const argv = yargs
  .usage("Usage: $0 --uid UID [--serviceAccount path] [--apiKey key] [--projectId id]")
  .option("uid", { type: "string", describe: "Firebase user UID to mint token for" })
  .option("serviceAccount", { type: "string", describe: "Path to service account JSON file (or set GOOGLE_APPLICATION_CREDENTIALS)" })
  .option("apiKey", { type: "string", describe: "Web API key for Firebase project (can be set in FIREBASE_API_KEY env)" })
  .option("projectId", { type: "string", describe: "Firebase project id (optional)" })
  .help()
  .alias("h", "help").argv;

// interactive prompt helper (lazy require for compatibility)
async function prompt(question) {
  try {
    const rl = require('readline/promises');
    const { stdin, stdout } = process;
    const rlInterface = rl.createInterface({ input: stdin, output: stdout });
    const answer = await rlInterface.question(colorText(question, colors.cyan));
    rlInterface.close();
    return answer.trim();
  } catch (e) {
    // fallback
    return new Promise((resolve) => {
      const rl2 = require('readline').createInterface({ input: process.stdin, output: process.stdout });
      rl2.question(colorText(question, colors.cyan), (ans) => { rl2.close(); resolve(ans.trim()); });
    });
  }
}

async function initAdmin(serviceAccountPath) {
  if (admin.apps && admin.apps.length) return;

  let options = {};
  // Priority: explicit path -> GOOGLE_APPLICATION_CREDENTIALS -> .firebase auto-detect
  if (serviceAccountPath) {
    const full = path.resolve(serviceAccountPath);
    if (!fs.existsSync(full)) throw new Error(`Service account file not found: ${full}`);
    const sa = require(full);
    options = { credential: admin.credential.cert(sa) };
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    options = { credential: admin.credential.applicationDefault() };
  } else {
    // try auto-detect in .firebase folder at CWD
    const candidateDir = path.resolve(process.cwd(), ".firebase");
    if (fs.existsSync(candidateDir) && fs.statSync(candidateDir).isDirectory()) {
      const files = fs.readdirSync(candidateDir).filter(f => f.endsWith('.json'));
      let picked = null;
      for (const f of files) {
        const full = path.join(candidateDir, f);
        try {
          const content = JSON.parse(fs.readFileSync(full, 'utf8'));
          // heuristic: service account JSON contains client_email and private_key
          if (content.client_email && content.private_key) {
            picked = full;
            break;
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      if (picked) {
        const sa = require(picked);
        options = { credential: admin.credential.cert(sa) };
      } else {
        throw new Error("No service account found. Place a service account JSON in .firebase/ or pass --serviceAccount or set GOOGLE_APPLICATION_CREDENTIALS env var.");
      }
    } else {
      throw new Error("No service account provided. Pass --serviceAccount or set GOOGLE_APPLICATION_CREDENTIALS env var, or put a service account JSON into .firebase/");
    }
  }

  if (argv.projectId || process.env.FIREBASE_PROJECT_ID) {
    options.projectId = argv.projectId || process.env.FIREBASE_PROJECT_ID;
  }

  admin.initializeApp(options);
}

async function createCustomToken(uid) {
  return admin.auth().createCustomToken(uid);
}

async function exchangeCustomTokenForIdToken(customToken, apiKey) {
  if (!apiKey) throw new Error("Need Firebase Web API key to exchange custom token for ID token (FIREBASE_API_KEY or --apiKey)");

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`;
  const body = {
    token: customToken,
    returnSecureToken: true,
  };

  const _fetch = await loadFetch();
  const res = await _fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : JSON.stringify(data);
    throw new Error(`Failed to exchange custom token: ${msg}`);
  }
  return data; // contains idToken, refreshToken, expiresIn, localId
}

async function main() {
  // gather inputs, prompting interactively if missing
  let uid = argv.uid;
  let serviceAccount = argv.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let apiKey = argv.apiKey || process.env.FIREBASE_API_KEY;

  if (!uid) {
    uid = await prompt('Enter UID to mint token for: ');
    if (!uid) {
      console.error('No UID provided, aborting.');
      process.exit(1);
    }
  }

  if (!apiKey) {
    const maybe = await prompt('Enter Firebase Web API key (or press Enter to leave empty): ');
    if (maybe) apiKey = maybe;
  }

  // If no service account env/arg, try auto-detect; if that fails, prompt for path
  if (!serviceAccount) {
    const candidateDir = path.resolve(process.cwd(), '.firebase');
    let picked = null;
    if (fs.existsSync(candidateDir) && fs.statSync(candidateDir).isDirectory()) {
      const files = fs.readdirSync(candidateDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const full = path.join(candidateDir, f);
        try {
          const content = JSON.parse(fs.readFileSync(full, 'utf8'));
          if (content.client_email && content.private_key) { picked = full; break; }
        } catch (e){}
      }
    }
    if (picked) {
      serviceAccount = picked;
      console.log(colorText('Auto-detected service account:', colors.dim), colorText(serviceAccount, colors.yellow));
    } else {
      const ans = await prompt('Service account path not found. Enter path to service account JSON (or press Enter to abort): ');
      if (ans) serviceAccount = ans;
    }
  }

  try {
    await initAdmin(serviceAccount);
  } catch (err) {
    console.error("Failed to initialize Firebase Admin:", err.message);
    process.exit(2);
  }

  try {
    const customToken = await createCustomToken(uid);
    console.log(colorText('\nCustom token created:', colors.green), colorText(customToken, colors.dim));

    const exchanged = await exchangeCustomTokenForIdToken(customToken, apiKey);
    console.log(colorText('\nExchanged token result:', colors.green));
    console.log(colorText(JSON.stringify(exchanged, null, 2), colors.yellow));
  } catch (err) {
    console.error(colorText('Error:', colors.red), colorText(err.message || err, colors.red));
    process.exit(3);
  }
}

if (require.main === module) {
  main();
}
