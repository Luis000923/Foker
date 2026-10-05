import { appendFile, lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FokerError, hashCanonicalJson, normalizePath, redactSecrets } from '@foker/engine';

export const OUTPUT_LIMIT = 80_000;
export class TokenBucket {
  private tokens = 120;
  private last: number;
  constructor(private readonly clock: () => number = Date.now) {
    this.last = clock();
  }
  take(): number {
    const now = this.clock();
    this.tokens = Math.min(120, this.tokens + Math.max(0, now - this.last) / 500);
    this.last = Math.max(this.last, now);
    if (this.tokens < 1) return Math.ceil((1 - this.tokens) * 500);
    this.tokens--;
    return 0;
  }
}
/** Redacta valores y claves, sin serializar primero: las expresiones multilínea deben seguir funcionando. */
export function sanitize<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map(sanitize) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redactSecrets(k), sanitize(v)])) as T;
  return value;
}
const truncation = { code: 'FKR-MCP-101', message: 'Salida truncada al límite de 80.000 caracteres.' };
/** Reduce datos conservando objetos requeridos y valores de contrato; el validador comprueba el resultado final. */
export function limitOutput(data: Record<string, unknown>, text?: string) {
  let structured = sanitize(data);
  let rendered = text === undefined ? undefined : redactSecrets(text);
  const size = () =>
    JSON.stringify({
      content: [{ type: 'text', text: rendered ?? JSON.stringify(structured) }],
      structuredContent: structured,
    }).length;
  if (size() <= OUTPUT_LIMIT) return { structured, rendered };
  // TaskRecord no permite diagnostics; se entrega el aviso en _meta además del texto.
  const diagnostics = Array.isArray(structured['diagnostics']) ? structured['diagnostics'] : [];
  structured = { ...structured };
  if ('diagnostics' in structured || !('task_id' in structured) || !('schema_version' in structured))
    structured['diagnostics'] = [...diagnostics, truncation];
  for (let iteration = 0; size() > OUTPUT_LIMIT && iteration < 100; iteration++) {
    if (rendered && rendered.length > 512) {
      rendered = `${rendered.slice(0, Math.floor(rendered.length / 2))}\n[FKR-MCP-101: contenido omitido por límite MCP.]\n`;
      if (typeof structured['rendered'] === 'string') structured['rendered'] = rendered;
      continue;
    }
    let candidate:
      | { container: Record<string, unknown> | unknown[]; key: string | number; value: string | unknown[] }
      | undefined;
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'diagnostics' || key === 'task_id' || key === 'pack_hash') continue;
        if ((typeof value === 'string' && value.length > 512) || (Array.isArray(value) && value.length > 0)) {
          if (!candidate || JSON.stringify(value).length > JSON.stringify(candidate.value).length)
            candidate = { container: node as Record<string, unknown>, key, value };
        }
        walk(value);
      }
    };
    walk(structured);
    if (!candidate) throw new FokerError('FKR-INT-001', 'No se puede truncar la salida conservando su contrato.');
    const { container, key, value } = candidate;
    (container as Record<string, unknown>)[key] = value.slice(0, Math.floor(value.length / 2));
    if (rendered !== undefined && typeof structured['rendered'] === 'string') rendered = structured['rendered'];
  }
  if (size() > OUTPUT_LIMIT) throw new FokerError('FKR-INT-001', 'Salida demasiado grande.');
  return { structured, rendered, diagnostics: [truncation] };
}
async function refuseLink(path: string) {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new FokerError('FKR-POL-001', 'Auditoría no admite symlinks.');
}
export class Audit {
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly root: string,
    private readonly clock: () => number,
  ) {}
  append(actor: string, tool: string, args: unknown, result: string, taskId?: string) {
    const job = this.queue.then(async () => {
      const directory = join(this.root, normalizePath(this.root, '.foker/audit'));
      for (const path of [join(this.root, '.foker'), directory]) await refuseLink(path);
      await mkdir(directory, { recursive: true });
      const ts = new Date(this.clock()).toISOString();
      const file = join(directory, normalizePath(directory, `${ts.slice(0, 10)}.jsonl`));
      await refuseLink(file);
      const names = (await readdir(directory)).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort();
      const previousFile = names.at(-1);
      if (previousFile) await refuseLink(join(directory, previousFile));
      const previous = previousFile
        ? (await readFile(join(directory, previousFile), 'utf8')).trim().split('\n').at(-1)
        : undefined;
      const entry = {
        ts,
        actor: redactSecrets(actor),
        tool,
        args_digest: hashCanonicalJson(JSON.stringify(args)),
        result,
        ...(taskId ? { task_id: taskId } : {}),
        prev_hash: previous ? hashCanonicalJson(previous) : null,
      };
      await appendFile(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    });
    this.queue = job.catch(() => {});
    return job;
  }
}
