"use strict";

const { text, password, select, spinner, note, cancel, isCancel } = require('@clack/prompts');
const { readCache }                = require('../lib/cache');
const { autoDetectServiceAccount } = require('../lib/admin');
const { run }                      = require('../commands/getToken');

/**
 * TUI flow for "Get ID Token".
 * Returns false if user cancelled or errored, true on success.
 */
async function getTokenFlow() {
  const cache  = readCache();
  const autoSa = autoDetectServiceAccount();

  // ── Lookup mode ───────────────────────────────────────────────────────────
  const lookupBy = await select({
    message: 'Find user by',
    options: [
      { value: 'uid',   label: 'UID',   hint: 'Firebase user ID' },
      { value: 'email', label: 'Email', hint: 'looks up UID via Admin SDK' },
    ],
  });
  if (isCancel(lookupBy)) { cancel('Cancelled.'); return false; }

  // ── UID or Email ──────────────────────────────────────────────────────────
  let uid   = null;
  let email = null;

  if (lookupBy === 'uid') {
    const input = await text({
      message:      'UID to mint token for',
      placeholder:  'e.g. abc123',
      initialValue: cache?.uid ?? '',
      validate:     v => (v?.trim() ? undefined : 'UID is required'),
    });
    if (isCancel(input)) { cancel('Cancelled.'); return false; }
    uid = input.trim();
  } else {
    const input = await text({
      message:     'Email address',
      placeholder: 'e.g. user@example.com',
      validate: (v) => {
        if (!v?.trim())          return 'Email is required';
        if (!v.includes('@'))    return 'Does not look like a valid email';
      },
    });
    if (isCancel(input)) { cancel('Cancelled.'); return false; }
    email = input.trim();
  }

  // ── API Key ───────────────────────────────────────────────────────────────
  let apiKey = process.env.FIREBASE_API_KEY || cache?.apiKey || '';
  if (!apiKey) {
    const apiKeyInput = await password({
      message:  'Firebase Web API Key  (not a secret — save it in .env as FIREBASE_API_KEY)',
      validate: v => (v?.trim() ? undefined : 'API Key is required — find it at Firebase Console → Project Settings → General'),
    });
    if (isCancel(apiKeyInput)) { cancel('Cancelled.'); return false; }
    apiKey = apiKeyInput.trim();
  }

  // ── Service Account ───────────────────────────────────────────────────────
  let serviceAccount;
  if (autoSa) {
    serviceAccount = autoSa;
  } else {
    const saInput = await text({
      message:      'Path to service account JSON',
      placeholder:  'e.g. .firebase/sa.json',
      initialValue: cache?.serviceAccount ?? '',
      validate:     v => (v?.trim() ? undefined : 'Service account path is required'),
    });
    if (isCancel(saInput)) { cancel('Cancelled.'); return false; }
    serviceAccount = saInput.trim();
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  const s = spinner();
  s.start(email ? `Looking up user by email and getting token…` : 'Getting Firebase ID token…');

  let result;
  try {
    result = await run({ uid, email, apiKey, serviceAccountPath: serviceAccount });
  } catch (err) {
    s.stop('Failed');
    cancel(`Error: ${err.message}`);
    return false;
  }

  s.stop('ID token ready');

  // ── Result ────────────────────────────────────────────────────────────────
  const saShort = serviceAccount.replace(/\\/g, '/').split('/').slice(-2).join('/');

  note(
    [
      `UID      : ${result.resolvedUid}`,
      `Email    : ${result.resolvedEmail ?? '—'}`,
      `Expires  : ${result.expiry?.label ?? `${result.expiresIn}s`}`,
      `SA       : ${autoSa ? `${saShort}  (auto-detected)` : saShort}`,
      '',
      'ID Token :',
      result.idToken,
    ].join('\n'),
    'Result'
  );

  return true;
}

module.exports = { getTokenFlow };
