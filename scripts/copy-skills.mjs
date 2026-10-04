import { cp, rm } from 'node:fs/promises';

const target = new URL('../packages/engine/skills/', import.meta.url);
await rm(target, { recursive: true, force: true });
await cp(new URL('../skills/', import.meta.url), target, { recursive: true });
