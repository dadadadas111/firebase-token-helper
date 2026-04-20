"use strict";

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

function paint(text, ...codes) {
  return `${codes.join('')}${text}${c.reset}`;
}

const DIVIDER_WIDTH = 56;

const logger = {
  // ✓ green success line
  ok(msg) {
    console.log(paint(`  ✓  ${msg}`, c.green));
  },

  // ✗ red error line
  err(msg) {
    console.error(paint(`  ✗  ${msg}`, c.red));
  },

  // →  step in progress
  step(msg) {
    console.log(paint(`  →  ${msg}`, c.cyan));
  },

  // !  yellow warning
  warn(msg) {
    console.log(paint(`  !  ${msg}`, c.yellow));
  },

  // dim info
  dim(msg) {
    console.log(paint(`     ${msg}`, c.dim));
  },

  // plain line
  raw(msg, color = '') {
    console.log(color ? paint(msg, color) : msg);
  },

  // bold title + rule
  banner(title, version = '') {
    const label = version ? `${title}  ${paint(version, c.dim)}` : title;
    console.log('');
    console.log(paint(`  ${label}`, c.bold, c.cyan));
    console.log(paint(`  ${'─'.repeat(DIVIDER_WIDTH)}`, c.dim));
  },

  divider(label = '') {
    if (label) {
      const pad = Math.max(0, DIVIDER_WIDTH - label.length - 3);
      console.log(paint(`\n  ── ${label} ${'─'.repeat(pad)}`, c.dim));
    } else {
      console.log(paint(`  ${'─'.repeat(DIVIDER_WIDTH)}`, c.dim));
    }
  },

  // Pretty result box
  // fields: [{ label, value }]
  box(title, fields) {
    const labelWidth = Math.max(...fields.map(f => f.label.length));
    const lines = fields.map(({ label, value }) => {
      const pad = ' '.repeat(labelWidth - label.length);
      return `  ${paint(label, c.dim)}${pad}  ${value}`;
    });

    console.log('');
    logger.divider(title);
    lines.forEach(l => console.log(l));
    logger.divider();
    console.log('');
  },

  colors: c,
  paint,
};

module.exports = logger;
