"use strict";

const { colors, paint } = require('./logger');

/**
 * Interactive readline prompt.
 * Returns trimmed answer string.
 */
async function prompt(question) {
  try {
    const rl = require('readline/promises');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await iface.question(paint(`  ${question}`, colors.cyan));
    iface.close();
    return answer.trim();
  } catch (_) {
    return new Promise((resolve) => {
      const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
      rl.question(paint(`  ${question}`, colors.cyan), (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }
}

module.exports = { prompt };
