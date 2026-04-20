"use strict";

const { intro, outro, select, isCancel, cancel } = require('@clack/prompts');
const { getTokenFlow }    = require('./getTokenFlow');
const { setClaimsFlow }   = require('./setClaimsFlow');
const { clearCacheFlow }  = require('./clearCacheFlow');
const { version }         = require('../../package.json');

const MENU_OPTIONS = [
  { value: 'get-token',    label: 'Get ID Token',      hint: 'mint + exchange a Firebase ID token for a UID or email' },
  { value: 'set-claims',   label: 'Set Custom Claims', hint: 'write custom claims to a Firebase user' },
  { value: 'clear-cache',  label: 'Clear Cache',       hint: 'view and remove saved setup values' },
  { value: 'exit',         label: 'Exit' },
];

async function runTui() {
  intro(`Firebase Token Kit  v${version}`);

  while (true) {
    const choice = await select({
      message: 'What do you want to do?',
      options: MENU_OPTIONS,
    });

    if (isCancel(choice) || choice === 'exit') {
      outro('Bye!');
      process.exit(0);
    }

    try {
      if      (choice === 'get-token')   await getTokenFlow();
      else if (choice === 'set-claims')  await setClaimsFlow();
      else if (choice === 'clear-cache') await clearCacheFlow();
    } catch (err) {
      cancel(`Error: ${err.message}`);
    }

    console.log('');
  }
}

module.exports = { runTui };
