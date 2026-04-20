"use strict";

const admin = require('firebase-admin');

/**
 * Decode a JWT payload without verification (inspection only).
 * Handles base64url encoding correctly.
 */
function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT: expected 3 parts');
  // base64url → base64: replace chars + add padding
  let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch (e) {
    throw new Error(`Failed to decode JWT payload: ${e.message}`);
  }
}

/**
 * Mint a Firebase custom token for the given UID.
 */
async function createCustomToken(uid) {
  return admin.auth().createCustomToken(uid);
}

/**
 * Exchange a Firebase custom token for an ID token via REST.
 * Uses native fetch (Node 18+).
 */
async function exchangeForIdToken(customToken, apiKey) {
  if (!apiKey) {
    throw new Error('Firebase Web API key required (--apiKey or FIREBASE_API_KEY)');
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token: customToken, returnSecureToken: true }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? JSON.stringify(data);
    throw new Error(`Token exchange failed: ${msg}`);
  }
  return data; // { idToken, refreshToken, expiresIn, localId }
}

/**
 * Format expiry info from an ID token.
 * Returns { expiresAt: Date, label: string }
 */
function tokenExpiry(idToken) {
  try {
    const payload = decodeJwt(idToken);
    if (!payload.exp) return null;
    const expiresAt = new Date(payload.exp * 1000);
    const diffMs    = expiresAt - Date.now();
    const diffMin   = Math.round(diffMs / 60000);
    const label     = diffMin > 0
      ? `in ${diffMin} min  (${expiresAt.toLocaleTimeString()})`
      : 'expired';
    return { expiresAt, label };
  } catch (_) {
    return null;
  }
}

module.exports = { decodeJwt, createCustomToken, exchangeForIdToken, tokenExpiry };
