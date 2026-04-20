"use strict";

const admin                  = require('firebase-admin');
const { initAdmin }          = require('../lib/admin');
const { createCustomToken, exchangeForIdToken, tokenExpiry, decodeJwt } = require('../lib/token');
const { writeCache }         = require('../lib/cache');

/**
 * Core get-token logic. No I/O — callers handle all output.
 * Accepts either uid or email; email is resolved to uid via Admin SDK.
 *
 * @param {{ uid?: string, email?: string, apiKey: string, serviceAccountPath?: string, projectId?: string }} opts
 * @returns {{ customToken, idToken, refreshToken, expiresIn, localId, expiry, decoded, resolvedUid, resolvedEmail }}
 */
async function run({ uid, email, apiKey, serviceAccountPath, projectId }) {
  if (!uid && !email) throw new Error('either --uid or --email is required');
  if (!apiKey)        throw new Error('apiKey is required');

  const { app, resolvedPath, method } = await initAdmin(serviceAccountPath, projectId);
  const saPath = resolvedPath || serviceAccountPath || null;

  // Resolve email → uid if needed
  let resolvedUid   = uid;
  let resolvedEmail = email ?? null;

  if (!resolvedUid && email) {
    let userRecord;
    try {
      userRecord = await admin.auth(app).getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        throw new Error(`No Firebase user found with email: ${email}`);
      }
      throw new Error(`Failed to look up user by email: ${err.message}`);
    }
    resolvedUid   = userRecord.uid;
    resolvedEmail = userRecord.email ?? email;
  }

  const customToken = await createCustomToken(resolvedUid);
  const result      = await exchangeForIdToken(customToken, apiKey);

  const expiry = tokenExpiry(result.idToken);
  let decoded  = null;
  try { decoded = decodeJwt(result.idToken); } catch (_) {}

  resolvedEmail = resolvedEmail ?? decoded?.email ?? null;

  writeCache({
    uid:            resolvedUid,
    apiKey,
    serviceAccount: saPath,
    projectId:      projectId || process.env.FIREBASE_PROJECT_ID || app.options.projectId,
  });

  return {
    customToken,
    idToken:      result.idToken,
    refreshToken: result.refreshToken,
    expiresIn:    result.expiresIn,
    localId:      result.localId,
    expiry,
    decoded,
    resolvedUid,
    resolvedEmail,
    serviceAccountMethod: method,
    resolvedServiceAccountPath: saPath,
  };
}

module.exports = { run };
