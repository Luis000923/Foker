import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { commands, exitCodes, globalFlags } from './registry.js';
import type { Flag } from './types.js';

function flagsTable(flags: Flag[]): string {
  return (
    '| Flag | Tipo | Default | Descripción |\n|---|---|---|---|\n' +
    flags
      .map(
        (f) =>
          `| --${f.name}${f.short ? ` / -${f.short}` : ''} | ${f.type} | ${JSON.stringify(f.default)} | ${f.description} |`,
      )
      .join('\n') +
    '\n'
  );
}
it('REQ-DOC-001: docs/cli.md corresponde al registro', () => {
  const markdown =
    '# CLI de Foker\n\nGenerado desde el registro de comandos. Regenerar con `UPDATE_SNAPSHOTS=1 ./node_modules/.bin/vitest run packages/cli/src/docs.test.ts`.\n\n## Flags globales\n\n' +
    flagsTable(globalFlags) +
    '\n## Exit codes\n\n| Código | Significado |\n|---|---|\n' +
    exitCodes.map(([code, description]) => `| ${code} | ${description} |`).join('\n') +
    '\n\n' +
    commands.map((c) => `## foker ${c.name}\n\n${c.description}\n\n${flagsTable(c.flags)}`).join('\n') +
    '\n## Datos de map\n\n`data` incluye `contentHash`, `files`, `symbols`, `added`, `changed`, `removed`, `rebuilt`, `unchanged`, `diagnostics` y, al guardar, `saved: {path, bytes}`. `--stats` añade `stats: {files, symbols, staleFiles, durationMs}`. `--dry-run --export` añade `plannedFiles` y no escribe. Las rutas de exportación se normalizan respecto a `--cwd`. `--check` compara el hash previo con el refrescado y no guarda.\n';
  const path = new URL('../../../docs/cli.md', import.meta.url);
  if (process.env['UPDATE_SNAPSHOTS'] === '1') writeFileSync(path, markdown);
  expect(readFileSync(path, 'utf8')).toBe(markdown);
});
