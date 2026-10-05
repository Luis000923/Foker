import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  claudeDenyRules,
  loadRoles,
  MANIFEST_PATH,
  parseRole,
  planSync,
  RULE_MAX_BYTES,
  type SyncInput,
  upsertBlock,
} from './index.js';

const roles = await loadRoles();

const input = (overrides: Partial<SyncInput> = {}): SyncInput => ({
  targets: ['antigravity', 'claude-code', 'opencode', 'codex'],
  skills: [
    {
      name: 'foker-workflow',
      files: [
        { path: 'SKILL.md', content: '---\nname: foker-workflow\ndescription: d\n---\n\n# Flujo\n' },
        { path: 'foker.skill.yaml', content: 'schema_version: 1\n' },
        { path: 'references/notas.md', content: 'notas\n' },
      ],
    },
  ],
  roles,
  protectedPaths: ['.foker/**', 'foker.config.yaml'],
  secretGlobs: ['.env', '**/*.pem'],
  ...overrides,
});

/** Sistema de archivos en memoria. */
function fs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    io: { read: (path: string) => files.get(path) },
    apply(plan: ReturnType<typeof planSync>) {
      for (const w of plan.writes) {
        if (w.content === null) files.delete(w.path);
        else files.set(w.path, typeof w.content === 'string' ? w.content : Buffer.from(w.content).toString('utf8'));
      }
    },
  };
}

describe('roles', () => {
  it('carga implementer y reviewer', () => {
    expect(roles.map((r) => [r.name, r.native])).toEqual([
      ['foker-implementer', 'edit'],
      ['foker-reviewer', 'read'],
    ]);
    expect(() => parseRole('---\nname: x\n---\n')).toThrow(/rol inválido/);
  });
});

describe('planSync', () => {
  it('genera los archivos de los 4 anfitriones (snapshot)', () => {
    const disk = fs();
    const plan = planSync(input(), disk.io);
    expect(plan.conflicts).toEqual([]);
    expect(Object.fromEntries(plan.writes.map((w) => [w.path, w.content]))).toMatchSnapshot();
  });

  it('REQ-PRJ-001: dos ejecuciones seguidas no producen cambios', () => {
    const disk = fs();
    disk.apply(planSync(input(), disk.io));
    const again = planSync(input(), disk.io);
    expect(again.writes).toEqual([]);
    expect(again.conflicts).toEqual([]);
  });

  it('REQ-PRJ-002: preserva el contenido del usuario en Markdown y JSON', () => {
    const userAgents = '# Mi proyecto\n\nTexto del usuario antes.\n';
    const disk = fs({
      'AGENTS.md': userAgents,
      'CLAUDE.md': 'Notas propias\n',
      '.claude/settings.json': JSON.stringify({
        permissions: { deny: ['Bash(rm -rf *)'], allow: ['Bash(pnpm test)'] },
        model: 'x',
      }),
      'opencode.json': JSON.stringify({ $schema: 'https://opencode.ai/config.json', permission: { edit: 'ask' } }),
    });
    disk.apply(planSync(input(), disk.io));
    const agents = disk.files.get('AGENTS.md') ?? '';
    expect(agents.startsWith(userAgents)).toBe(true);
    disk.files.set('AGENTS.md', `${agents}\nTexto del usuario después.\n`);
    disk.apply(planSync(input(), disk.io));
    expect(disk.files.get('AGENTS.md')).toContain('Texto del usuario después.');
    expect(disk.files.get('CLAUDE.md')?.startsWith('@AGENTS.md\n\nNotas propias\n')).toBe(true);
    const settings = JSON.parse(disk.files.get('.claude/settings.json') ?? '{}');
    expect(settings.permissions.deny[0]).toBe('Bash(rm -rf *)');
    expect(settings.permissions.allow).toEqual(['Bash(pnpm test)']);
    expect(settings.model).toBe('x');
    expect(settings.permissions.deny).toContain('Edit(./.foker/**)');
    const oc = JSON.parse(disk.files.get('opencode.json') ?? '{}');
    expect(oc.permission.edit['*']).toBe('ask');
    expect(oc.permission.edit['.foker/**']).toBe('deny');
  });

  it('retira entradas propias obsoletas sin tocar las del usuario', () => {
    const disk = fs({ '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Bash(rm -rf *)'] } }) });
    disk.apply(planSync(input(), disk.io));
    disk.apply(planSync(input({ protectedPaths: ['.foker/**'] }), disk.io));
    const deny = JSON.parse(disk.files.get('.claude/settings.json') ?? '{}').permissions.deny as string[];
    expect(deny).toContain('Bash(rm -rf *)');
    expect(deny).not.toContain('Edit(./**/foker.config.yaml)');
  });

  it('quitar un anfitrión elimina sus archivos y entradas', () => {
    const disk = fs({ '.mcp.json': JSON.stringify({ mcpServers: { otro: { command: 'x' } } }) });
    disk.apply(planSync(input(), disk.io));
    disk.apply(planSync(input({ targets: ['opencode'] }), disk.io));
    expect(disk.files.has('.claude/agents/foker-implementer.md')).toBe(false);
    expect(disk.files.has('.agents/rules/foker.md')).toBe(false);
    expect(JSON.parse(disk.files.get('.mcp.json') ?? '{}')).toEqual({ mcpServers: { otro: { command: 'x' } } });
    expect(disk.files.get('CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(disk.files.has('.agents/skills/foker-workflow/SKILL.md')).toBe(true);
  });

  it('FKR-SYN-001: detecta ediciones manuales del bloque o de archivos generados', () => {
    const disk = fs();
    disk.apply(planSync(input(), disk.io));
    disk.files.set('AGENTS.md', (disk.files.get('AGENTS.md') ?? '').replace('## Foker', '## Foker editado'));
    disk.files.set('.claude/agents/foker-reviewer.md', 'a mano\n');
    const plan = planSync(input(), disk.io);
    expect(plan.conflicts.map((c) => c.path)).toEqual(['.claude/agents/foker-reviewer.md', 'AGENTS.md']);
    const forced = planSync(input(), disk.io, { force: true });
    expect(forced.conflicts).toEqual([]);
    disk.apply(forced);
    expect(planSync(input(), disk.io).writes).toEqual([]);
  });

  it('no pisa archivos o valores que no generó', () => {
    const disk = fs({
      '.claude/agents/foker-implementer.md': 'del usuario\n',
      '.mcp.json': JSON.stringify({ mcpServers: { foker: { command: 'otro' } } }),
      'opencode.json': '{ // comentario\n}',
    });
    const plan = planSync(input(), disk.io);
    expect(plan.conflicts.map((c) => c.path)).toEqual([
      '.claude/agents/foker-implementer.md',
      '.mcp.json',
      'opencode.json',
    ]);
  });

  it('REQ-INT-001: opencode.json valida contra el esquema publicado de OpenCode', () => {
    const disk = fs();
    disk.apply(planSync(input({ targets: ['opencode'] }), disk.io));
    const schema = JSON.parse(readFileSync(new URL('../test/opencode-config.schema.json', import.meta.url), 'utf8'));
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    // El esquema de OpenCode referencia el de modelos de models.dev (copia local, sin red).
    const models = JSON.parse(readFileSync(new URL('../test/models-dev.schema.json', import.meta.url), 'utf8'));
    ajv.addSchema({ ...models, $id: 'https://models.dev/model-schema.json' });
    const validate = ajv.compile(schema);
    const ok = validate(JSON.parse(disk.files.get('opencode.json') ?? '{}'));
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('la regla de Antigravity no supera 24 KB y el manifiesto es determinista', () => {
    const disk = fs();
    const plan = planSync(input(), disk.io);
    const rule = plan.writes.find((w) => w.path === '.agents/rules/foker.md')?.content ?? '';
    expect(Buffer.byteLength(rule)).toBeLessThanOrEqual(RULE_MAX_BYTES);
    const manifest = plan.writes.find((w) => w.path === MANIFEST_PATH)?.content ?? '';
    expect(manifest).toBe(planSync(input(), fs().io).writes.find((w) => w.path === MANIFEST_PATH)?.content);
    expect(manifest).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('reglas deny de Claude Code a partir de la política', () => {
    expect(claudeDenyRules(input())).toEqual([
      'Read(./**/.env)',
      'Read(./**/*.pem)',
      'Edit(./.foker/**)',
      'Edit(./**/foker.config.yaml)',
      'Bash(git push *)',
      'Bash(git reset --hard *)',
      'Bash(git clean *)',
      'Bash(git checkout -- .)',
    ]);
  });
});

describe('upsertBlock', () => {
  it('es idempotente y conserva bytes fuera del bloque', () => {
    const once = upsertBlock('A\r\nB', 'x\n');
    expect(upsertBlock(once, 'x\n')).toBe(once);
    expect(once.startsWith('A\r\nB')).toBe(true);
  });
});

it('conserva reglas y hooks preexistentes al retirar el anfitrión', () => {
  const first = planSync(input({ targets: ['claude-code'] }), fs().io);
  const hooks = JSON.parse(first.writes.find((w) => w.path === '.claude/settings.json')?.content as string).hooks;
  const user = { permissions: { deny: ['Bash(git push *)'] }, hooks };
  const disk = fs({ '.claude/settings.json': JSON.stringify(user) });
  disk.apply(planSync(input({ targets: ['claude-code'] }), disk.io));
  expect(planSync(input({ targets: ['claude-code'] }), disk.io).writes).toEqual([]);
  disk.apply(planSync(input({ targets: [] }), disk.io));
  expect(JSON.parse(disk.files.get('.claude/settings.json') ?? '{}')).toEqual(user);
});

it('informa conflicto si no puede insertar arrays bajo un escalar', () => {
  const disk = fs({ '.claude/settings.json': '{"hooks":"bad"}' });
  for (const force of [false, true]) {
    const plan = planSync(input({ targets: ['claude-code'] }), disk.io, { force });
    expect(plan.conflicts).toContainEqual({
      path: '.claude/settings.json',
      reason: expect.stringContaining('intermedio'),
    });
    expect(plan.writes.some((w) => w.path === '.claude/settings.json')).toBe(false);
    expect(plan.manifest.files['.claude/settings.json']).toBeUndefined();
  }
});

it('los cuatro targets generan el flujo corto y la misma instrucción de no releer objetivos', () => {
  const workflow = 'El pack contiene el código objetivo: no releas esos archivos salvo aviso de omisión.';
  for (const target of ['claude-code', 'codex', 'antigravity', 'opencode'] as const) {
    const plan = planSync(input({ targets: [target] }), fs().io);
    const agents = plan.writes.find((w) => w.path === 'AGENTS.md')?.content;
    expect(agents).toContain('`context: true`');
    expect(agents).toContain(workflow);
    expect(agents).toContain('`foker_task_submit` ejecuta checks y gates');
    expect(agents).toContain('`foker_check` opcional');
    expect(agents).toContain('omite `scope` y pasa `context` con `anchors`');
    expect(agents).toContain('Un alcance inventado se rechaza sin crear tarea');
    expect(agents).not.toContain('2. `foker_context`');
    const implementer = plan.writes.find((w) => /foker-implementer\.(md|toml)$/.test(w.path))?.content;
    expect(implementer).toContain(workflow);
    expect(implementer).toContain('`context: true`');
    expect(implementer).toContain('omite `scope` y pasa `context` con `anchors`');
    expect(implementer).toContain('Un alcance inventado se rechaza sin crear tarea');
  }
});
