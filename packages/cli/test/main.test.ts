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
