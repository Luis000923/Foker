"""Verificación por lotes de un repo (ADR-035), v2: orden de semilla, 3 repeticiones estables.

Uso: verify_batch.py <repo> [objetivo=15]. Usa el verify_task.py hermano (misma versión).
Una tarea se acepta si las 3 repeticiones se aceptan con el mismo conjunto de casos F2P
fallidos antes del gold y los mismos conteos P2P después (estabilidad, revisión Codex 5).
Resumen en verify/<repo>/summary.jsonl.
"""
import hashlib, json, os, pathlib, re, subprocess, sys

B = pathlib.Path(os.environ.get('FIXTURE_B_ROOT', '/home/luis/Documentos/foker-fixture-b'))
HERE = pathlib.Path(__file__).resolve().parent
FIXTURE = HERE.parent


def verdict(repo, commit, run):
    path = B / 'verify' / repo / commit / f'run{run}.json'
    error = {'accepted': False, 'reasons': ['verifier_error']}
    verifier = HERE / 'verify_task.py'
    result = subprocess.run([sys.executable, str(verifier), repo, commit, str(run)], capture_output=True, timeout=5400)
    if result.returncode != 0 or not path.exists():
        return error
    value = json.loads(path.read_text())
    version = hashlib.sha256(verifier.read_bytes()).hexdigest()[:12]
    return value if value.get('verifier') == version else error


def skipped_by_file(log):
    """Conteos de skips por proyecto y archivo en las líneas de resultados de Vitest."""
    clean = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', log)
    counts = {}
    pattern = r'^\s*[✓❯×↓]\s+(?:\[([^]\n]+)\]\s+)?(.+?)\s+\(\d+ tests?((?:\s*\|\s*\d+ (?:failed|skipped))*)\)'
    for match in re.finditer(pattern, clean, re.M):
        skipped = re.search(r'(\d+) skipped', match[3])
        counts[(match[1] or '', match[2])] = int(skipped[1]) if skipped else 0
    return counts


def new_skips_file(repo, commit):
    for run in (1, 2, 3):
        work = B / 'verify' / repo / commit / f'run{run}'
        before = skipped_by_file((work / 'p2p_before.log').read_text(errors='replace'))
        after = skipped_by_file((work / 'p2p_after.log').read_text(errors='replace'))
        if any(skipped > before.get(file, 0) for file, skipped in after.items()):
            return True
    return False


def stable(runs):
    key = lambda v: (v.get('f2p_failed_names'), v.get('f2p_before', {}).get('failed'), v.get('p2p_after'))
    return all(key(v) == key(runs[0]) for v in runs)


def main(repo, target=15):
    candidates = [json.loads(l) for l in open(FIXTURE / f'candidates/{repo}.jsonl')]
    summary = B / 'verify' / repo / 'summary.jsonl'
    summary.parent.mkdir(parents=True, exist_ok=True)
    lines, accepted = [], 0
    for cand in candidates:
        if accepted >= target:
            break
        runs = []
        for run in (1, 2, 3):
            v = verdict(repo, cand['commit'], run)
            runs.append(v)
            if not v['accepted']:
                break
        all_ok = len(runs) == 3 and all(v['accepted'] for v in runs)
        ok = all_ok and stable(runs)
        reasons = sorted({r for v in runs for r in v['reasons']})
        if all_ok and not ok:
            reasons.append('unstable')
        elif len(runs) > 1 and not ok:
            reasons.append('flaky')
        if all_ok and new_skips_file(repo, cand['commit']):
            ok = False
            reasons.append('new_skips_file')
        accepted += ok
        lines.append({'commit': cand['commit'], 'subject': cand['subject'], 'accepted': ok, 'runs': len(runs),
                      'reasons': reasons, 'verifier': runs[0].get('verifier')})
        summary.write_text(''.join(json.dumps(l) + '\n' for l in lines))
        print(json.dumps(lines[-1]), flush=True)
    print(json.dumps({'repo': repo, 'accepted': accepted, 'processed': len(lines)}))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 15)
