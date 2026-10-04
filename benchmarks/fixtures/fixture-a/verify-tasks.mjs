// FUERA DEL SANDBOX: instala dependencias exactas del fixture; no invoca proveedores de IA.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const tasks = fileURLToPath(new URL('./tasks/', import.meta.url));
function run(argv, root, expectPass = true) {
  if (process.argv.includes('--offline') && argv[0] === 'pnpm') {
    if (argv[1] === 'exec')
      argv = [
        process.execPath,
        join(repo, 'node_modules', argv[2] === 'vitest' ? 'vitest/vitest.mjs' : 'typescript/bin/tsc'),
        ...argv.slice(3),
      ];
    else if (argv.at(-1) === 'typecheck')
      argv = [process.execPath, join(repo, 'node_modules/typescript/bin/tsc'), '--noEmit'];
    else if (argv.at(-1) === 'lint') argv = [process.execPath, 'scripts/lint.mjs'];
    else argv = [process.execPath, join(repo, 'node_modules/vitest/vitest.mjs'), 'run'];
  }
  const result = spawnSync(argv[0], argv.slice(1), { cwd: root, shell: false, stdio: 'inherit', timeout: 300_000 });
  if (result.error || result.signal || (result.status === 0) !== expectPass)
    throw new Error(`Resultado inesperado: ${argv.join(' ')}`);
}
for (const id of readdirSync(tasks).sort()) {
  const root = mkdtempSync(join(tmpdir(), `foker-${id}-`));
  try {
    generate(root);
    if (process.argv.includes('--offline')) symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'));
    else run(['pnpm', 'install'], root);
    const meta = JSON.parse(readFileSync(join(tasks, id, 'meta.json'), 'utf8'));
    for (const group of Object.values(meta.hidden_tests)) {
      for (const [i, path] of group.paths.entries()) {
        const destination = join(root, group.destinations[i]);
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(join(repo, path), destination);
      }
    }
    run(meta.hidden_tests.pass_to_pass.command, root);
    run(meta.hidden_tests.fail_to_pass.command, root, false);
    run(['git', 'apply', join(tasks, id, 'gold.patch')], root);
    run(meta.hidden_tests.fail_to_pass.command, root);
    run(meta.hidden_tests.pass_to_pass.command, root);
    for (const command of meta.default_checks) run(command, root);
    run(['pnpm', 'test'], root);
    if (meta.submitted_tests) {
      run(meta.submitted_tests.command, root);
      run(['git', 'apply', '-R', join(tasks, id, 'gold.patch')], root);
      // Reinstala solo los tests entregados sobre el código original.
      const { after } = JSON.parse(readFileSync(join(tasks, '../task-definitions.json'), 'utf8')).find(
        (t) => t.id === id,
      );
      for (const path of meta.submitted_tests.paths) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(join(root, path), after[path]);
      }
      run(meta.submitted_tests.command, root, false);
    }
    console.log(`${id}: fail→pass, pass→pass y perfil default correctos`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
