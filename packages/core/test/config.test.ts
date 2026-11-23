import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openEngine } from '../src/index.js';

describe('openEngine: maxFileBytes', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'foker-core-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rechaza decimales en lugar de truncarlos', async () => {
    await expect(openEngine(root, { maxFileBytes: 1.5 })).rejects.toMatchObject({ code: 'FKR-INP-001' });
  });

  it('acepta enteros', async () => {
    await expect(openEngine(root, { maxFileBytes: 4096, readOnly: true })).resolves.toBeDefined();
  });
});
