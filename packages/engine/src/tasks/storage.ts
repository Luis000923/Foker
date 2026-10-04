import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { FokerError } from '@foker/core';
export async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function withLock<T>(path: string, body: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  for (let i = 0; i < 100; i++) {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(path, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await setTimeout(10);
      continue;
    }
    try {
      return await body();
    } finally {
      await handle.close();
      await unlink(path);
    }
  }
  throw new FokerError('FKR-VAL-003', 'Ledger ocupado');
}
