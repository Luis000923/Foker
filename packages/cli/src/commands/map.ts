import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FokerError, normalizePath, openEngine } from '@foker/core';
import { type Command, flag } from '../types.js';
export const mapCommand: Command = {
  name: 'map',
  description: 'Construye/refresca el Project Map',
  maxArgs: 0,
  flags: [
    flag('full', 'boolean', 'Reconstruye completamente'),
    flag('stats', 'boolean', 'Incluye estadísticas'),
    flag('export', 'string', 'Exporta JSON canónico a un archivo'),
    flag('check', 'boolean', 'Sale con 1 si el mapa estaba desactualizado; no guarda'),
    flag('dry-run', 'boolean', 'Previsualiza exportación sin escribir (requiere --export)'),
  ],
  async run(ctx) {
    // Hasta FKR-040 no hay carga de foker.config.yaml: mejor rechazar que ignorar en silencio.
    if (ctx.flags['config'])
      throw new FokerError('FKR-INP-001', '--config todavía no está soportado por map (llega con FKR-040).');
    if (ctx.flags['check'] && ctx.flags['export'])
      throw new FokerError('FKR-INP-001', '--check no escribe archivos: no se puede combinar con --export.');
    if (ctx.flags['dry-run'] && !ctx.flags['export'])
      throw new FokerError('FKR-INP-001', '--dry-run requiere --export.');
    const exportPath = ctx.flags['export'] ? normalizePath(ctx.cwd, String(ctx.flags['export'])) : undefined;
    const engine = await openEngine(ctx.cwd, { readOnly: Boolean(ctx.flags['check'] || ctx.flags['dry-run']) });
    const before = engine.status().contentHash;
    const staleFiles = await engine.checkStale();
    const report = await engine.refresh({ full: Boolean(ctx.flags['full']) });
    const status = engine.status();
    const diagnostics = [...engine.loadDiagnostics(), ...report.diagnostics];
    const data = {
      contentHash: report.contentHash,
      files: status.files,
      symbols: status.symbols,
      added: report.added,
      changed: report.changed,
      removed: report.removed,
      rebuilt: report.rebuilt,
      unchanged: report.unchanged,
      diagnostics,
      ...(ctx.flags['stats']
        ? { stats: { files: status.files, symbols: status.symbols, staleFiles, durationMs: report.durationMs } }
        : {}),
      ...(ctx.flags['dry-run'] ? { plannedFiles: [exportPath] } : {}),
      ...(!ctx.flags['check'] && !ctx.flags['dry-run']
        ? { saved: await engine.save().then(({ path, bytes }) => ({ path, bytes })) }
        : {}),
    };
    if (exportPath && !ctx.flags['dry-run'])
      await writeFile(resolve(ctx.cwd, exportPath), await engine.exportMapJson(), 'utf8');
    return {
      data,
      warnings: diagnostics.map(({ code, message }) => ({ code, message })),
      exitCode: ctx.flags['check'] && (!before || before !== report.contentHash) ? 1 : 0,
    };
  },
};
