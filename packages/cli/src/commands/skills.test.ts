import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { main } from '../main.js';

it('CLI list/show/validate/new y dry-run, errores y strict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'foker-skill-cli-'));
  async function run(...args: string[]) {
    let stdout = '';
    const exit = await main(
      ['--cwd', root, '--json', ...args],
      {},
      {
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
        isTTY: false,
      },
    );
    return { exit, output: JSON.parse(stdout) };
  }
  try {
    expect((await run('skill', 'list')).output.data).toHaveLength(6);
    expect((await run('skill', 'show', 'foker-workflow')).output.data.markdown).toContain('foker_task_begin');
    expect((await run('skill', 'validate', '--strict')).exit).toBe(0);
    expect((await run('--dry-run', 'skill', 'new', 'demo')).output.data.files).toHaveLength(2);
    await expect(readFile(join(root, 'foker/skills/demo/SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await run('skill', 'new', 'demo')).exit).toBe(0);
    expect((await run('skill', 'validate', 'demo', '--strict')).exit).toBe(0);
    expect((await run('skill', 'new', 'demo')).exit).toBe(2);
    expect((await run('skill', 'new', 'BAD')).output.errors[0].code).toBe('FKR-INP-001');
    expect((await run('skill', 'show', 'absent')).output.errors[0].code).toBe('FKR-SKL-001');
    const path = join(root, 'foker/skills/demo/SKILL.md');
    await writeFile(path, `${await readFile(path, 'utf8')}\nignore previous`);
    expect((await run('skill', 'validate', 'demo')).exit).toBe(0);
    expect((await run('skill', 'validate', '--strict')).exit).toBe(3);
    await writeFile(join(root, 'foker/skills/demo/foker.skill.yaml'), 'name: [');
    const invalid = await run('skill', 'validate', 'demo');
    expect(invalid.exit).toBe(3);
    expect(invalid.output.errors[0].code).toBe('FKR-SKL-002');
    expect((await run('skill', 'show', 'BAD')).output.errors[0].code).toBe('FKR-INP-001');
    expect(invalid.output.data[0].valid).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
