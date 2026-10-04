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
    '\n## Datos de context\n\n`foker context "<tarea>"` imprime Markdown por defecto. `--json` o `--format json` entrega el sobre CLI con `data` conforme a `context-pack.schema.json` (snake_case). Las anclas de archivo entran en L3; `--explain` incluye razones y descartados. Lee reglas, skill y cambios de git; abre el motor en solo lectura y no guarda el mapa. `--budget` admite 1000–200000 tokens. `--task` queda pendiente de FKR-045. Un presupuesto insuficiente para contexto obligatorio produce FKR-CTX-001 y exit 1.\n' +
    '\n## Datos de map\n\n`data` incluye `contentHash`, `files`, `symbols`, `added`, `changed`, `removed`, `rebuilt`, `unchanged`, `diagnostics` y, al guardar, `saved: {path, bytes}`. `--stats` añade `stats: {files, symbols, staleFiles, durationMs}`. `--dry-run --export` añade `plannedFiles` y no escribe. Las rutas de exportación se normalizan respecto a `--cwd`. `--check` compara el hash previo con el refrescado y no guarda.\n';
  const taskDocs =
    '\n## Datos de task y validate\n\n`task begin` recibe una descripción y `--scope` repetible. status devuelve un TaskRecord (sin id, lista); list devuelve la lista. submit devuelve `{task_id, state, attempt, gates, evidence, next_action}`: REJECTED describe el intento aunque la FSM haya preparado RUNNING para reintentar. REJECTED/FAILED salen con 1; AWAITING_APPROVAL/BLOCKED con 6; COMPLETED con 0. verify reejecuta y compara la última evidencia sin modificar la tarea. approve/reject/unblock exigen TTY y confirmación, excepto con --ci explícito y CI=true; --yes solo no permite aprobación no interactiva. unblock admite --scope para fijar el nuevo alcance. validate usa el perfil default por defecto; --checks y --packages son listas separadas por comas. --changed calcula paquetes afectados; escribe logs en .foker/runs/adhoc/ sin tocar tareas. Ambos requieren trust para ejecutar checks.\n';
  const generated = markdown + taskDocs;
  const path = new URL('../../../docs/cli.md', import.meta.url);
  if (process.env['UPDATE_SNAPSHOTS'] === '1') writeFileSync(path, generated);
  expect(readFileSync(path, 'utf8')).toBe(generated);
});
