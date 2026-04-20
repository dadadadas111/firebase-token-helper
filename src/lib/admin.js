"use strict";

const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

/**
 * Find a service account JSON in ./.firebase/ by checking for client_email + private_key.
 * Returns absolute path or null.
 */
function autoDetectServiceAccount() {
  const dir = path.resolve(process.cwd(), '.firebase');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const content = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (content.client_email && content.private_key) return full;
    } catch (_) { /* skip unparseable files */ }
  }
  return null;
}

/**
 * Initialize Firebase Admin SDK (idempotent).
 * Priority: explicit serviceAccountPath → GOOGLE_APPLICATION_CREDENTIALS → .firebase/ auto-detect
 *
 * @param {string|null} serviceAccountPath
 * @param {string|null} projectId
 * @returns {{ app: admin.app.App, resolvedPath: string|null, method: string }}
 */
async function initAdmin(serviceAccountPath, projectId) {
  if (admin.apps.length > 0) {
    return { app: admin.app(), resolvedPath: null, method: 'reused' };
  }

  let resolvedPath = null;
  let method;
  let options = {};

  if (serviceAccountPath) {
    resolvedPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Service account file not found: ${resolvedPath}`);
    }
    const sa = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    options = { credential: admin.credential.cert(sa) };
    method  = 'explicit';

  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    resolvedPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    options = { credential: admin.credential.applicationDefault() };
    method  = 'env';

  } else {
    resolvedPath = autoDetectServiceAccount();
    if (!resolvedPath) {
      throw new Error(
        'No service account found. Pass --serviceAccount, set GOOGLE_APPLICATION_CREDENTIALS, ' +
        'or place a service account JSON in .firebase/'
      );
    }
    const sa = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    options = { credential: admin.credential.cert(sa) };
    method  = 'auto-detect';
  }

  if (projectId || process.env.FIREBASE_PROJECT_ID) {
    options.projectId = projectId || process.env.FIREBASE_PROJECT_ID;
  }

  const app = admin.initializeApp(options);
  return { app, resolvedPath, method };
}

module.exports = { initAdmin, autoDetectServiceAccount };
