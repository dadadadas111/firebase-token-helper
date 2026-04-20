"use strict";

const { text, spinner, note, cancel, isCancel } = require('@clack/prompts');
const { decodeJwt }                = require('../lib/token');
const { autoDetectServiceAccount } = require('../lib/admin');
const { run }                      = require('../commands/setClaims');

/**
 * TUI flow for "Set Custom Claims".
 * Returns false if user cancelled or errored, true on success.
 */
async function setClaimsFlow() {
  const autoSa = autoDetectServiceAccount();

  // ── Token ─────────────────────────────────────────────────────────────────
  const token = await text({
    message:     'Firebase ID Token (JWT)',
    placeholder: 'eyJhbG…',
    validate: (v) => {
      if (!v?.trim())                         return 'Token is required';
      if (v.trim().split('.').length !== 3)   return 'Does not look like a valid JWT';
    },
  });
  if (isCancel(token)) { cancel('Cancelled.'); return false; }

  // Decode and preview token info before proceeding
  try {
    const payload = decodeJwt(token.trim());
    const uid     = payload.user_id || payload.sub || '—';
    const email   = payload.email ?? '—';
    const exp     = payload.exp ? new Date(payload.exp * 1000).toLocaleString() : '—';
    note(
      [`UID    : ${uid}`, `Email  : ${email}`, `Expires: ${exp}`].join('\n'),
      'Token Info'
    );
  } catch (_) { /* non-fatal — continue even if decode fails */ }

  // ── Claims ────────────────────────────────────────────────────────────────
  const claims = await text({
    message:     'Custom claims (JSON object)',
    placeholder: '{"role":"admin"}',
    validate: (v) => {
      if (!v?.trim()) return 'Claims are required';
      try {
        const parsed = JSON.parse(v.trim());
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          return 'Must be a JSON object, e.g. {"role":"admin"}';
        }
      } catch (e) {
        return `Invalid JSON: ${e.message}`;
      }
    },
  });
  if (isCancel(claims)) { cancel('Cancelled.'); return false; }

  // ── Service Account ───────────────────────────────────────────────────────
  let serviceAccount;
  if (autoSa) {
    serviceAccount = autoSa;
  } else {
    const saInput = await text({
      message:     'Path to service account JSON',
      placeholder: 'e.g. .firebase/sa.json',
      validate:    v => (v?.trim() ? undefined : 'Service account path is required'),
    });
    if (isCancel(saInput)) { cancel('Cancelled.'); return false; }
    serviceAccount = saInput.trim();
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  const s = spinner();
  s.start('Setting custom claims…');

  let result;
  try {
    result = await run({
      token:              token.trim(),
      claimsJson:         claims.trim(),
      serviceAccountPath: serviceAccount,
    });
  } catch (err) {
    s.stop('Failed');
    cancel(`Error: ${err.message}`);
    return false;
  }

  s.stop('Custom claims set');

  // ── Result ────────────────────────────────────────────────────────────────
  const claimsDisplay = Object.entries(result.customClaims)
    .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');

  note(
    [
      `UID     : ${result.uid}`,
      `Email   : ${result.email ?? '—'}`,
      `Project : ${result.projectId}`,
      '',
      'Claims set:',
      claimsDisplay,
      '',
      'Note: user must refresh their token to see updated claims.',
    ].join('\n'),
    'Success'
  );

  return true;
}

module.exports = { setClaimsFlow };
