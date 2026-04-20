"use strict";

const admin              = require('firebase-admin');
const { initAdmin }      = require('../lib/admin');
const { decodeJwt }      = require('../lib/token');

/**
 * Core set-claims logic. No I/O — callers handle all output.
 *
 * @param {{ token: string, claimsJson: string, serviceAccountPath?: string, projectId?: string }} opts
 * @returns {{ uid, email, customClaims, projectId }}
 */
async function run({ token, claimsJson, serviceAccountPath, projectId }) {
  if (!token)      throw new Error('token is required');
  if (!claimsJson) throw new Error('claims JSON is required');

  // Decode token to extract UID
  const payload = decodeJwt(token);
  const uid     = payload.user_id || payload.sub;
  if (!uid) throw new Error('Could not extract uid from token (missing user_id / sub claim)');

  const email = payload.email || payload.firebase?.identities?.email?.[0] || null;

  // Parse claims
  let customClaims;
  try {
    customClaims = JSON.parse(claimsJson);
  } catch (e) {
    throw new Error(`Invalid claims JSON: ${e.message}`);
  }

  if (typeof customClaims !== 'object' || Array.isArray(customClaims)) {
    throw new Error('Claims must be a JSON object, e.g. {"role":"admin"}');
  }

  const { app } = await initAdmin(serviceAccountPath, projectId);

  const resolvedProjectId =
    projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    app.options.projectId;

  if (!resolvedProjectId) {
    throw new Error('Project ID not found. Pass --projectId or set FIREBASE_PROJECT_ID');
  }

  await admin.auth(app).setCustomUserClaims(uid, customClaims);

  return { uid, email, customClaims, projectId: resolvedProjectId };
}

module.exports = { run };
