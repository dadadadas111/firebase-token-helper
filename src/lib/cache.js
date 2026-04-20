"use strict";

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CACHE_DIR  = path.join(os.homedir(), '.firebase-token-helper');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Writes setup fields to cache. Sensitive token values are never stored.
 * @param {{ uid?, serviceAccount?, apiKey?, projectId? }} obj
 */
function writeCache(obj) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    }
    const safe = {
      uid:            obj.uid            || undefined,
      serviceAccount: obj.serviceAccount || undefined,
      apiKey:         obj.apiKey         || undefined,
      projectId:      obj.projectId      || undefined,
      timestamp:      Date.now(),
    };
    // strip undefined keys
    Object.keys(safe).forEach(k => safe[k] === undefined && delete safe[k]);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(safe, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (_) {
    // cache write failure is non-fatal
  }
}

/**
 * Remove specific fields from the cache.
 * If no meaningful fields remain afterwards the cache file is deleted entirely.
 * @param {string[]} fields  e.g. ['uid', 'apiKey']
 */
function clearCacheFields(fields) {
  const cache = readCache();
  if (!cache) return;

  fields.forEach(f => delete cache[f]);

  const meaningful = ['uid', 'apiKey', 'serviceAccount', 'projectId'];
  const anyLeft    = meaningful.some(f => cache[f]);

  if (anyLeft) {
    // Rewrite without the removed fields
    writeCache(cache);
  } else {
    clearAllCache();
  }
}

/** Delete the cache file entirely. */
function clearAllCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  } catch (_) {}
}

/** Human-readable label + masked value for display. */
function describeCacheField(key, value) {
  if (key === 'apiKey') {
    const visible = String(value).slice(0, 8);
    return { label: 'apiKey', hint: `${visible}…  (Web API Key)` };
  }
  if (key === 'serviceAccount') {
    const short = String(value).replace(/\\/g, '/').split('/').slice(-2).join('/');
    return { label: 'serviceAccount', hint: short };
  }
  if (key === 'projectId') return { label: 'projectId', hint: String(value) };
  if (key === 'uid')       return { label: 'uid',       hint: String(value) };
  return { label: key, hint: String(value) };
}

module.exports = { readCache, writeCache, clearCacheFields, clearAllCache, describeCacheField, CACHE_FILE };
