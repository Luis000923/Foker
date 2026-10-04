import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { estimateTokens, versionInfo } from '@foker/core';
import { FokerError, isTrusted, loadConfig } from '@foker/engine';
import { MANIFEST_PATH } from '@foker/integrations';
import { type Command, flag } from '../types.js';
import { runSync } from './sync.js';

const exec = promisify(execFile);

/** Resultado de una comprobación de `foker doctor`. */
export interface Check {
  id: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  hint?: string;
}

/** Límite de tokens de `foker/rules.md` (FOKER-SPEC §9.8). */
const RULES_MAX_TOKENS = 1500;

function versionAtLeast(version: string, minimum: [number, number]): boolean {
  const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);
  return major > minimum[0] || (major === minimum[0] && minor >= minimum[1]);
}

/** Servidores MCP del proyecto distintos de `foker` (T5). */
function otherMcpServers(root: string): string[] {
  const found = new Set<string>();
  const read = (path: string, pick: (doc: Record<string, unknown>) => unknown) => {
    try {
      const doc = JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;
      const servers = pick(doc);
      if (servers && typeof servers === 'object') {
        for (const name of Object.keys(servers)) if (name !== 'foker') found.add(`${path}: ${name}`);
      }
    } catch {
      // Ausente o no JSON: lo informa sync.
    }
  };
  read('.mcp.json', (d) => d['mcpServers']);
  read('opencode.json', (d) => d['mcp']);
  read('.agents/mcp_config.json', (d) => d['mcpServers']);
  return [...found].sort();
}

/** Heurística de sandbox de SO (C4): contenedor o sandbox declarado por el anfitrión. */
function sandboxDetected(env: NodeJS.ProcessEnv): boolean {
  return (
    existsSync('/.dockerenv') ||
    existsSync('/run/.containerenv') ||
    Boolean(env['FOKER_SANDBOX'] || env['CLAUDE_CODE_SANDBOX'] || env['SANDBOX_RUNTIME'])
  );
}

export async function runDoctor(
  root: string,
  env: NodeJS.ProcessEnv,
  options: { fix?: boolean; trustBaseDir?: string },
) {
  const checks: Check[] = [];
  const add = (check: Check) => checks.push(check);

  add(
    versionAtLeast(process.versions.node, [22, 14])
      ? { id: 'node', status: 'ok', message: `Node.js ${process.versions.node}` }
      : { id: 'node', status: 'fail', message: `Node.js ${process.versions.node} < 22.14`, hint: 'Actualiza Node.js' },
  );
  try {
    const info = versionInfo();
    add({ id: 'addon', status: 'ok', message: `Addon nativo ${info.coreVersion} (API ${info.nativeApi})` });
  } catch (error) {
    const code = error instanceof FokerError ? error.code : 'FKR-INT-003';
    add({ id: 'addon', status: 'fail', message: `${code}: addon nativo no disponible`, hint: 'Reinstala foker' });
  }
  try {
    const { stdout } = await exec('git', ['--version'], { timeout: 5000 });
    add({ id: 'git', status: 'ok', message: stdout.trim() });
  } catch {
    add({
      id: 'git',
      status: 'warn',
      message: 'git no encontrado',
      hint: 'Sin git, los gates usan instantáneas de hashes',
    });
  }

  let loaded: Awaited<ReturnType<typeof loadConfig>> | undefined;
  try {
    loaded = await loadConfig(root);
    add({
      id: 'config',
      status: loaded.source ? 'ok' : 'warn',
      message: loaded.source ? 'foker.config.yaml válido' : 'Sin foker.config.yaml: se usan los valores por defecto',
      ...(loaded.source ? {} : { hint: 'Ejecuta foker init' }),
    });
    for (const override of loaded.overrides ?? []) {
      add({
        id: 'policy-override',
        status: 'warn',
        message: `Política relajada: ${JSON.stringify(override)}`,
        hint: 'Revisa policy.overrides',
      });
    }
  } catch (error) {
    add({
      id: 'config',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
      hint: 'Corrige foker.config.yaml (FKR-CFG-001)',
    });
  }

  if (loaded) {
    const trusted = await isTrusted(root, loaded.commandsHash, options.trustBaseDir).catch(() => false);
    const hasChecks = Object.keys(loaded.config.validation.checks).length > 0;
    add(
      trusted || !hasChecks
        ? { id: 'trust', status: 'ok', message: hasChecks ? 'Workspace confiado' : 'Sin checks que confiar' }
        : {
            id: 'trust',
            status: 'warn',
            message: 'Workspace no confiado (FKR-POL-010)',
            hint: 'Revisa los comandos y ejecuta foker trust',
          },
    );
    try {
      const { plan } = await runSync(root, { check: true });
      const drift = plan.writes.length + plan.conflicts.length;
      const synced = existsSync(join(root, MANIFEST_PATH));
      add(
        !synced && plan.writes.length > 0
          ? { id: 'sync', status: 'warn', message: 'Integraciones sin generar', hint: 'Ejecuta foker sync' }
          : drift === 0
            ? { id: 'sync', status: 'ok', message: 'Integraciones al día' }
            : {
                id: 'sync',
                status: 'warn',
                message: `Deriva de sync: ${drift} archivo(s)`,
                hint: plan.conflicts.length ? 'Hay ediciones manuales (FKR-SYN-001)' : 'Ejecuta foker sync',
              },
      );
    } catch (error) {
      add({ id: 'sync', status: 'warn', message: error instanceof Error ? error.message : String(error) });
    }
  }

  try {
    const rules = await readFile(join(root, 'foker/rules.md'), 'utf8');
    const tokens = estimateTokens(rules);
    add(
      tokens <= RULES_MAX_TOKENS
        ? { id: 'rules', status: 'ok', message: `foker/rules.md: ${tokens} tokens` }
        : {
            id: 'rules',
            status: 'warn',
            message: `foker/rules.md: ${tokens} tokens > ${RULES_MAX_TOKENS}`,
            hint: 'Resume las reglas',
          },
    );
  } catch {
    add({ id: 'rules', status: 'warn', message: 'Sin foker/rules.md', hint: 'Ejecuta foker init' });
  }

  const others = otherMcpServers(root);
  add(
    others.length
      ? {
          id: 'mcp',
          status: 'warn',
          message: `Otros servidores MCP en el proyecto: ${others.join(', ')}`,
          hint: 'Revisa que sean de confianza (T5)',
        }
      : { id: 'mcp', status: 'ok', message: 'Sin otros servidores MCP en el proyecto' },
  );
  add(
    sandboxDetected(env)
      ? { id: 'sandbox', status: 'ok', message: 'Sandbox de SO detectado' }
      : {
          id: 'sandbox',
          status: 'warn',
          message: 'No se detecta sandbox de SO (C4)',
          hint: 'Ejecuta el agente en un sandbox o contenedor (REQ-SEC-001)',
        },
  );

  const gitignorePath = join(root, '.gitignore');
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const ignored = gitignore.split(/\r?\n/).some((l) => ['.foker', '.foker/', '/.foker', '/.foker/'].includes(l.trim()));
  const fixed: string[] = [];
  if (options.fix) {
    // Solo acciones seguras (FOKER-SPEC §16.1).
    if (!existsSync(join(root, '.foker'))) {
      await mkdir(join(root, '.foker'), { recursive: true });
      fixed.push('.foker/');
    }
    if (!ignored) {
      await appendFile(gitignorePath, `${gitignore && !gitignore.endsWith('\n') ? '\n' : ''}.foker/\n`);
      fixed.push('.gitignore');
    }
  }
  add(
    ignored || fixed.includes('.gitignore')
      ? { id: 'gitignore', status: 'ok', message: '.foker/ está en .gitignore' }
      : { id: 'gitignore', status: 'warn', message: '.foker/ no está en .gitignore', hint: 'foker doctor --fix' },
  );
  return { checks, fixed };
}

export const doctorCommand: Command = {
  name: 'doctor',
  description: 'Diagnóstico: Node, addon, git, configuración, trust, sync, reglas, otros MCP y sandbox',
  maxArgs: 0,
  flags: [flag('fix', 'boolean', 'Aplica solo correcciones seguras (crear .foker/, añadirlo a .gitignore)')],
  async run(ctx) {
    const { checks, fixed } = await runDoctor(ctx.cwd, ctx.env, {
      fix: Boolean(ctx.flags['fix']),
      ...(ctx.trustBaseDir ? { trustBaseDir: ctx.trustBaseDir } : {}),
    });
    const icon = { ok: '✓', warn: '!', fail: '✗' } as const;
    const human = `${checks
      .map((c) => `${icon[c.status]} ${c.id}: ${c.message}${c.hint ? ` — ${c.hint}` : ''}`)
      .join('\n')}\n`;
    return {
      data: { checks, fixed },
      warnings: [],
      human,
      exitCode: checks.some((c) => c.status === 'fail') ? 1 : 0,
    };
  },
};
