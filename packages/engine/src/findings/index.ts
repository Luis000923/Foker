import { posix, win32 } from 'node:path';
import { type ExecOptions, type ExecutableCheck, runCheck } from '@foker/policy';
import type { Finding } from '@foker/schemas';

export type FindingParser = 'tsc' | 'eslint' | 'vitest' | 'generic';
export function parseFindings(
  parser: FindingParser,
  output: string,
  { root, cwd = '.' }: { root: string; cwd?: string },
): Finding[] {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: secuencias ANSI del reporter.
  const text = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const findings: Finding[] = [];
  const normalizeFile = (file: string): string | undefined => {
    if (/^([A-Za-z]:|\\\\)/.test(file) && !/^[A-Za-z]:/.test(root)) return;
    const path = /^[A-Za-z]:/.test(root) ? win32 : posix;
    const normalized = path
      .relative(path.resolve(root), path.resolve(root, cwd, file.replaceAll('\\', '/')))
      .replaceAll('\\', '/');
    if (
      normalized &&
      normalized.length <= 4096 &&
      !normalized.includes('\0') &&
      normalized !== '..' &&
      !normalized.startsWith('../') &&
      !path.isAbsolute(normalized) &&
      !/^[A-Za-z]:/.test(normalized)
    )
      return normalized;
    return;
  };
  const add = (
    message: string,
    rule: string,
    file?: string,
    line?: number,
    col?: number,
    severity: Finding['severity'] = 'error',
    code?: string,
  ) => {
    if (!message.trim()) return;
    const finding: Finding = { message: message.trim(), rule, severity };
    if (code) finding.code = code;
    const normalized = file ? normalizeFile(file) : undefined;
    if (normalized) {
      finding.file = normalized;
      if (line && Number.isInteger(line) && line > 0) finding.line = line;
      if (col && Number.isInteger(col) && col > 0) finding.col = col;
    }
    findings.push(file && !finding.file ? { message: finding.message } : finding);
  };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    /* textual reporter */
  }
  if (parser === 'eslint' && Array.isArray(json)) {
    for (const entry of json) {
      if (!entry || !Array.isArray(entry.messages)) continue;
      for (const m of entry.messages) {
        if (!m || typeof m.message !== 'string') continue;
        add(
          m.message ?? '',
          `eslint/${m.ruleId ?? 'unknown'}`,
          typeof entry.filePath === 'string' ? entry.filePath : undefined,
          m.line,
          m.column,
          m.severity === 1 ? 'warning' : 'error',
        );
      }
    }
  } else if (
    parser === 'vitest' &&
    json &&
    typeof json === 'object' &&
    'testResults' in json &&
    Array.isArray(json.testResults)
  ) {
    for (const entry of json.testResults) {
      if (!entry || !Array.isArray(entry.assertionResults)) continue;
      for (const assertion of entry.assertionResults)
        if (assertion && assertion.status === 'failed') {
          const message =
            (Array.isArray(assertion.failureMessages)
              ? assertion.failureMessages.filter((m: unknown) => typeof m === 'string').join('\n')
              : '') ||
            (typeof assertion.fullName === 'string' ? assertion.fullName : '') ||
            (typeof assertion.title === 'string' ? assertion.title : '') ||
            'Test failed';
          const location = [...message.matchAll(/(?:❯|at)\s+(.+?):(\d+):(\d+)/g)].find((frame) =>
            normalizeFile(frame[1] ?? ''),
          );
          add(
            message,
            'vitest/fail',
            location?.[1] ?? (typeof entry.name === 'string' ? entry.name : undefined),
            location ? Number(location[2]) : undefined,
            location ? Number(location[3]) : undefined,
          );
        }
    }
  } else {
    let file: string | undefined;
    let pending: Finding | undefined;
    let hasFrame = false;
    for (const raw of text.split(/\r?\n/)) {
      const s = raw.trim();
      if (parser === 'tsc') {
        const m = s.match(/^(.+?)(?:\((\d+),(\d+)\):|:(\d+):(\d+)\s+-)\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
        if (m)
          add(
            m[8] ?? '',
            `tsc/${m[7]}`,
            m[1],
            Number(m[2] ?? m[4]),
            Number(m[3] ?? m[5]),
            m[6] as Finding['severity'],
            m[7],
          );
        else {
          const global = s.match(/^(error|warning)\s+(TS\d+):\s*(.+)$/);
          if (global)
            add(
              global[3] ?? '',
              `tsc/${global[2]}`,
              undefined,
              undefined,
              undefined,
              global[1] as Finding['severity'],
              global[2],
            );
        }
      } else if (parser === 'eslint') {
        const m = s.match(/^(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}(\S+))?$/);
        if (m)
          add(m[4] ?? '', `eslint/${m[5] ?? 'unknown'}`, file, Number(m[1]), Number(m[2]), m[3] as Finding['severity']);
        else if (s && !/^\d|^✖/.test(s)) file = s;
      } else if (parser === 'vitest') {
        const fail = s.match(/^FAIL\s+(.+?)\s+>\s+(.+)$/);
        if (fail) {
          add(fail[2] ?? '', 'vitest/fail', fail[1]);
          pending = findings.at(-1);
          hasFrame = false;
        }
        const location = s.match(/^❯\s+(.+?):(\d+):(\d+)/);
        if (location && pending && !hasFrame && normalizeFile(location[1] ?? '')) {
          add(pending.message, 'vitest/fail', location[1], Number(location[2]), Number(location[3]));
          const located = findings.pop();
          if (located) {
            const index = findings.indexOf(pending);
            findings[index] = located;
            pending = located;
            hasFrame = true;
          }
        }
      } else if (/error/i.test(s) && findings.length < 50) add(s, 'generic/error');
    }
  }
  findings.sort(
    (a, b) =>
      (a.file ?? '').localeCompare(b.file ?? '', 'en') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.col ?? 0) - (b.col ?? 0) ||
      (a.rule ?? '').localeCompare(b.rule ?? '', 'en'),
  );
  return findings.length > 200
    ? [
        ...findings.slice(0, 199),
        { rule: 'foker/truncated', severity: 'warning', message: 'Hallazgos truncados al límite de 200.' },
      ]
    : findings;
}
export async function runProfileCheck(check: ExecutableCheck & { parser?: FindingParser }, options: ExecOptions) {
  let output = '';
  const result = await runCheck(check, {
    ...options,
    onOutput: (text) => {
      output = text;
      options.onOutput?.(text);
    },
  });
  if (!result.notExecuted)
    result.findings = parseFindings(check.parser ?? 'generic', output, { root: options.root, cwd: check.cwd ?? '.' });
  return result;
}
