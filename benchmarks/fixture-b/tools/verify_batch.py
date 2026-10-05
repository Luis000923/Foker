"""Verificación por lotes de un repo (ADR-035): orden de semilla, 3 repeticiones, hasta 15 aceptadas.

Uso: verify_batch.py <repo> [objetivo=15]. Reanudable: reutiliza veredictos ya escritos.
Resumen en verify/<repo>/summary.jsonl (una línea por candidato procesado, en orden).
"""
import json, os, subprocess, sys, pathlib

B = pathlib.Path(os.environ.get('FIXTURE_B_ROOT', '/home/luis/Documentos/foker-fixture-b') + '')
WT = pathlib.Path(os.environ.get('FOKER_WORKTREE', '/home/luis/Documentos/Foker-014'))


def verdict(repo, commit, run):
    path = B / 'verify' / repo / commit / f'run{run}.json'
    if not path.exists():
        subprocess.run([sys.executable, str(B / 'tools/verify_task.py'), repo, commit, str(run)],
                       capture_output=True, timeout=5400)
    return json.loads(path.read_text()) if path.exists() else {'accepted': False, 'reasons': ['verifier_error']}


def main(repo, target=15):
    candidates = [json.loads(l) for l in open(WT / f'benchmarks/fixture-b/candidates/{repo}.jsonl')]
    accepted = 0
    summary = B / 'verify' / repo / 'summary.jsonl'
    summary.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for cand in candidates:
        if accepted >= target:
            break
        runs = []
        for run in (1, 2, 3):
            v = verdict(repo, cand['commit'], run)
            runs.append(v)
            if not v['accepted']:
                break
        ok = len(runs) == 3 and all(v['accepted'] for v in runs)
        accepted += ok
        reasons = sorted({r for v in runs for r in v['reasons']})
        if len(runs) > 1 and not ok:
            reasons.append('flaky')
        line = {'commit': cand['commit'], 'subject': cand['subject'], 'accepted': ok, 'runs': len(runs), 'reasons': reasons}
        lines.append(line)
        summary.write_text(''.join(json.dumps(l) + '\n' for l in lines))
        print(json.dumps(line), flush=True)
    print(json.dumps({'repo': repo, 'accepted': accepted, 'processed': len(lines)}))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 15)
