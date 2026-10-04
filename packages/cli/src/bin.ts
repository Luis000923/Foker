#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { main } from './main.js';

process.exitCode = await main(process.argv.slice(2), process.env, {
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
  confirm: async (message) => {
    const input = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return /^(s|si|sí|y|yes)$/i.test((await input.question(message)).trim());
    } finally {
      input.close();
    }
  },
  isTTY: Boolean(process.stdin.isTTY),
});
