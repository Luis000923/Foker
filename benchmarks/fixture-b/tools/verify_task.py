"""Verificación F2P/P2P de un candidato de Fixture B (ADR-035), v2 tras la revisión de Codex.

Uso: verify_task.py <repo> <commit C> <run>
Fase 1 (con red, contenedor aparte): gestor y Node de B (packageManager, .nvmrc), imagen por
digest, instalación congelada + build.
Fase 2 (sin red): P2P sobre B puro; tests ocultos de C sobre B (F2P debe fallar con ≥ 1 caso);
gold + build; F2P, P2P y calidad deben pasar.
Tests ocultos = TODOS los archivos de C que casan con la regex de tests (incluidos snapshots y
fixtures de tests); gold = el resto. Escribe verify/<repo>/<C>/run<k>.json con la huella del
verificador; reutiliza un veredicto solo si la huella coincide.
"""
import hashlib, json, os, pathlib, re, shutil, subprocess, sys, time, urllib.request

B = pathlib.Path(os.environ.get('FIXTURE_B_ROOT', '/home/luis/Documentos/foker-fixture-b'))
HERE = pathlib.Path(__file__).resolve().parent
FIXTURE = HERE.parent  # benchmarks/fixture-b
VERSION = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()[:12]
NODE_DEFAULT = '24.16.0'  # Vite no fija .nvmrc; sus engines admiten >= 22.12
# Imágenes por digest (observadas el 2026-10-05); una versión sin digest aquí es un error.
IMAGES = {
    '22': 'node@sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7',
    '24': 'node@sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4',
    '24.8.0': 'node@sha256:82a1d74c5988b72e839ac01c5bf0f7879a8ffd14ae40d7008016bca6ae12852b',
    '24.16.0': 'node@sha256:40ad9f3064e67d6860b4bc3fe1880b2953934fd6320ada990e45fe0efa6badd7',
}
NUB_URL = 'https://raw.githubusercontent.com/nubjs/nub/0ae8783f1f93763c56dfc827892cfb679e8a0a77/install.sh'
NUB_SHA256 = '42b2d044f13a52ffa27717dc5c675d9a010e0d9276b0af3c47500c34d0fa6f98'
TEST = re.compile(r'(^|/)(__tests__|tests?|test-d|__snapshots__|e2e)(/|$)|\.(test|spec|test-d|bench)\.[cm]?[jt]sx?(\.snap)?$')
TS = ('.ts', '.tsx', '.mts', '.cts')
ANSI = re.compile(r'\x1b\[[0-9;]*m')


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(B / 'full' / repo), *args])


def show(repo, rev, path):
    try:
        return git(repo, 'show', f'{rev}:{path}').decode()
    except subprocess.CalledProcessError:
        return None


def environment(repo, base):
    pkg = json.loads(show(repo, base, 'package.json'))
    name, version = pkg.get('packageManager', 'pnpm@unknown').split('@', 1)
    version = version.split('+')[0]
    node = (show(repo, base, '.nvmrc') or NODE_DEFAULT).strip().lstrip('v') or NODE_DEFAULT
    if node not in IMAGES:
        raise SystemExit(f'imagen sin digest para Node {node}')
    if name == 'pnpm':
        setup = ('export COREPACK_HOME=$HOME/corepack PATH=$HOME/bin:$PATH && mkdir -p $HOME/bin '
                 f'&& corepack enable --install-directory $HOME/bin && corepack prepare pnpm@{version} --activate')
        run, execute = 'pnpm', 'pnpm exec'
    elif name == 'nub':
        setup = f'export PATH=$HOME/.nub/bin:$PATH; command -v nub >/dev/null || bash $HOME/nub-install.sh {version}'
        run, execute = 'nub run', 'nub exec --node'
    else:
        raise SystemExit(f'gestor no soportado: {name}@{version}')
    return dict(manager=f'{name}@{version}', node=node, image=IMAGES[node], setup=setup, run=run, exec=execute,
                scripts=pkg.get('scripts', {}))


def partition(repo, base, commit):
    files = [f for f in git(repo, 'diff', '--name-only', base, commit).decode().split('\n') if f]
    return sorted(f for f in files if TEST.search(f)), sorted(f for f in files if not TEST.search(f))


def commands(repo, env, tests, gold):
    run, ex, scripts = env['run'], env['exec'], env['scripts']
    runnable = ' '.join(t for t in tests if t.endswith(TS) and not t.endswith('.d.ts'))
    if repo == 'vite':
        return dict(install='pnpm install --frozen-lockfile', build=f'{run} build', f2p=f'{ex} vitest run {runnable}',
                    p2p=f'{run} test-unit', quality=f'{run} typecheck && {run} lint')
    if repo == 'zod':
        lint = 'lint:check' if 'lint:check' in scripts else ('lint' if 'lint' in scripts else None)
        return dict(install=f"{run.split()[0]} install --frozen-lockfile",
                    build=f'{run} build' if 'build' in scripts else 'true', f2p=f'{ex} vitest run {runnable}',
                    p2p=f'{run} test', quality=f'{run} {lint}' if lint else 'true')
    # query: paquetes de los tests Y de la implementación modificada (revisión Codex, hallazgo 3)
    pkgs = sorted({f.split('/')[1] for f in tests + gold if f.startswith('packages/') and f.count('/') >= 2})
    test_pkgs = sorted({t.split('/')[1] for t in tests if t.startswith('packages/') and t.endswith(TS)})
    rel = lambda p: ' '.join(t.split('/', 2)[2] for t in tests if t.startswith(f'packages/{p}/') and t.endswith(TS))
    f2p = ' && '.join(f'(cd packages/{p} && {ex} vitest run {rel(p)})' for p in test_pkgs) or 'false'
    p2p = ' && '.join(f'(cd packages/{p} && {ex} vitest run --passWithNoTests)' for p in pkgs) or 'false'
    quality = ' && '.join(
        f'(cd packages/{p} && ({run} test:types:tscurrent || {run} test:types) && {run} test:eslint)' for p in pkgs) or 'false'
    return dict(install='pnpm install --frozen-lockfile', build='true', f2p=f2p, p2p=p2p, quality=quality)


def counts(log):
    """Suma de los resúmenes «Tests …» de vitest: passed, failed, skipped."""
    out = {'passed': 0, 'failed': 0, 'skipped': 0}
    for line in ANSI.sub('', log).splitlines():
        if re.match(r'\s*Tests\s', line):
            for key in out:
                out[key] += sum(map(int, re.findall(rf'(\d+) {key}', line)))
    return out


def failed_names(log):
    return sorted({m.group(1).strip() for m in re.finditer(r'^\s*FAIL\s+(.+?)\s*$', ANSI.sub('', log), re.M)})


def docker(work, home, image, script, network):
    args = ['docker', 'run', '--rm', '--cpus', '2', '--memory', '8g', '--user', '1000:1000',
            '-e', 'HOME=/home/bench', '-e', 'CI=1', '-e', 'TZ=UTC', '-e', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1',
            '-v', f'{work}/repo:/repo', '-v', f'{work}:/work', '-v', f'{home}:/home/bench', '-w', '/repo']
    if not network:
        args += ['--network', 'none']
    return subprocess.run(args + [image, 'bash', '-lc', script], capture_output=True, text=True, timeout=3600)


def nub_installer(home):
    target = home / 'nub-install.sh'
    data = target.read_bytes() if target.exists() else urllib.request.urlopen(NUB_URL, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != NUB_SHA256:
        raise SystemExit('checksum del instalador de nub no coincide')
    target.write_bytes(data)


def main(repo, commit, run):
    cand = next(json.loads(l) for l in open(FIXTURE / f'candidates/{repo}.jsonl') if json.loads(l)['commit'] == commit)
    base = cand['base']
    out = B / 'verify' / repo / commit
    out.mkdir(parents=True, exist_ok=True)
    verdict_path = out / f'run{run}.json'
    if verdict_path.exists() and json.loads(verdict_path.read_text()).get('verifier') == VERSION:
        print(verdict_path.read_text().strip())
        return
    lock = out / f'run{run}.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)  # falla si otra ejecución usa este run
    try:
        work = out / f'run{run}'
        if work.exists():  # restos de otra versión: se apartan, no se reutilizan
            work.rename(out / f'run{run}.stale-{int(time.time())}')
        (work / 'repo').mkdir(parents=True)
        env = environment(repo, base)
        tests, gold = partition(repo, base, commit)
        cmd = commands(repo, env, tests, gold)
        home = B / 'homes' / repo
        home.mkdir(parents=True, exist_ok=True)
        if env['manager'].startswith('nub@'):
            nub_installer(home)
        subprocess.run(f'git -C {B}/full/{repo} archive {base} | tar -x -C {work}/repo', shell=True, check=True)
        (work / 'tests.patch').write_bytes(git(repo, 'diff', '--binary', base, commit, '--', *tests))
        (work / 'gold.patch').write_bytes(git(repo, 'diff', '--binary', base, commit, '--', *gold))
        t0 = time.time()
        prep = docker(work, home, env['image'],
                      f"{env['setup']} > /work/setup.log 2>&1 && ({cmd['install']} && {cmd['build']}) > /work/install.log 2>&1; echo @@RC $?",
                      network=True)
        t1 = time.time()
        rc = {'install': int((re.findall(r'@@RC (\d+)', prep.stdout) or ['99'])[-1])}
        phases = [('p2p_before', cmd['p2p']), ('apply_tests', 'git apply --whitespace=nowarn /work/tests.patch'),
                  ('f2p_before', cmd['f2p']),
                  ('apply_gold', f"git apply --whitespace=nowarn /work/gold.patch && {cmd['build']}"),
                  ('f2p_after', cmd['f2p']), ('p2p_after', cmd['p2p']), ('quality_after', cmd['quality'])]
        script = ['set +e', f"{env['setup']} >/dev/null 2>&1"]
        for name, c in phases:
            script += [f'( {c} ) > /work/{name}.log 2>&1', f'echo "@@RC {name} $?"']
        if rc['install'] == 0:
            res = docker(work, home, env['image'], '\n'.join(script), network=False)
            rc.update({k: int(v) for k, v in re.findall(r'@@RC (\w+) (\d+)', res.stdout)})
        log = lambda n: (work / f'{n}.log').read_text(errors='replace') if (work / f'{n}.log').exists() else ''
        before, after, p2p_b = counts(log('f2p_before')), counts(log('p2p_after')), counts(log('p2p_before'))
        reasons = []
        for phase, code in [('install', 'install'), ('p2p_before', 'p2p_fails_before'), ('apply_tests', 'apply_tests'),
                            ('apply_gold', 'apply_gold_or_build'), ('f2p_after', 'f2p_fails_after'),
                            ('p2p_after', 'p2p_fails_after'), ('quality_after', 'quality_fails_after')]:
            if rc.get(phase, 99) != 0:
                reasons.append(code)
        if rc.get('f2p_before') == 0:
            reasons.append('f2p_passes_before')
        elif 'f2p_before' in rc and before['failed'] == 0:
            reasons.append('f2p_load_only')
        if 'p2p_after' in rc and after['skipped'] > p2p_b['skipped']:
            reasons.append('new_skips')
        verdict = {'repo': repo, 'commit': commit, 'base': base, 'run': run, 'verifier': VERSION,
                   'manager': env['manager'], 'node': env['node'], 'image': env['image'],
                   'hidden_tests': tests, 'gold_files': gold, 'rc': rc,
                   'f2p_before': before, 'f2p_failed_names': failed_names(log('f2p_before')),
                   'p2p_before': p2p_b, 'p2p_after': after,
                   'install_s': round(t1 - t0), 'eval_s': round(time.time() - t1),
                   'accepted': not reasons, 'reasons': reasons}
        verdict_path.write_text(json.dumps(verdict) + '\n')
        shutil.rmtree(work / 'repo', ignore_errors=True)
        print(json.dumps(verdict))
    finally:
        os.close(fd)
        lock.unlink()


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
