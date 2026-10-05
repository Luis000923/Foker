"""Verificación F2P/P2P de un candidato de Fixture B (ADR-035), con el entorno de B.

Uso: verify_task.py <repo> <commit C> <run>
Fase 1 (con red, contenedor aparte): gestor y Node de B (packageManager, .nvmrc) e instalación
congelada + build. Fase 2 (sin red): tests de C sobre B (F2P debe fallar con ≥1 caso), gold,
build, F2P/P2P y calidad deben pasar. Escribe verify/<repo>/<C>/run<k>.json.
"""
import json, os, subprocess, sys, pathlib, re, time, shutil

B = pathlib.Path(os.environ.get('FIXTURE_B_ROOT', '/home/luis/Documentos/foker-fixture-b') + '')
WT = pathlib.Path(os.environ.get('FOKER_WORKTREE', '/home/luis/Documentos/Foker-014'))
NODE_DEFAULT = '24.16.0'  # Vite no fija .nvmrc; sus engines admiten >= 22.12


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(B / 'full' / repo), *args])


def show(repo, rev, path):
    try:
        return git(repo, 'show', f'{rev}:{path}').decode()
    except subprocess.CalledProcessError:
        return None


def environment(repo, base):
    pkg = json.loads(show(repo, base, 'package.json'))
    manager = pkg.get('packageManager', 'pnpm@unknown')
    node = (show(repo, base, '.nvmrc') or NODE_DEFAULT).strip().lstrip('v') or NODE_DEFAULT
    name, version = manager.split('@', 1)
    version = version.split('+')[0]
    if name == 'pnpm':
        setup = ('export COREPACK_HOME=$HOME/corepack PATH=$HOME/bin:$PATH && mkdir -p $HOME/bin '
                 f'&& corepack enable --install-directory $HOME/bin && corepack prepare pnpm@{version} --activate')
        run, execute = 'pnpm', 'pnpm exec'
    elif name == 'nub':
        setup = f'export PATH=$HOME/.nub/bin:$PATH; command -v nub >/dev/null || bash $HOME/nub-install.sh {version}'
        run, execute = 'nub run', 'nub exec --node'
    else:
        raise SystemExit(f'gestor no soportado: {manager}')
    return dict(manager=manager, node=node, image=f'node:{node}-bookworm', setup=setup,
                run=run, exec=execute, scripts=pkg.get('scripts', {}), pm=name)


def commands(repo, env, tests):
    run, ex, scripts = env['run'], env['exec'], env['scripts']
    has = lambda s: s in scripts
    files = ' '.join(tests)
    if repo == 'vite':
        build = f'{run} build'
        f2p = f'{ex} vitest run {files}'
        p2p = f'{run} test-unit'
        quality = f'{run} typecheck && {run} lint'
    elif repo == 'zod':
        build = f'{run} build' if has('build') else 'true'
        f2p = f'{ex} vitest run {files}'
        p2p = f'{run} test'
        quality = f'{run} lint:check' if has('lint:check') else (f'{run} lint' if has('lint') else 'true')
    else:  # query: por paquete afectado
        pkgs = sorted({t.split('/')[1] for t in tests if t.startswith('packages/')})
        rel = lambda p: ' '.join(t.split('/', 2)[2] for t in tests if t.startswith(f'packages/{p}/'))
        build = 'true'
        f2p = ' && '.join(f'(cd packages/{p} && {ex} vitest run {rel(p)})' for p in pkgs) or 'false'
        p2p = ' && '.join(f'(cd packages/{p} && {ex} vitest run)' for p in pkgs) or 'false'
        quality = ' && '.join(
            f'(cd packages/{p} && ({run} test:types:tscurrent || {run} test:types) && {run} test:eslint)' for p in pkgs) or 'false'
    install = f'{run.split()[0]} install --frozen-lockfile'
    return dict(install=install, build=build, f2p=f2p, p2p=p2p, quality=quality)


def summary(log):
    clean = re.sub(r'\x1b\[[0-9;]*m', '', log)
    return sum(map(int, re.findall(r'Tests\s+(\d+) failed', clean)))


def docker(work, home, image, script, network=True):
    args = ['docker', 'run', '--rm', '--cpus', '2', '--memory', '8g', '--user', '1000:1000',
            '-e', 'HOME=/home/bench', '-e', 'CI=1', '-e', 'TZ=UTC', '-e', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1',
            '-v', f'{work}/repo:/repo', '-v', f'{work}:/work', '-v', f'{home}:/home/bench', '-w', '/repo']
    if not network:
        args += ['--network', 'none']
    return subprocess.run(args + [image, 'bash', '-lc', script], capture_output=True, text=True, timeout=3600)


def main(repo, commit, run):
    cand = next(json.loads(l) for l in open(WT / f'benchmarks/fixture-b/candidates/{repo}.jsonl') if json.loads(l)['commit'] == commit)
    base, tests = cand['base'], cand['tests_changed']
    env = environment(repo, base)
    cmd = commands(repo, env, tests)
    out = B / 'verify' / repo / commit
    work = out / f'run{run}'
    if work.exists():
        shutil.rmtree(work)
    (work / 'repo').mkdir(parents=True)
    home = B / 'homes' / repo
    home.mkdir(parents=True, exist_ok=True)
    shutil.copy(B / 'tools' / 'nub-install.sh', home / 'nub-install.sh')
    subprocess.run(f'git -C {B}/full/{repo} archive {base} | tar -x -C {work}/repo', shell=True, check=True)
    (work / 'tests.patch').write_bytes(git(repo, 'diff', '--binary', base, commit, '--', *tests))
    (work / 'gold.patch').write_bytes(git(repo, 'diff', '--binary', base, commit, '--', '.', *[f':(exclude){t}' for t in tests]))
    t0 = time.time()
    prep = docker(work, home, env['image'],
                  f"set -o pipefail; {env['setup']} > /work/setup.log 2>&1 && ({cmd['install']} && {cmd['build']}) > /work/install.log 2>&1; echo @@RC $?")
    t1 = time.time()
    rc = {'install': int((re.findall(r'@@RC (\d+)', prep.stdout) or ['99'])[-1])}
    phases = [('apply_tests', 'git apply --whitespace=nowarn /work/tests.patch'), ('f2p_before', cmd['f2p']),
              ('apply_gold', f"git apply --whitespace=nowarn /work/gold.patch && {cmd['build']}"),
              ('f2p_after', cmd['f2p']), ('p2p_after', cmd['p2p']), ('quality_after', cmd['quality'])]
    script = ['set +e', f"{env['setup']} >/dev/null 2>&1"]
    for name, c in phases:
        script += [f'( {c} ) > /work/{name}.log 2>&1', f'echo "@@RC {name} $?"']
    if rc['install'] == 0:
        res = docker(work, home, env['image'], '\n'.join(script), network=False)
        rc.update({k: int(v) for k, v in re.findall(r'@@RC (\w+) (\d+)', res.stdout)})
    before = summary((work / 'f2p_before.log').read_text(errors='replace')) if (work / 'f2p_before.log').exists() else 0
    reasons = []
    for phase, code in [('install', 'install'), ('apply_tests', 'apply_tests'), ('apply_gold', 'apply_gold_or_build'),
                        ('f2p_after', 'f2p_fails_after'), ('p2p_after', 'p2p_fails_after'), ('quality_after', 'quality_fails_after')]:
        if rc.get(phase, 99) != 0:
            reasons.append(code)
    if rc.get('f2p_before') == 0:
        reasons.append('f2p_passes_before')
    elif 'f2p_before' in rc and before == 0:
        reasons.append('f2p_load_only')
    verdict = {'repo': repo, 'commit': commit, 'base': base, 'run': run, 'manager': env['manager'], 'node': env['node'],
               'image': env['image'], 'rc': rc, 'f2p_failed_cases_before': before,
               'install_s': round(t1 - t0), 'eval_s': round(time.time() - t1), 'accepted': not reasons, 'reasons': reasons}
    (out / f'run{run}.json').write_text(json.dumps(verdict) + '\n')
    shutil.rmtree(work / 'repo', ignore_errors=True)
    print(json.dumps(verdict))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
