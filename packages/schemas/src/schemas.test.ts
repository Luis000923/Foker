import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { ContextPack, FokerConfig, ProjectMap, TaskRecord } from './index.js';
import {
  ajv,
  bundleSchema,
  errorCode,
  errorCodes,
  formatIssues,
  getSchema,
  mcpApiVersion,
  mcpTools,
  SCHEMA_NAMES,
  schemaId,
  validate,
} from './index.js';

const examples = new URL('../examples/', import.meta.url);
const json = (file: string): unknown => JSON.parse(readFileSync(new URL(file, examples), 'utf8'));
const yaml = (file: string): unknown => parse(readFileSync(new URL(file, examples), 'utf8'));
const frontmatter = (file: string): unknown => {
  const text = readFileSync(new URL(file, examples), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) throw new Error(`${file} sin frontmatter`);
  return parse(match[1]);
};

function expectValid(ref: Parameters<typeof validate>[0], data: unknown): void {
  const result = validate(ref, data);
  if (!result.ok) throw new Error(`${ref} inválido:\n${formatIssues(result.issues)}`);
}

function expectInvalid(ref: Parameters<typeof validate>[0], data: unknown, path: string): void {
  const result = validate(ref, data);
  expect(result.ok, `${ref} debería rechazar el dato`).toBe(false);
  if (!result.ok) expect(result.issues.map((i) => i.path)).toContain(path);
}

describe('registro', () => {
  it('carga los esquemas con el $id esperado y compila todos en modo estricto', () => {
    for (const name of SCHEMA_NAMES) expect(getSchema(name)['$id']).toBe(schemaId(name));
    expect(() => ajv()).not.toThrow();
  });

  it('incluye los 8 documentos de FKR-004 más common y foker-md', () => {
    expect([...SCHEMA_NAMES].sort()).toEqual(
      [
        'benchmark-result',
        'benchmark-manifest',
        'cli-output',
        'common',
        'context-pack',
        'foker-config',
        'foker-md',
        'foker-skill',
        'mcp-tools',
        'project-map',
        'task',
      ].sort(),
    );
  });

  it('devuelve copias que no alteran la caché', () => {
    const a = getSchema('task');
    a['title'] = 'mutado';
    expect(getSchema('task')['title']).toBe('Foker TaskRecord');
  });
});

describe('ejemplos de la especificación', () => {
  const cases: [Parameters<typeof validate>[0], () => unknown][] = [
    ['project-map', () => json('project-map.json')],
    ['context-pack', () => json('context-pack.json')],
    ['task', () => json('task.json')],
    ['task#/$defs/event', () => json('task-event.json')],
    ['task#/$defs/evidence', () => json('task-evidence.json')],
    ['cli-output', () => json('cli-output.json')],
    ['benchmark-result', () => json('benchmark-result.json')],
    ['foker-config', () => yaml('foker.config.yaml')],
    ['foker-skill', () => yaml('foker.skill.yaml')],
    ['foker-md', () => frontmatter('foker.md')],
  ];
  it.each(cases)('%s valida', (ref, load) => {
    expectValid(ref, load());
  });
});

describe('foker-config', () => {
  const withRun = (run: string[]) => ({ version: 1, validation: { checks: { evil: { run } } } });

  it('rechaza un check con ${HOME} en run', () => {
    expectInvalid('foker-config', withRun(['sh', '-c', 'cat ${HOME}/.ssh/id_rsa']), '/validation/checks/evil');
  });

  it('solo admite ${affected_packages} como argumento completo', () => {
    expectValid('foker-config', withRun(['pnpm', 'turbo', 'run', 'test', '${affected_packages}']));
    expectInvalid('foker-config', withRun(['pnpm', '--filter=${affected_packages}']), '/validation/checks/evil');
    expectInvalid('foker-config', withRun(['${affected_packages}', 'x']), '/validation/checks/evil');
  });

  it('rechaza claves desconocidas (FKR-CFG-001)', () => {
    expectInvalid('foker-config', { version: 1, mapa: {} }, '');
    expectInvalid('foker-config', { version: 1, map: { includes: [] } }, '/map');
  });

  it('exige version 1', () => {
    expectInvalid('foker-config', { version: 2 }, '/version');
    expectInvalid('foker-config', {}, '');
  });

  it('exige justificación al relajar la política', () => {
    expectInvalid(
      'foker-config',
      { version: 1, policy: { overrides: [{ remove_protected_paths: ['.mcp.json'] }] } },
      '/policy/overrides/0',
    );
    expectInvalid(
      'foker-config',
      { version: 1, policy: { overrides: [{ justification: 'sin nada que relajar' }] } },
      '/policy/overrides/0',
    );
  });
});

describe('foker-skill (REQ-SKL-001)', () => {
  const base = yaml('foker.skill.yaml') as Record<string, unknown>;
  it.each(['-form', 'form-', 'secure--form', 'Secure', 'a'.repeat(65), ''])('rechaza el nombre %j', (name) => {
    expectInvalid('foker-skill', { ...base, name }, '/name');
  });
  it('acepta nombres válidos', () => {
    expectValid('foker-skill', { ...base, name: 'a' });
    expectValid('foker-skill', { ...base, name: 'next-route-2' });
  });
  it('solo admite herramientas de Foker', () => {
    expectInvalid('foker-skill', { ...base, tools: ['run_shell'] }, '/tools/0');
  });
});

describe('common', () => {
  it.each(['src/a.ts', '.foker/project-map.json', 'apps/web/src/app/[id]/page.tsx', 'packages/ui/src/botón.tsx'])(
    'fileId válido %j',
    (id) => {
      expectValid('common#/$defs/fileId', id);
    },
  );
  it.each(['/etc/passwd', '../x', 'a/../b', './a', 'a//b', 'a/', 'C:/x', 'a\\b', 'a/./b', '..', '.', ''])(
    'fileId inválido %j',
    (id) => {
      expect(validate('common#/$defs/fileId', id).ok).toBe(false);
    },
  );
  it('valida hashes y task ids', () => {
    expectValid('common#/$defs/hash', `blake3:${'0'.repeat(64)}`);
    expect(validate('common#/$defs/hash', `sha256:${'0'.repeat(64)}`).ok).toBe(false);
    expectValid('common#/$defs/taskId', 'tsk_01J9Z3K8Q4M7V2N5X8B1C6D0EF');
    expect(validate('common#/$defs/taskId', 'tsk_01J9Z3K8Q4M7V2N5X8B1C6D0EI').ok).toBe(false);
  });
});

describe('project-map', () => {
  const map = json('project-map.json') as { edges: Record<string, unknown>[] };
  it('exige weight en uses_symbol', () => {
    const edges = map.edges.map((e) => (e['kind'] === 'uses_symbol' ? { ...e, weight: undefined } : e));
    expectInvalid('project-map', { ...map, edges: JSON.parse(JSON.stringify(edges)) }, '/edges/3');
  });
  it('package_depends solo une paquetes', () => {
    const edges = [{ kind: 'package_depends', from: 'apps/web', to: 'pkg:x', confidence: 'declared' }];
    expectInvalid('project-map', { ...map, edges }, '/edges/0/from');
  });
});

describe('herramientas MCP', () => {
  const tools = mcpTools();

  it('son 8, con prefijo foker_ y en orden alfabético', () => {
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(8);
    expect(names).toEqual([...names].sort());
    for (const name of names) expect(name).toMatch(/^foker_[a-z_]+$/);
    expect(mcpApiVersion()).toBe(1);
  });

  it('publican esquemas autocontenidos, de tipo object y compilables', () => {
    for (const tool of tools) {
      for (const schema of [tool.inputSchema, tool.outputSchema]) {
        expect(JSON.stringify(schema)).not.toContain('$ref');
        expect(schema['type']).toBe('object');
        expect(() => ajv().compile(schema)).not.toThrow();
      }
      expect(tool.inputSchema['additionalProperties']).toBe(false);
    }
  });

  const tool = (name: string) => {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(name);
    return ajv().compile(found.inputSchema);
  };

  it('validan entradas según FOKER-SPEC §10.3', () => {
    expect(tool('foker_status')({})).toBe(true);
    expect(tool('foker_status')({ extra: 1 })).toBe(false);
    expect(tool('foker_search')({ query: 'Button' })).toBe(true);
    expect(tool('foker_search')({ query: '' })).toBe(false);
    expect(tool('foker_impact')({ direction: 'both' })).toBe(false);
    expect(tool('foker_impact')({ files: ['a.ts'], depth: 3 })).toBe(true);
    expect(tool('foker_impact')({ files: ['a.ts'], depth: 4 })).toBe(false);
    expect(tool('foker_context')({ task: 'x', budget_tokens: 20000 })).toBe(true);
    expect(tool('foker_context')({ task: 'x', budget_tokens: 20001 })).toBe(false);
    expect(tool('foker_task_begin')({ description: 'x', scope: { paths: ['src/**'] } })).toBe(true);
    expect(tool('foker_task_begin')({ description: 'x', scope: { paths: [] } })).toBe(false);
    expect(tool('foker_check')({ packages: ['$(rm -rf /)'] })).toBe(false);
  });

  it('las salidas de contexto y tarea coinciden con sus documentos', () => {
    const contextOut = tools.find((t) => t.name === 'foker_context')?.outputSchema;
    const taskOut = tools.find((t) => t.name === 'foker_task_get')?.outputSchema;
    expect(ajv().compile(contextOut ?? {})(json('context-pack.json'))).toBe(true);
    expect(ajv().compile(taskOut ?? {})(json('task.json'))).toBe(true);
  });

  it('bundleSchema conserva la semántica de $ref con hermanos', () => {
    const bundled = bundleSchema('project-map');
    expect(JSON.stringify(bundled)).not.toContain('$ref');
    expect(ajv().compile(bundled)(json('project-map.json'))).toBe(true);
  });
});

describe('códigos de error (FOKER-SPEC §18)', () => {
  it('contiene los 32 códigos con formato válido y sin duplicados', () => {
    const codes = errorCodes().map((c) => c.code);
    expect(codes).toHaveLength(32);
    expect(new Set(codes).size).toBe(32);
    for (const code of codes) expectValid('common#/$defs/errorCode', code);
  });

  it('los 1xx son diagnósticos y los demás no', () => {
    for (const info of errorCodes()) {
      expect(info.recoverable === 'diagnostic', info.code).toBe(/-1\d\d$/.test(info.code));
    }
    expect(errorCode('FKR-INT-002')).toMatchObject({ recoverable: 'no', exit: 10 });
    expect(errorCode('FKR-NOPE-000')).toBeUndefined();
  });
});

describe('artefactos generados', () => {
  it('src/generated y la tabla de @foker/core están al día', () => {
    const script = fileURLToPath(new URL('../scripts/generate.mjs', import.meta.url));
    expect(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});

// Los nombres de tipo deben existir: si el generador cambia de nombre, falla la compilación.
const _typeCheck: [
  ProjectMap['schema_version'],
  ContextPack['pack_version'],
  TaskRecord['state'],
  FokerConfig['version'],
] = [1, 1, 'RUNNING', 1];
void _typeCheck;
