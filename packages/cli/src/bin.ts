#!/usr/bin/env node
import { createInterface, type Interface } from 'node:readline/promises';
import { FokerError } from '@foker/core';
import { main } from './main.js';

// Una sola interfaz para toda la sesión: con varias, las líneas ya leídas de stdin se perderían.
let rl: Interface | undefined;
let cancelled = false;
const reader = () => {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stderr });
    // Ctrl+C o EOF durante una pregunta: se cancela la entrevista; nadie ha escrito todavía.
    rl.on('SIGINT', () => {
      cancelled = true;
      rl?.close();
    });
    rl.on('close', () => {
      cancelled = true;
    });
  }
  return rl;
};
const ask = async (message: string) => {
  if (cancelled) throw new FokerError('FKR-INP-001', 'Entrevista cancelada; no se escribió ningún archivo.');
  const controller = new AbortController();
  const input = reader();
  const onClose = () => controller.abort();
  input.once('close', onClose);
  try {
    return await input.question(message, { signal: controller.signal });
  } catch {
    process.stderr.write('\n');
    throw new FokerError('FKR-INP-001', 'Entrevista cancelada; no se escribió ningún archivo.');
  } finally {
    input.off('close', onClose);
  }
};

try {
  process.exitCode = await main(process.argv.slice(2), process.env, {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    confirm: async (message) => /^(s|si|sí|y|yes)$/i.test((await ask(message)).trim()),
    prompt: ask,
    stdin: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    },
    isTTY: Boolean(process.stdin.isTTY),
  });
  if (cancelled && process.exitCode === 2) process.exitCode = 130;
} finally {
  rl?.close();
}
