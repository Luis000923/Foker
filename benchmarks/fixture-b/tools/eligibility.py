"""Elegibilidad E1/E2/E3/E6/E7 de Fixture B al SHA fijado (FKR-014, ADR-035).

Regla idéntica para todos los repos: archivos de `git ls-tree -r <sha>`; código propio =
.ts/.tsx/.mts/.cts (TS) y .js/.jsx/.mjs/.cjs (JS) fuera de EXCLUDE; tests aparte.
LOC con cloc 1.96 (paquete npm cloc@2.11.0), sin comentarios ni líneas vacías.
"""
import json, os, re, subprocess, sys, tempfile, pathlib, collections

CLOC = os.environ.get('FIXTURE_B_ROOT', '/home/luis/Documentos/foker-fixture-b') + '/tools/node_modules/.bin/cloc'
TS = ('.ts', '.tsx', '.mts', '.cts')
JS = ('.js', '.jsx', '.mjs', '.cjs')
EXCLUDE = re.compile(
    r'(^|/)(node_modules|dist|build|coverage|vendor|vendored|generated|__generated__|fixtures?|__fixtures__|'
    r'examples?|playground|docs?|benchmarks?|bench|scripts|\.github|\.changeset)(/|$)'
)
TEST = re.compile(r'(^|/)(__tests__|tests?|test-d|__snapshots__|e2e)(/|$)|\.(test|spec|test-d|bench)\.[cm]?[jt]sx?$')


def files(repo, sha):
    out = subprocess.check_output(['git', '-C', repo, 'ls-tree', '-r', '--name-only', '-z', sha])
    return [f for f in out.decode().split('\0') if f]


def cloc(repo, sha, paths):
    if not paths:
        return 0
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(f"git -C {repo} archive {sha} | tar -x -C {tmp}", shell=True, check=True)
        lst = pathlib.Path(tmp, '.cloc-list')
        lst.write_text('\n'.join(paths))
        res = subprocess.run([CLOC, '--json', '--quiet', f'--list-file={lst}'], cwd=tmp, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        return data.get('SUM', {}).get('code', 0)


def main(repo, sha):
    all_files = files(repo, sha)
    own = [f for f in all_files if not EXCLUDE.search(f) and not f.endswith('.d.ts')]
    ts = [f for f in own if f.endswith(TS) and not TEST.search(f)]
    js = [f for f in own if f.endswith(JS) and not TEST.search(f)]
    ts_tests = [f for f in all_files if f.endswith(TS) and not f.endswith('.d.ts') and TEST.search(f)]
    packages = collections.Counter(
        (m.group(1) if (m := re.match(r'^(packages/[^/]+)/', f)) else '.') for f in ts
    )
    lic = [f for f in all_files if re.match(r'^(LICENSE|LICENCE|COPYING|NOTICE)', f.split('/')[-1], re.I) and f.count('/') <= 2]
    lock = [f for f in all_files if f in ('pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'bun.lock')]
    pkg = json.loads(subprocess.check_output(['git', '-C', repo, 'show', f'{sha}:package.json']))
    gitmodules = '.gitmodules' in all_files
    ts_loc, js_loc = cloc(repo, sha, ts), cloc(repo, sha, js)
    result = {
        'sha': sha,
        'license_files': lic,
        'ts_files': len(ts), 'ts_loc': ts_loc, 'js_files': len(js), 'js_loc': js_loc,
        'ts_share': round(ts_loc / (ts_loc + js_loc), 4) if ts_loc + js_loc else None,
        'ts_test_files': len(ts_tests), 'ts_test_loc': cloc(repo, sha, ts_tests),
        'packages_with_ts': {k: v for k, v in packages.most_common() if v >= 1},
        'lockfiles': lock, 'packageManager': pkg.get('packageManager'),
        'engines': pkg.get('engines'), 'submodules': gitmodules,
        'lfs': any('filter=lfs' in subprocess.run(['git', '-C', repo, 'show', f'{sha}:.gitattributes'], capture_output=True, text=True).stdout for _ in [0]),
    }
    print(json.dumps(result, indent=1))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
