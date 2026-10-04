import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('./', import.meta.url));
const definitions = JSON.parse(readFileSync(join(base, 'task-definitions.json'), 'utf8'));
const sources = [];
const casesPath = join(base, '../../ctx-gold/cases.jsonl');
const mono = readFileSync(casesPath, 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse)
  .filter((c) => c.fixture !== 'fixture-a');
const cases = [];
for (const item of definitions) {
  sources.push({ files: item.before });
  const folder = join(base, 'tasks', item.id);
  mkdirSync(join(folder, 'hidden-tests'), { recursive: true });
  writeFileSync(join(folder, 'task.md'), `# ${item.id} · ${item.meta.type}\n\n${item.task}\n`);
  writeFileSync(join(folder, 'meta.json'), `${JSON.stringify(item.meta, null, 2)}\n`);
  for (const [name, content] of Object.entries(item.hidden)) writeFileSync(join(folder, 'hidden-tests', name), content);
  const temp = mkdtempSync(join(tmpdir(), 'foker-gold-'));
  try {
    const patches = [];
    for (const path of item.meta.modified) {
      const a = join(temp, 'a', path);
      const b = join(temp, 'b', path);
      for (const [target, content] of [
        [a, item.before[path]],
        [b, item.after[path]],
      ]) {
        if (content === undefined) continue;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
      const diff = spawnSync(
        'git',
        [
          'diff',
          '--no-index',
          '--',
          item.before[path] === undefined ? '/dev/null' : a,
          item.after[path] === undefined ? '/dev/null' : b,
        ],
        { encoding: 'utf8' },
      );
      if (diff.status !== 1) throw new Error(`Diff inválido: ${path}`);
      patches.push(
        diff.stdout.replaceAll(`a${temp}/a/`, 'a/').replaceAll(`b${temp}/b/`, 'b/').replaceAll(`a${temp}/b/`, 'a/'),
      );
    }
    writeFileSync(join(folder, 'gold.patch'), patches.join(''));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  cases.push({ id: item.id, fixture: 'fixture-a', task: item.task, gold_modified: item.meta.modified });
}
writeFileSync(join(base, 'source.json'), `${JSON.stringify(sources, null, 2)}\n`);
writeFileSync(casesPath, `${[...cases, ...mono].map((c) => JSON.stringify(c)).join('\n')}\n`);
