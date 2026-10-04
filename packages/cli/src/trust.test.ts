import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { main } from './main.js';

it('trust exige TTY o --yes con --ci y CI=true', async () => {
  const root = await mkdtemp(join(tmpdir(), 'foker-cli-trust-'));
  const io = { stdout() {}, stderr() {}, isTTY: false, trustBaseDir: root };
  try {
    expect(await main(['trust', '--cwd', root], {}, io)).toBe(6);
    expect(await main(['trust', '--yes', '--cwd', root], {}, io)).toBe(2);
    expect(await main(['trust', '--yes', '--cwd', root], { CI: 'true' }, io)).toBe(2);
    expect(await main(['trust', '--yes', '--ci', '--cwd', root], { CI: 'true' }, io)).toBe(0);
    expect(await main(['trust', '--cwd', root], {}, { ...io, isTTY: true, confirm: async () => true })).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
