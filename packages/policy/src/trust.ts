import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { policyError } from './policy.js';

export interface TrustEntry {
  root_realpath: string;
  commands_hash: string;
  approved_at: string;
  approved_by: string;
}
export function assertCanTrust(origin: string): void {
  if (origin === 'mcp') throw policyError('FKR-POL-010', 'MCP nunca puede conceder confianza');
}
export class TrustStore {
  readonly path: string;
  constructor(
    baseDir = process.platform === 'win32'
      ? (process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'))
      : (process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')),
  ) {
    this.path = join(baseDir, 'foker', 'trust.json');
  }
  async entries(): Promise<TrustEntry[]> {
    try {
      const entries: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      if (
        !Array.isArray(entries) ||
        !entries.every(
          (e) =>
            e &&
            ['root_realpath', 'commands_hash', 'approved_at', 'approved_by'].every((k) => typeof e[k] === 'string'),
        )
      )
        return [];
      return entries as TrustEntry[];
    } catch {
      return [];
    }
  }
  async isTrusted(root: string, commandsHash: string): Promise<boolean> {
    const canonical = await realpath(root);
    return (await this.entries()).some((e) => e.root_realpath === canonical && e.commands_hash === commandsHash);
  }
  async approve(root: string, commandsHash: string, approvedBy = userInfo().username, origin = 'cli'): Promise<void> {
    assertCanTrust(origin);
    const canonical = await realpath(root);
    const entries = (await this.entries()).filter((e) => e.root_realpath !== canonical);
    entries.push({
      root_realpath: canonical,
      commands_hash: commandsHash,
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    });
    await mkdir(join(this.path, '..'), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(entries)}\n`, { mode: 0o600, flag: 'wx' });
      await rename(temp, this.path);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
}
export async function isTrusted(root: string, commandsHash: string, baseDir?: string): Promise<boolean> {
  return new TrustStore(baseDir).isTrusted(root, commandsHash);
}
