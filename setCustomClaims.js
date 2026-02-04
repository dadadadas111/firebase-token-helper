#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const yargs = require("yargs");
require("dotenv").config();

// Small ANSI color helper
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function colorText(text, col) {
  return `${col}${text}${colors.reset}`;
}

function log(msg, col = colors.reset) {
  console.log(colorText(msg, col));
}

// Parse JWT without verification (for inspection)
function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');
    
    const payload = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (e) {
    throw new Error(`Failed to parse JWT: ${e.message}`);
  }
}

// Base64 encode for custom claims
function encodeSafe(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

async function initAdmin(serviceAccountPath) {
  if (admin.apps.length > 0) return admin.app();

  let saPath = serviceAccountPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!saPath) {
    // auto-detect in ./.firebase
    const firebaseDir = path.resolve(process.cwd(), '.firebase');
    if (fs.existsSync(firebaseDir)) {
      const files = fs.readdirSync(firebaseDir).filter(f => f.endsWith('.json'));
      if (files.length > 0) {
        saPath = path.join(firebaseDir, files[0]);
        log(`Auto-detected service account: ${saPath}`, colors.yellow);
      }
    }
  }

  if (!saPath || !fs.existsSync(saPath)) {
    throw new Error('Service account file not found. Set GOOGLE_APPLICATION_CREDENTIALS env or pass --serviceAccount');
  }

  const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function setCustomClaims(token, claimsJson, serviceAccountPath, projectId) {
  try {
    // Parse the access token to extract user info
    log(`\nParsing access token...`, colors.cyan);
    const payload = parseJWT(token);
    
    const uid = payload.user_id || payload.sub;
    if (!uid) {
      throw new Error('Could not extract user_id or sub from token');
    }

    log(`✓ Extracted UID: ${uid}`, colors.green);
    log(`✓ Token claims:`, colors.green);
    Object.entries(payload).forEach(([key, value]) => {
      if (key !== 'firebase') {
        console.log(`    ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
      }
    });

    // Initialize Firebase Admin
    log(`\nInitializing Firebase Admin SDK...`, colors.cyan);
    const app = await initAdmin(serviceAccountPath);
    
    // Determine project ID
    const projectIdToUse = projectId || app.options.projectId || process.env.FIREBASE_PROJECT_ID;
    if (!projectIdToUse) {
      throw new Error('Project ID not found. Pass --projectId or set FIREBASE_PROJECT_ID');
    }

    log(`✓ Using project: ${projectIdToUse}`, colors.green);

    // Parse custom claims
    log(`\nSetting custom claims...`, colors.cyan);
    let customClaims;
    try {
      customClaims = JSON.parse(claimsJson);
    } catch (e) {
      throw new Error(`Invalid JSON for custom claims: ${e.message}`);
    }

    log(`Custom claims to set:`, colors.reset);
    console.log(JSON.stringify(customClaims, null, 2));

    // Set custom claims
    await admin.auth(app).setCustomUserClaims(uid, customClaims);
    
    log(`\n✓ Successfully set custom claims for user: ${uid}`, colors.green);
    log(`✓ Claims:`, colors.green);
    Object.entries(customClaims).forEach(([key, value]) => {
      console.log(`    ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    });

    log(`\nNote: User will need to refresh their token to get updated claims.`, colors.yellow);

  } catch (error) {
    log(`\n✗ Error: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// CLI argument parsing
const argv = yargs
  .usage("Usage: $0 --token TOKEN --claims CLAIMS_JSON [options]")
  .option("token", { 
    type: "string", 
    describe: "Firebase access/ID token (JWT string)" 
  })
  .option("claims", { 
    type: "string", 
    describe: "Custom claims as JSON string (e.g., '{\"abac\":\"encoded-value\"}')" 
  })
  .option("serviceAccount", { 
    type: "string", 
    describe: "Path to service account JSON file (or set GOOGLE_APPLICATION_CREDENTIALS)" 
  })
  .option("projectId", { 
    type: "string", 
    describe: "Firebase project ID (optional, auto-detected from service account)" 
  })
  .help()
  .alias("h", "help")
  .argv;

// Interactive prompt helper
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

// Main execution
(async () => {
  try {
    log('\n' + colorText('Firebase Custom Claims Setter', colors.bold), colors.green);
    log('================================\n');

    let token = argv.token;
    let claims = argv.claims;

    // Prompt for token if not provided
    if (!token) {
      token = await prompt('Enter access token (JWT): ');
    }

    if (!token) {
      throw new Error('Token is required');
    }

    // Prompt for claims if not provided
    if (!claims) {
      log('\nExample claims JSON: {"abac":"encoded-value"}', colors.yellow);
      claims = await prompt('Enter custom claims as JSON: ');
    }

    if (!claims) {
      throw new Error('Custom claims are required');
    }

    await setCustomClaims(token, claims, argv.serviceAccount, argv.projectId);

  } catch (error) {
    log(`\n✗ Fatal error: ${error.message}`, colors.red);
    process.exit(1);
  }
})();
