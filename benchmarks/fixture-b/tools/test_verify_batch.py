"""Regresiones locales del verificador por lotes; no requieren Docker."""
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('verify_batch', pathlib.Path(__file__).with_name('verify_batch.py'))
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)


class VerifyBatchTests(unittest.TestCase):
    def test_parser(self):
        log = '\n'.join([
            '\x1b[32m ✓ [unit] src/a.test.ts (5 tests | 1 failed | 2 skipped) 10ms\x1b[0m',
            ' ❯ [unit] src/b.test.ts (3 tests | 1 failed) 2ms',
            ' × [other] src/a.test.ts (2 tests) 1ms',
            ' ↓ src/c.test.ts (1 test | 1 skipped)',
            ' Tests 2 skipped',
        ])
        self.assertEqual(batch.skipped_by_file(log), {
            ('unit', 'src/a.test.ts'): 2, ('unit', 'src/b.test.ts'): 0,
            ('other', 'src/a.test.ts'): 0, ('', 'src/c.test.ts'): 1,
        })

    def test_verdict_checks_returncode_and_fingerprint(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(batch, 'B', pathlib.Path(tmp)):
            path = batch.B / 'verify/repo/commit/run1.json'
            path.parent.mkdir(parents=True)
            version = hashlib.sha256((batch.HERE / 'verify_task.py').read_bytes()).hexdigest()[:12]
            value = {'accepted': True, 'reasons': [], 'verifier': version}
            path.write_text(json.dumps(value))
            error = {'accepted': False, 'reasons': ['verifier_error']}
            with patch.object(batch.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)):
                self.assertEqual(batch.verdict('repo', 'commit', 1), error)
            with patch.object(batch.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
                self.assertEqual(batch.verdict('repo', 'commit', 1), value)
                path.write_text(json.dumps({**value, 'verifier': 'obsolete'}))
                self.assertEqual(batch.verdict('repo', 'commit', 1), error)
                path.unlink()
                self.assertEqual(batch.verdict('repo', 'commit', 1), error)

    def test_new_skips_rejects_task_even_when_totals_match(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(batch, 'B', pathlib.Path(tmp)), \
                patch.object(batch, 'FIXTURE', pathlib.Path(tmp)):
            candidates = batch.FIXTURE / 'candidates'
            candidates.mkdir()
            (candidates / 'repo.jsonl').write_text(json.dumps({'commit': 'commit', 'subject': 's'}) + '\n')
            for run in (1, 2, 3):
                work = batch.B / 'verify/repo/commit' / f'run{run}'
                work.mkdir(parents=True)
                (work / 'p2p_before.log').write_text(' ✓ [unit] a.test.ts (2 tests | 1 skipped)\n')
                (work / 'p2p_after.log').write_text(' ✓ [unit] a.test.ts (2 tests | 1 skipped)\n')
            self.assertFalse(batch.new_skips_file('repo', 'commit'))
            (work / 'p2p_after.log').write_text(' ✓ [unit] a.test.ts (2 tests)\n ↓ [unit] b.test.ts (1 test | 1 skipped)\n')
            self.assertTrue(batch.new_skips_file('repo', 'commit'))
            with patch.object(batch, 'verdict', return_value={'accepted': True, 'reasons': []}), patch('builtins.print'):
                batch.main('repo', 1)
            summary = json.loads((batch.B / 'verify/repo/summary.jsonl').read_text())
            self.assertFalse(summary['accepted'])
            self.assertEqual(summary['reasons'], ['new_skips_file'])
            self.assertEqual(summary['runs'], 3)


if __name__ == '__main__':
    unittest.main()
