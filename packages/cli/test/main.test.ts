import { describe, expect, it } from 'vitest';
import { type IO, main } from '../src/main.js';

function capture(isTTY = false) {
  const out: string[] = [];
  const err: string[] = [];
  const io: IO = { stdout: (t) => out.push(t), stderr: (t) => err.push(t), isTTY };
  return { io, out, err };
}

describe('main: separador --', () => {
  it("['task', '--'] falla con un error de uso claro (exit 2)", async () => {
    const { io, err } = capture();
    const code = await main(['task', '--'], {}, io);
    expect(code).toBe(2);
    expect(err.join('')).toContain('FKR-INP-001: El separador -- debe ir seguido');
  });

  it("['--'] no lee posiciones fuera de argv", async () => {
    const { io, out } = capture();
    const code = await main(['--json', '--'], {}, io);
    expect(code).toBe(2);
    const payload = JSON.parse(out.join(''));
    expect(payload.ok).toBe(false);
    expect(payload.errors[0].code).toBe('FKR-INP-001');
  });

  it('-- seguido de un posicional lo reconoce como comando', async () => {
    const { io, out } = capture();
    const code = await main(['--json', '--', 'desconocido'], {}, io);
    expect(code).toBe(2);
    const payload = JSON.parse(out.join(''));
    expect(payload.command).toBe('desconocido');
    expect(payload.errors[0].message).toContain('Comando desconocido: desconocido');
  });
});

describe('sin git en el PATH (modo degradado)', () => {
  it('context y task begin funcionan y muestran el aviso; doctor lo documenta', async () => {
    const { mkdir, mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 'foker-nogit-cli-'));
    const path = process.env['PATH'];
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'package.json'), '{"name":"t"}\n');
      await writeFile(join(root, 'src/a.ts'), 'export const a = 1;\n');
      const setup = capture();
      expect(await main(['init', '--ci', '--skip-spec', '--targets', 'codex', '--cwd', root], {}, setup.io)).toBe(0);
      expect(await main(['map', '--ci', '--cwd', root], {}, setup.io)).toBe(0);

      process.env['PATH'] = join(root, 'sin-binarios');
      for (const argv of [
        ['context', 'tarea', '--anchor', 'src/a.ts'],
        ['task', 'begin', 'tarea', '--scope', 'src/**'],
      ]) {
        const { io, out } = capture();
        const code = await main([...argv, '--ci', '--json', '--cwd', root], {}, io);
        const payload = JSON.parse(out.join(''));
        expect(payload.errors, argv.join(' ')).toEqual([]);
        expect(code, argv.join(' ')).toBe(0);
        expect(payload.warnings).toEqual([
          expect.objectContaining({ code: 'FKR-MAP-001', message: expect.stringContaining('git no está instalado') }),
        ]);
      }
    } finally {
      process.env['PATH'] = path;
      await rm(root, { recursive: true, force: true });
    }
  });
});
