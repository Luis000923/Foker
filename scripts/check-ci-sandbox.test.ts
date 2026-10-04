import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkCiSandbox, checkWorkflow } from './check-ci-sandbox.mjs';

const workflow = `permissions:
  contents: read

jobs:
  test:
    container:
      image: rust:1.98.0-bookworm
    steps:
      - uses: actions/checkout@sha
        with:
          persist-credentials: false
      - run: foker task submit tarea
`;

describe('REQ-SEC-001', () => {
  it('comprueba todos los workflows del repositorio', () => {
    expect(checkCiSandbox(fileURLToPath(new URL('../', import.meta.url)))).toEqual([]);
  });
  it('acepta checks aislados', () => expect(checkWorkflow(workflow)).toEqual([]));
  it('rechaza checks sin contenedor', () => {
    expect(checkWorkflow(workflow.replace('    container:\n      image: rust:1.98.0-bookworm\n', ''))).not.toEqual([]);
  });
  it('rechaza secretos de job y workflow', () => {
    for (const source of [
      `${workflow}    env:\n      TOKEN: \${{ secrets.API_KEY }}\n`,
      `env:\n  TOKEN: \${{ secrets.API_KEY }}\n${workflow}`,
    ]) {
      expect(checkWorkflow(source).join()).toContain('credenciales');
    }
  });
  it('rechaza montajes, permisos elevados y credenciales persistentes', () => {
    for (const source of [
      `${workflow}    volumes: []\n`,
      `${workflow}    permissions: write-all\n`,
      workflow.replace('persist-credentials: false', 'persist-credentials: true'),
    ]) {
      expect(checkWorkflow(source)).not.toEqual([]);
    }
  });
});

const withoutContainer = workflow.replace('    container:\n      image: rust:1.98.0-bookworm\n', '');
function withRunner(runner: string) {
  return withoutContainer.replace('    steps:', `    runs-on: ${runner}\n    steps:`);
}
function withMatrix(values: string[], field = 'os', include = false) {
  const matrix = include
    ? `        include:\n${values.map((value) => `          - { ${field}: ${value}, node: 22 }\n`).join('')}`
    : `        ${field}: [${values.join(', ')}]\n`;
  return withRunner(`\${{ matrix.${field} }}`).replace(
    '    steps:',
    `    strategy:\n      matrix:\n${matrix}    steps:`,
  );
}
function conditional(source: string, field = 'os') {
  return source.replace(
    '    steps:',
    `    container: \${{ startsWith(matrix.${field}, 'ubuntu') && 'rust:1.98.0-bookworm' || '' }}\n    steps:`,
  );
}

describe('ADR-026: aislamiento multiplataforma', () => {
  it('acepta contenedor literal de versión exacta', () => {
    expect(checkWorkflow(workflow.replace('container:\n      image:', 'container:'))).toEqual([]);
  });
  it('acepta solo runners macOS/Windows de la allowlist sin contenedor', () => {
    for (const runner of ['macos-15', 'macos-15-intel', 'windows-2025', 'windows-11-arm']) {
      expect(checkWorkflow(withRunner(runner))).toEqual([]);
    }
    expect(checkWorkflow(withMatrix(['macos-15', 'windows-2025']))).toEqual([]);
    expect(checkWorkflow(withMatrix(['macos-15', 'windows-11-arm'], 'runner', true))).toEqual([]);
  });
  it('acepta matrices mixtas con contenedor condicional exacto', () => {
    for (const field of ['os', 'runner']) {
      for (const include of [false, true]) {
        expect(
          checkWorkflow(
            conditional(
              withMatrix(['ubuntu-24.04', 'ubuntu-24.04-arm', 'macos-15', 'windows-2025'], field, include),
              field,
            ),
          ),
        ).toEqual([]);
      }
    }
  });
  it('rechaza Ubuntu sin contenedor y runners desconocidos o dinámicos', () => {
    for (const source of [
      withRunner('ubuntu-24.04'),
      withRunner('macos-latest'),
      withRunner('windows-personal'),
      withRunner('${{ inputs.runner }}'),
      withMatrix(['macos-15', 'ubuntu-24.04']),
      withMatrix([]),
    ]) {
      expect(checkWorkflow(source)).not.toEqual([]);
    }
  });
  it('rechaza self-hosted incluso con contenedor', () => {
    for (const source of [
      withRunner('[self-hosted, macos-15]'),
      withMatrix(['macos-15', 'self-hosted']),
      workflow.replace('    steps:', '    runs-on: self-hosted\n    steps:'),
    ]) {
      expect(checkWorkflow(source)).not.toEqual([]);
    }
  });
  it('rechaza expresiones alteradas, imágenes incorrectas y campo distinto', () => {
    const source = conditional(withMatrix(['ubuntu-24.04', 'macos-15']));
    for (const invalid of [
      source.replace('1.98.0', 'latest'),
      source.replace("'ubuntu'", "'macos'"),
      source.replace('startsWith(matrix.os', 'startsWith(matrix.runner'),
      source.replace("|| ''", "|| 'otra-imagen'"),
      conditional(withMatrix(['ubuntu-personal', 'macos-15'])),
    ]) {
      expect(checkWorkflow(invalid)).not.toEqual([]);
    }
  });
  it('aplica las restricciones de credenciales y permisos también a VM alojadas', () => {
    const source = withRunner('macos-15');
    for (const invalid of [
      `${source}    env:\n      TOKEN: \${{ github.token }}\n`,
      `${source}    env:\n      TOKEN: \${{ secrets.API_KEY }}\n`,
      `${source}    options: --privileged\n`,
      `${source}    credentials: {}\n`,
      `${source}    volumes: []\n`,
      source.replace('contents: read', 'contents: write'),
      source.replace('persist-credentials: false', 'persist-credentials: true'),
    ]) {
      expect(checkWorkflow(invalid)).not.toEqual([]);
    }
  });
});

it('rechaza entradas include añadidas a una matriz sin contenedor', () => {
  const source = withMatrix(['macos-15']).replace(
    '    steps:',
    '        include:\n          - { os: ubuntu-24.04 }\n    steps:',
  );
  expect(checkWorkflow(source)).not.toEqual([]);
});
it('rechaza token con acceso por corchetes', () => {
  expect(checkWorkflow(`${withRunner('windows-2025')}    env:\n      TOKEN: \${{ github['token'] }}\n`)).not.toEqual(
    [],
  );
});
it('acepta matrices include de bloque y rechaza entradas incompletas', () => {
  const source = withMatrix(['macos-15', 'windows-2025'], 'os', true)
    .replace('- { os: macos-15, node: 22 }', '- target: darwin\n            os: macos-15')
    .replace('- { os: windows-2025, node: 22 }', '- target: windows\n            os: windows-2025');
  expect(checkWorkflow(source)).toEqual([]);
  expect(checkWorkflow(source.replace('            os: windows-2025\n', ''))).not.toEqual([]);
});

it('rechaza permisos globales adicionales y cada checkout con credenciales', () => {
  expect(checkWorkflow(workflow.replace('contents: read', 'contents: read\n  issues: write'))).not.toEqual([]);
  expect(
    checkWorkflow(
      `${workflow}      - uses: actions/checkout@otro-sha\n        with:\n          persist-credentials: true\n`,
    ),
  ).not.toEqual([]);
  expect(
    checkWorkflow(
      `${workflow}      - uses: actions/checkout@otro-sha\n        with:\n          persist-credentials: false\n`,
    ),
  ).toEqual([]);
});

it('rechaza acceso al contexto completo de secretos', () => {
  expect(checkWorkflow(`${withRunner('macos-15')}    env:\n      DATOS: \${{ toJSON(secrets) }}\n`)).not.toEqual([]);
});

it('exige aislamiento también para jobs que solo invocan acciones', () => {
  const source = withRunner('ubuntu-24.04').replace(
    / {4}steps:[\s\S]*/,
    '    steps:\n      - uses: organizacion/accion@sha\n',
  );
  expect(checkWorkflow(source)).not.toEqual([]);
  expect(checkWorkflow(source.replace('ubuntu-24.04', 'windows-2025'))).toEqual([]);
});
