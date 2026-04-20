"use strict";

const { multiselect, note, confirm, cancel, isCancel } = require('@clack/prompts');
const { readCache, clearCacheFields, clearAllCache, describeCacheField } = require('../lib/cache');

const CLEARABLE_FIELDS = ['uid', 'apiKey', 'serviceAccount', 'projectId'];

/**
 * TUI flow for "Clear Cache".
 * Shows what is currently cached and lets the user pick which fields to remove.
 */
async function clearCacheFlow() {
  const cache = readCache();

  if (!cache) {
    note('Cache is empty — nothing to clear.', 'Clear Cache');
    return true;
  }

  // Build options only for fields that are actually present
  const present = CLEARABLE_FIELDS.filter(f => cache[f] != null);

  if (present.length === 0) {
    note('Cache is empty — nothing to clear.', 'Clear Cache');
    return true;
  }

  const savedOn = cache.timestamp
    ? `Saved on ${new Date(cache.timestamp).toLocaleString()}`
    : null;

  const options = present.map(f => ({
    value: f,
    ...describeCacheField(f, cache[f]),
  }));

  const selected = await multiselect({
    message: savedOn
      ? `Select fields to remove  (${savedOn})`
      : 'Select fields to remove',
    options,
    required: false, // allow submitting with nothing selected
  });

  if (isCancel(selected)) { cancel('Cancelled.'); return false; }

  if (!selected.length) {
    note('Nothing selected — cache unchanged.', 'Clear Cache');
    return true;
  }

  const removingAll = selected.length === present.length;

  const confirmed = await confirm({
    message: removingAll
      ? 'Clear entire cache?'
      : `Remove ${selected.join(', ')} from cache?`,
    initialValue: false,
  });

  if (isCancel(confirmed) || !confirmed) {
    cancel('Cancelled.');
    return false;
  }

  if (removingAll) {
    clearAllCache();
    note('Cache cleared.', 'Done');
  } else {
    clearCacheFields(selected);
    note(`Removed: ${selected.join(', ')}`, 'Done');
  }

  return true;
}

module.exports = { clearCacheFlow };
