"""Material privado de Fixture B fuera del repo (ADR-035): tests ocultos y gold por tarea.

Uso: private.py [--tasks benchmarks/fixture-b/tasks.jsonl]
Escribe $FIXTURE_B_ROOT/private/<id>/{hidden/<ruta de C>, gold.patch, task.json} y
private/nub-install.sh (checksum verificado). La partición tests/gold y los comandos salen de
tools/verify_task.py (misma versión que la verificación). Nunca escribe en el repositorio.
"""
import json, os, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'tools'))
import verify_task as vt  # noqa: E402

B = vt.B


def main(tasks_path):
    private = B / 'private'
    private.mkdir(exist_ok=True)
    vt.nub_installer(private)  # private/nub-install.sh con checksum
    harness_tasks = []
    for line in open(tasks_path):
        t = json.loads(line)
        repo, base, commit = t['repo'], t['base'], t['commit']
        env = vt.environment(repo, base)
        tests, gold = vt.partition(repo, base, commit)
        cmd = vt.commands(repo, env, tests, gold)
        out = private / t['id']
        hidden = out / 'hidden'
        hidden.mkdir(parents=True, exist_ok=True)
        present = set(vt.git(repo, 'ls-tree', '-r', '--name-only', commit, '--', *tests).decode().split('\n'))
        for path in tests:
            if path not in present:
                continue  # borrado en C: la evaluación usa la versión de B
            target = hidden / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(vt.git(repo, 'show', f'{commit}:{path}'))
        (out / 'gold.patch').write_bytes(vt.git(repo, 'diff', '--binary', base, commit, '--', *gold))
        src = [f for f in gold if f.endswith(vt.TS) and not f.endswith('.d.ts')]
        # P2P de la evaluación: misma suite sin los archivos F2P (si no, un F2P fallido arrastra a P2P).
        # vitest 4 solo aplica de forma fiable el glob por nombre de archivo: puede excluir además
        # un test homónimo del mismo paquete (riesgo documentado en ADR-035).
        f2p_files = [x for x in tests if x.endswith(vt.TS) and not x.endswith('.d.ts')]
        if repo == 'query':
            pkgs = sorted({f.split('/')[1] for f in tests + gold if f.startswith('packages/') and f.count('/') >= 2})
            excl = lambda p: ' '.join(f"--exclude '**/{x.rsplit('/', 1)[-1]}'" for x in f2p_files if x.startswith(f'packages/{p}/'))
            p2p_eval = ' && '.join(f"(cd packages/{p} && {env['exec']} vitest run --passWithNoTests {excl(p)})" for p in pkgs)
        else:
            p2p_eval = f"{env['exec']} vitest run --passWithNoTests " + ' '.join(f"--exclude '**/{x.rsplit('/', 1)[-1]}'" for x in f2p_files)
        cmd = {**cmd, 'p2p': p2p_eval}
        task = {'id': t['id'], 'repo': repo, 'base': base, 'commit': commit, 'type': t['type'],
                'statement': t['statement'],
                'environment': {'manager': env['manager'], 'node': env['node'], 'image_digest': env['image']},
                'hidden_tests': tests, 'gold_modified': src,
                'commands': {k: cmd[k] for k in ('install', 'build', 'f2p', 'p2p', 'quality')}}
        (out / 'task.json').write_text(json.dumps(task, ensure_ascii=False, indent=1) + '\n')
        harness_tasks.append(task)
    (B / 'harness-tasks.json').write_text(json.dumps(harness_tasks, ensure_ascii=False) + '\n')
    print(len(harness_tasks), 'tareas con material privado')


if __name__ == '__main__':
    args = sys.argv[1:]
    main(args[args.index('--tasks') + 1] if '--tasks' in args else str(HERE.parent / 'tasks.jsonl'))
